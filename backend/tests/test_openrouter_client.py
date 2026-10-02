"""OpenRouter client against a mocked HTTP transport: streaming assembly, headers, retries."""
import json

import httpx
import pytest

from app.llm import openrouter
from app.llm.openrouter import (
    ChatCompletion,
    LLMConfigError,
    LLMStreamError,
    OpenRouterClient,
    ReasoningDelta,
    TextDelta,
    ToolCallStarted,
    _merge_reasoning_details,
)


def _sse(*chunks):
    lines = [f"data: {json.dumps(c)}\n\n" for c in chunks] + ["data: [DONE]\n\n"]
    return "".join(lines).encode()


def _client(handler):
    http = httpx.Client(transport=httpx.MockTransport(handler))
    return OpenRouterClient("key", "https://example.test/api/v1/", http=http)


def test_no_api_key_is_a_config_error(monkeypatch):
    # Patch the instance the client module holds: test_crypto reloads app.config,
    # after which `app.config.settings` is a different object.
    from app.llm import openrouter

    monkeypatch.setattr(openrouter.settings, "OPENROUTER_API_KEY", None)
    with pytest.raises(LLMConfigError):
        OpenRouterClient()


def test_stream_assembles_text_tools_reasoning_and_usage():
    seen = {}

    def handler(request):
        seen["headers"] = request.headers
        seen["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            content=_sse(
                {"model": "m/x", "choices": [{"delta": {"reasoning": "hmm "}}]},
                {"choices": [{"delta": {"content": "Hel"}}]},
                {"choices": [{"delta": {"content": "lo"}}]},
                {"choices": [{"delta": {"tool_calls": [
                    {"index": 0, "id": "c1", "function": {"name": "get_debts_tool", "arguments": '{"a"'}}
                ]}}]},
                {"choices": [{"delta": {"tool_calls": [
                    {"index": 0, "function": {"arguments": ": 1}"}}
                ]}, "finish_reason": "tool_calls"}]},
                {"choices": [], "usage": {
                    "prompt_tokens": 50, "completion_tokens": 7, "cost": 0.0012,
                    "prompt_tokens_details": {"cached_tokens": 10},
                }},
            ),
        )

    items = list(_client(handler).stream_chat("m/x", [{"role": "user", "content": "hi"}], tools=[{"t": 1}], max_tokens=99))

    assert seen["body"]["usage"] == {"include": True}
    assert seen["body"]["stream"] is True
    assert seen["body"]["max_tokens"] == 99
    assert seen["headers"]["authorization"] == "Bearer key"
    assert seen["headers"]["x-title"] == "Personal Finance"
    assert "http-referer" in seen["headers"]

    assert [type(i) for i in items[:-1]] == [ReasoningDelta, TextDelta, TextDelta, ToolCallStarted]
    done = items[-1]
    assert isinstance(done, ChatCompletion)
    assert done.text == "Hello"
    assert done.reasoning == "hmm "
    assert done.finish_reason == "tool_calls"
    assert done.model == "m/x"
    assert (done.tool_calls[0].id, done.tool_calls[0].name, done.tool_calls[0].arguments) == (
        "c1", "get_debts_tool", '{"a": 1}'
    )
    assert done.usage.prompt_tokens == 50
    assert done.usage.cached_tokens == 10
    assert done.usage.cost_usd == pytest.approx(0.0012)


def test_a_midstream_error_raises():
    client = _client(lambda r: httpx.Response(200, content=_sse({"error": {"message": "boom"}})))
    with pytest.raises(LLMStreamError, match="boom"):
        list(client.stream_chat("m/x", []))


def test_transient_statuses_are_retried_before_the_first_byte(monkeypatch):
    monkeypatch.setattr(openrouter.time, "sleep", lambda s: None)
    calls = []

    def handler(request):
        calls.append(1)
        if len(calls) < 3:
            return httpx.Response(503, headers={"retry-after": "1"})
        return httpx.Response(200, content=_sse({"choices": [{"delta": {"content": "ok"}}]}))

    items = list(_client(handler).stream_chat("m/x", []))
    assert len(calls) == 3
    assert items[-1].text == "ok"


def test_a_client_error_is_not_retried_and_raises(monkeypatch):
    monkeypatch.setattr(openrouter.time, "sleep", lambda s: None)
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(400, json={"error": "bad param"})

    with pytest.raises(httpx.HTTPStatusError, match="bad param"):
        list(_client(handler).stream_chat("m/x", []))
    assert len(calls) == 1


def test_reasoning_details_chunks_are_merged_by_index():
    acc = {}
    _merge_reasoning_details(acc, [{"index": 0, "type": "reasoning.text", "text": "a"}])
    _merge_reasoning_details(acc, [{"index": 0, "text": "b", "signature": None}])
    _merge_reasoning_details(acc, [{"index": 0, "signature": "sig"}])
    assert acc == {0: {"index": 0, "type": "reasoning.text", "text": "ab", "signature": "sig"}}


def test_list_models_returns_the_data_array():
    client = _client(lambda r: httpx.Response(200, json={"data": [{"id": "a/b"}]}))
    assert client.list_models() == [{"id": "a/b"}]
