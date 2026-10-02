"""opportunity-screening skill: screen wrappers, portfolio_fit maths, loading (no network)."""
import numpy as np
import pandas as pd
import pytest

from app import ai_skills
from app.ai_skills.opportunity_screening import tools
from app.services import ai_service, market_research


def _series(values, start="2025-01-01"):
    idx = pd.bdate_range(start, periods=len(values))
    return pd.Series(values, index=idx)


@pytest.fixture
def rng_returns():
    rng = np.random.default_rng(7)
    return rng.normal(0, 0.01, 200)


def test_screen_stocks_passes_args(monkeypatch):
    seen = {}

    def fake(filters, sort_by, sort_desc, limit):
        seen.update(filters=filters, sort_by=sort_by, sort_desc=sort_desc, limit=limit)
        return {"count": 0, "results": []}

    monkeypatch.setattr(market_research, "screen_equities", fake)
    out = tools.screen_stocks_tool(None, 1, {"pe_max": 20}, "pe", False, 10)
    assert out["count"] == 0
    assert seen == {"filters": {"pe_max": 20}, "sort_by": "pe", "sort_desc": False, "limit": 10}


def test_screen_filter_validation_surfaces_as_error():
    out = tools.screen_stocks_tool(None, 1, {"made_up_filter": 3})
    assert "Unknown filter" in out["error"]
    out = tools.screen_etfs_tool(None, 1, {"nope": 1})
    assert "Unknown filter" in out["error"]
    out = tools.screen_stocks_tool(None, 1, {}, sort_by="bogus")
    assert "Unknown sort_by" in out["error"]


def test_screen_provider_failure_is_generic(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("secret internal detail")

    monkeypatch.setattr(market_research, "screen_equities", boom)
    out = tools.screen_stocks_tool(None, 1, {})
    assert out == {"error": "Market data unavailable"}


def test_schema_enumerates_whitelisted_filters():
    schema = {t["function"]["name"]: t["function"] for t in tools.TOOLS}
    eq = schema["screen_stocks_tool"]["parameters"]["properties"]["filters"]
    assert set(eq["properties"]) == set(market_research.EQUITY_FILTER_KEYS)
    assert eq["additionalProperties"] is False
    etf = schema["screen_etfs_tool"]["parameters"]["properties"]["filters"]
    assert set(etf["properties"]) == set(market_research.ETF_FILTER_KEYS)
    sorts = schema["screen_stocks_tool"]["parameters"]["properties"]["sort_by"]["enum"]
    assert set(sorts) == {
        "market_cap", "pe", "pb", "dividend_yield", "eps_growth", "revenue_growth",
        "beta", "price", "volume",
    }


def _stub_fit(monkeypatch, rng_returns, held=None):
    held = held if held is not None else [
        {"symbol": "AAA", "yahoo": "AAA", "name": "Alpha Corp", "weight_pct": 60.0},
        {"symbol": "VWCE", "yahoo": "VWCE.DE", "name": "Vanguard FTSE All-World UCITS ETF", "weight_pct": 40.0},
    ]
    base = rng_returns
    rng = np.random.default_rng(99)
    n = len(base)
    series = {
        "AAA": _series(base),
        "VWCE.DE": _series(base * 0.8 + rng.normal(0, 0.003, n)),
        "TWIN": _series(base * 0.95 + rng.normal(0, 0.002, n)),  # tracks AAA
        "INDEP": _series(rng.normal(0, 0.01, n)),
        "SHORT": _series(base[:20]),
        "IWDA.AS": _series(base * 0.8 + rng.normal(0, 0.003, n)),
    }
    info = {
        "AAA": {"longName": "Alpha Corp", "quoteType": "EQUITY", "sector": "Technology", "currency": "USD"},
        "VWCE.DE": {"longName": "Vanguard FTSE All-World UCITS ETF", "quoteType": "ETF", "currency": "EUR"},
        "TWIN": {"longName": "Twin Inc", "quoteType": "EQUITY", "sector": "Technology", "currency": "USD"},
        "INDEP": {"longName": "Indep Ltd", "quoteType": "EQUITY", "sector": "Utilities", "currency": "USD"},
        "SHORT": {"longName": "Short Co", "quoteType": "EQUITY", "sector": "Utilities", "currency": "USD"},
        "IWDA.AS": {"longName": "iShares MSCI World ETF", "quoteType": "ETF", "currency": "EUR"},
    }
    monkeypatch.setattr(tools, "_load_holdings", lambda db, uid: held)
    # series above are already daily returns
    monkeypatch.setattr(tools, "_returns", lambda db, s: series.get(s))
    monkeypatch.setattr(market_research, "get_info", lambda s: info.get(s, {"error": "none"}))
    monkeypatch.setattr(tools, "db_watchlist", lambda db, uid: {"INDEP"})


def test_portfolio_fit_correlation_and_concentration(monkeypatch, rng_returns):
    _stub_fit(monkeypatch, rng_returns)
    out = tools.portfolio_fit_tool(None, 1, ["TWIN", "INDEP", "SHORT", "AAA"], position_pct=10)
    by = {r["symbol"]: r for r in out["results"]}

    assert by["TWIN"]["correlation_with_portfolio"] > 0.8
    assert by["TWIN"]["correlation_label"].startswith("high")
    assert by["TWIN"]["most_correlated_holdings"][0]["symbol"] == "AAA"
    assert abs(by["INDEP"]["correlation_with_portfolio"]) < 0.4
    assert by["INDEP"]["correlation_label"].startswith("low")
    assert by["INDEP"]["on_watchlist"] is True
    # too little history -> no correlation, explained
    assert by["SHORT"]["correlation_with_portfolio"] is None
    assert "Not computed" in by["SHORT"]["correlation_note"]
    assert by["AAA"]["already_held"] is True and by["TWIN"]["already_held"] is False

    # tech weight before = 60%, after a 10% position = 60 * 0.9 + 10 = 64
    assert by["TWIN"]["sector_weight_before_pct"] == 60.0
    assert by["TWIN"]["sector_weight_after_pct"] == pytest.approx(64.0)
    assert by["INDEP"]["sector_weight_after_pct"] == pytest.approx(10.0)
    # largest position: max(60% * 0.9, 10%) = 54
    assert by["INDEP"]["largest_position_after_pct"] == pytest.approx(54.0)
    assert by["TWIN"]["indirect_exposure_note"]


def test_portfolio_fit_etf_overlap(monkeypatch, rng_returns):
    _stub_fit(monkeypatch, rng_returns)
    out = tools.portfolio_fit_tool(None, 1, ["IWDA.AS"])
    entry = out["results"][0]
    assert entry["etf_overlap_with_held_funds"][0]["symbol"] == "VWCE"
    assert "overlap_note" in entry


def test_portfolio_fit_no_holdings(monkeypatch, rng_returns):
    _stub_fit(monkeypatch, rng_returns, held=[])
    out = tools.portfolio_fit_tool(None, 1, ["INDEP"])
    assert out["portfolio_has_holdings"] is False
    assert out["results"][0]["correlation_with_portfolio"] is None


def test_portfolio_fit_input_validation(monkeypatch, rng_returns):
    _stub_fit(monkeypatch, rng_returns)
    assert "error" in tools.portfolio_fit_tool(None, 1, [])
    assert "error" in tools.portfolio_fit_tool(None, 1, [f"S{i}" for i in range(9)])
    assert "error" in tools.portfolio_fit_tool(None, 1, ["AAA"], position_pct=90)
    assert "error" in tools.portfolio_fit_tool(None, 1, ["AAA"], position_pct="x")


def test_sector_overview_passthrough(monkeypatch):
    monkeypatch.setattr(market_research, "get_sector_overview", lambda k, r="US": {"key": k, "region": r})
    assert tools.get_sector_overview_tool(None, 1, "technology", "US") == {"key": "technology", "region": "US"}


def test_skill_loads_from_real_dir():
    registry = ai_skills.load_all(core_tool_names=set(ai_service.TOOL_DISPATCH))
    skill = registry["opportunity-screening"]
    assert skill.command == "opportunities"
    assert skill.requires == ["investments"]
    assert skill.max_rounds == 25
    assert set(skill.tool_names) == {
        "screen_stocks_tool", "screen_etfs_tool", "get_sector_overview_tool", "portfolio_fit_tool",
    }
    assert 'load_skill_tool("equity-research")' in skill.body
    assert len(skill.body.splitlines()) > 100
