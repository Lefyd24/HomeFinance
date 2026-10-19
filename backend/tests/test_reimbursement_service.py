from sqlalchemy import func

from app.models import Transaction, TransactionReimbursement
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
