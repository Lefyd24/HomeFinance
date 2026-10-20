from datetime import date

import pytest
from sqlalchemy import func

from app.models import Transaction, TransactionReimbursement, User
from app.schemas import TransactionUpdate
from app.services import TransactionService
from app.services.reimbursement_service import ReimbursementError, ReimbursementService
from tests.factories import make_account, make_transaction


def _linked_pair(db, user):
    account = make_account(db, user)
    expense = make_transaction(db, user, account, amount=100.0, type="expense")
    income = make_transaction(db, user, account, amount=33.0, type="income")
    db.add(TransactionReimbursement(
        user_id=user.id, expense_id=expense.id, income_id=income.id, amount=33.0,
    ))
    db.commit()
    return expense, income


def test_unlinked_transaction_keeps_full_amount(db, seed_user):
    tx = make_transaction(db, seed_user, make_account(db, seed_user), amount=100.0)

    assert tx.reimbursed_amount == 0
    assert tx.effective_amount == 100.0


def test_link_reduces_both_sides(db, seed_user):
    expense, income = _linked_pair(db, seed_user)
    db.refresh(expense)
    db.refresh(income)

    assert expense.reimbursed_amount == 33.0
    assert expense.effective_amount == 67.0
    assert income.effective_amount == 0.0


def test_effective_amount_works_in_sql_aggregates(db, seed_user):
    _linked_pair(db, seed_user)

    total = (
        db.query(func.sum(Transaction.effective_amount))
        .filter(Transaction.type == "expense")
        .scalar()
    )
    assert total == 67.0


@pytest.fixture()
def account(db, seed_user):
    return make_account(db, seed_user)


def _expense(db, user, account, amount=100.0, **kw):
    return make_transaction(db, user, account, amount=amount, type="expense", **kw)


def _income(db, user, account, amount=33.0, **kw):
    return make_transaction(db, user, account, amount=amount, type="income", **kw)


def test_link_is_the_same_in_either_order(db, seed_user, account):
    expense, income = _expense(db, seed_user, account), _income(db, seed_user, account)

    link = ReimbursementService.link(db, seed_user.id, income, expense, 10.0)

    assert (link.expense_id, link.income_id) == (expense.id, income.id)


def test_default_amount_is_the_smaller_remainder(db, seed_user, account):
    expense = _expense(db, seed_user, account, 100.0)
    first = _income(db, seed_user, account, 50.0)
    second = _income(db, seed_user, account, 33.0)

    assert ReimbursementService.link(db, seed_user.id, expense, first, None).amount == 50.0
    assert ReimbursementService.link(db, seed_user.id, expense, second, None).amount == 33.0
    assert ReimbursementService.remaining(expense) == 17.0
    assert expense.effective_amount == 17.0


def test_one_income_can_cover_two_expenses(db, seed_user, account):
    income = _income(db, seed_user, account, 60.0)
    for _ in range(2):
        ReimbursementService.link(db, seed_user.id, _expense(db, seed_user, account), income, 30.0)

    assert income.effective_amount == 0.0
    assert len(ReimbursementService.links_for(db, income)) == 2


def test_over_allocation_is_rejected_on_both_sides(db, seed_user, account):
    expense = _expense(db, seed_user, account, 100.0)
    small_income = _income(db, seed_user, account, 20.0)
    big_income = _income(db, seed_user, account, 500.0)

    with pytest.raises(ReimbursementError):
        ReimbursementService.link(db, seed_user.id, expense, small_income, 25.0)
    with pytest.raises(ReimbursementError):
        ReimbursementService.link(db, seed_user.id, expense, big_income, 100.01)

    ReimbursementService.link(db, seed_user.id, expense, big_income, 100.0)
    with pytest.raises(ReimbursementError):
        ReimbursementService.link(db, seed_user.id, expense, small_income, None)


def test_invalid_counterparts_are_rejected(db, seed_user, account):
    expense = _expense(db, seed_user, account)
    other_user = User(email="b@example.com", hashed_password="x", full_name="B", is_active=True)
    db.add(other_user)
    db.commit()
    other_account = make_account(db, other_user)

    pending = _income(db, seed_user, account)
    pending.is_pending = True
    db.commit()
    invalid = [
        _expense(db, seed_user, account),
        pending,
        make_transaction(db, seed_user, account, amount=33.0, type="transfer"),
        _income(db, other_user, other_account),
    ]

    for counterpart in invalid:
        with pytest.raises(ReimbursementError):
            ReimbursementService.link(db, seed_user.id, expense, counterpart, 10.0)


def test_unlink_restores_effective_amount(db, seed_user, account):
    expense, income = _expense(db, seed_user, account), _income(db, seed_user, account)
    link = ReimbursementService.link(db, seed_user.id, expense, income, None)

    ReimbursementService.unlink(db, seed_user.id, link.id)

    assert expense.effective_amount == 100.0
    assert income.effective_amount == 33.0


@pytest.mark.parametrize("delete_expense", [True, False])
def test_deleting_either_side_removes_links(db, seed_user, account, delete_expense):
    expense, income = _expense(db, seed_user, account), _income(db, seed_user, account)
    ReimbursementService.link(db, seed_user.id, expense, income, None)

    TransactionService.delete_transaction(db, expense if delete_expense else income)

    assert db.query(TransactionReimbursement).count() == 0
    survivor = income if delete_expense else expense
    assert survivor.effective_amount == survivor.amount


def test_update_cannot_change_type_or_drop_below_linked(db, seed_user, account):
    expense, income = _expense(db, seed_user, account), _income(db, seed_user, account)
    ReimbursementService.link(db, seed_user.id, expense, income, None)

    with pytest.raises(ReimbursementError):
        TransactionService.update_transaction(db, expense, TransactionUpdate(type="income"))
    with pytest.raises(ReimbursementError):
        TransactionService.update_transaction(db, expense, TransactionUpdate(amount=20.0))

    TransactionService.update_transaction(db, expense, TransactionUpdate(amount=150.0))
    assert expense.amount == 150.0


def test_candidates_skip_full_rows_and_sort_by_date(db, seed_user, account):
    expense = _expense(db, seed_user, account, tx_date=date(2026, 5, 10))
    far = _income(db, seed_user, account, tx_date=date(2026, 1, 1), description="far")
    near = _income(db, seed_user, account, tx_date=date(2026, 5, 12), description="near")
    full = _income(db, seed_user, account, 10.0, tx_date=date(2026, 5, 10), description="full")
    ReimbursementService.link(db, seed_user.id, _expense(db, seed_user, account, 10.0), full, None)

    found = ReimbursementService.candidates(db, seed_user.id, expense)

    assert [tx.id for tx in found] == [near.id, far.id]
    assert [tx.id for tx in ReimbursementService.candidates(db, seed_user.id, expense, "far")] == [far.id]
