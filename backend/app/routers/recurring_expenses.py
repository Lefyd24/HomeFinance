import calendar
from datetime import date, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import RecurringExpense, RecurringExpensePayment
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
