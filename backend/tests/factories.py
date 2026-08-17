from datetime import date, datetime

from app.models import Account, Category, Transaction, Budget, Debt
from app.models.investment import (
    InvestmentTransaction,
    PortfolioPosition,
    PortfolioSnapshot,
)
from app.models.recurring_expense import RecurringExpense


def make_account(db, user, name="Checking", balance=1000.0, is_active=True, type="checking",
                  is_linked=False):
    a = Account(user_id=user.id, name=name, balance=balance, is_active=is_active, type=type,
                is_linked=is_linked)
    db.add(a); db.commit(); db.refresh(a)
    return a


def make_category(db, user, name="Groceries", color="#EF4444", type="expense"):
    c = Category(user_id=user.id, name=name, color=color, type=type)
    db.add(c); db.commit(); db.refresh(c)
    return c


def make_transaction(db, user, account, category=None, amount=50.0, type="expense",
                      tx_date=None, description="Test", notes=None, external_id=None):
    # Note: Transaction has no `payee` column (backend/app/models/transaction.py) —
    # only `description`, `notes`, `type`, `date`, etc. Adjusted from the brief accordingly.
    t = Transaction(
        user_id=user.id, account_id=account.id,
        category_id=category.id if category else None,
        amount=amount, type=type, date=tx_date or date.today(),
        description=description, notes=notes, external_id=external_id,
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


def make_investment_account(db, user, name="Broker", balance=10000.0, currency="EUR",
                            provider="freedom24", is_active=True, last_synced_at=None):
    """An investment account is an ordinary Account with a non-null `provider`."""
    a = Account(
        user_id=user.id, name=name, balance=balance, currency=currency,
        type="investment", provider=provider, is_active=is_active,
        last_synced_at=last_synced_at or datetime.utcnow(),
    )
    db.add(a); db.commit(); db.refresh(a)
    return a


def make_position(db, account, symbol="AAPL.US", name="Apple Inc", quantity=10.0,
                  avg_price=100.0, current_price=150.0, currency="USD", fx_rate=1.0,
                  day_change_pct=None, exchange=None):
    """Market/cost values are derived so the `*_base` columns stay self-consistent —
    a test portfolio that doesn't add up would make every assertion meaningless."""
    market_value = quantity * current_price
    cost_basis = quantity * avg_price
    p = PortfolioPosition(
        account_id=account.id, symbol=symbol, name=name, quantity=quantity,
        avg_price=avg_price, current_price=current_price, market_value=market_value,
        currency=currency, cost_basis=cost_basis, fx_rate=fx_rate,
        market_value_base=market_value * fx_rate, cost_basis_base=cost_basis * fx_rate,
        day_change_pct=day_change_pct, exchange=exchange,
    )
    db.add(p); db.commit(); db.refresh(p)
    return p


def make_snapshot(db, account, snapshot_date, total_value, cash_balance=0.0,
                  positions_value=None, currency="EUR"):
    s = PortfolioSnapshot(
        account_id=account.id, date=snapshot_date, total_value=total_value,
        cash_balance=cash_balance,
        positions_value=positions_value if positions_value is not None else total_value - cash_balance,
        currency=currency,
    )
    db.add(s); db.commit(); db.refresh(s)
    return s


def make_investment_transaction(db, account, type="buy", amount=-1000.0, symbol=None,
                                quantity=None, price=None, txn_date=None, currency="EUR",
                                external_id=None):
    t = InvestmentTransaction(
        account_id=account.id, type=type, amount=amount, symbol=symbol,
        quantity=quantity, price=price, currency=currency,
        date=txn_date or datetime.utcnow(),
        external_id=external_id or f"{type}-{id(object())}",
    )
    db.add(t); db.commit(); db.refresh(t)
    return t


def make_recurring(db, user, account=None, name="Bill", amount=10.0,
                   next_due_date=None, next_due=None, notify=False, days_before=None,
                   is_active=True):
    due = next_due_date or next_due or date.today()
    r = RecurringExpense(
        user_id=user.id, account_id=account.id, name=name, amount=amount,
        recurrence_interval=1, recurrence_unit="months", start_date=date.today(),
        next_due_date=due, is_active=is_active,
        notify_enabled=notify, notify_days_before=days_before,
    )
    db.add(r); db.commit(); db.refresh(r)
    return r
