"""System prompt construction and the /api/ai/chat SSE endpoint.

No test calls OpenRouter — the client is a fake replaying canned streams,
in keeping with conftest.py's offline discipline.
"""
import json
import pytest

from app.config import settings
from app.llm.openrouter import (
    ChatCompletion,
    OpenRouterClient,
    ReasoningDelta,
    TextDelta,
    ToolCallRequest,
    ToolCallStarted,
    Usage,
)
from app.services import ai_models, ai_usage_service
from app.services import investor_profile_service as profile_svc
from app.services.ai_prompt import DISCLAIMER, build_system_prompt
from tests.factories import make_account, make_investment_account


# --- system prompt ---------------------------------------------------------


def test_prompt_states_todays_date(db, seed_user):
    """A financial assistant left to guess what "this month" means guesses wrong."""
    from datetime import date

    assert date.today().isoformat() in build_system_prompt(db, seed_user)


def test_prompt_says_the_profile_is_unset_and_what_to_do(db, seed_user):
    prompt = build_system_prompt(db, seed_user)
    assert "INVESTOR PROFILE: not set" in prompt
    assert "ask for what you need" in prompt


def test_prompt_carries_the_profile_when_set(db, seed_user):
    profile_svc.apply_updates(
        db,
        seed_user.id,
        {
            "risk_tolerance": "balanced",
            "horizon_years": 12,
            "max_single_position_pct": 20,
            "excluded_symbols": ["TSLA"],
            "target_allocation": {"equity": 70, "bond": 20, "cash": 10},
        },
    )

    prompt = build_system_prompt(db, seed_user)

    assert "Risk tolerance: balanced" in prompt
    assert "Investment horizon (years): 12" in prompt
    assert "Maximum single position (%): 20" in prompt
    assert "Excluded symbols: TSLA" in prompt
    assert "equity 70%" in prompt


def test_prompt_flags_a_stale_profile(db, seed_user):
    from datetime import datetime, timedelta

    profile_svc.apply_updates(db, seed_user.id, {"risk_tolerance": "growth"})
    profile = profile_svc.get_profile(db, seed_user.id)
    profile.updated_at = datetime.utcnow() - timedelta(days=400)
    db.commit()

    assert "not been reviewed in over six months" in build_system_prompt(db, seed_user)


def test_prompt_says_when_no_brokerage_is_connected(db, seed_user):
    make_account(db, seed_user, name="Current", type="checking")
    prompt = build_system_prompt(db, seed_user)
    assert "No brokerage accounts are connected" in prompt


def test_prompt_counts_brokerage_accounts(db, seed_user):
    make_account(db, seed_user, name="Current", type="checking")
    make_investment_account(db, seed_user, name="Broker")

    prompt = build_system_prompt(db, seed_user)

    assert "2 active account(s), 1 of which are brokerage-synced" in prompt
    assert "No brokerage accounts are connected" not in prompt


def test_prompt_forbids_arithmetic_and_price_prediction(db, seed_user):
    """The two rules the whole design rests on."""
    prompt = build_system_prompt(db, seed_user)
    assert "Never do arithmetic" in prompt
    assert "Never predict a price" in prompt


# --- the chat endpoint -----------------------------------------------------

DEFAULT_MODEL = "deepseek/deepseek-chat-v3.1"


def _catalog_entry(model_id, *, tools=True, prompt="0.000001", completion="0.000004", ctx=64000):
    return {
        "id": model_id,
        "name": model_id.split("/")[-1],
        "context_length": ctx,
        "pricing": {"prompt": prompt, "completion": completion},
        "supported_parameters": ["tools", "temperature"] if tools else ["temperature"],
    }


def _completion(text="", tool_calls=(), usage=None, model=DEFAULT_MODEL, reasoning_details=None):
    return ChatCompletion(
        text=text,
        tool_calls=[ToolCallRequest(*call) for call in tool_calls],
        finish_reason="tool_calls" if tool_calls else "stop",
        model=model,
        usage=usage or Usage(prompt_tokens=100, completion_tokens=10, cost_usd=0.001),
        duration_ms=5,
        reasoning_details=reasoning_details or [],
    )


def _answer(*pieces, usage=None):
    """One model call that answers in text."""
    return [*(TextDelta(p) for p in pieces), _completion("".join(pieces), usage=usage)]


def _tool_round(call_id, name, arguments, usage=None, reasoning_details=None):
    return [
        ToolCallStarted(call_id, name),
        _completion(
            "", [(call_id, name, arguments)], usage=usage, reasoning_details=reasoning_details
        ),
    ]


class FakeClient:
    """Replays canned streams, one per `stream_chat` call, and serves a fake catalogue."""

    def __init__(self, streams=(), catalogue=()):
        self._streams = list(streams)
        self.catalogue = list(catalogue)
        self.calls = []
        self.list_calls = 0

    def stream_chat(self, model, messages, **kwargs):
        # Snapshot: the agent keeps appending to its own list between rounds.
        self.calls.append({"model": model, "messages": list(messages), **kwargs})
        yield from self._streams.pop(0)

    def list_models(self):
        self.list_calls += 1
        return self.catalogue


@pytest.fixture(autouse=True)
def _fresh_catalog():
    ai_models.catalog.reset()
    yield
    ai_models.catalog.reset()


@pytest.fixture()
def stub_llm(monkeypatch):
    """Installs a fake OpenRouter client and a fake API key."""
    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", "test-key")

    def _install(streams, catalogue=()):
        fake = FakeClient(streams, catalogue)
        monkeypatch.setattr(ai_models, "make_client", lambda: fake)
        return fake

    return _install


def _events(response):
    return [
        json.loads(line[len("data: "):])
        for line in response.text.split("\n\n")
        if line.startswith("data: ")
    ]


def _chat(client, content="hi", **extra):
    return client.post(
        "/api/ai/chat", json={"messages": [{"role": "user", "content": content}], **extra}
    )


def test_status_reports_configuration(client, monkeypatch):
    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", None)
    body = client.get("/api/ai/status").json()
    assert body["configured"] is False
    assert "investment_tools_enabled" in body
    assert body["default_model"] == settings.AI_DEFAULT_MODEL


def test_chat_without_a_key_yields_an_error_event(client, monkeypatch):
    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", None)
    response = _chat(client)

    assert response.status_code == 200
    events = _events(response)
    assert events[0] == {"type": "error", "message": "AI chat is not configured."}


def test_plain_answer_streams_tokens_then_a_disclaimer(client, stub_llm):
    stub_llm([_answer("You ", "hold ", "two funds.")])

    events = _events(_chat(client, "what do I hold?"))

    assert [e["type"] for e in events if e["type"] == "token"] == ["token"] * 3
    done = next(e for e in events if e["type"] == "done")
    assert done["content"] == "You hold two funds."
    # Server-generated, so the model can never talk its way out of it.
    assert events[-1] == {"type": "disclaimer", "text": DISCLAIMER}


def test_no_disclaimer_when_there_was_no_answer(client, stub_llm):
    stub_llm([[_completion("")]])
    assert not any(e["type"] == "disclaimer" for e in _events(_chat(client)))


def test_reasoning_deltas_are_forwarded(client, stub_llm):
    stub_llm([[ReasoningDelta("thinking..."), TextDelta("Hi."), _completion("Hi.")]])
    events = _events(_chat(client))
    assert {"type": "reasoning", "text": "thinking..."} in events


def test_a_tool_call_round_emits_start_and_result(client, stub_llm, seed_user, db):
    make_investment_account(db, seed_user, name="Broker")
    stub_llm(
        [
            _tool_round("call_1", "get_portfolio_overview_tool", "{}"),
            _answer("You have one account."),
        ]
    )

    events = _events(_chat(client, "my portfolio?"))

    start = next(e for e in events if e["type"] == "tool_call_start")
    result = next(e for e in events if e["type"] == "tool_call_result")
    assert start["tool"] == "get_portfolio_overview_tool"
    assert result["result"]["has_investments"] is True


def test_reasoning_details_return_on_the_tool_call_message(client, stub_llm):
    details = [{"type": "reasoning.text", "text": "plan", "signature": "sig"}]
    fake = stub_llm(
        [
            _tool_round("c1", "get_debts_tool", "{}", reasoning_details=details),
            _answer("Done."),
        ]
    )
    _chat(client)

    second = fake.calls[1]["messages"]
    assistant = next(m for m in second if m["role"] == "assistant")
    assert assistant["reasoning_details"] == details
    assert assistant["tool_calls"][0]["function"]["name"] == "get_debts_tool"
    assert any(m["role"] == "tool" and m["tool_call_id"] == "c1" for m in second)


def test_a_profile_write_emits_its_own_event(client, stub_llm, db, seed_user):
    """The one model action that outlasts the conversation gets its own UI."""
    stub_llm(
        [
            _tool_round(
                "call_1",
                "update_investor_profile_tool",
                json.dumps(
                    {
                        "updates": {"horizon_years": 3},
                        "reason": "User said they need it in three years.",
                    }
                ),
            ),
            _answer("Noted."),
        ]
    )

    events = _events(_chat(client, "I need this money in 3 years"))

    update = next(e for e in events if e["type"] == "profile_update")
    assert update["changes"][0] == {"field": "horizon_years", "old_value": None, "new_value": 3}
    assert "three years" in update["reason"]
    assert profile_svc.get_profile(db, seed_user.id).horizon_years == 3


def test_a_failed_profile_write_emits_no_profile_event(client, stub_llm, db, seed_user):
    stub_llm(
        [
            _tool_round(
                "call_1",
                "update_investor_profile_tool",
                json.dumps({"updates": {"risk_tolerance": "bananas"}, "reason": "x"}),
            ),
            _answer("Sorry."),
        ]
    )

    events = _events(_chat(client, "go"))
    assert not any(e["type"] == "profile_update" for e in events)


def test_the_model_receives_the_tools_and_the_system_prompt(client, stub_llm):
    fake = stub_llm([_answer("Hi.")])
    _chat(client)

    call = fake.calls[0]
    assert call["model"] == settings.AI_DEFAULT_MODEL
    assert call["messages"][0]["role"] == "system"
    assert "Never do arithmetic" in call["messages"][0]["content"]
    assert any(t["function"]["name"] == "get_portfolio_allocation_tool" for t in call["tools"])
    assert call["max_tokens"] == settings.AI_MAX_OUTPUT_TOKENS


def test_done_carries_model_context_window_and_usage(client, stub_llm):
    stub_llm(
        [
            _tool_round(
                "c1", "get_debts_tool", "{}",
                usage=Usage(prompt_tokens=100, completion_tokens=5, cached_tokens=20, cost_usd=0.002),
            ),
            _answer(
                "Hi.",
                usage=Usage(prompt_tokens=150, completion_tokens=8, cached_tokens=40, cost_usd=0.003),
            ),
        ]
    )
    done = next(e for e in _events(_chat(client)) if e["type"] == "done")

    assert done["model"] == DEFAULT_MODEL
    assert done["context_window"] == 128_000  # catalogue unreachable: default window
    usage = done["usage"]
    assert set(usage) == {
        "prompt_tokens", "completion_tokens", "cached_tokens", "cost_usd", "cost_estimated",
        "peak_context_tokens", "duration_ms", "steps", "tool_calls",
    }
    assert usage["prompt_tokens"] == 250
    assert usage["completion_tokens"] == 13
    assert usage["cached_tokens"] == 60
    assert usage["cost_usd"] == pytest.approx(0.005)
    assert usage["cost_estimated"] is False
    assert usage["peak_context_tokens"] == 150
    assert usage["steps"] == 2
    assert usage["tool_calls"] == 1


def test_the_tool_round_limit_ends_the_stream(client, stub_llm, monkeypatch):
    monkeypatch.setattr(settings, "AI_CHAT_MAX_TOOL_ROUNDS", 2)
    stub_llm([_tool_round(f"c{i}", "get_debts_tool", "{}") for i in range(2)])

    events = _events(_chat(client, "go"))
    assert events[-1]["type"] == "error"
    assert "maximum tool-call rounds" in events[-1]["message"]


def test_the_turn_cost_cap_stops_the_loop(client, stub_llm, monkeypatch):
    monkeypatch.setattr(settings, "AI_TURN_COST_CAP_USD", 0.01)
    expensive = Usage(prompt_tokens=10, completion_tokens=1, cost_usd=0.02)
    fake = stub_llm([_tool_round("c1", "get_debts_tool", "{}", usage=expensive), _answer("never")])

    events = _events(_chat(client, "go"))

    assert events[-1] == {"type": "error", "message": "This answer hit the per-turn cost limit."}
    assert not any(e["type"] == "done" for e in events)
    assert len(fake.calls) == 1


def test_a_provider_failure_is_reported_generically(client, stub_llm, monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("secret upstream detail")
        yield  # pragma: no cover

    fake = stub_llm([])
    monkeypatch.setattr(fake, "stream_chat", boom)

    events = _events(_chat(client))
    assert events[-1]["type"] == "error"
    assert "secret upstream detail" not in events[-1]["message"]


def test_chat_is_rate_limited_per_user(client, stub_llm, monkeypatch):
    from app.routers import ai_chat as ai_chat_router
    from app.utils.rate_limit import SlidingWindowRateLimiter

    monkeypatch.setattr(
        ai_chat_router, "_chat_limiter", SlidingWindowRateLimiter(max_hits=2, window_seconds=3600)
    )
    stub_llm([_answer("ok") for _ in range(2)])

    assert _chat(client).status_code == 200
    assert _chat(client).status_code == 200

    limited = _chat(client)
    assert limited.status_code == 429
    assert "Retry-After" in limited.headers


# --- model selection --------------------------------------------------------


def test_a_listed_tool_model_is_used(client, stub_llm):
    fake = stub_llm([_answer("Hi.")], catalogue=[_catalog_entry("acme/fast", ctx=32000)])
    events = _events(_chat(client, model="acme/fast"))

    assert fake.calls[0]["model"] == "acme/fast"
    done = next(e for e in events if e["type"] == "done")
    assert done["model"] == "acme/fast"
    assert done["context_window"] == 32000


def test_an_unknown_model_is_a_422_before_streaming(client, stub_llm):
    fake = stub_llm([], catalogue=[_catalog_entry("acme/fast")])
    response = _chat(client, model="acme/nope")

    assert response.status_code == 422
    assert "acme/nope" in response.json()["detail"]
    assert fake.calls == []


def test_a_model_without_tools_is_a_422(client, stub_llm):
    stub_llm([], catalogue=[_catalog_entry("acme/chatty", tools=False)])
    assert _chat(client, model="acme/chatty").status_code == 422


def test_the_default_model_passes_even_if_the_catalogue_is_down(client, stub_llm):
    fake = stub_llm([_answer("Hi.")], catalogue=[])
    response = _chat(client, model=settings.AI_DEFAULT_MODEL)
    assert response.status_code == 200
    assert fake.calls[0]["model"] == settings.AI_DEFAULT_MODEL


def test_anthropic_models_get_a_cache_marked_system_prompt(client, stub_llm):
    fake = stub_llm(
        [_answer("Hi.")], catalogue=[_catalog_entry("anthropic/claude-x", ctx=200000)]
    )
    _chat(client, model="anthropic/claude-x")

    system = fake.calls[0]["messages"][0]
    assert system["role"] == "system"
    block = system["content"][0]
    assert block["cache_control"] == {"type": "ephemeral"}
    assert "Never do arithmetic" in block["text"]


def test_other_models_get_a_plain_system_prompt(client, stub_llm):
    fake = stub_llm([_answer("Hi.")])
    _chat(client)
    assert isinstance(fake.calls[0]["messages"][0]["content"], str)


def test_history_is_trimmed_to_the_models_budget(client, stub_llm, monkeypatch):
    monkeypatch.setattr(settings, "AI_MAX_OUTPUT_TOKENS", 100)
    # 4k floor budget (context is tiny) minus system prompt + tool schemas leaves ~2k tokens.
    fake = stub_llm([_answer("ok")], catalogue=[_catalog_entry("acme/tiny", ctx=1000)])
    old = "word " * 1500  # ~1.9k tokens per message
    messages = [
        {"role": "user", "content": old},
        {"role": "assistant", "content": "fine"},
        {"role": "user", "content": old + "again"},
        {"role": "assistant", "content": "fine"},
        {"role": "user", "content": "latest question"},
    ]
    response = client.post("/api/ai/chat", json={"messages": messages, "model": "acme/tiny"})
    assert response.status_code == 200

    sent = fake.calls[0]["messages"]
    contents = [m["content"] for m in sent[1:]]
    assert old not in contents
    assert len(contents) < 5  # the oldest turns were dropped
    assert contents[-1] == "latest question"


# --- /ai/models -------------------------------------------------------------


def test_models_endpoint_lists_tool_models_with_per_million_prices(client, stub_llm):
    stub_llm(
        [],
        catalogue=[
            _catalog_entry("b/zeta", prompt="0.000003", completion="0.000015", ctx=200000),
            _catalog_entry("a/alpha", ctx=64000),
            _catalog_entry("c/notools", tools=False),
        ],
    )
    body = client.get("/api/ai/models").json()

    assert [m["id"] for m in body["models"]] == ["a/alpha", "b/zeta"]
    zeta = body["models"][1]
    assert zeta["prompt_per_m"] == pytest.approx(3.0)
    assert zeta["completion_per_m"] == pytest.approx(15.0)
    assert zeta["cache_read_per_m"] is None
    assert zeta["supports_tools"] is True and zeta["known"] is True
    assert zeta["history_budget"] == int(200000 * 0.95) - settings.AI_MAX_OUTPUT_TOKENS
    assert body["fetched_at"] is not None


def test_models_endpoint_without_a_key_makes_no_network_call(client, monkeypatch):
    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", None)

    def no_network(self):
        raise AssertionError("catalogue must not be fetched without a key")

    monkeypatch.setattr(OpenRouterClient, "list_models", no_network)
    assert client.get("/api/ai/models").json() == {"models": [], "fetched_at": None}


def test_models_refresh_forces_a_refetch(client, stub_llm):
    fake = stub_llm([], catalogue=[_catalog_entry("a/alpha")])
    client.get("/api/ai/models")
    client.get("/api/ai/models")
    assert fake.list_calls == 1  # cached

    fake.catalogue = [_catalog_entry("a/alpha"), _catalog_entry("d/delta")]
    body = client.post("/api/ai/models/refresh").json()
    assert fake.list_calls == 2
    assert [m["id"] for m in body["models"]] == ["a/alpha", "d/delta"]


# --- usage tracking / monthly cap ------------------------------------------


def test_a_completed_turn_is_recorded(client, stub_llm, monkeypatch):
    recorded = []
    monkeypatch.setattr(
        ai_usage_service, "record_usage", lambda db, uid, model, usage: recorded.append((uid, model, usage))
    )
    stub_llm([_answer("Hi.")])
    _chat(client)

    assert len(recorded) == 1
    _, model, usage = recorded[0]
    assert model == DEFAULT_MODEL
    assert usage["prompt_tokens"] == 100


def test_a_failed_usage_write_does_not_break_the_stream(client, stub_llm, monkeypatch):
    def broken(*args, **kwargs):
        raise RuntimeError("db down")

    monkeypatch.setattr(ai_usage_service, "record_usage", broken)
    stub_llm([_answer("Hi.")])
    events = _events(_chat(client))

    assert any(e["type"] == "done" for e in events)
    assert events[-1]["type"] == "disclaimer"


def test_monthly_cap_blocks_a_new_turn(client, stub_llm, monkeypatch):
    monkeypatch.setattr(settings, "AI_MONTHLY_CAP_USD", 5.0)
    monkeypatch.setattr(ai_usage_service, "household_month_spend", lambda db, now=None: 5.0)
    fake = stub_llm([_answer("never")])

    response = _chat(client)

    assert response.status_code == 429
    assert response.json()["detail"] == "Monthly AI budget reached."
    assert fake.calls == []


def test_below_the_monthly_cap_the_turn_runs(client, stub_llm, monkeypatch):
    monkeypatch.setattr(settings, "AI_MONTHLY_CAP_USD", 5.0)
    monkeypatch.setattr(ai_usage_service, "household_month_spend", lambda db, now=None: 4.99)
    stub_llm([_answer("ok")])
    assert _chat(client).status_code == 200


# --- transcript validation: the client resends the whole conversation every turn ---


def _post_history(client, messages):
    return client.post("/api/ai/chat", json={"messages": messages})


def test_a_long_earlier_answer_is_shortened_not_rejected(client, stub_llm):
    from app.schemas.ai_chat import MAX_ASSISTANT_MESSAGE_CHARS

    fake = stub_llm([_answer("Sure.")])
    long_answer = "x" * (MAX_ASSISTANT_MESSAGE_CHARS + 5_000)
    response = _post_history(
        client,
        [
            {"role": "user", "content": "write a long report"},
            {"role": "assistant", "content": long_answer},
            {"role": "user", "content": "thanks, and now?"},
        ],
    )

    assert response.status_code == 200
    sent = [m for m in fake.calls[0]["messages"] if m["role"] == "assistant"]
    assert all(len(m["content"]) <= MAX_ASSISTANT_MESSAGE_CHARS for m in sent)


def test_a_long_user_prompt_is_accepted(client, stub_llm):
    stub_llm([_answer("Ok.")])
    response = _chat(client, "a" * 20_000)  # was over the old 8000-char cap
    assert response.status_code == 200


def test_an_over_limit_user_prompt_gets_a_readable_422(client, stub_llm):
    from app.schemas.ai_chat import MAX_USER_MESSAGE_CHARS

    stub_llm([_answer("never")])
    response = _chat(client, "a" * (MAX_USER_MESSAGE_CHARS + 1))
    assert response.status_code == 422
    assert "too long" in json.dumps(response.json())


def test_empty_stopped_answers_are_dropped(client, stub_llm):
    fake = stub_llm([_answer("Back again.")])
    response = _post_history(
        client,
        [
            {"role": "user", "content": "first"},
            {"role": "assistant", "content": ""},
            {"role": "user", "content": "retry"},
        ],
    )

    assert response.status_code == 200
    roles = [m["role"] for m in fake.calls[0]["messages"] if m["role"] != "system"]
    assert roles == ["user", "user"]


def test_a_long_conversation_keeps_its_most_recent_messages(client, stub_llm):
    from app.schemas.ai_chat import MAX_HISTORY_MESSAGES

    fake = stub_llm([_answer("Still here.")])
    history = []
    for i in range(60):
        history += [
            {"role": "user", "content": f"q{i}"},
            {"role": "assistant", "content": f"a{i}"},
        ]
    history.append({"role": "user", "content": "latest"})

    response = _post_history(client, history)

    assert response.status_code == 200
    convo = [m for m in fake.calls[0]["messages"] if m["role"] != "system"]
    assert convo[-1]["content"] == "latest"
    assert convo[0]["role"] == "user"
    assert len(convo) <= MAX_HISTORY_MESSAGES
