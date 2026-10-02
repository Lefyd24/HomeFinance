"""OpenRouter-backed conversational agent with tool calling and streaming.

`run_agent_stream` is a generator that yields small dicts describing what's
happening (a streamed answer token, a tool call starting/finishing, a profile
change, or an error) so the router can forward each one to the browser as an SSE
event in real time.

The tool registry is assembled from the `ai_tools*` modules, each of which keeps
its JSON schemas beside its implementations. The security boundary is that no
schema names `user_id` or an email recipient: those are injected here, from the
authenticated user, so the model has no way to reach another user's data.
"""
import json
import logging
import time
from typing import Any, Callable, Generator, Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.llm.openrouter import (
    ChatCompletion,
    OpenRouterClient,
    ReasoningDelta,
    TextDelta,
)
from app.services import ai_tools, ai_tools_investments, ai_tools_planning
from app.services.ai_budget import estimate_tokens, fit_history
from app.services.ai_models import ModelInfo

logger = logging.getLogger("app.ai")


def _build_registry() -> tuple[list, dict[str, Callable]]:
    modules = [ai_tools]
    if settings.AI_INVESTMENT_TOOLS_ENABLED:
        modules += [ai_tools_investments, ai_tools_planning]

    schemas: list = []
    dispatch: dict[str, Callable] = {}
    for module in modules:
        schemas.extend(module.TOOLS)
        dispatch.update(module.DISPATCH)

    # A schema without an implementation would fail only at the moment the model
    # picked it, mid-conversation. Catch it at import instead.
    declared = {schema["function"]["name"] for schema in schemas}
    missing = declared - set(dispatch)
    if missing:
        raise RuntimeError(f"AI tools declared without an implementation: {sorted(missing)}")

    return schemas, dispatch


AI_TOOLS, TOOL_DISPATCH = _build_registry()

# Tools that need the caller's identity injected server-side rather than
# taking every argument straight from the model.
_EMAIL_TOOL_NAME = "send_analysis_email_tool"

#: Tools whose results the UI surfaces specially rather than as a plain receipt.
_PROFILE_WRITE_TOOL = "update_investor_profile_tool"


def _execute_tool(db: Session, user_id: int, user_email: str, name: str, args: dict) -> dict:
    fn = TOOL_DISPATCH.get(name)
    if fn is None:
        return {"error": f"Unknown tool: {name}"}
    try:
        if name == _EMAIL_TOOL_NAME:
            return fn(db, user_id, **args, user_email=user_email)
        return fn(db, user_id, **args)
    except TypeError as exc:
        # Almost always the model inventing an argument. Naming it back lets the
        # model correct itself on the next round instead of retrying identically.
        logger.warning("Tool %s called with bad arguments %s: %s", name, args, exc)
        return {"error": f"Invalid arguments for {name}: {exc}"}
    except Exception as exc:  # tool errors surface to the model, not as a broken stream
        logger.warning("Tool %s failed: %s", name, exc)
        return {"error": str(exc)}


def _serialize_result(name: str, result: dict) -> str:
    """JSON for the model, truncated if it would swamp the context window.

    A five-symbol comparison or a long transaction list can run to tens of
    thousands of characters; several of those in one conversation exhausts the
    window and the answer degrades with no visible cause. Lists are cut from the
    end and the cut is declared, so the model reports a partial list as partial.
    """
    limit = settings.AI_TOOL_RESULT_MAX_CHARS
    payload = json.dumps(result, default=str)
    if len(payload) <= limit:
        return payload

    trimmed = dict(result)
    # Longest list first — that is nearly always the one doing the damage.
    list_fields = sorted(
        (k for k, v in trimmed.items() if isinstance(v, list)),
        key=lambda k: len(trimmed[k]),
        reverse=True,
    )
    for field in list_fields:
        while len(trimmed[field]) > 1 and len(json.dumps(trimmed, default=str)) > limit:
            trimmed[field] = trimmed[field][: max(1, len(trimmed[field]) // 2)]
        trimmed[f"{field}_truncated_from"] = len(result[field])
        if len(json.dumps(trimmed, default=str)) <= limit:
            break

    trimmed["truncated"] = True
    trimmed["truncation_note"] = (
        "This result was too large to send in full and was shortened. Treat the lists as "
        "a sample, and say so if you summarise them."
    )
    payload = json.dumps(trimmed, default=str)

    if len(payload) > limit:
        # Nothing list-shaped to cut; refuse rather than blow the window.
        logger.warning("Tool %s result of %d chars could not be truncated", name, len(payload))
        return json.dumps(
            {
                "error": (
                    "The result was too large to return. Ask for a narrower date range, "
                    "fewer symbols, or a smaller limit."
                ),
                "size_chars": len(payload),
            }
        )
    return payload


def system_message(text: str, model_id: str) -> dict[str, Any]:
    """The system prompt as a message. Anthropic caches only explicitly marked prefixes
    (other providers cache automatically), so for those the prompt is marked ephemeral."""
    if model_id.startswith("anthropic/"):
        return {
            "role": "system",
            "content": [{"type": "text", "text": text, "cache_control": {"type": "ephemeral"}}],
        }
    return {"role": "system", "content": text}


def _history_budget(model: ModelInfo, system_prompt: str) -> int:
    """Tokens left for the conversation once the system prompt and tool schemas are paid."""
    fixed = estimate_tokens(system_prompt) + estimate_tokens(
        json.dumps(AI_TOOLS, ensure_ascii=False)
    )
    return max(model.history_budget(settings) - fixed, 2_000)


_UNAVAILABLE = "The AI service is unavailable. Please try again."


def run_agent_stream(
    db: Session,
    user_id: int,
    user_email: str,
    system_prompt: str,
    messages: list[dict],
    model: ModelInfo,
    client: Optional[OpenRouterClient],
) -> Generator[dict, None, None]:
    """Run one chat turn. `messages` is the user/assistant transcript (no system message);
    the system prompt is passed separately so it can be cache-marked per model."""
    if client is None:
        yield {"type": "error", "message": "AI chat is not configured."}
        return

    messages = list(messages)  # tool rounds append to it; never mutate the caller's list
    started = time.monotonic()
    prompt_tokens = completion_tokens = cached_tokens = 0
    peak_context = 0
    cost_usd = 0.0
    cost_estimated = False
    steps = 0
    tool_calls_made = 0

    for _ in range(settings.AI_CHAT_MAX_TOOL_ROUNDS):
        steps += 1
        history, _dropped = fit_history(messages, _history_budget(model, system_prompt))
        request_messages = [system_message(system_prompt, model.id), *history]

        completion: Optional[ChatCompletion] = None
        stream = client.stream_chat(
            model.id,
            request_messages,
            tools=AI_TOOLS,
            max_tokens=settings.AI_MAX_OUTPUT_TOKENS,
        )
        try:
            for item in stream:
                if isinstance(item, ReasoningDelta):
                    yield {"type": "reasoning", "text": item.text}
                elif isinstance(item, TextDelta):
                    yield {"type": "token", "content": item.text}
                elif isinstance(item, ChatCompletion):
                    completion = item
        except Exception as exc:
            # The real error stays in the server log; the client gets a generic message.
            logger.warning("OpenRouter request failed for user %s: %s", user_id, exc)
            yield {"type": "error", "message": _UNAVAILABLE}
            return
        finally:
            stream.close()

        if completion is None:
            logger.warning("OpenRouter stream ended without a completion for user %s", user_id)
            yield {"type": "error", "message": _UNAVAILABLE}
            return

        usage = completion.usage
        step_cost, estimated = model.cost_usd(usage, settings)
        prompt_tokens += usage.prompt_tokens
        completion_tokens += usage.completion_tokens
        cached_tokens += usage.cached_tokens
        peak_context = max(peak_context, usage.prompt_tokens)
        cost_usd += step_cost
        cost_estimated = cost_estimated or estimated

        if completion.tool_calls:
            assistant_message: dict[str, Any] = {
                "role": "assistant",
                "content": completion.text or None,
                "tool_calls": [
                    {
                        "id": call.id,
                        "type": "function",
                        "function": {"name": call.name, "arguments": call.arguments or "{}"},
                    }
                    for call in completion.tool_calls
                ],
            }
            # A reasoning model needs its own thinking back to keep its train of thought
            # across tool rounds. In-memory, within this turn only.
            if completion.reasoning_details:
                assistant_message["reasoning_details"] = completion.reasoning_details
            messages.append(assistant_message)

            for call in completion.tool_calls:
                tool_calls_made += 1
                try:
                    args = json.loads(call.arguments) if call.arguments else {}
                except json.JSONDecodeError:
                    args = {}
                if not isinstance(args, dict):
                    args = {}

                yield {"type": "tool_call_start", "tool": call.name, "args": args}
                result = _execute_tool(db, user_id, user_email, call.name, args)
                yield {"type": "tool_call_result", "tool": call.name, "result": result}

                # A profile write is the one thing the model does that outlasts
                # the conversation, so it gets its own event and its own UI.
                if call.name == _PROFILE_WRITE_TOOL and result.get("updated"):
                    yield {
                        "type": "profile_update",
                        "changes": result.get("changes", []),
                        "reason": args.get("reason"),
                    }

                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.id,
                        "content": _serialize_result(call.name, result),
                    }
                )

            if cost_usd >= settings.AI_TURN_COST_CAP_USD:
                logger.warning(
                    "AI turn for user %s stopped at the cost cap (%.4f USD)", user_id, cost_usd
                )
                yield {"type": "error", "message": "This answer hit the per-turn cost limit."}
                return
            continue

        logger.info(
            "AI chat completed for user %s on %s: %d prompt tokens, %d completion tokens, "
            "%.5f USD",
            user_id,
            model.id,
            prompt_tokens,
            completion_tokens,
            cost_usd,
        )
        yield {
            "type": "done",
            "content": completion.text,
            "model": model.id,
            "context_window": model.context_length,
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "cached_tokens": cached_tokens,
                "cost_usd": cost_usd,
                "cost_estimated": cost_estimated,
                "peak_context_tokens": peak_context,
                "duration_ms": int((time.monotonic() - started) * 1000),
                "steps": steps,
                "tool_calls": tool_calls_made,
            },
        }
        return

    logger.warning(
        "AI chat hit the tool-round limit for user %s (%d prompt tokens)", user_id, prompt_tokens
    )
    yield {"type": "error", "message": "Reached maximum tool-call rounds without a final answer."}
