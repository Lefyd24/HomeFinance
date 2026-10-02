"""OpenRouter client: streaming chat with tools, and the model catalogue.

Ported from PolTrust. Deliberately small: it sends requests and reports what OpenRouter
returned (tokens, cost). Budgeting and recording are the caller's job.
"""
import json
import time
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.config import settings


class LLMConfigError(Exception):
    """The client cannot run (for example, no API key is configured)."""


class LLMStreamError(Exception):
    """The provider reported an error in the middle of a stream."""


def _raise_for_status(response: httpx.Response) -> None:
    """raise_for_status, but with the provider's error body (a bare 400 does not say which
    parameter was refused). The body is for server-side logs only."""
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as error:
        raise httpx.HTTPStatusError(
            f"{error}\nResponse body: {response.text[:2000]}",
            request=error.request,
            response=response,
        ) from None


RETRYABLE_STATUSES = {429, 500, 502, 503, 504}
MAX_ATTEMPTS = 6
BACKOFF_SECONDS = 2.0


def _retry_delay(response: httpx.Response, attempt: int) -> float:
    """Honour Retry-After when the provider sends it, else back off exponentially (2, 4, 8...)."""
    header = response.headers.get("retry-after", "")
    if header.isdigit():
        return min(float(header), 60.0)
    return min(BACKOFF_SECONDS * 2**attempt, 60.0)


@dataclass
class Usage:
    """Token and cost accounting for one model call, as OpenRouter reported it."""

    prompt_tokens: int = 0
    completion_tokens: int = 0
    cached_tokens: int = 0
    reasoning_tokens: int = 0
    cost_usd: float | None = None  # None when OpenRouter did not report a cost

    @classmethod
    def from_payload(cls, usage: dict[str, Any]) -> "Usage":
        prompt_details: dict[str, Any] = usage.get("prompt_tokens_details") or {}
        completion_details: dict[str, Any] = usage.get("completion_tokens_details") or {}
        cost = usage.get("cost")
        return cls(
            prompt_tokens=int(usage.get("prompt_tokens") or 0),
            completion_tokens=int(usage.get("completion_tokens") or 0),
            cached_tokens=int(prompt_details.get("cached_tokens") or 0),
            reasoning_tokens=int(completion_details.get("reasoning_tokens") or 0),
            cost_usd=float(cost) if cost is not None else None,
        )


@dataclass
class ToolCallRequest:
    """A function call the model asked for. `arguments` is the raw JSON string it wrote."""

    id: str
    name: str
    arguments: str


@dataclass
class TextDelta:
    text: str


@dataclass
class ReasoningDelta:
    """A piece of the model's reasoning, streamed while it thinks."""

    text: str


@dataclass
class ToolCallStarted:
    """The model began a function call (named on its first streamed chunk)."""

    id: str
    name: str


@dataclass
class ChatCompletion:
    """The assembled result of one streamed chat call."""

    text: str
    tool_calls: list[ToolCallRequest]
    finish_reason: str | None
    model: str
    usage: Usage
    duration_ms: int
    reasoning: str = ""
    # A reasoning model needs these back, unmodified, on the assistant message that carries
    # tool calls to keep its train of thought across steps.
    reasoning_details: list[dict[str, Any]] = field(default_factory=list)


# Fields whose streamed fragments are pieces of one string; every other field is metadata.
_DETAIL_TEXT_FIELDS = ("text", "summary", "data")


def _merge_reasoning_details(acc: dict[int, dict[str, Any]], chunk: Any) -> None:
    """Reassemble `reasoning_details`: chunks of one entry share an `index`, their text
    fragments concatenate and the signature/ids arrive on whichever chunk carries them."""
    if not isinstance(chunk, list):
        return
    for position, item in enumerate(chunk):
        if not isinstance(item, dict):
            continue
        entry = acc.setdefault(int(item.get("index", position)), {})
        for key, value in item.items():
            if value is None:
                entry.setdefault(key, None)
            elif key in _DETAIL_TEXT_FIELDS and isinstance(value, str):
                entry[key] = f"{entry.get(key) or ''}{value}"
            else:
                entry[key] = value


def _reasoning_text(delta: dict[str, Any]) -> str:
    """Use `reasoning` (plain text) if present, else the text in `reasoning_details`."""
    plain = delta.get("reasoning")
    if isinstance(plain, str) and plain:
        return plain
    details: list[dict[str, Any]] = delta.get("reasoning_details") or []
    return "".join(str(d.get("text") or d.get("summary") or "") for d in details)


class OpenRouterClient:
    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        http: httpx.Client | None = None,
    ) -> None:
        key = api_key if api_key is not None else settings.OPENROUTER_API_KEY
        if not key:
            raise LLMConfigError("OPENROUTER_API_KEY is not set.")
        self._base_url = (base_url or settings.OPENROUTER_BASE_URL).rstrip("/")
        self._http = http or httpx.Client(timeout=settings.AI_CHAT_TIMEOUT_SECONDS)
        self._headers = {
            "Authorization": f"Bearer {key}",
            "HTTP-Referer": "https://github.com/personal-finance",
            "X-Title": "Personal Finance",
        }

    def stream_chat(
        self,
        model: str,
        messages: list[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        max_tokens: int | None = None,
        temperature: float = 0.2,
        tool_choice: str | None = None,
    ) -> Generator[TextDelta | ReasoningDelta | ToolCallStarted | ChatCompletion]:
        """Stream an OpenAI-compatible chat call with optional function tools.

        Yields deltas as they arrive and finally one `ChatCompletion` with the assembled
        text, the tool calls (arguments concatenated by index) and the usage frame OpenRouter
        sends just before `[DONE]`. Transient errors are retried only before the first byte:
        once text has been shown to the user a retry would duplicate it."""
        body: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": True,
            "usage": {"include": True},
            "temperature": temperature,
        }
        if tools:
            body["tools"] = tools
            if tool_choice:
                body["tool_choice"] = tool_choice  # e.g. "none": answer in text, no more calls
        if max_tokens:
            body["max_tokens"] = max_tokens
        started = time.monotonic()
        text: list[str] = []
        thoughts: list[str] = []
        details: dict[int, dict[str, Any]] = {}
        calls: dict[int, dict[str, str]] = {}
        finish_reason: str | None = None
        answered_model = model
        usage = Usage()
        with self._open_stream("/chat/completions", body) as response:
            for line in response.iter_lines():
                if not line.startswith("data:"):
                    continue  # blank separators and ": OPENROUTER PROCESSING" keep-alives
                payload = line[5:].strip()
                if payload == "[DONE]":
                    break
                chunk: dict[str, Any] = json.loads(payload)
                if chunk.get("error"):
                    error: dict[str, Any] = chunk["error"]
                    raise LLMStreamError(str(error.get("message") or error))
                answered_model = chunk.get("model") or answered_model
                if chunk.get("usage"):
                    usage = Usage.from_payload(chunk["usage"])
                choices: list[dict[str, Any]] = chunk.get("choices") or []
                if not choices:
                    continue
                choice = choices[0]
                finish_reason = choice.get("finish_reason") or finish_reason
                delta: dict[str, Any] = choice.get("delta") or {}
                _merge_reasoning_details(details, delta.get("reasoning_details"))
                thought = _reasoning_text(delta)
                if thought:
                    thoughts.append(thought)
                    yield ReasoningDelta(thought)
                if delta.get("content"):
                    text.append(delta["content"])
                    yield TextDelta(delta["content"])
                call_deltas: list[dict[str, Any]] = delta.get("tool_calls") or []
                for call in call_deltas:
                    index = int(call.get("index", len(calls)))
                    slot = calls.setdefault(index, {"id": "", "name": "", "arguments": ""})
                    function: dict[str, Any] = call.get("function") or {}
                    named = bool(slot["name"])
                    slot["id"] = call.get("id") or slot["id"]
                    slot["name"] += function.get("name") or ""
                    slot["arguments"] += function.get("arguments") or ""
                    if slot["name"] and not named:
                        yield ToolCallStarted(slot["id"] or f"call_{index}", slot["name"])
        yield ChatCompletion(
            text="".join(text),
            tool_calls=[
                ToolCallRequest(slot["id"] or f"call_{index}", slot["name"], slot["arguments"])
                for index, slot in sorted(calls.items())
                if slot["name"]
            ],
            finish_reason=finish_reason,
            model=answered_model,
            usage=usage,
            duration_ms=int((time.monotonic() - started) * 1000),
            reasoning="".join(thoughts),
            reasoning_details=[details[index] for index in sorted(details)],
        )

    @contextmanager
    def _open_stream(self, path: str, body: dict[str, Any]) -> Generator[httpx.Response]:
        for attempt in range(MAX_ATTEMPTS):
            last = attempt == MAX_ATTEMPTS - 1
            try:
                with self._http.stream(
                    "POST", f"{self._base_url}{path}", json=body, headers=self._headers
                ) as response:
                    if response.status_code in RETRYABLE_STATUSES and not last:
                        delay = _retry_delay(response, attempt)
                    else:
                        if response.is_error:
                            response.read()
                        _raise_for_status(response)
                        yield response
                        return
            except httpx.TransportError:
                if last:
                    raise
                delay = BACKOFF_SECONDS * 2**attempt
            time.sleep(delay)
        raise AssertionError("unreachable")

    def list_models(self) -> list[dict[str, Any]]:
        """OpenRouter's model catalogue: context length, prices and supported parameters."""
        response = self._http.get(f"{self._base_url}/models", headers=self._headers, timeout=20)
        _raise_for_status(response)
        data: list[dict[str, Any]] = response.json().get("data") or []
        return data
