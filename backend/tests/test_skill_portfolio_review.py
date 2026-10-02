from datetime import date

import pytest

from app import ai_skills
from app.ai_skills.portfolio_review import tools as pr
from app.models.investment_analytics import MarketSymbolMeta
from app.services import investor_profile_service, market_research, portfolio_analytics_service
from tests.factories import make_investment_account, make_position, make_snapshot


def rows_by_bucket(plan):
    return {r["bucket"]: r for r in plan["rows"]}


# --- registration ---------------------------------------------------------------------


def test_skill_loads_from_real_directory():
    from app.services import ai_service

    registry = ai_skills.load_all(core_tool_names=set(ai_service.TOOL_DISPATCH))
    skill = registry["portfolio-review"]
    assert skill.command == "portfolio"
    assert skill.requires == ["investments"]
    assert set(skill.tool_names) == {"rebalance_plan_tool", "get_fund_costs_tool"}
    assert skill.max_rounds and skill.max_rounds <= 25


# --- compute_rebalance (pure) -------------------------------------------------------------


def test_balanced_portfolio_needs_no_action():
    plan = pr.compute_rebalance({"equity": 6000, "bond": 3000, "cash": 1000}, {"equity": 60, "bond": 30, "cash": 10})
    assert plan["needs_action"] is False
    assert plan["max_abs_drift_pp"] == 0
    assert plan["total_buys"] == 0 and plan["total_sells"] == 0


def test_full_rebalance_buys_minus_sells_equals_new_cash():
    current = {"equity": 8000, "bond": 1000, "cash": 1000}
    target = {"equity": 60, "bond": 30, "cash": 10}
    plan = pr.compute_rebalance(current, target, new_cash=1000, prefer_contributions=False)
    assert plan["mode"] == "full_rebalance"
    rows = rows_by_bucket(plan)
    assert rows["equity"]["sell"] == 1400
    assert rows["bond"]["buy"] == 2300
    assert rows["cash"]["buy"] == 100
    assert plan["total_buys"] - plan["total_sells"] == pytest.approx(1000)
    for r in plan["rows"]:  # after the trades every bucket sits on target
        assert r["after_drift_pp"] == pytest.approx(0, abs=0.01)
    assert plan["total_after"] == 11000


def test_contributions_first_never_sells_and_sums_to_cash():
    current = {"equity": 8000, "bond": 1000, "cash": 1000}
    target = {"equity": 60, "bond": 30, "cash": 10}
    plan = pr.compute_rebalance(current, target, new_cash=1000, prefer_contributions=True)
    assert plan["mode"] == "contributions_first"
    rows = rows_by_bucket(plan)
    assert plan["total_sells"] == 0
    assert plan["total_buys"] == 1000
    assert rows["equity"]["buy"] == 0
    assert rows["bond"]["buy"] == pytest.approx(958.33, abs=0.01)
    assert rows["cash"]["buy"] == pytest.approx(41.67, abs=0.01)
    # equity was 80% (+20pp); contributions reduce but cannot eliminate the drift
    assert rows["equity"]["drift_pp"] == 20
    assert rows["equity"]["after_pct"] < 80
    assert rows["equity"]["after_drift_pp"] > pr.DRIFT_BAND_PP
    assert rows["equity"]["full_rebalance_trade"] == -1400
    assert any("full_rebalance_trade" in n for n in plan["notes"])


def test_contributions_that_fully_close_drift():
    current = {"equity": 5000, "bond": 2000}
    plan = pr.compute_rebalance(current, {"equity": 50, "bond": 50}, new_cash=3000)
    rows = rows_by_bucket(plan)
    assert rows["bond"]["buy"] == 3000 and rows["equity"]["buy"] == 0
    assert rows["bond"]["after_pct"] == 50 and rows["equity"]["after_pct"] == 50
    assert plan["needs_action"] is True  # drift before the contribution was 21pp
    assert not any(r["after_drift_pp"] and abs(r["after_drift_pp"]) > 0.01 for r in plan["rows"])


def test_no_cash_with_prefer_contributions_falls_back_to_sells_and_says_so():
    plan = pr.compute_rebalance({"equity": 9000, "bond": 1000}, {"equity": 70, "bond": 30})
    assert plan["mode"] == "full_rebalance"
    rows = rows_by_bucket(plan)
    assert rows["equity"]["sell"] == 2000 and rows["bond"]["buy"] == 2000
    assert any("No new cash" in n for n in plan["notes"])


def test_bucket_missing_from_portfolio_gets_bought():
    plan = pr.compute_rebalance({"equity": 10000}, {"equity": 80, "bond": 20}, new_cash=0, prefer_contributions=False)
    rows = rows_by_bucket(plan)
    assert rows["bond"]["buy"] == 2000 and rows["bond"]["current_value"] == 0
    assert rows["equity"]["sell"] == 2000


def test_unknown_bucket_is_held_fixed():
    plan = pr.compute_rebalance({"equity": 6000, "unknown": 2000, "cash": 2000}, {"equity": 70, "cash": 30})
    assert "unknown" not in rows_by_bucket(plan)
    assert any("unknown" in n for n in plan["notes"])
    rows = rows_by_bucket(plan)
    # targets apply to the 8000 that can be traded: equity 5600, cash 2400
    assert rows["equity"]["full_rebalance_trade"] == -400
    assert rows["cash"]["full_rebalance_trade"] == 400


def test_normalise_target():
    ok, err = pr._normalise_target({"Stocks": 60, "Bonds": 30, "CASH": 10})
    assert err is None and ok == {"equity": 60, "bond": 30, "cash": 10}
    assert pr._normalise_target({"equity": 60, "bond": 30})[1].startswith("Target percentages must sum")
    assert "Unknown bucket" in pr._normalise_target({"gold": 100})[1]
    assert "negative" in pr._normalise_target({"equity": 120, "bond": -20})[1]
    assert pr._normalise_target({})[1] and pr._normalise_target(None)[1]
    scaled, _ = pr._normalise_target({"equity": 60.4, "bond": 40})  # within tolerance, rescaled to 100
    assert sum(scaled.values()) == pytest.approx(100)


# --- rebalance_plan_tool (DB) ---------------------------------------------------------------


def seed_portfolio(db, user):
    acct = make_investment_account(db, user, currency="EUR")
    specs = [
        ("AAPL.US", "Apple Inc", 10, 150.0, "stock"),
        ("GLOB.EU", "Global Equity ETF", 20, 100.0, "etf"),
        ("EBND.EU", "Euro Government Bond ETF", 15, 100.0, "etf"),
    ]
    positions = {}
    for symbol, name, qty, price, quote_type in specs:
        p = make_position(db, acct, symbol=symbol, name=name, quantity=qty, avg_price=price,
                          current_price=price, currency="EUR")
        guess = portfolio_analytics_service._yahoo_symbol_guess(db, p, acct.provider)
        db.merge(MarketSymbolMeta(symbol=guess, name=name, quote_type=quote_type, currency="EUR"))
        positions[symbol] = p
    make_snapshot(db, acct, date.today(), 6000, cash_balance=1000)
    db.commit()
    return acct, positions


def test_rebalance_tool_uses_current_allocation(db, seed_user):
    seed_portfolio(db, seed_user)  # equity 3500, bond 1500, cash 1000 = 6000
    plan = pr.rebalance_plan_tool(db, seed_user.id, {"equity": 60, "bond": 30, "cash": 10}, new_cash=600)
    assert "error" not in plan
    assert plan["currency"] == "EUR" and plan["total_value"] == pytest.approx(6000, abs=1)
    rows = rows_by_bucket(plan)
    assert rows["equity"]["current_pct"] == pytest.approx(58.33, abs=0.05)
    assert rows["cash"]["buy"] == 0  # cash is over target
    assert plan["total_buys"] == pytest.approx(600)
    assert plan["total_sells"] == 0
    assert plan["target_source"] == "request"
    assert plan["total_after"] == pytest.approx(6600, abs=1)


def test_rebalance_tool_full_mode_sums(db, seed_user):
    seed_portfolio(db, seed_user)
    plan = pr.rebalance_plan_tool(db, seed_user.id, {"equity": 60, "bond": 30, "cash": 10},
                                  new_cash=0, prefer_contributions=False)
    assert plan["total_buys"] == pytest.approx(plan["total_sells"], abs=0.02)
    assert plan["total_sells"] > 0


def test_rebalance_tool_falls_back_to_profile_target(db, seed_user):
    seed_portfolio(db, seed_user)
    err = pr.rebalance_plan_tool(db, seed_user.id)
    assert "No target allocation" in err["error"]
    investor_profile_service.apply_updates(
        db, seed_user.id, {"target_allocation": {"equity": 60, "bond": 30, "cash": 10}},
        source="user", reason="test")
    plan = pr.rebalance_plan_tool(db, seed_user.id)
    assert "error" not in plan and plan["target_source"] == "investor_profile"


def test_rebalance_tool_errors(db, seed_user):
    no_holdings = pr.rebalance_plan_tool(db, seed_user.id, {"equity": 100})
    assert "error" in no_holdings
    seed_portfolio(db, seed_user)
    assert "must sum to 100" in pr.rebalance_plan_tool(db, seed_user.id, {"equity": 50})["error"]
    assert "negative" in pr.rebalance_plan_tool(db, seed_user.id, {"equity": 100}, new_cash=-5)["error"]
    assert "number" in pr.rebalance_plan_tool(db, seed_user.id, {"equity": 100}, new_cash="lots")["error"]


def test_rebalance_tool_other_users_holdings_not_used(db, seed_user):
    from app.models import User

    other = User(email="o@example.com", hashed_password="x", full_name="O", is_active=True)
    db.add(other)
    db.commit()
    seed_portfolio(db, other)
    assert "error" in pr.rebalance_plan_tool(db, seed_user.id, {"equity": 100})


# --- fund costs ---------------------------------------------------------------------------


def test_fund_costs_skips_stocks_and_computes_annual_cost(db, seed_user, monkeypatch):
    seed_portfolio(db, seed_user)
    looked_up = []

    def fake_info(symbol):
        looked_up.append(symbol)
        if symbol.startswith("GLOB"):
            return {"quote_type": "etf", "expense_ratio_pct": 0.2, "source": "netExpenseRatio"}
        return {"quote_type": "etf", "expense_ratio_pct": 0.75, "source": "netExpenseRatio"}

    monkeypatch.setattr(pr, "_fund_info", fake_info)
    out = pr.get_fund_costs_tool(db, seed_user.id)
    assert not any(s.startswith("AAPL") for s in looked_up)  # stock: never looked up
    funds = {f["symbol"]: f for f in out["funds"]}
    assert set(funds) == {"GLOB.EU", "EBND.EU"}
    assert funds["GLOB.EU"]["annual_cost"] == 4.0  # 2000 * 0.2%
    assert funds["EBND.EU"]["annual_cost"] == 11.25  # 1500 * 0.75%
    assert funds["EBND.EU"]["cost_flag"] == "high" and funds["GLOB.EU"]["cost_flag"] is None
    assert out["total_annual_cost"] == 15.25
    assert out["weighted_avg_expense_ratio_pct"] == pytest.approx(15.25 / 3500 * 100, abs=1e-3)
    assert out["currency"] == "EUR"
    assert out["funds"][0]["symbol"] == "EBND.EU"  # most expensive first
    assert out["cost_over_10_years_flat"] == 152.5


def test_fund_costs_reports_missing_data(db, seed_user, monkeypatch):
    seed_portfolio(db, seed_user)
    monkeypatch.setattr(
        pr, "_fund_info",
        lambda s: {"quote_type": "etf", "expense_ratio_pct": None, "source": None} if s.startswith("GLOB")
        else {"error": "Market data unavailable"},
    )
    out = pr.get_fund_costs_tool(db, seed_user.id)
    assert out["funds"] == []
    reasons = {f["symbol"]: f["reason"] for f in out["funds_without_cost_data"]}
    assert reasons["GLOB.EU"] == "expense ratio not available"
    assert out["total_annual_cost"] == 0
    assert out["weighted_avg_expense_ratio_pct"] is None
    assert any("lower bound" in n or "understates" in n for n in out["notes"])


def test_fund_costs_no_holdings(db, seed_user):
    out = pr.get_fund_costs_tool(db, seed_user.id)
    assert out["has_investments"] is False and out["funds"] == []


def test_fund_info_units(monkeypatch):
    pr._expense_cache.clear()
    monkeypatch.setattr(market_research, "get_info", lambda s: {"quoteType": "ETF", "netExpenseRatio": 0.07})
    assert pr._fund_info("AAA") == {"quote_type": "etf", "expense_ratio_pct": 0.07, "source": "netExpenseRatio"}

    monkeypatch.setattr(
        market_research, "get_info", lambda s: {"quoteType": "ETF", "annualReportExpenseRatio": 0.0035}
    )
    out = pr._fund_info("BBB")
    assert out["expense_ratio_pct"] == pytest.approx(0.35) and out["source"] == "annualReportExpenseRatio"

    monkeypatch.setattr(market_research, "get_info", lambda s: {"error": "No data found for ZZZ"})
    assert "error" in pr._fund_info("ZZZ")
    pr._expense_cache.clear()
