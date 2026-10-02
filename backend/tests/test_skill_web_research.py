"""web-research skill: OpenRouter web-plugin tool, cost reporting, error hygiene (no network)."""
import json

import httpx
import pytest

from app import ai_skills
from app.ai_skills.web_research import tools
from app.config import settings
from app.services import ai_service

PAYLOAD = {
    "choices": [
        {
            "message": {
                "content": "ASML reported record orders [1].",
                "annotations": [
                    {"type": "url_citation", "url_citation": {
                        "url": "https://a.example/1", "title": "Orders", "content": "x" * 900}},
                    {"type": "url_citation", "url_citation": {
                        "url": "https://a.example/1", "title": "dup", "content": "dup"}},
                    {"type": "url_citation", "url_citation": {
                        "url": "https://b.example/2", "title": "Second", "content": "s"}},
                    {"type": "something_else"},
                ],
            }
        }
    ],
    "usage": {"prompt_tokens": 1000, "completion_tokens": 200, "cost": 0.0021},
}


@pytest.fixture
def web(monkeypatch):
    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr(settings, "AI_WEB_SEARCH_MODEL", None)
    monkeypatch.setattr(settings, "AI_WEB_SEARCH_MAX_RESULTS", 5)
    seen = {}

    def install(handler):
        def wrapped(request: httpx.Request):
            seen["request"] = request
            seen["body"] = json.loads(request.content)
            return handler(request)

        monkeypatch.setattr(
            tools, "_client", lambda: httpx.Client(transport=httpx.MockTransport(wrapped))
        )

    install(lambda r: httpx.Response(200, json=PAYLOAD))
    return seen, install


def test_parses_citations_and_reports_cost(web):
    seen, _ = web
    out = tools.web_search_tool(None, 1, "ASML orders 2026", max_results=5)
    assert [r["url"] for r in out["results"]] == ["https://a.example/1", "https://b.example/2"]
    assert len(out["results"][0]["snippet"]) <= tools.SNIPPET_CHARS
    assert out["answer_summary"].startswith("ASML reported")
    assert out["_cost_usd"] == pytest.approx(0.0021 + tools.SEARCH_FEE_USD)
    assert "third-party" in out["note"]
    body = seen["body"]
    assert body["plugins"] == [{"id": "web", "max_results": 5}]
    assert body["model"] == settings.AI_DEFAULT_MODEL
    assert body["usage"] == {"include": True}
    assert seen["request"].headers["authorization"] == "Bearer test-key"
    assert str(seen["request"].url).endswith("/chat/completions")


def test_uses_search_model_and_clamps_results(web, monkeypatch):
    seen, _ = web
    monkeypatch.setattr(settings, "AI_WEB_SEARCH_MODEL", "google/gemini-3.5-flash-lite")
    monkeypatch.setattr(settings, "AI_WEB_SEARCH_MAX_RESULTS", 3)
    tools.web_search_tool(None, 1, "q", max_results=50)
    assert seen["body"]["model"] == "google/gemini-3.5-flash-lite"
    assert seen["body"]["plugins"][0]["max_results"] == 3


def test_cost_estimated_when_usage_cost_missing(web):
    _, install = web
    payload = {**PAYLOAD, "usage": {"prompt_tokens": 1_000_000, "completion_tokens": 0}}
    install(lambda r: httpx.Response(200, json=payload))
    out = tools.web_search_tool(None, 1, "q")
    assert out["_cost_usd"] == pytest.approx(
        settings.AI_FALLBACK_PRICE_IN_PER_M + tools.SEARCH_FEE_USD
    )


def test_no_citations_is_flagged(web):
    _, install = web
    install(
        lambda r: httpx.Response(
            200, json={"choices": [{"message": {"content": "hm"}}], "usage": {"cost": 0}}
        )
    )
    out = tools.web_search_tool(None, 1, "q")
    assert out["results"] == [] and "No sources" in out["warning"]


def test_http_error_hides_details(web):
    _, install = web
    install(lambda r: httpx.Response(500, text="upstream SECRET stack trace"))
    out = tools.web_search_tool(None, 1, "q")
    assert out == {"error": tools.GENERIC_ERROR}


def test_exception_hides_details(web, monkeypatch):
    def boom():
        raise RuntimeError("secret-token-123")

    monkeypatch.setattr(tools, "_client", boom)
    out = tools.web_search_tool(None, 1, "q")
    assert out == {"error": tools.GENERIC_ERROR}


def test_missing_key_and_empty_query(monkeypatch):
    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", None)
    assert tools.web_search_tool(None, 1, "q") == {"error": tools.GENERIC_ERROR}
    assert "error" in tools.web_search_tool(None, 1, "   ")


def test_skill_loads_and_requires_flag(monkeypatch):
    registry = ai_skills.load_all(core_tool_names=set(ai_service.TOOL_DISPATCH))
    skill = registry["web-research"]
    assert skill.command == "web"
    assert skill.requires == ["web_search"]
    assert skill.max_rounds == 12
    assert skill.tool_names == ["web_search_tool"]

    monkeypatch.setattr(ai_skills, "_REGISTRY", dict(registry))
    monkeypatch.setattr(settings, "AI_WEB_SEARCH_ENABLED", False)
    assert ai_skills.get_skill("web-research") is None
    assert "web-research" not in [s.name for s in ai_skills.available_skills()]
    monkeypatch.setattr(settings, "AI_WEB_SEARCH_ENABLED", True)
    assert ai_skills.get_skill("web-research") is not None
