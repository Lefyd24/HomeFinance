"""System prompt construction and the /api/ai/chat SSE endpoint.

No test calls DeepSeek — the client is stubbed with canned tool-call payloads,
in keeping with conftest.py's offline discipline.
"""
import json
from types import SimpleNamespace

import pytest

from app.services import ai_service
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


def _chunk(*, content=None, tool_calls=None, finish_reason=None, usage=None):
    delta = SimpleNamespace(content=content, tool_calls=tool_calls)
    choice = SimpleNamespace(delta=delta, finish_reason=finish_reason)
    return SimpleNamespace(choices=[choice], usage=usage)


class _StubClient:
    """Replays canned streams, one per `create` call."""

    def __init__(self, streams):
        self._streams = list(streams)
        self.calls = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        return self._streams.pop(0)


@pytest.fixture()
def stub_deepseek(monkeypatch):
    """Installs a stub OpenAI client and a fake API key."""
    from app.config import settings

    monkeypatch.setattr(settings, "DEEPSEEK_API_KEY", "test-key")

    holder = {}

    def _install(streams):
        client = _StubClient(streams)
        holder["client"] = client
        monkeypatch.setattr(ai_service, "OpenAI", lambda **kwargs: client)
        return client

    return _install


def _events(response):
    return [
        json.loads(line[len("data: "):])
        for line in response.text.split("\n\n")
        if line.startswith("data: ")
    ]


def test_status_reports_configuration(client, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "DEEPSEEK_API_KEY", None)
    body = client.get("/api/ai/status").json()
    assert body["configured"] is False
    assert "investment_tools_enabled" in body


def test_chat_without_a_key_yields_an_error_event(client, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "DEEPSEEK_API_KEY", None)
    response = client.post("/api/ai/chat", json={"messages": [{"role": "user", "content": "hi"}]})

    assert response.status_code == 200
    assert _events(response)[0]["type"] == "error"


def test_plain_answer_streams_tokens_then_a_disclaimer(client, stub_deepseek):
    stub_deepseek([[_chunk(content="You "), _chunk(content="hold "),
                    _chunk(content="two funds.", finish_reason="stop")]])

    response = client.post(
        "/api/ai/chat", json={"messages": [{"role": "user", "content": "what do I hold?"}]}
    )
    events = _events(response)

    assert [e["type"] for e in events if e["type"] == "token"] == ["token"] * 3
    done = next(e for e in events if e["type"] == "done")
    assert done["content"] == "You hold two funds."
    # Server-generated, so the model can never talk its way out of it.
    assert events[-1] == {"type": "disclaimer", "text": DISCLAIMER}


def test_no_disclaimer_when_there_was_no_answer(client, stub_deepseek):
    stub_deepseek([[_chunk(content=None, finish_reason="stop")]])
    response = client.post("/api/ai/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert not any(e["type"] == "disclaimer" for e in _events(response))


def _tool_call_chunk(index, call_id, name, arguments):
    return _chunk(
        tool_calls=[
            SimpleNamespace(
                index=index,
                id=call_id,
                function=SimpleNamespace(name=name, arguments=arguments),
            )
        ]
    )


def test_a_tool_call_round_emits_start_and_result(client, stub_deepseek, seed_user, db):
    make_investment_account(db, seed_user, name="Broker")
    stub_deepseek(
        [
            [
                _tool_call_chunk(0, "call_1", "get_portfolio_overview_tool", "{}"),
                _chunk(finish_reason="tool_calls"),
            ],
            [_chunk(content="You have one account.", finish_reason="stop")],
        ]
    )

    response = client.post(
        "/api/ai/chat", json={"messages": [{"role": "user", "content": "my portfolio?"}]}
    )
    events = _events(response)

    start = next(e for e in events if e["type"] == "tool_call_start")
    result = next(e for e in events if e["type"] == "tool_call_result")
    assert start["tool"] == "get_portfolio_overview_tool"
    assert result["result"]["has_investments"] is True


def test_a_profile_write_emits_its_own_event(client, stub_deepseek, db, seed_user):
    """The one model action that outlasts the conversation gets its own UI."""
    stub_deepseek(
        [
            [
                _tool_call_chunk(
                    0, "call_1", "update_investor_profile_tool",
                    json.dumps({"updates": {"horizon_years": 3},
                                "reason": "User said they need it in three years."}),
                ),
                _chunk(finish_reason="tool_calls"),
            ],
            [_chunk(content="Noted.", finish_reason="stop")],
        ]
    )

    response = client.post(
        "/api/ai/chat",
        json={"messages": [{"role": "user", "content": "I need this money in 3 years"}]},
    )

    update = next(e for e in _events(response) if e["type"] == "profile_update")
    assert update["changes"][0] == {"field": "horizon_years", "old_value": None, "new_value": 3}
    assert "three years" in update["reason"]
    assert profile_svc.get_profile(db, seed_user.id).horizon_years == 3


def test_a_failed_profile_write_emits_no_profile_event(client, stub_deepseek, db, seed_user):
    stub_deepseek(
        [
            [
                _tool_call_chunk(
                    0, "call_1", "update_investor_profile_tool",
                    json.dumps({"updates": {"risk_tolerance": "bananas"}, "reason": "x"}),
                ),
                _chunk(finish_reason="tool_calls"),
            ],
            [_chunk(content="Sorry.", finish_reason="stop")],
        ]
    )

    events = _events(
        client.post("/api/ai/chat", json={"messages": [{"role": "user", "content": "go"}]})
    )
    assert not any(e["type"] == "profile_update" for e in events)


def test_the_model_receives_the_tools_and_the_system_prompt(client, stub_deepseek):
    stub_client = stub_deepseek([[_chunk(content="Hi.", finish_reason="stop")]])
    client.post("/api/ai/chat", json={"messages": [{"role": "user", "content": "hi"}]})

    call = stub_client.calls[0]
    assert call["messages"][0]["role"] == "system"
    assert "Never do arithmetic" in call["messages"][0]["content"]
    assert any(t["function"]["name"] == "get_portfolio_allocation_tool" for t in call["tools"])
    assert call["stream_options"] == {"include_usage": True}


def test_usage_is_reported_on_done(client, stub_deepseek):
    stub_deepseek(
        [
            [
                _chunk(content="Hi.", finish_reason="stop"),
                _chunk(usage=SimpleNamespace(prompt_tokens=120, completion_tokens=8)),
            ]
        ]
    )
    events = _events(
        client.post("/api/ai/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    )
    done = next(e for e in events if e["type"] == "done")
    assert done["usage"] == {"prompt_tokens": 120, "completion_tokens": 8}


def test_the_tool_round_limit_ends_the_stream(client, stub_deepseek, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "AI_CHAT_MAX_TOOL_ROUNDS", 2)
    looping = [
        [_tool_call_chunk(0, f"c{i}", "get_debts_tool", "{}"), _chunk(finish_reason="tool_calls")]
        for i in range(2)
    ]
    stub_deepseek(looping)

    events = _events(
        client.post("/api/ai/chat", json={"messages": [{"role": "user", "content": "go"}]})
    )
    assert events[-1]["type"] == "error"
    assert "maximum tool-call rounds" in events[-1]["message"]


def test_chat_is_rate_limited_per_user(client, stub_deepseek, monkeypatch):
    from app.routers import ai_chat as ai_chat_router
    from app.utils.rate_limit import SlidingWindowRateLimiter

    monkeypatch.setattr(
        ai_chat_router, "_chat_limiter", SlidingWindowRateLimiter(max_hits=2, window_seconds=3600)
    )
    stub_deepseek([[_chunk(content="ok", finish_reason="stop")] for _ in range(2)])

    body = {"messages": [{"role": "user", "content": "hi"}]}
    assert client.post("/api/ai/chat", json=body).status_code == 200
    assert client.post("/api/ai/chat", json=body).status_code == 200

    limited = client.post("/api/ai/chat", json=body)
    assert limited.status_code == 429
    assert "Retry-After" in limited.headers
