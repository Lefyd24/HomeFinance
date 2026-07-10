from datetime import date

from app.models import Account, Category, Transaction, Budget, Debt
from app.models.recurring_expense import RecurringExpense


def make_account(db, user, name="Checking", balance=1000.0, is_active=True, type="checking"):
    a = Account(user_id=user.id, name=name, balance=balance, is_active=is_active, type=type)
    db.add(a); db.commit(); db.refresh(a)
    return a


def make_category(db, user, name="Groceries", color="#EF4444", type="expense"):
    c = Category(user_id=user.id, name=name, color=color, type=type)
    db.add(c); db.commit(); db.refresh(c)
    return c


def make_transaction(db, user, account, category=None, amount=50.0, type="expense",
                      tx_date=None, description="Test", notes=None):
    # Note: Transaction has no `payee` column (backend/app/models/transaction.py) —
    # only `description`, `notes`, `type`, `date`, etc. Adjusted from the brief accordingly.
    t = Transaction(
        user_id=user.id, account_id=account.id,
        category_id=category.id if category else None,
        amount=amount, type=type, date=tx_date or date.today(),
        description=description, notes=notes,
    )
    db.add(t); db.commit(); db.refresh(t)
    return t


def make_budget(db, user, name="Monthly Budget", amount=500.0, period="monthly",
                 start_date=None, end_date=None, is_active=True):
    b = Budget(
        user_id=user.id, name=name, amount=amount, period=period,
        start_date=start_date, end_date=end_date, is_active=is_active,
    )
    db.add(b); db.commit(); db.refresh(b)
    return b


def make_debt(db, user, name="Car Loan", original_balance=10000.0, current_balance=8000.0,
              type="loan", interest_rate=0.05, minimum_payment=200.0, is_active=True):
    d = Debt(
        user_id=user.id, name=name, original_balance=original_balance,
        current_balance=current_balance, type=type, interest_rate=interest_rate,
        minimum_payment=minimum_payment, is_active=is_active,
    )
    db.add(d); db.commit(); db.refresh(d)
    return d


def make_recurring(db, user, account=None, name="Bill", amount=10.0,
                   next_due_date=None, next_due=None, notify=False, days_before=None):
    due = next_due_date or next_due or date.today()
    r = RecurringExpense(
        user_id=user.id, account_id=account.id, name=name, amount=amount,
        recurrence_interval=1, recurrence_unit="months", start_date=date.today(),
        next_due_date=due, is_active=True,
        notify_enabled=notify, notify_days_before=days_before,
    )
    db.add(r); db.commit(); db.refresh(r)
    return r
