"""Deleting a linked transaction: unlink by default, reverse only when asked."""

from datetime import date

from app.models import Transaction
from app.models.debt import Debt, DebtPayment
from app.models.recurring_expense import RecurringExpense, RecurringExpensePayment
from app.services.transaction_service import TransactionService, _rewind_due_date
from tests.factories import make_account, make_transaction


def test_deleting_linked_transaction_keeps_debt_progress_by_default(db, seed_user):
    account = make_account(db, seed_user)
    debt = Debt(
        user_id=seed_user.id,
        name="Card",
        type="credit_card",
        original_balance=1000,
        current_balance=750,
        is_active=True,
    )
    db.add(debt)
    db.commit()
    db.refresh(debt)

    tx = make_transaction(db, seed_user, account, amount=50, description="Card payment")
    payment = DebtPayment(
        debt_id=debt.id,
        user_id=seed_user.id,
        amount=50,
        payment_date=date.today(),
        account_id=account.id,
        transaction_id=tx.id,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    TransactionService.delete_transaction(db, tx, affect_linked=False)

    db.refresh(debt)
    db.refresh(payment)
    assert debt.current_balance == 750
    assert db.query(DebtPayment).count() == 1
    assert payment.transaction_id is None
    assert db.query(Transaction).filter_by(id=tx.id).count() == 0


def test_deleting_linked_transaction_can_reverse_debt_progress(db, seed_user):
    account = make_account(db, seed_user)
    debt = Debt(
        user_id=seed_user.id,
        name="Card",
        type="credit_card",
        original_balance=1000,
        current_balance=750,
        is_active=True,
    )
    db.add(debt)
    db.commit()
    db.refresh(debt)

    tx = make_transaction(db, seed_user, account, amount=50, description="Card payment")
    db.add(
        DebtPayment(
            debt_id=debt.id,
            user_id=seed_user.id,
            amount=50,
            payment_date=date.today(),
            account_id=account.id,
            transaction_id=tx.id,
        )
    )
    db.commit()

    TransactionService.delete_transaction(db, tx, affect_linked=True)

    db.refresh(debt)
    assert debt.current_balance == 800
    assert db.query(DebtPayment).count() == 0
    assert db.query(Transaction).filter_by(id=tx.id).count() == 0


def test_deleting_linked_transaction_keeps_recurring_progress_by_default(db, seed_user):
    account = make_account(db, seed_user)
    due = date(2026, 8, 15)
    expense = RecurringExpense(
        user_id=seed_user.id,
        name="Netflix",
        amount=10,
        account_id=account.id,
        recurrence_interval=1,
        recurrence_unit="months",
        start_date=date(2026, 6, 15),
        next_due_date=due,
        is_active=True,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)

    tx = make_transaction(db, seed_user, account, amount=10, description="Netflix")
    payment = RecurringExpensePayment(
        recurring_expense_id=expense.id,
        user_id=seed_user.id,
        amount=10,
        payment_date=date.today(),
        transaction_id=tx.id,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    TransactionService.delete_transaction(db, tx, affect_linked=False)

    db.refresh(expense)
    db.refresh(payment)
    assert expense.next_due_date == due
    assert db.query(RecurringExpensePayment).count() == 1
    assert payment.transaction_id is None


def test_deleting_linked_transaction_can_rewind_recurring(db, seed_user):
    account = make_account(db, seed_user)
    due = date(2026, 8, 15)
    expense = RecurringExpense(
        user_id=seed_user.id,
        name="Netflix",
        amount=10,
        account_id=account.id,
        recurrence_interval=1,
        recurrence_unit="months",
        start_date=date(2026, 6, 15),
        next_due_date=due,
        is_active=True,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)

    tx = make_transaction(db, seed_user, account, amount=10, description="Netflix")
    db.add(
        RecurringExpensePayment(
            recurring_expense_id=expense.id,
            user_id=seed_user.id,
            amount=10,
            payment_date=date.today(),
            transaction_id=tx.id,
        )
    )
    db.commit()

    TransactionService.delete_transaction(db, tx, affect_linked=True)

    db.refresh(expense)
    assert db.query(RecurringExpensePayment).count() == 0
    assert expense.next_due_date == _rewind_due_date(due, 1, "months")
    assert expense.next_due_date == date(2026, 7, 15)
