"""Keeping the prompt inside a token budget.

The exact count is only known after the call (OpenRouter reports it), so before the call we
estimate. Greek text costs roughly twice as many tokens per character as English, which a
plain `len / 4` badly underestimates, so the estimate weighs non-ASCII characters higher.
"""
import json
from typing import Any

COMPACT_TOOL_RESULT_CHARS = 600
# Tool results in turns older than this many are compacted before any turn is dropped.
KEEP_FULL_TURNS = 2
MESSAGE_OVERHEAD_TOKENS = 4


def estimate_tokens(text: str) -> int:
    ascii_chars = sum(1 for char in text if ord(char) < 128)
    return (ascii_chars + 3) // 4 + (len(text) - ascii_chars + 1) // 2


def message_tokens(message: dict[str, Any]) -> int:
    content = message.get("content") or ""
    if not isinstance(content, str):
        content = json.dumps(content, ensure_ascii=False)
    total = MESSAGE_OVERHEAD_TOKENS + estimate_tokens(content)
    if message.get("tool_calls"):
        total += estimate_tokens(json.dumps(message["tool_calls"], ensure_ascii=False))
    if message.get("reasoning_details"):
        total += estimate_tokens(json.dumps(message["reasoning_details"], ensure_ascii=False))
    return total


def messages_tokens(messages: list[dict[str, Any]]) -> int:
    return sum(message_tokens(message) for message in messages)


def _turns(messages: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    """Split the history at user messages, so a tool call is never separated from its result."""
    turns: list[list[dict[str, Any]]] = []
    for message in messages:
        if message["role"] == "user" or not turns:
            turns.append([])
        turns[-1].append(message)
    return turns


def _compact(message: dict[str, Any]) -> dict[str, Any]:
    content = str(message.get("content") or "")
    if message["role"] != "tool" or len(content) <= COMPACT_TOOL_RESULT_CHARS:
        return message
    return {
        **message,
        "content": content[:COMPACT_TOOL_RESULT_CHARS]
        + "\n[Older tool result shortened to save context. Call the tool again if you need it.]",
    }


def fit_history(
    messages: list[dict[str, Any]], budget_tokens: int
) -> tuple[list[dict[str, Any]], int]:
    """Return the history that fits `budget_tokens`, and how many earlier turns were dropped.

    First older tool results are shortened; then whole turns are dropped, oldest first. The
    latest turn is always kept, even if it alone exceeds the budget."""
    turns = _turns(messages)
    turns = [
        turn if index >= len(turns) - KEEP_FULL_TURNS else [_compact(m) for m in turn]
        for index, turn in enumerate(turns)
    ]
    dropped = 0
    while len(turns) > 1 and sum(messages_tokens(turn) for turn in turns) > budget_tokens:
        turns.pop(0)
        dropped += 1
    return [message for turn in turns for message in turn], dropped
