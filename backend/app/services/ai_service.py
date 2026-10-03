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
from contextlib import closing
from typing import Any, Callable, Generator, Optional

from sqlalchemy.orm import Session

from app import ai_skills
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

# Skills are validated against the core registry here, once, at import: a broken
# skill fails startup. Core tools that exist but are switched off by a feature flag
# are passed separately so a skill depending on them is unavailable, not an error.
_DISABLED_CORE_TOOLS = (
    set()
    if settings.AI_INVESTMENT_TOOLS_ENABLED
    else {
        schema["function"]["name"]
        for module in (ai_tools_investments, ai_tools_planning)
        for schema in module.TOOLS
    }
)
ai_skills.install(
    ai_skills.load_all(
        core_tool_names=set(TOOL_DISPATCH),
        disabled_core_tool_names=_DISABLED_CORE_TOOLS,
    )
)

# Tools that need the caller's identity injected server-side rather than
# taking every argument straight from the model.
_EMAIL_TOOL_NAME = "send_analysis_email_tool"

#: Tools whose results the UI surfaces specially rather than as a plain receipt.
_PROFILE_WRITE_TOOL = "update_investor_profile_tool"


def _execute_tool(
    db: Session,
    user_id: int,
    user_email: str,
    name: str,
    args: dict,
    active_skills: Optional[list[ai_skills.Skill]] = None,
) -> dict:
    """Run one tool. Skill tools are reachable only through a skill that is active this
    turn, so a hallucinated call to an unloaded skill's tool is an unknown tool."""
    if name == ai_skills.LOAD_SKILL_TOOL_NAME:
        return ai_skills.load_skill_result(args.get("name"))

    inject_email = name == _EMAIL_TOOL_NAME
    fn = TOOL_DISPATCH.get(name)
    if fn is None:
        for skill in active_skills or ():
            if name in skill.dispatch:
                fn = skill.dispatch[name]
                inject_email = name in skill.needs_user_email
                break
    if fn is None:
        return {"error": f"Unknown tool: {name}"}
    try:
        if inject_email:
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


def _history_budget(
    model: ModelInfo, system_prompt: str, tools: Optional[list] = None, extra_text: str = ""
) -> int:
    """Tokens left for the conversation once the system prompt and tool schemas are paid."""
    fixed = (
        estimate_tokens(system_prompt)
        + estimate_tokens(json.dumps(AI_TOOLS if tools is None else tools, ensure_ascii=False))
        + estimate_tokens(extra_text)
    )
    return max(model.history_budget(settings) - fixed, 2_000)


_UNAVAILABLE = "The AI service is unavailable. Please try again."


def _round_limit(active: list[ai_skills.Skill]) -> int:
    """Tool rounds allowed this turn: the base limit, raised by an active skill's
    `max_rounds` but never beyond AI_SKILL_MAX_ROUNDS."""
    base = settings.AI_CHAT_MAX_TOOL_ROUNDS
    wanted = max((s.max_rounds or 0 for s in active), default=0)
    return max(base, min(wanted, settings.AI_SKILL_MAX_ROUNDS))


def _tools_for(active: list[ai_skills.Skill]) -> list[dict]:
    tools = list(AI_TOOLS)
    load_schema = ai_skills.load_skill_tool_schema()
    if load_schema is not None:
        tools.append(load_schema)
    for skill in active:
        tools.extend(skill.tools)
    return tools


def _skill_system_message(skill: ai_skills.Skill) -> dict[str, Any]:
    return {"role": "system", "content": f"Active skill: {skill.title}\n\n{skill.body}"}


def run_agent_stream(
    session_factory: Callable[[], Session],
    user_id: int,
    user_email: str,
    system_prompt: str,
    messages: list[dict],
    model: ModelInfo,
    client: Optional[OpenRouterClient],
    active_skills: Optional[list[str]] = None,
) -> Generator[dict, None, None]:
    """Run one chat turn. `messages` is the user/assistant transcript (no system message);
    the system prompt is passed separately so it can be cache-marked per model.
    `active_skills` are skill names carried over from earlier turns or pre-activated by a
    slash command; unknown or unavailable names are silently dropped.

    `session_factory` is called once per tool execution and the session is closed right
    after: a chat turn can stream for minutes, and holding one session (and so one pool
    connection) across LLM round-trips starves the rest of the app."""
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

    active: list[ai_skills.Skill] = []
    for requested in active_skills or []:
        skill = ai_skills.get_skill(requested)
        if skill is not None and skill not in active:
            active.append(skill)
    # Skills active from the start get their method injected up front; skills the model
    # loads later deliver it through the load_skill_tool result instead.
    preloaded = [_skill_system_message(s) for s in active]
    preloaded_text = "".join(m["content"] for m in preloaded)

    rounds_used = 0
    while rounds_used < _round_limit(active):
        rounds_used += 1
        last_round = rounds_used >= _round_limit(active)
        steps += 1
        tools = _tools_for(active)
        history, _dropped = fit_history(
            messages, _history_budget(model, system_prompt, tools, preloaded_text)
        )
        request_messages = [system_message(system_prompt, model.id), *preloaded, *history]

        completion: Optional[ChatCompletion] = None
        call_kwargs: dict[str, Any] = {"tools": tools, "max_tokens": settings.AI_MAX_OUTPUT_TOKENS}
        if last_round:
            # Final allowed round: the model must answer with what it has.
            call_kwargs["tool_choice"] = "none"
        stream = client.stream_chat(model.id, request_messages, **call_kwargs)
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

        if completion.tool_calls and last_round:
            break  # defensive: tool_choice "none" was ignored; fall through to the error
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
                with closing(session_factory()) as tool_db:
                    result = _execute_tool(tool_db, user_id, user_email, call.name, args, active)
                # A tool may report extra spend (e.g. a web search). It counts toward the
                # turn cost but is internal: neither the model nor the client sees it.
                if isinstance(result, dict) and "_cost_usd" in result:
                    result = dict(result)
                    extra_cost = result.pop("_cost_usd")
                    if isinstance(extra_cost, (int, float)) and not isinstance(extra_cost, bool):
                        cost_usd += float(extra_cost)
                yield {"type": "tool_call_result", "tool": call.name, "result": result}

                if call.name == ai_skills.LOAD_SKILL_TOOL_NAME and result.get("skill"):
                    loaded = ai_skills.get_skill(result["skill"])
                    if loaded is not None and loaded not in active:
                        active.append(loaded)
                        yield {
                            "type": "skill_loaded",
                            "name": loaded.name,
                            "title": loaded.title,
                            "suggested_model": loaded.suggested_model,
                        }

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
            "active_skills": [s.name for s in active],
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
