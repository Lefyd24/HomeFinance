import csv
import io
import re
from datetime import date
from pathlib import Path

import pytest

from app.models import BudgetCategory, TrackerTransaction, TransactionReimbursement
from app.models.tracker import Tracker
from app.services import TransactionService
from app.services.forecast_service import CashflowProjector
from tests.factories import (
    make_account,
    make_budget,
    make_category,
    make_transaction,
)


@pytest.fixture()
def shared_dinner(db, seed_user):
    """A 100 dinner repaid by two 33 transfers, plus an unrelated 1000 salary."""
    account = make_account(db, seed_user, balance=1000.0)
    food = make_category(db, seed_user, name="Food")
    dinner = make_transaction(db, seed_user, account, food, amount=100.0, type="expense",
                              description="Dinner")
    for name in ("George", "Manos"):
        repayment = make_transaction(db, seed_user, account, amount=33.0, type="income",
                                     description=name)
        db.add(TransactionReimbursement(
            user_id=seed_user.id, expense_id=dinner.id, income_id=repayment.id, amount=33.0,
        ))
    make_transaction(db, seed_user, account, amount=1000.0, type="income", description="Salary")
    budget = make_budget(db, seed_user, name="Food budget", amount=200.0)
    db.add(BudgetCategory(budget_id=budget.id, category_id=food.id))
    tracker = Tracker(user_id=seed_user.id, name="Dinner out")
    db.add(tracker)
    db.commit()
    db.add(TrackerTransaction(
        user_id=seed_user.id, tracker_id=tracker.id, transaction_id=dinner.id,
    ))
    db.commit()
    return account, budget, tracker


def test_totals_and_summary_are_net(db, seed_user, shared_dinner):
    totals = TransactionService.get_totals(db, seed_user.id)
    summary = TransactionService.get_transaction_summary(db, seed_user.id)

    for result in (totals, summary):
        assert result["income"] == 1000.0
        assert result["expenses"] == 34.0


def test_income_vs_spending_is_net(client, shared_dinner):
    body = client.get("/api/transactions/income-vs-spending").json()

    assert sum(body["income"]) == 1000.0
    assert sum(body["spending"]) == 34.0


def test_reports_are_net(client, shared_dinner):
    spending = client.get("/api/reports/spending").json()
    assert dict(zip(spending["labels"], spending["data"]))["Food"] == 34.0

    export = client.get("/api/reports/export", params={"report": "spending"}).text
    assert ("Food", "34.0") in [tuple(r) for r in csv.reader(io.StringIO(export))]


def test_budget_and_tracker_totals_are_net(client, shared_dinner):
    _, budget, tracker = shared_dinner

    assert client.get(f"/api/budgets/{budget.id}").json()["spent"] == 34.0
    assert client.get(f"/api/trackers/{tracker.id}").json()["total_amount"] == 34.0


def test_cashflow_projection_is_net(db, seed_user, shared_dinner):
    cashflow = CashflowProjector(db, seed_user.id).get_average_cashflow(months=1)

    assert cashflow["monthly_income"] == 1000.0
    assert cashflow["monthly_expenses"] == 34.0


def test_balances_and_net_worth_ignore_links(client, db, seed_user, shared_dinner):
    account, _, _ = shared_dinner
    db.refresh(account)
    net_worth = client.get("/api/reports/net-worth").json()["data"][-1]

    # Cash really moved: -100 + 33 + 33 + 1000.
    assert account.balance == 1000.0
    assert net_worth == 966.0


# Files allowed to sum the raw amount. Empty: the balance reconstructions (net worth and
# balance history in reports.py) use case() expressions, not a plain func.sum(Transaction.amount).
RAW_AMOUNT_SUM_ALLOWED: set[str] = set()


def test_no_aggregation_sums_the_raw_amount():
    app_dir = Path(__file__).resolve().parent.parent / "app"
    offenders = [
        str(path.relative_to(app_dir))
        for path in app_dir.rglob("*.py")
        if re.search(r"func\.sum\(\s*Transaction\.amount", path.read_text(encoding="utf-8"))
        and str(path.relative_to(app_dir)) not in RAW_AMOUNT_SUM_ALLOWED
    ]

    assert not offenders, (
        f"{offenders} sum Transaction.amount. Totals of income/spending must use "
        "Transaction.effective_amount so reimbursed money is not counted twice; only "
        "balance/net-worth reconstructions keep the raw amount (add them to "
        "RAW_AMOUNT_SUM_ALLOWED with a reason)."
    )
