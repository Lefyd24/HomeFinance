from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from datetime import date, timedelta
import math

from app.database import get_db
from app.utils.security import get_current_user_authenticated as get_current_user
from app.schemas.debt import (
    DebtCreate,
    DebtUpdate,
    DebtResponse,
    DebtPaymentCreate,
    DebtPaymentResponse,
    DebtSummary,
    PayoffComparison,
    PayoffStrategy,
    PayoffScheduleItem,
    ExtraPaymentScenario,
    UpcomingPayment,
)
from app.models import User, Debt, DebtPayment, Transaction

router = APIRouter(prefix="/debts", tags=["Debts"])


@router.get("/", response_model=List[DebtResponse])
def get_debts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    active_only: bool = False,
):
    """Get all debts for current user."""
    query = db.query(Debt).filter(Debt.user_id == current_user.id)
    
    if active_only:
        query = query.filter(Debt.is_active == True, Debt.is_paid_off == False)
    
    debts = query.order_by(Debt.priority.desc(), Debt.created_at.desc()).all()
    
    # Calculate payoff metrics for each debt
    result = []
    for debt in debts:
        debt_data = calculate_debt_metrics(debt)
        result.append(debt_data)
    
    return result


@router.get("/summary", response_model=DebtSummary)
def get_debt_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get overall debt summary."""
    debts = db.query(Debt).filter(Debt.user_id == current_user.id).all()
    
    active_debts = [d for d in debts if d.is_active and not d.is_paid_off]
    paid_off_debts = [d for d in debts if d.is_paid_off]
    
    total_original = sum(d.original_balance for d in debts)
    total_current = sum(d.current_balance for d in debts)
    total_paid = total_original - total_current
    total_minimum = sum(d.minimum_payment or 0 for d in active_debts)
    
    avg_interest = 0
    if active_debts:
        rates = [d.interest_rate for d in active_debts if d.interest_rate]
        if rates:
            avg_interest = sum(rates) / len(rates)
    
    progress_pct = (total_paid / total_original * 100) if total_original > 0 else 0
    
    total_projected_interest = 0
    total_amount_due = 0
    for debt in active_debts:
        if debt.interest_rate and debt.interest_rate > 0 and debt.minimum_payment and debt.minimum_payment > 0:
            monthly_rate = debt.interest_rate / 12
            payment = debt.minimum_payment
            balance = debt.current_balance
            
            if payment > balance * monthly_rate:
                months = math.log(payment / (payment - balance * monthly_rate)) / math.log(1 + monthly_rate)
                months = int(math.ceil(months))
                projected_interest = (payment * months) - balance
                total_projected_interest += projected_interest
                total_amount_due += balance + projected_interest
            else:
                total_amount_due += balance
        else:
            total_amount_due += debt.current_balance
    
    return DebtSummary(
        total_debts=len(debts),
        active_debts=len(active_debts),
        paid_off_debts=len(paid_off_debts),
        total_original_balance=total_original,
        total_current_balance=total_current,
        total_paid_off=total_paid,
        total_minimum_payments=total_minimum,
        average_interest_rate=round(avg_interest, 4),
        overall_progress_percentage=round(progress_pct, 2),
        total_projected_interest=round(total_projected_interest, 2),
        total_amount_due=round(total_amount_due, 2)
    )


@router.get("/upcoming-payments", response_model=List[UpcomingPayment])
def get_upcoming_payments(
    days: int = 30,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get upcoming debt payments for the specified number of days."""
    today = date.today()
    end_date = today + timedelta(days=days)
    
    # Get active debts with recurrence settings
    debts = db.query(Debt).filter(
        Debt.user_id == current_user.id,
        Debt.is_active == True,
        Debt.is_paid_off == False,
        Debt.current_balance > 0,
        Debt.recurrence_interval.isnot(None),
        Debt.recurrence_unit.isnot(None)
    ).all()
    
    upcoming = []
    
    for debt in debts:
        # Calculate next payment date
        if debt.next_payment_date:
            next_date = debt.next_payment_date
        else:
            # Calculate based on recurrence settings
            last_payment = db.query(DebtPayment).filter(
                DebtPayment.debt_id == debt.id
            ).order_by(DebtPayment.payment_date.desc()).first()
            
            if last_payment:
                next_date = calculate_next_payment_date(
                    last_payment.payment_date,
                    debt.recurrence_interval,
                    debt.recurrence_unit,
                    debt.recurrence_day_of_month
                )
            else:
                # No payments yet, calculate from opened date or today
                start_date = debt.opened_date or today
                next_date = calculate_next_payment_date(
                    start_date,
                    debt.recurrence_interval,
                    debt.recurrence_unit,
                    debt.recurrence_day_of_month
                )
        
        # Check if within the requested period
        if next_date <= end_date:
            days_until = (next_date - today).days
            upcoming.append(UpcomingPayment(
                debt_id=debt.id,
                debt_name=debt.name,
                creditor=debt.creditor,
                amount=debt.minimum_payment or 0,
                due_date=next_date,
                days_until_due=days_until,
                is_overdue=days_until < 0,
                debt_type=debt.type
            ))
    
    # Sort by due date
    upcoming.sort(key=lambda x: x.due_date)
    
    return upcoming


@router.post("/", response_model=DebtResponse, status_code=status.HTTP_201_CREATED)
def create_debt(
    debt_data: DebtCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new debt."""
    db_debt = Debt(
        user_id=current_user.id,
        **debt_data.model_dump()
    )
    db.add(db_debt)
    db.commit()
    db.refresh(db_debt)
    
    return calculate_debt_metrics(db_debt)


@router.get("/{debt_id}", response_model=DebtResponse)
def get_debt(
    debt_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get specific debt details."""
    debt = db.query(Debt).filter(
        Debt.id == debt_id,
        Debt.user_id == current_user.id
    ).first()
    
    if not debt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Debt not found"
        )
    
    return calculate_debt_metrics(debt)


@router.put("/{debt_id}", response_model=DebtResponse)
def update_debt(
    debt_id: int,
    debt_data: DebtUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a debt."""
    debt = db.query(Debt).filter(
        Debt.id == debt_id,
        Debt.user_id == current_user.id
    ).first()
    
    if not debt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Debt not found"
        )
    
    update_data = debt_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(debt, field, value)
    
    db.commit()
    db.refresh(debt)
    
    return calculate_debt_metrics(debt)


@router.delete("/{debt_id}")
def delete_debt(
    debt_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a debt and all its payments."""
    debt = db.query(Debt).filter(
        Debt.id == debt_id,
        Debt.user_id == current_user.id
    ).first()
    
    if not debt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Debt not found"
        )
    
    db.delete(debt)
    db.commit()
    
    return {"message": "Debt deleted successfully"}


@router.post("/{debt_id}/payments", response_model=DebtPaymentResponse)
def add_payment(
    debt_id: int,
    payment_data: DebtPaymentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a payment to a debt and optionally create a transaction."""
    debt = db.query(Debt).filter(
        Debt.id == debt_id,
        Debt.user_id == current_user.id
    ).first()
    
    if not debt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Debt not found"
        )
    
    # Determine transaction_id - use provided one or create new if requested
    transaction_id = payment_data.transaction_id
    account_id = payment_data.account_id
    
    # Create transaction if requested and account_id is provided
    if payment_data.create_transaction and account_id and not transaction_id:
        # Determine category - use linked category or find/create a "Debt Payment" category
        category_id = debt.linked_category_id
        if not category_id:
            # Try to find existing debt payment category
            from app.models import Category
            category = db.query(Category).filter(
                Category.user_id == current_user.id,
                Category.name.ilike("%debt%payment%")
            ).first()
            if not category:
                # Create default category
                category = Category(
                    user_id=current_user.id,
                    name="Debt Payment",
                    type="expense",
                    color="#EF4444"
                )
                db.add(category)
                db.flush()
            category_id = category.id
        
        # Create the transaction
        transaction = Transaction(
            user_id=current_user.id,
            account_id=account_id,
            category_id=category_id,
            amount=payment_data.amount,
            type="expense",
            description=f"Payment for {debt.name}",
            date=payment_data.payment_date,
            notes=payment_data.notes or f"Debt payment for {debt.name}"
        )
        db.add(transaction)
        db.flush()
        transaction_id = transaction.id
    
    # Create payment
    payment = DebtPayment(
        debt_id=debt_id,
        user_id=current_user.id,
        amount=payment_data.amount,
        payment_date=payment_data.payment_date,
        principal_amount=payment_data.principal_amount,
        interest_amount=payment_data.interest_amount,
        notes=payment_data.notes,
        account_id=account_id,
        transaction_id=transaction_id
    )
    db.add(payment)
    
    # Update debt balance
    debt.current_balance -= payment_data.amount
    if debt.current_balance <= 0:
        debt.current_balance = 0
        debt.is_paid_off = True
        debt.paid_off_date = date.today()
        debt.is_active = False
    
    # Update next payment date based on recurrence
    if debt.recurrence_interval and debt.recurrence_unit and not debt.is_paid_off:
        debt.next_payment_date = calculate_next_payment_date(
            payment_data.payment_date,
            debt.recurrence_interval,
            debt.recurrence_unit,
            debt.recurrence_day_of_month
        )
    
    db.commit()
    db.refresh(payment)
    
    return payment


def calculate_next_payment_date(
    last_payment_date: date,
    interval: int,
    unit: str,
    day_of_month: int = None
) -> date:
    """Calculate the next payment date based on recurrence settings."""
    if unit == "days":
        return last_payment_date + timedelta(days=interval)
    elif unit == "weeks":
        return last_payment_date + timedelta(weeks=interval)
    elif unit == "months":
        # Calculate next month
        year = last_payment_date.year
        month = last_payment_date.month + interval
        
        # Handle year rollover
        while month > 12:
            month -= 12
            year += 1
        
        # Determine day
        if day_of_month:
            # Use specified day of month
            from calendar import monthrange
            last_day = monthrange(year, month)[1]
            day = min(day_of_month, last_day)
        else:
            # Use same day as last payment
            day = last_payment_date.day
            from calendar import monthrange
            last_day = monthrange(year, month)[1]
            day = min(day, last_day)
        
        return date(year, month, day)
    
    return last_payment_date + timedelta(days=30)  # Default to 30 days


@router.get("/{debt_id}/payments", response_model=List[DebtPaymentResponse])
def get_payments(
    debt_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 50
):
    """Get payments for a debt."""
    debt = db.query(Debt).filter(
        Debt.id == debt_id,
        Debt.user_id == current_user.id
    ).first()
    
    if not debt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Debt not found"
        )
    
    payments = db.query(DebtPayment).filter(
        DebtPayment.debt_id == debt_id
    ).order_by(DebtPayment.payment_date.desc()).limit(limit).all()
    
    return payments


@router.get("/strategies/compare", response_model=PayoffComparison)
def compare_payoff_strategies(
    extra_payment: float = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Compare snowball vs avalanche payoff strategies."""
    debts = db.query(Debt).filter(
        Debt.user_id == current_user.id,
        Debt.is_active == True,
        Debt.is_paid_off == False,
        Debt.current_balance > 0
    ).all()
    
    if not debts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active debts to calculate payoff strategies"
        )
    
    # Snowball: lowest balance first
    snowball_debts = sorted(debts, key=lambda d: d.current_balance)
    snowball = calculate_payoff_strategy(snowball_debts, "snowball", extra_payment)
    
    # Avalanche: highest interest first
    avalanche_debts = sorted(debts, key=lambda d: d.interest_rate or 0, reverse=True)
    avalanche = calculate_payoff_strategy(avalanche_debts, "avalanche", extra_payment)
    
    # Determine recommended strategy
    if avalanche.total_interest_paid < snowball.total_interest_paid:
        recommended = "avalanche"
        savings = snowball.total_interest_paid - avalanche.total_interest_paid
        months_saved = snowball.total_months - avalanche.total_months
    else:
        recommended = "snowball"
        savings = avalanche.total_interest_paid - snowball.total_interest_paid
        months_saved = avalanche.total_months - snowball.total_months
    
    return PayoffComparison(
        snowball=snowball,
        avalanche=avalanche,
        recommended_strategy=recommended,
        savings_difference=round(savings, 2),
        months_difference=months_saved
    )


@router.get("/strategies/scenarios", response_model=List[ExtraPaymentScenario])
def get_extra_payment_scenarios(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get payoff scenarios with different extra payment amounts."""
    debts = db.query(Debt).filter(
        Debt.user_id == current_user.id,
        Debt.is_active == True,
        Debt.is_paid_off == False,
        Debt.current_balance > 0
    ).all()
    
    if not debts:
        return []
    
    # Calculate baseline (no extra payment)
    baseline = calculate_payoff_strategy(debts, "avalanche", 0)
    
    scenarios = []
    for extra in [50, 100, 200, 500, 1000]:
        scenario = calculate_payoff_strategy(debts, "avalanche", extra)
        scenarios.append(ExtraPaymentScenario(
            extra_payment=extra,
            new_payoff_months=scenario.total_months,
            interest_saved=round(baseline.total_interest_paid - scenario.total_interest_paid, 2),
            months_saved=baseline.total_months - scenario.total_months
        ))
    
    return scenarios


def calculate_debt_metrics(debt: Debt) -> DebtResponse:
    """Calculate payoff metrics for a debt."""
    months_to_payoff = None
    total_interest = None
    payoff_date = None
    total_amount_due = debt.current_balance
    
    if debt.current_balance > 0 and debt.minimum_payment and debt.minimum_payment > 0:
        if debt.interest_rate and debt.interest_rate > 0:
            monthly_rate = debt.interest_rate / 12
            payment = debt.minimum_payment
            balance = debt.current_balance
            
            if payment <= balance * monthly_rate:
                months_to_payoff = float('inf')
                total_interest = float('inf')
                total_amount_due = float('inf')
            else:
                months_to_payoff = math.log(
                    payment / (payment - balance * monthly_rate)
                ) / math.log(1 + monthly_rate)
                months_to_payoff = int(math.ceil(months_to_payoff))
                
                total_paid = payment * months_to_payoff
                total_interest = total_paid - balance
                total_amount_due = balance + total_interest
                payoff_date = date.today() + timedelta(days=months_to_payoff * 30)
        else:
            months_to_payoff = int(math.ceil(debt.current_balance / debt.minimum_payment))
            total_interest = 0
            total_amount_due = debt.current_balance
            payoff_date = date.today() + timedelta(days=months_to_payoff * 30)
    
    return DebtResponse(
        id=debt.id,
        user_id=debt.user_id,
        name=debt.name,
        creditor=debt.creditor,
        type=debt.type,
        original_balance=debt.original_balance,
        current_balance=debt.current_balance,
        interest_rate=debt.interest_rate,
        minimum_payment=debt.minimum_payment,
        opened_date=debt.opened_date,
        maturity_date=debt.maturity_date,
        notes=debt.notes,
        recurrence_interval=debt.recurrence_interval,
        recurrence_unit=debt.recurrence_unit,
        recurrence_day_of_month=debt.recurrence_day_of_month,
        next_payment_date=debt.next_payment_date,
        linked_account_id=debt.linked_account_id,
        linked_category_id=debt.linked_category_id,
        priority=debt.priority,
        is_active=debt.is_active,
        is_paid_off=debt.is_paid_off,
        paid_off_date=debt.paid_off_date,
        created_at=debt.created_at,
        updated_at=debt.updated_at,
        months_to_payoff=months_to_payoff if months_to_payoff != float('inf') else None,
        total_interest=round(total_interest, 2) if total_interest and total_interest != float('inf') else None,
        payoff_date=payoff_date,
        total_amount_due=round(total_amount_due, 2) if total_amount_due and total_amount_due != float('inf') else None
    )


def calculate_payoff_strategy(debts: List[Debt], strategy: str, extra_payment: float) -> PayoffStrategy:
    """Calculate payoff schedule using specified strategy."""
    # Create working copies
    debt_balances = []
    for d in debts:
        debt_balances.append({
            'id': d.id,
            'name': d.name,
            'balance': d.current_balance,
            'rate': d.interest_rate or 0,
            'min_payment': d.minimum_payment or 0
        })
    
    schedule = []
    month = 0
    total_interest = 0
    total_payments = 0
    
    # Sort by strategy
    if strategy == "snowball":
        debt_balances.sort(key=lambda x: x['balance'])
    else:  # avalanche
        debt_balances.sort(key=lambda x: x['rate'], reverse=True)
    
    active_debts = [d for d in debt_balances if d['balance'] > 0]
    
    while active_debts and month < 600:  # Max 50 years
        month += 1
        month_interest = 0
        month_payment = extra_payment
        
        # Apply minimum payments to all debts
        for debt in active_debts:
            monthly_rate = debt['rate'] / 12
            interest = debt['balance'] * monthly_rate
            debt['balance'] += interest
            month_interest += interest
            
            payment = min(debt['min_payment'], debt['balance'])
            debt['balance'] -= payment
            month_payment += debt['min_payment']
        
        total_interest += month_interest
        
        # Apply extra payment to first active debt
        if extra_payment > 0 and active_debts:
            target = active_debts[0]
            payment = min(extra_payment, target['balance'])
            target['balance'] -= payment
            month_payment += payment
        
        total_payments += month_payment
        
        # Record schedule
        for debt in active_debts:
            schedule.append(PayoffScheduleItem(
                month=month,
                debt_id=debt['id'],
                debt_name=debt['name'],
                payment=month_payment if debt == active_debts[0] else debt['min_payment'],
                remaining_balance=round(debt['balance'], 2)
            ))
        
        # Remove paid off debts
        active_debts = [d for d in active_debts if d['balance'] > 0.01]
    
    return PayoffStrategy(
        strategy=strategy,
        total_months=month,
        total_interest_paid=round(total_interest, 2),
        total_payments=round(total_payments, 2),
        payoff_schedule=schedule[:100]  # Limit schedule size
    )
