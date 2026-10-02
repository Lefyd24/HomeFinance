"""equity-research skill: DCF maths, validation, and tool wrappers (no network)."""
import pytest

from app import ai_skills
from app.ai_skills.equity_research import tools
from app.config import settings
from app.services import market_research


def test_dcf_matches_hand_computation():
    # FCF 100, +10% for 2y, r=10%, terminal 0%:
    # FCF1=110, FCF2=121; PV explicit = 100 + 100 = 200
    # TV = 121 * 1 / 0.10 = 1210; PV(TV) = 1210 / 1.21 = 1000; EV = 1200
    out = tools.dcf_valuation_tool(
        None, 1, fcf_base=100, growth_rate=0.10, growth_years=2, terminal_growth=0.0,
        discount_rate=0.10, net_debt=200, shares_outstanding=100, currency="EUR",
    )
    assert "error" not in out
    assert out["pv_explicit_fcf"] == pytest.approx(200.0)
    assert out["terminal_value"] == pytest.approx(1210.0)
    assert out["pv_terminal_value"] == pytest.approx(1000.0)
    assert out["enterprise_value"] == pytest.approx(1200.0)
    assert out["equity_value"] == pytest.approx(1000.0)
    assert out["value_per_share"] == pytest.approx(10.0)
    assert out["terminal_value_share_of_ev"] == pytest.approx(1000 / 1200, abs=1e-4)
    assert out["currency"] == "EUR"
    assert out["warnings"]  # TV share > 75%


def test_sensitivity_grid_shape_and_centre():
    out = tools.dcf_valuation_tool(
        None, 1, fcf_base=100, growth_rate=0.08, discount_rate=0.09,
        shares_outstanding=50, net_debt=0,
    )
    grid = out["sensitivity"]
    assert len(grid["rows"]) == 5
    assert all(len(r["values"]) == 5 for r in grid["rows"])
    assert grid["terminal_growth_columns"][2] == pytest.approx(0.025)
    assert [r["discount_rate"] for r in grid["rows"]][2] == pytest.approx(0.09)
    assert grid["rows"][2]["values"][2] == out["value_per_share"]
    # higher discount rate -> lower value; higher terminal growth -> higher value
    col = [r["values"][2] for r in grid["rows"]]
    assert col == sorted(col, reverse=True)
    assert grid["rows"][2]["values"] == sorted(grid["rows"][2]["values"])


@pytest.mark.parametrize(
    "overrides,fragment",
    [
        ({"discount_rate": 0.02}, "sane range"),
        ({"discount_rate": 0.05, "terminal_growth": 0.045}, "at least 2 percentage points"),
        ({"fcf_base": -5}, "fcf_base must be positive"),
        ({"shares_outstanding": 0}, "shares_outstanding must be positive"),
        ({"growth_rate": 0.9}, "growth_rate"),
        ({"growth_years": 0}, "growth_years"),
        ({"growth_years": 2.5}, "growth_years"),
        ({"terminal_growth": 0.09}, "terminal_growth"),
        ({"fcf_base": "abc"}, "must be a number"),
    ],
)
def test_dcf_validation_errors(overrides, fragment):
    args = dict(fcf_base=100, growth_rate=0.05, discount_rate=0.09, shares_outstanding=10)
    args.update(overrides)
    out = tools.dcf_valuation_tool(None, 1, **args)
    assert fragment in out["error"]


def test_dcf_discount_not_above_terminal():
    out = tools.dcf_valuation_tool(
        None, 1, fcf_base=100, growth_rate=0.05, discount_rate=0.04, terminal_growth=0.05,
        shares_outstanding=10,
    )
    assert "error" in out


def test_dcf_missing_args_is_error_not_exception():
    assert "error" in tools.dcf_valuation_tool(None, 1, fcf_base=100)


def test_wrappers_pass_args_through(monkeypatch):
    calls = {}

    def fake(name):
        def _f(*a, **k):
            calls[name] = (a, k)
            return {"ok": name}
        return _f

    for fn in ("get_financial_statements", "get_analyst_estimates", "find_peers"):
        monkeypatch.setattr(market_research, fn, fake(fn))
    assert tools.get_financial_statements_tool(None, 1, "ASML.AS", "cashflow", "annual", 3) == {
        "ok": "get_financial_statements"
    }
    assert calls["get_financial_statements"][0] == ("ASML.AS", "cashflow", "annual", 3)
    tools.get_analyst_estimates_tool(None, 1, "AAPL")
    assert calls["get_analyst_estimates"][0] == ("AAPL",)
    tools.find_peers_tool(None, 1, "AAPL", 7)
    assert calls["find_peers"][0] == ("AAPL", 7)


def test_news_empty_is_flagged_as_gap(monkeypatch):
    monkeypatch.setattr(
        market_research, "get_news_digest", lambda symbol, days=30, limit=20: {"symbol": symbol, "items": []}
    )
    out = tools.get_news_digest_tool(None, 1, "SAP.DE", 14)
    assert "NOT mean" in out["note"]


def test_news_error_passes_through(monkeypatch):
    monkeypatch.setattr(
        market_research, "get_news_digest", lambda *a, **k: {"error": "Market data unavailable"}
    )
    assert tools.get_news_digest_tool(None, 1, "X") == {"error": "Market data unavailable"}


def test_skill_loads_from_real_dir(monkeypatch):
    from app.services import ai_service

    registry = ai_skills.load_all(core_tool_names=set(ai_service.TOOL_DISPATCH))
    skill = registry["equity-research"]
    assert skill.command == "research"
    assert skill.requires == ["investments"]
    assert skill.max_rounds == 20
    assert set(skill.tool_names) == {
        "get_financial_statements_tool", "get_analyst_estimates_tool", "find_peers_tool",
        "dcf_valuation_tool", "get_news_digest_tool",
    }
    assert len(skill.body.splitlines()) > 100
