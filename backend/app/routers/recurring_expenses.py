import calendar
from datetime import date, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import RecurringExpense, RecurringExpensePayment
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.recurring_expense import (
    RecurringExpenseCreate,
    RecurringExpenseUpdate,
    RecurringExpenseResponse,
    RecurringExpensePaymentCreate,
    RecurringExpensePaymentResponse,
    UpcomingRecurringExpense,
)
from app.utils.security import get_current_user

router = APIRouter(prefix="/recurring-expenses", tags=["Recurring Expenses"])


def _advance_due_date(current: date, interval: int, unit: str) -> date:
    if unit == "days":
        return current + timedelta(days=interval)
    elif unit == "weeks":
        return current + timedelta(weeks=interval)
    else:  # months
        month = current.month - 1 + interval
        year = current.year + month // 12
        month = month % 12 + 1
        day = min(current.day, calendar.monthrange(year, month)[1])
        return date(year, month, day)


def _enrich(expense: RecurringExpense) -> dict:
    today = date.today()
    delta = (expense.next_due_date - today).days
    data = {c.name: getattr(expense, c.name) for c in expense.__table__.columns}
    data["days_until_due"] = delta
    data["is_overdue"] = delta < 0
    return data


@router.get("/upcoming", response_model=List[UpcomingRecurringExpense])
def get_upcoming_recurring_expenses(
    days: int = 15,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = date.today()
    cutoff = today + timedelta(days=days)
    expenses = (
        db.query(RecurringExpense)
        .filter(
            RecurringExpense.user_id == current_user.id,
            RecurringExpense.is_active == True,
            RecurringExpense.next_due_date <= cutoff,
        )
        .order_by(RecurringExpense.next_due_date)
        .all()
    )
    result = []
    for e in expenses:
        delta = (e.next_due_date - today).days
        result.append(
            UpcomingRecurringExpense(
                recurring_expense_id=e.id,
                name=e.name,
                amount=e.amount,
                due_date=e.next_due_date,
                days_until_due=delta,
                is_overdue=delta < 0,
                category_id=e.category_id,
                account_id=e.account_id,
            )
        )
    return result


@router.get("/", response_model=List[RecurringExpenseResponse])
def list_recurring_expenses(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    expenses = (
        db.query(RecurringExpense)
        .filter(RecurringExpense.user_id == current_user.id)
        .order_by(RecurringExpense.next_due_date)
        .all()
    )
    return [_enrich(e) for e in expenses]


@router.post("/", response_model=RecurringExpenseResponse, status_code=status.HTTP_201_CREATED)
def create_recurring_expense(
    data: RecurringExpenseCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    expense = RecurringExpense(user_id=current_user.id, **data.model_dump())
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return _enrich(expense)


@router.put("/{expense_id}", response_model=RecurringExpenseResponse)
def update_recurring_expense(
    expense_id: int,
    data: RecurringExpenseUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    expense = db.query(RecurringExpense).filter(
        RecurringExpense.id == expense_id,
        RecurringExpense.user_id == current_user.id,
    ).first()
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recurring expense not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(expense, field, value)
    db.commit()
    db.refresh(expense)
    return _enrich(expense)


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recurring_expense(
    expense_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    expense = db.query(RecurringExpense).filter(
        RecurringExpense.id == expense_id,
        RecurringExpense.user_id == current_user.id,
    ).first()
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recurring expense not found")
    db.delete(expense)
    db.commit()


@router.post("/{expense_id}/payments", response_model=RecurringExpensePaymentResponse, status_code=status.HTTP_201_CREATED)
def record_payment(
    expense_id: int,
    data: RecurringExpensePaymentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    expense = db.query(RecurringExpense).filter(
        RecurringExpense.id == expense_id,
        RecurringExpense.user_id == current_user.id,
    ).first()
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recurring expense not found")

    payment = RecurringExpensePayment(
        recurring_expense_id=expense_id,
        user_id=current_user.id,
        amount=data.amount,
        payment_date=data.payment_date,
        transaction_id=data.transaction_id,
        notes=data.notes,
    )
    db.add(payment)

    expense.next_due_date = _advance_due_date(
        expense.next_due_date, expense.recurrence_interval, expense.recurrence_unit
    )

    db.commit()
    db.refresh(payment)
    return payment


@router.get("/{expense_id}/transactions")
def get_linked_transactions(
    expense_id: int,
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return transactions linked to a recurring expense via its payment records.

    Mirrors the budgets `/budgets/{id}/summary` pattern, but joins via
    RecurringExpensePayment.transaction_id rather than category filters.
    """
    expense = db.query(RecurringExpense).filter(
        RecurringExpense.id == expense_id,
        RecurringExpense.user_id == current_user.id,
    ).first()
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recurring expense not found")

    payments_q = (
        db.query(RecurringExpensePayment)
        .filter(
            RecurringExpensePayment.recurring_expense_id == expense_id,
            RecurringExpensePayment.user_id == current_user.id,
        )
        .order_by(RecurringExpensePayment.payment_date.desc())
    )
    all_payments = payments_q.all()
    total_paid = sum(float(p.amount or 0) for p in all_payments)
    payment_count = len(all_payments)
    last_payment_date = all_payments[0].payment_date if all_payments else None

    page_payments = payments_q.offset(skip).limit(limit).all()
    tx_ids = [p.transaction_id for p in page_payments if p.transaction_id is not None]
    transactions_by_id = {}
    if tx_ids:
        tx_rows = (
            db.query(Transaction)
            .options(joinedload(Transaction.category), joinedload(Transaction.account))
            .filter(
                Transaction.id.in_(tx_ids),
                Transaction.user_id == current_user.id,
            )
            .all()
        )
        transactions_by_id = {t.id: t for t in tx_rows}

    rows = []
    for p in page_payments:
        t = transactions_by_id.get(p.transaction_id) if p.transaction_id else None
        if t is not None:
            rows.append({
                "payment_id": p.id,
                "payment_date": p.payment_date,
                "amount": float(t.amount or 0),
                "transaction_id": t.id,
                "description": t.description,
                "transaction_date": t.date,
                "category_id": t.category_id,
                "category_name": t.category.name if t.category else None,
                "category_color": getattr(t.category, "color", None) if t.category else None,
                "account_id": t.account_id,
                "account_name": t.account.name if t.account else None,
                "notes": p.notes,
            })
        else:
            # Payment recorded without a linked transaction
            rows.append({
                "payment_id": p.id,
                "payment_date": p.payment_date,
                "amount": float(p.amount or 0),
                "transaction_id": None,
                "description": "Payment (no transaction linked)",
                "transaction_date": p.payment_date,
                "category_id": None,
                "category_name": None,
                "category_color": None,
                "account_id": None,
                "account_name": None,
                "notes": p.notes,
            })

    return {
        "recurring_expense": {
            "id": expense.id,
            "name": expense.name,
            "amount": expense.amount,
            "recurrence_interval": expense.recurrence_interval,
            "recurrence_unit": expense.recurrence_unit,
            "next_due_date": expense.next_due_date,
            "category_id": expense.category_id,
            "account_id": expense.account_id,
        },
        "transactions": rows,
        "summary": {
            "total_paid": total_paid,
            "payment_count": payment_count,
            "last_payment_date": last_payment_date,
        },
    }
