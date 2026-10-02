from datetime import date

import pytest

from app import ai_skills
from app.ai_skills.financial_health_review import tools as fh
from app.models import Account, User
from app.models.recurring_expense import RecurringExpense, RecurringExpensePayment
from tests.factories import (
    make_account,
    make_category,
    make_recurring,
    make_transaction,
)

TODAY = date(2026, 10, 15)  # complete months: ... 2026-07, 2026-08, 2026-09


@pytest.fixture(autouse=True)
def fixed_today(monkeypatch):
    monkeypatch.setattr(fh, "_today", lambda: TODAY)


@pytest.fixture()
def acct(db, seed_user):
    return make_account(db, seed_user)


def tx(db, user, account, amount, d, type="expense", category=None, description="Test"):
    return make_transaction(
        db, user, account, category=category, amount=amount, type=type, tx_date=d,
        description=description,
    )


# --- registration ------------------------------------------------------------------


def test_skill_loads_from_real_directory():
    from app.services import ai_service

    registry = ai_skills.load_all(core_tool_names=set(ai_service.TOOL_DISPATCH))
    skill = registry["financial-health-review"]
    assert skill.command == "review"
    assert skill.requires == []
    assert set(skill.tool_names) == {
        "get_category_trends_tool",
        "get_cashflow_trend_tool",
        "detect_spending_anomalies_tool",
        "get_subscription_audit_tool",
    }
    assert set(skill.dispatch) == set(skill.tool_names)
    assert skill.max_rounds and skill.max_rounds <= 25


# --- cashflow ------------------------------------------------------------------------


def test_cashflow_empty(db, seed_user):
    out = fh.get_cashflow_trend_tool(db, seed_user.id, months=6)
    assert out["months"] == [] and out["summary"] is None
    assert out["months_analyzed"] == 0
    assert any("No income or expense" in n for n in out["data_notes"])


def test_cashflow_savings_rate_and_transfers_excluded(db, seed_user, acct):
    for m, (inc, exp) in {7: (3000, 2000), 8: (3000, 2400), 9: (3000, 1800)}.items():
        tx(db, seed_user, acct, inc, date(2026, m, 5), "income")
        tx(db, seed_user, acct, exp, date(2026, m, 10), "expense")
        tx(db, seed_user, acct, 9999, date(2026, m, 12), "transfer")  # must not count
    out = fh.get_cashflow_trend_tool(db, seed_user.id, months=6)

    assert out["months_analyzed"] == 3  # leading empty months trimmed
    assert [r["month"] for r in out["months"]] == ["2026-07", "2026-08", "2026-09"]
    jul = out["months"][0]
    assert (jul["income"], jul["expenses"], jul["net"]) == (3000, 2000, 1000)
    assert jul["savings_rate_pct"] == 33.3
    s = out["summary"]
    assert s["avg_monthly_income"] == 3000
    assert s["avg_monthly_expenses"] == 2066.67
    assert s["overall_savings_rate_pct"] == 31.1  # 2800/9000
    assert s["income_stability"] == "stable"
    assert s["months_with_negative_net"] == 0
    assert s["worst_month"] == "2026-08"
    # Rolling average after 3 months equals the mean net.
    assert out["months"][2]["rolling_3m_avg_net"] == pytest.approx(933.33, abs=0.01)


def test_cashflow_matches_get_totals_semantics(db, seed_user, acct):
    from app.services.transaction_service import TransactionService

    tx(db, seed_user, acct, 1000, date(2026, 9, 3), "income")
    tx(db, seed_user, acct, 400, date(2026, 9, 4), "expense")
    tx(db, seed_user, acct, 250, date(2026, 9, 5), "transfer")
    totals = TransactionService.get_totals(db, seed_user.id, date(2026, 9, 1), date(2026, 9, 30))
    out = fh.get_cashflow_trend_tool(db, seed_user.id, months=1)
    row = out["months"][0]
    assert row["income"] == totals["income"]
    assert row["expenses"] == totals["expenses"]
    assert row["net"] == totals["net"]


def test_cashflow_single_month_flags_short_history(db, seed_user, acct):
    tx(db, seed_user, acct, 2000, date(2026, 9, 1), "income")
    tx(db, seed_user, acct, 2500, date(2026, 9, 2), "expense")
    out = fh.get_cashflow_trend_tool(db, seed_user.id, months=12)
    assert out["months_analyzed"] == 1
    assert out["summary"]["income_cv_pct"] is None
    assert out["summary"]["income_stability"] == "unknown"
    assert out["summary"]["months_with_negative_net"] == 1
    assert any("Only 1 month" in n for n in out["data_notes"])


def test_cashflow_no_income_has_no_savings_rate(db, seed_user, acct):
    tx(db, seed_user, acct, 100, date(2026, 9, 2), "expense")
    out = fh.get_cashflow_trend_tool(db, seed_user.id, months=3)
    assert out["months"][0]["savings_rate_pct"] is None
    assert out["summary"]["overall_savings_rate_pct"] is None
    assert any("No income recorded" in n for n in out["data_notes"])


def test_cashflow_current_month_reported_separately(db, seed_user, acct):
    tx(db, seed_user, acct, 500, date(2026, 10, 2), "expense")
    tx(db, seed_user, acct, 100, date(2026, 9, 2), "expense")
    out = fh.get_cashflow_trend_tool(db, seed_user.id, months=3)
    assert out["months_analyzed"] == 1
    assert out["current_month_partial"]["expenses"] == 500
    assert out["current_month_partial"]["days_elapsed"] == 15


def test_cashflow_scoped_to_user(db, seed_user, acct):
    other = User(email="o@example.com", hashed_password="x", full_name="O", is_active=True)
    db.add(other)
    db.commit()
    other_acct = make_account(db, other, name="Theirs")
    tx(db, other, other_acct, 5000, date(2026, 9, 1), "income")
    tx(db, seed_user, acct, 100, date(2026, 9, 1), "income")
    out = fh.get_cashflow_trend_tool(db, seed_user.id, months=3)
    assert out["months"][0]["income"] == 100


def test_cashflow_multi_currency_note(db, seed_user, acct):
    usd = Account(user_id=seed_user.id, name="USD", balance=0, type="checking", currency="USD")
    db.add(usd)
    db.commit()
    tx(db, seed_user, acct, 10, date(2026, 9, 1))
    tx(db, seed_user, usd, 10, date(2026, 9, 2))
    out = fh.get_cashflow_trend_tool(db, seed_user.id, months=2)
    assert any("currencies" in n for n in out["data_notes"])


def test_months_argument_is_clamped(db, seed_user):
    assert fh.get_cashflow_trend_tool(db, seed_user.id, months=999)["months_requested"] == 36
    assert fh.get_cashflow_trend_tool(db, seed_user.id, months="x")["months_requested"] == 12


# --- category trends ---------------------------------------------------------------------


def test_category_trends_movers_and_uncategorised(db, seed_user, acct):
    food = make_category(db, seed_user, "Food")
    fun = make_category(db, seed_user, "Fun")
    for m, amt in {7: 200, 8: 200, 9: 320}.items():
        tx(db, seed_user, acct, amt, date(2026, m, 5), category=food)
    for m, amt in {7: 100, 8: 100, 9: 40}.items():
        tx(db, seed_user, acct, amt, date(2026, m, 6), category=fun)
    tx(db, seed_user, acct, 60, date(2026, 9, 7))  # uncategorised
    tx(db, seed_user, acct, 777, date(2026, 9, 8), type="transfer", category=food)  # ignored

    out = fh.get_category_trends_tool(db, seed_user.id, months=6, top_n=8)
    assert out["months"] == ["2026-07", "2026-08", "2026-09"]
    by_name = {c["category"]: c for c in out["categories"]}
    assert set(by_name) == {"Food", "Fun", "Uncategorised"}
    food_row = by_name["Food"]
    assert food_row["monthly"] == [200, 200, 320]
    assert food_row["total"] == 720
    assert food_row["mom_change_pct"] == 60.0
    assert food_row["trailing_avg_excl_last"] == 200
    assert food_row["vs_trailing_avg_pct"] == 60.0
    assert food_row["vs_trailing_avg_amount"] == 120
    assert out["total_expenses"] == 720 + 240 + 60
    assert out["uncategorised_share_pct"] == round(60 / 1020 * 100, 1)
    assert out["biggest_increases"][0]["category"] == "Food"
    assert out["biggest_decreases"][0]["category"] == "Fun"
    assert out["categories"][0]["category"] == "Food"  # sorted by total


def test_category_trends_top_n_rolls_up_rest(db, seed_user, acct):
    for i in range(4):
        cat = make_category(db, seed_user, f"C{i}")
        tx(db, seed_user, acct, 100 * (i + 1), date(2026, 9, 5), category=cat)
    out = fh.get_category_trends_tool(db, seed_user.id, months=3, top_n=2)
    assert len(out["categories"]) == 2
    assert out["other_categories"]["count"] == 2
    assert out["other_categories"]["total"] == 300  # C0 + C1
    # one month only: no trend comparisons
    assert out["biggest_increases"] == []
    assert any("Fewer than 3 months" in n for n in out["data_notes"])
    assert out["categories"][0]["mom_change_pct"] is None


def test_category_trends_empty_and_high_uncategorised_note(db, seed_user, acct):
    empty = fh.get_category_trends_tool(db, seed_user.id)
    assert empty["categories"] == [] and empty["months_analyzed"] == 0
    tx(db, seed_user, acct, 100, date(2026, 9, 5))
    out = fh.get_category_trends_tool(db, seed_user.id)
    assert out["uncategorised_share_pct"] == 100.0
    assert any("uncategorised" in n for n in out["data_notes"])


# --- anomalies ----------------------------------------------------------------------------


def test_anomalies_detect_large_spike_and_new_recurring(db, seed_user, acct):
    shop = make_category(db, seed_user, "Shopping")
    dining = make_category(db, seed_user, "Dining")
    for _ in range(6):
        tx(db, seed_user, acct, 20, date(2026, 9, 3), category=shop, description="Corner shop")
    tx(db, seed_user, acct, 500, date(2026, 9, 9), category=shop, description="Sofa")
    for m in (4, 5, 6, 7, 8):
        tx(db, seed_user, acct, 100, date(2026, m, 15), category=dining, description="Restaurant")
    tx(db, seed_user, acct, 400, date(2026, 9, 15), category=dining, description="Restaurant")
    tx(db, seed_user, acct, 12.99, date(2026, 8, 20), description="Streamflix #1")
    tx(db, seed_user, acct, 12.99, date(2026, 9, 20), description="Streamflix #2")

    out = fh.detect_spending_anomalies_tool(db, seed_user.id, months=6)
    large = out["large_transactions"]
    assert [t["description"] for t in large] == ["Sofa", "Restaurant"]  # sorted by amount
    assert large[0]["category_median"] == 20
    spikes = [s for s in out["category_spikes"] if s["category"] == "Dining"]
    assert len(spikes) == 1 and spikes[0]["month"] == "2026-09"
    assert spikes[0]["baseline_avg"] == 100 and spikes[0]["excess"] == 300
    merchants = {m["merchant"]: m for m in out["new_recurring_merchants"]}
    assert "streamflix" in merchants
    assert merchants["streamflix"]["annualised_if_monthly"] == pytest.approx(155.88)
    assert "restaurant" not in merchants  # first seen before the recent window


def test_anomalies_empty_and_short_history(db, seed_user, acct):
    out = fh.detect_spending_anomalies_tool(db, seed_user.id)
    assert out["large_transactions"] == [] and out["transactions_analyzed"] == 0
    tx(db, seed_user, acct, 10, date(2026, 9, 3))
    short = fh.detect_spending_anomalies_tool(db, seed_user.id)
    assert short["category_spikes"] == []
    assert any("month(s) of history" in n for n in short["data_notes"])


def test_anomalies_ignore_transfers(db, seed_user, acct):
    cat = make_category(db, seed_user, "Moves")
    for _ in range(6):
        tx(db, seed_user, acct, 10, date(2026, 9, 3), category=cat)
    tx(db, seed_user, acct, 9000, date(2026, 9, 4), "transfer", category=cat)
    out = fh.detect_spending_anomalies_tool(db, seed_user.id)
    assert out["large_transactions"] == []
    assert out["transactions_analyzed"] == 6


# --- subscriptions --------------------------------------------------------------------------


def test_subscription_audit_empty(db, seed_user):
    out = fh.get_subscription_audit_tool(db, seed_user.id)
    assert out["count"] == 0 and out["items"] == []
    assert out["total_annual_cost"] == 0
    assert out["data_notes"]


def test_subscription_audit_annualises_and_finds_creep(db, seed_user, acct):
    monthly = make_recurring(db, seed_user, acct, name="Netflix", amount=12.0, next_due=date(2026, 10, 20))
    weekly = RecurringExpense(
        user_id=seed_user.id, account_id=acct.id, name="Cleaner", amount=5.0,
        recurrence_interval=2, recurrence_unit="weeks", start_date=date(2026, 1, 1),
        next_due_date=date(2026, 10, 20), is_active=True,
    )
    inactive = make_recurring(db, seed_user, acct, name="Old", amount=99.0, is_active=False)
    db.add(weekly)
    db.commit()
    for amount, d in ((10.0, date(2026, 1, 1)), (10.0, date(2026, 2, 1)), (12.0, date(2026, 9, 1))):
        db.add(RecurringExpensePayment(
            recurring_expense_id=monthly.id, user_id=seed_user.id, amount=amount, payment_date=d))
    db.commit()

    out = fh.get_subscription_audit_tool(db, seed_user.id)
    assert out["count"] == 2  # inactive excluded
    items = {i["name"]: i for i in out["items"]}
    assert "Old" not in items
    assert items["Netflix"]["annual_cost"] == 144.0
    assert items["Netflix"]["monthly_equivalent"] == 12.0
    assert items["Cleaner"]["annual_cost"] == 130.0  # 26 fortnights
    assert out["total_annual_cost"] == 274.0
    assert out["price_increases"] == [
        {"name": "Netflix", "from": 10.0, "to": 12.0, "change_pct": 20.0, "extra_annual_cost": 24.0}
    ]
    assert out["items"][0]["name"] == "Netflix"  # sorted by annual cost
    assert items["Cleaner"]["price_change_pct"] is None
    assert inactive.id not in {i["id"] for i in out["items"]}


def test_subscription_audit_notes_missing_history_and_duplicates(db, seed_user, acct):
    make_recurring(db, seed_user, acct, name="Gym", amount=30)
    make_recurring(db, seed_user, acct, name="gym 2", amount=30)
    out = fh.get_subscription_audit_tool(db, seed_user.id)
    assert any("No payment history" in n for n in out["data_notes"])
    assert out["possible_duplicates"] == [["Gym", "gym 2"]]  # names normalise to the same merchant
