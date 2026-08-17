"""DeepSeek-backed conversational agent with tool calling and streaming.

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
from typing import Callable, Generator, Optional

from openai import OpenAI
from sqlalchemy.orm import Session

from app.config import settings
from app.services import ai_tools, ai_tools_investments, ai_tools_planning

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


def run_agent_stream(
    db: Session,
    user_id: int,
    user_email: str,
    messages: list[dict],
) -> Generator[dict, None, None]:
    if not settings.DEEPSEEK_API_KEY:
        yield {"type": "error", "message": "AI chat is not configured."}
        return

    client = OpenAI(
        api_key=settings.DEEPSEEK_API_KEY,
        base_url=settings.DEEPSEEK_BASE_URL,
        timeout=settings.AI_CHAT_TIMEOUT_SECONDS,
    )

    prompt_tokens = 0
    completion_tokens = 0

    for _ in range(settings.AI_CHAT_MAX_TOOL_ROUNDS):
        try:
            stream = client.chat.completions.create(
                model=settings.DEEPSEEK_MODEL,
                messages=messages,
                tools=AI_TOOLS,
                stream=True,
                stream_options={"include_usage": True},
            )
        except Exception as exc:
            logger.warning("DeepSeek request failed: %s", exc)
            yield {"type": "error", "message": f"DeepSeek API error: {exc}"}
            return

        content_buf = ""
        tool_call_buf: dict[int, dict] = {}
        finish_reason: Optional[str] = None

        try:
            for chunk in stream:
                # The usage-only chunk that `include_usage` appends carries no choices.
                if getattr(chunk, "usage", None):
                    prompt_tokens += chunk.usage.prompt_tokens or 0
                    completion_tokens += chunk.usage.completion_tokens or 0
                if not chunk.choices:
                    continue

                choice = chunk.choices[0]
                delta = choice.delta
                if choice.finish_reason:
                    finish_reason = choice.finish_reason

                if delta.content:
                    content_buf += delta.content
                    yield {"type": "token", "content": delta.content}

                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        entry = tool_call_buf.setdefault(
                            tc.index, {"id": None, "name": None, "arguments": ""}
                        )
                        if tc.id:
                            entry["id"] = tc.id
                        if tc.function and tc.function.name:
                            entry["name"] = tc.function.name
                        if tc.function and tc.function.arguments:
                            entry["arguments"] += tc.function.arguments
        except Exception as exc:
            logger.warning("DeepSeek stream interrupted: %s", exc)
            yield {"type": "error", "message": f"DeepSeek stream error: {exc}"}
            return

        if finish_reason == "tool_calls" and tool_call_buf:
            assistant_tool_calls = []
            for entry in tool_call_buf.values():
                assistant_tool_calls.append(
                    {
                        "id": entry["id"],
                        "type": "function",
                        "function": {"name": entry["name"], "arguments": entry["arguments"]},
                    }
                )
            messages.append(
                {"role": "assistant", "content": content_buf or None, "tool_calls": assistant_tool_calls}
            )

            for entry in tool_call_buf.values():
                try:
                    args = json.loads(entry["arguments"]) if entry["arguments"] else {}
                except json.JSONDecodeError:
                    args = {}

                yield {"type": "tool_call_start", "tool": entry["name"], "args": args}
                result = _execute_tool(db, user_id, user_email, entry["name"], args)
                yield {"type": "tool_call_result", "tool": entry["name"], "result": result}

                # A profile write is the one thing the model does that outlasts
                # the conversation, so it gets its own event and its own UI.
                if entry["name"] == _PROFILE_WRITE_TOOL and result.get("updated"):
                    yield {
                        "type": "profile_update",
                        "changes": result.get("changes", []),
                        "reason": args.get("reason"),
                    }

                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": entry["id"],
                        "content": _serialize_result(entry["name"], result),
                    }
                )
            continue

        logger.info(
            "AI chat completed for user %s: %d prompt tokens, %d completion tokens",
            user_id,
            prompt_tokens,
            completion_tokens,
        )
        yield {
            "type": "done",
            "content": content_buf,
            "usage": {"prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens},
        }
        return

    logger.warning(
        "AI chat hit the tool-round limit for user %s (%d prompt tokens)", user_id, prompt_tokens
    )
    yield {"type": "error", "message": "Reached maximum tool-call rounds without a final answer."}
