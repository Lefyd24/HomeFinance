from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.utils.security import get_current_user
from app.schemas import AccountCreate, AccountUpdate, AccountResponse
from app.models import User, Account

router = APIRouter(prefix="/accounts", tags=["Accounts"])


@router.get("/", response_model=List[AccountResponse])
def get_accounts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100
):
    """Get all accounts for current user."""
    accounts = db.query(Account).filter(
        Account.user_id == current_user.id
    ).offset(skip).limit(limit).all()
    
    # Round balances to 2 decimal places to avoid floating-point precision errors
    for account in accounts:
        account.balance = round(account.balance, 2)
    
    return accounts


@router.post("/", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
def create_account(
    account_data: AccountCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new account."""
    db_account = Account(
        user_id=current_user.id,
        **account_data.model_dump()
    )
    db.add(db_account)
    db.commit()
    db.refresh(db_account)
    
    return db_account


@router.get("/{account_id}", response_model=AccountResponse)
def get_account(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get account by ID."""
    account = db.query(Account).filter(
        Account.id == account_id,
        Account.user_id == current_user.id
    ).first()
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )
    
    # Round balance to 2 decimal places
    account.balance = round(account.balance, 2)
    
    return account


@router.put("/{account_id}", response_model=AccountResponse)
def update_account(
    account_id: int,
    account_data: AccountUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update an account."""
    account = db.query(Account).filter(
        Account.id == account_id,
        Account.user_id == current_user.id
    ).first()
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )
    
    # Update fields
    update_data = account_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(account, field, value)
    
    db.commit()
    db.refresh(account)
    
    return account


@router.delete("/{account_id}")
def delete_account(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete an account."""
    account = db.query(Account).filter(
        Account.id == account_id,
        Account.user_id == current_user.id
    ).first()
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )
    
    # Instead of deleting, mark as inactive
    account.is_active = False
    db.commit()
    
    return {"message": "Account deleted successfully"}


@router.get("/{account_id}/transactions")
def get_account_transactions(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100
):
    """Get transactions for a specific account."""
    account = db.query(Account).filter(
        Account.id == account_id,
        Account.user_id == current_user.id
    ).first()
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )
    
    transactions = db.query(Account).filter(
        Account.id == account_id
    ).first().transactions[skip:skip+limit]
    
    return transactions


@router.get("/{account_id}/balance")
def get_account_balance_history(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get account balance history."""
    account = db.query(Account).filter(
        Account.id == account_id,
        Account.user_id == current_user.id
    ).first()
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )
    
    # Return current balance and account info
    return {
        "account_id": account.id,
        "account_name": account.name,
        "current_balance": round(account.balance, 2),
        "currency": account.currency
    }