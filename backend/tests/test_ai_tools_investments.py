"""The advisor's tool layer: registry integrity, guardrails, and result shapes.

The registry tests are the load-bearing ones. `user_id` never appearing in a
tool schema is the whole security boundary — if a schema ever names it, the
model can ask for another user's data and the router will happily pass it.
"""
import json

import pytest

from app.services import ai_service, ai_tools, ai_tools_investments, ai_tools_planning
from app.services import investor_profile_service as profile_svc
from tests.factories import (
    make_account,
    make_category,
    make_debt,
    make_investment_account,
    make_investment_transaction,
    make_position,
    make_transaction,
)


# --- registry --------------------------------------------------------------


def test_no_tool_schema_exposes_user_id():
    """The security boundary: user_id is injected server-side, never model-supplied."""
    for schema in ai_service.AI_TOOLS:
        serialized = json.dumps(schema)
        assert "user_id" not in serialized, f"{schema['function']['name']} exposes user_id"
        assert "user_email" not in serialized


def test_every_schema_has_an_implementation():
    declared = {s["function"]["name"] for s in ai_service.AI_TOOLS}
    assert declared == set(ai_service.TOOL_DISPATCH)


def test_tool_names_are_unique():
    names = [s["function"]["name"] for s in ai_service.AI_TOOLS]
    assert len(names) == len(set(names))


def test_every_tool_has_a_description():
    for schema in ai_service.AI_TOOLS:
        description = schema["function"].get("description", "")
        assert len(description) > 30, f"{schema['function']['name']} is under-described"


def test_investment_tools_can_be_disabled(monkeypatch):
    """The feature flag must actually remove the tools, not just hide the UI."""
    from app.config import settings

    monkeypatch.setattr(settings, "AI_INVESTMENT_TOOLS_ENABLED", False)
    schemas, dispatch = ai_service._build_registry()

    names = {s["function"]["name"] for s in schemas}
    assert "get_portfolio_overview_tool" not in names
    assert "get_transactions_tool" in names
    assert names == set(dispatch)


# --- unknown tools and bad arguments --------------------------------------


def test_unknown_tool_returns_an_error_not_an_exception(db, seed_user):
    result = ai_service._execute_tool(db, seed_user.id, "a@b.c", "nope_tool", {})
    assert "Unknown tool" in result["error"]


def test_invented_argument_is_named_back_to_the_model(db, seed_user):
    """So the model can correct itself instead of retrying the same call."""
    result = ai_service._execute_tool(
        db, seed_user.id, "a@b.c", "get_debts_tool", {"not_a_real_arg": 1}
    )
    assert "Invalid arguments" in result["error"]
    assert "get_debts_tool" in result["error"]


# --- tool result truncation ------------------------------------------------


def test_small_results_pass_through_untouched():
    payload = json.loads(ai_service._serialize_result("t", {"a": 1}))
    assert payload == {"a": 1}
    assert "truncated" not in payload


def test_oversized_list_results_are_trimmed_and_declared(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "AI_TOOL_RESULT_MAX_CHARS", 2000)
    big = {"rows": [{"description": "x" * 100, "id": i} for i in range(200)]}

    payload = json.loads(ai_service._serialize_result("t", big))

    assert payload["truncated"] is True
    assert payload["rows_truncated_from"] == 200
    assert len(payload["rows"]) < 200
    # The model must be told the list is a sample, or it will summarise it as complete.
    assert "sample" in payload["truncation_note"]


def test_oversized_result_with_nothing_to_trim_errors_rather_than_overflow(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "AI_TOOL_RESULT_MAX_CHARS", 500)
    payload = json.loads(ai_service._serialize_result("t", {"blob": "x" * 5000}))

    assert "too large" in payload["error"]


# --- the profile write tool ------------------------------------------------


def test_profile_write_records_the_change_and_its_reason(db, seed_user):
    result = ai_tools.update_investor_profile_tool(
        db,
        seed_user.id,
        {"risk_tolerance": "balanced", "horizon_years": 8},
        reason="User said they are uncomfortable with big swings and are saving for 8 years.",
    )

    assert result["updated"] is True
    assert {c["field"] for c in result["changes"]} == {"risk_tolerance", "horizon_years"}

    revisions = profile_svc.list_revisions(db, seed_user.id)
    assert all(r["source"] == "agent" for r in revisions)
    assert all("uncomfortable" in r["reason"] for r in revisions)


def test_profile_write_rejects_a_field_outside_the_whitelist(db, seed_user):
    result = ai_tools.update_investor_profile_tool(
        db, seed_user.id, {"user_id": 42}, reason="trying it on"
    )
    assert result["updated"] is False
    assert "Not editable" in result["error"]
    assert profile_svc.get_profile(db, seed_user.id) is None


def test_profile_write_rejects_a_bad_enum(db, seed_user):
    result = ai_tools.update_investor_profile_tool(
        db, seed_user.id, {"risk_tolerance": "very spicy"}, reason="because"
    )
    assert result["updated"] is False
    # The error is handed to the model verbatim, so it must list the valid options.
    assert "conservative" in result["error"]


def test_profile_write_requires_a_reason(db, seed_user):
    result = ai_tools.update_investor_profile_tool(
        db, seed_user.id, {"horizon_years": 5}, reason="   "
    )
    assert result["updated"] is False
    assert "reason is required" in result["error"]
    assert profile_svc.get_profile(db, seed_user.id) is None


def test_profile_write_rejects_empty_updates(db, seed_user):
    result = ai_tools.update_investor_profile_tool(db, seed_user.id, {}, reason="x")
    assert result["updated"] is False


def test_profile_write_reports_a_no_op_rather_than_claiming_a_change(db, seed_user):
    ai_tools.update_investor_profile_tool(
        db, seed_user.id, {"horizon_years": 5}, reason="stated"
    )
    result = ai_tools.update_investor_profile_tool(
        db, seed_user.id, {"horizon_years": 5}, reason="stated again"
    )
    assert result["updated"] is False
    assert "already held" in result["note"]


def test_get_investor_profile_tool_reads_back(db, seed_user):
    ai_tools.update_investor_profile_tool(
        db, seed_user.id, {"max_single_position_pct": 15}, reason="stated"
    )
    assert ai_tools.get_investor_profile_tool(db, seed_user.id)["max_single_position_pct"] == 15.0


# --- portfolio tools -------------------------------------------------------


def test_portfolio_tools_on_an_empty_portfolio(db, seed_user):
    assert ai_tools_investments.get_portfolio_overview_tool(db, seed_user.id)[
        "has_investments"
    ] is False
    assert ai_tools_investments.get_positions_tool(db, seed_user.id)["count"] == 0
    assert ai_tools_investments.get_watchlist_tool(db, seed_user.id)["count"] == 0


def test_investment_transactions_totals_by_type(db, seed_user):
    account = make_investment_account(db, seed_user)
    make_investment_transaction(db, account, type="fee", amount=-5.0, external_id="f1")
    make_investment_transaction(db, account, type="fee", amount=-7.5, external_id="f2")
    make_investment_transaction(db, account, type="dividend", amount=20.0, external_id="d1")

    result = ai_tools_investments.get_investment_transactions_tool(db, seed_user.id)

    assert result["count"] == 3
    assert result["totals_by_type"]["fee"] == -12.5
    assert result["totals_by_type"]["dividend"] == 20.0
    # The sign convention is not obvious and the model will get it wrong without help.
    assert "negative when cash left" in result["amount_note"]


def test_investment_transactions_filter_by_symbol(db, seed_user):
    account = make_investment_account(db, seed_user)
    make_investment_transaction(db, account, type="buy", symbol="AAPL", amount=-100, external_id="a")
    make_investment_transaction(db, account, type="buy", symbol="MSFT", amount=-200, external_id="b")

    result = ai_tools_investments.get_investment_transactions_tool(
        db, seed_user.id, symbol="aapl"
    )
    assert result["count"] == 1
    assert result["transactions"][0]["symbol"] == "AAPL"


def test_position_history_for_an_unheld_symbol_lists_what_is_held(db, seed_user):
    account = make_investment_account(db, seed_user)
    make_position(db, account, symbol="AAPL.US")

    result = ai_tools_investments.get_position_history_tool(db, seed_user.id, symbol="TSLA")

    assert "not currently held" in result["error"]
    assert result["symbols_held"] == ["AAPL.US"]


def test_compare_symbols_needs_at_least_two(db, seed_user):
    assert "at least two" in ai_tools_investments.compare_symbols_tool(
        db, seed_user.id, symbols=["AAPL"]
    )["error"]


def test_compare_symbols_caps_the_list(db, seed_user):
    result = ai_tools_investments.compare_symbols_tool(
        db, seed_user.id, symbols=["A", "B", "C", "D", "E", "F", "G"]
    )
    assert "At most" in result["error"]


def test_company_research_rejects_an_unknown_section(db, seed_user):
    result = ai_tools_investments.get_company_research_tool(
        db, seed_user.id, symbol="AAPL", include=["profile", "horoscope"]
    )
    assert "Unknown section" in result["error"]
    assert "horoscope" in result["error"]


def test_company_research_omits_null_fields(db, seed_user, monkeypatch):
    """A model shown "trailing_pe": null writes a sentence about it."""
    monkeypatch.setattr(
        ai_tools_investments.yahoo_market_data,
        "get_company_profile",
        lambda symbol: {
            "symbol": "AAPL", "name": "Apple Inc", "currency": "USD",
            "sector": None, "trailing_pe": 28.5, "forward_pe": None,
        },
    )

    result = ai_tools_investments.get_company_research_tool(
        db, seed_user.id, symbol="aapl", include=["profile", "fundamentals"]
    )

    assert result["profile"]["name"] == "Apple Inc"
    assert "sector" not in result["profile"]
    assert result["fundamentals"] == {"trailing_pe": 28.5}


def test_company_research_names_the_sections_it_could_not_fill(db, seed_user, monkeypatch):
    monkeypatch.setattr(
        ai_tools_investments.yahoo_market_data,
        "get_company_profile",
        lambda symbol: {"symbol": "BTC-USD", "name": "Bitcoin", "quote_type": "crypto"},
    )

    result = ai_tools_investments.get_company_research_tool(
        db, seed_user.id, symbol="BTC-USD", include=["profile", "analyst"]
    )

    assert "analyst" in result["unavailable_sections"]
    assert "rather than filling the gap" in result["unavailable_note"]


def test_simulation_result_carries_its_interpretation_rule(db, seed_user, monkeypatch):
    """The one output most likely to be misread as a forecast."""
    monkeypatch.setattr(
        ai_tools_investments.technical_service,
        "simulate_technical",
        lambda *a, **k: {"percentiles": {"p50": 120.0}},
    )

    result = ai_tools_investments.simulate_symbol_tool(db, seed_user.id, symbol="AAPL")
    assert "not a forecast" in result["interpretation_rule"]


# --- planning tools --------------------------------------------------------


def test_investable_surplus_deducts_and_explains(db, seed_user):
    account = make_account(db, seed_user, name="Main", balance=5000.0, type="checking")
    income = make_category(db, seed_user, name="Salary", type="income")
    from datetime import date, timedelta

    for month in range(6):
        when = date.today() - timedelta(days=30 * month)
        make_transaction(db, seed_user, account, income, amount=2000.0, type="income", tx_date=when)
        make_transaction(db, seed_user, account, None, amount=1500.0, type="expense", tx_date=when)

    # A 12% loan: above the threshold, so its minimum comes out of the surplus.
    make_debt(db, seed_user, name="Credit card", interest_rate=0.12, minimum_payment=100.0)

    result = ai_tools_planning.get_investable_surplus_tool(db, seed_user.id)

    assert result["deductions"]["high_interest_debt_payments"] == 100.0
    assert result["deductions"]["high_interest_debts"][0]["name"] == "Credit card"
    # The advisor has to be able to explain the figure, not just assert it.
    assert len(result["assumptions"]) >= 3
    assert result["investable_monthly_surplus"] == round(
        result["average_monthly_net"]
        - result["deductions"]["emergency_fund_topup"]
        - 100.0,
        2,
    )


def test_low_interest_debt_is_not_deducted(db, seed_user):
    make_debt(db, seed_user, name="Mortgage", interest_rate=0.02, minimum_payment=800.0)
    result = ai_tools_planning.get_investable_surplus_tool(db, seed_user.id)
    assert result["deductions"]["high_interest_debt_payments"] == 0.0


def test_project_investment_validates_its_inputs(db, seed_user):
    assert "error" in ai_tools_planning.project_investment_tool(
        db, seed_user.id, years=0, annual_return_pct=7
    )
    assert "error" in ai_tools_planning.project_investment_tool(
        db, seed_user.id, years=10, annual_return_pct=900
    )


def test_project_investment_returns_a_balance_and_its_assumptions(db, seed_user):
    result = ai_tools_planning.project_investment_tool(
        db, seed_user.id, years=10, annual_return_pct=7, principal=1000, monthly_contribution=100
    )
    assert result["final_balance"] > 1000 + 100 * 12 * 10
    assert any("not a forecast" in a for a in result["assumptions"])


def test_invest_vs_payoff_needs_a_real_debt(db, seed_user):
    assert "error" in ai_tools_planning.compare_invest_vs_debt_payoff_tool(
        db, seed_user.id, debt_id=999, monthly_amount=200
    )


def test_invest_vs_payoff_compares_both_sides(db, seed_user):
    debt = make_debt(
        db, seed_user, name="Car Loan", current_balance=10000.0,
        interest_rate=0.06, minimum_payment=300.0,
    )

    result = ai_tools_planning.compare_invest_vs_debt_payoff_tool(
        db, seed_user.id, debt_id=debt.id, monthly_amount=200, assumed_annual_return_pct=7
    )

    assert result["pay_down_debt"]["interest_saved"] > 0
    assert result["invest_instead"]["final_balance"] > 0
    assert result["verdict"]["better_on_these_numbers"] in ("pay_down_debt", "invest")
    # The guaranteed-vs-hoped-for asymmetry is the actual insight.
    assert "guaranteed" in result["verdict"]["break_even_note"]


def test_invest_vs_payoff_refuses_a_debt_with_no_minimum_payment(db, seed_user):
    debt = make_debt(db, seed_user, current_balance=5000.0, minimum_payment=0.0)
    result = ai_tools_planning.compare_invest_vs_debt_payoff_tool(
        db, seed_user.id, debt_id=debt.id, monthly_amount=100
    )
    assert "no minimum payment recorded" in result["error"]


def test_invest_vs_payoff_flags_a_payment_that_never_clears_the_debt(db, seed_user):
    # 50/month against 10000 at 30% is 250/month of interest alone.
    debt = make_debt(
        db, seed_user, current_balance=10000.0, interest_rate=0.30, minimum_payment=50.0
    )
    result = ai_tools_planning.compare_invest_vs_debt_payoff_tool(
        db, seed_user.id, debt_id=debt.id, monthly_amount=100
    )
    assert "does not cover its monthly interest" in result["error"]


def test_recurring_commitments_normalise_to_monthly(db, seed_user):
    from tests.factories import make_recurring

    account = make_account(db, seed_user)
    monthly = make_recurring(db, seed_user, account, name="Rent", amount=800.0)
    monthly.recurrence_unit = "months"
    yearly = make_recurring(db, seed_user, account, name="Insurance", amount=1200.0)
    yearly.recurrence_unit = "years"
    db.commit()

    result = ai_tools_planning.get_recurring_commitments_tool(db, seed_user.id)

    assert result["count"] == 2
    # 800/month + 1200/year (=100/month)
    assert result["monthly_total"] == pytest.approx(900.0, abs=0.01)
    assert result["commitments"][0]["name"] == "Rent"


def test_goals_report_the_monthly_saving_still_required(db, seed_user):
    from datetime import date, timedelta

    from app.models import FinancialGoal

    goal = FinancialGoal(
        user_id=seed_user.id, name="House deposit", target_amount=12000.0,
        current_amount=2000.0, status="active",
        target_date=date.today() + timedelta(days=365),
    )
    db.add(goal)
    db.commit()

    result = ai_tools_planning.get_goals_tool(db, seed_user.id)
    row = result["goals"][0]

    assert row["remaining"] == 10000.0
    assert row["progress_pct"] == pytest.approx(16.7, abs=0.1)
    assert row["required_monthly"] == pytest.approx(10000 / 12, abs=5)
