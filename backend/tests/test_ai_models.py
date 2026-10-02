"""Model catalogue: parsing, daily cache, stale-serve, selection and cost fallback order."""
import httpx
import pytest
from fastapi import HTTPException

from app.config import settings
from app.llm.openrouter import Usage
from app.services import ai_models
from app.services.ai_models import ModelCatalog, ModelInfo, resolve_model


def _entry(model_id, *, tools=True, **pricing):
    return {
        "id": model_id,
        "name": model_id.split("/")[-1].title(),
        "context_length": 100_000,
        "pricing": pricing or {"prompt": "0.000002", "completion": "0.00001"},
        "supported_parameters": ["tools"] if tools else [],
    }


class _Client:
    def __init__(self, entries):
        self.entries = entries
        self.calls = 0
        self.fail = False

    def list_models(self):
        self.calls += 1
        if self.fail:
            raise httpx.ConnectError("down")
        return self.entries


@pytest.fixture(autouse=True)
def _fresh_catalog():
    ai_models.catalog.reset()
    yield
    ai_models.catalog.reset()


def _info(**overrides):
    base = dict(
        id="x/y", name="Y", context_length=100_000, prompt_per_m=2.0, completion_per_m=10.0,
        cache_read_per_m=0.5, supports_tools=True, known=True,
    )
    return ModelInfo(**{**base, **overrides})


def test_parsing_converts_per_token_prices_to_per_million():
    catalog = ModelCatalog()
    client = _Client(
        [_entry("a/m", prompt="0.000003", completion="0.000015", input_cache_read="0.0000003")]
    )
    (info,) = catalog.all_models(client)

    assert info.prompt_per_m == pytest.approx(3.0)
    assert info.completion_per_m == pytest.approx(15.0)
    assert info.cache_read_per_m == pytest.approx(0.3)
    assert info.context_length == 100_000
    assert info.supports_tools and info.known


def test_only_tool_models_are_listed_sorted_by_name_then_id():
    catalog = ModelCatalog()
    client = _Client([_entry("z/zed"), _entry("a/beta"), _entry("b/alpha"), _entry("c/no", tools=False)])
    assert [m.id for m in catalog.all_models(client)] == ["b/alpha", "a/beta", "z/zed"]


def test_catalogue_is_cached_for_a_day_and_force_refetches(monkeypatch):
    catalog = ModelCatalog()
    client = _Client([_entry("a/m")])
    now = [1000.0]
    monkeypatch.setattr(ai_models.time, "monotonic", lambda: now[0])

    catalog.all_models(client)
    now[0] += ai_models.CACHE_SECONDS - 10
    catalog.all_models(client)
    assert client.calls == 1

    now[0] += 20  # past 24h
    catalog.all_models(client)
    assert client.calls == 2

    catalog.all_models(client, force=True)
    assert client.calls == 3


def test_stale_catalogue_keeps_being_served_when_the_refetch_fails(monkeypatch):
    catalog = ModelCatalog()
    client = _Client([_entry("a/m")])
    now = [1000.0]
    monkeypatch.setattr(ai_models.time, "monotonic", lambda: now[0])
    catalog.all_models(client)

    now[0] += ai_models.CACHE_SECONDS + 1
    client.fail = True
    assert [m.id for m in catalog.all_models(client)] == ["a/m"]
    assert client.calls == 2

    # Retry only after RETRY_SECONDS, not on every request.
    catalog.all_models(client)
    assert client.calls == 2
    now[0] += ai_models.RETRY_SECONDS + 1
    catalog.all_models(client)
    assert client.calls == 3


def test_unknown_ids_get_a_default_window_and_known_false():
    info = ModelCatalog().get("who/knows", None)
    assert info.known is False
    assert info.context_length == ai_models.DEFAULT_CONTEXT_TOKENS


def test_history_budget_leaves_room_for_the_answer(monkeypatch):
    monkeypatch.setattr(settings, "AI_MAX_OUTPUT_TOKENS", 4096)
    assert _info(context_length=100_000).history_budget(settings) == 95_000 - 4096
    assert _info(context_length=1_000).history_budget(settings) == 4_000  # floor


def test_cost_prefers_the_reported_cost():
    cost, estimated = _info().cost_usd(Usage(prompt_tokens=1000, completion_tokens=1000, cost_usd=0.5), settings)
    assert (cost, estimated) == (0.5, False)


def test_cost_falls_back_to_catalogue_prices_with_cache_read_rate():
    usage = Usage(prompt_tokens=1_000_000, completion_tokens=100_000, cached_tokens=400_000)
    cost, estimated = _info().cost_usd(usage, settings)
    # 600k fresh * 2 + 400k cached * 0.5 + 100k out * 10, per million
    assert cost == pytest.approx(1.2 + 0.2 + 1.0)
    assert estimated is True


def test_cost_falls_back_to_configured_prices_when_unpriced(monkeypatch):
    monkeypatch.setattr(settings, "AI_FALLBACK_PRICE_IN_PER_M", 1.0)
    monkeypatch.setattr(settings, "AI_FALLBACK_PRICE_OUT_PER_M", 4.0)
    info = _info(prompt_per_m=None, completion_per_m=None, cache_read_per_m=None, known=False)
    cost, estimated = info.cost_usd(Usage(prompt_tokens=1_000_000, completion_tokens=500_000), settings)
    assert cost == pytest.approx(1.0 + 2.0)
    assert estimated is True


def test_resolve_model_default_always_passes_even_without_a_catalogue():
    assert resolve_model(None, None).id == settings.AI_DEFAULT_MODEL
    assert resolve_model(settings.AI_DEFAULT_MODEL, _Client([])).id == settings.AI_DEFAULT_MODEL


def test_resolve_model_accepts_listed_tool_models():
    assert resolve_model("a/m", _Client([_entry("a/m")])).id == "a/m"


def test_resolve_model_rejects_unlisted_and_toolless_models():
    client = _Client([_entry("a/m"), _entry("b/chat", tools=False)])
    for bad in ("nope/none", "b/chat"):
        with pytest.raises(HTTPException) as err:
            resolve_model(bad, client)
        assert err.value.status_code == 422
    ai_models.catalog.reset()
    with pytest.raises(HTTPException):  # no catalogue available at all
        resolve_model("a/m", None)
