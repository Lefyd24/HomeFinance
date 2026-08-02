from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.utils.security import get_current_user_authenticated
from app.schemas import AccountCreate, AccountUpdate, AccountResponse
from app.models import User, Account, Transaction

router = APIRouter(prefix="/accounts", tags=["Accounts"])


@router.get("/", response_model=List[AccountResponse])
def get_accounts(
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
):
    """Get all accounts for current user."""
    accounts = (
        db.query(Account)
        .filter(Account.user_id == current_user.id)
        .offset(skip)
        .limit(limit)
        .all()
    )

    # Round balances to 2 decimal places to avoid floating-point precision errors
    for account in accounts:
        account.balance = round(account.balance, 2)

    return accounts


@router.post("/", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
def create_account(
    account_data: AccountCreate,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    """Create a new account."""
    db_account = Account(user_id=current_user.id, **account_data.model_dump())
    db.add(db_account)
    db.commit()
    db.refresh(db_account)

    return db_account


@router.get("/{account_id}", response_model=AccountResponse)
def get_account(
    account_id: int,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    """Get account by ID."""
    account = (
        db.query(Account)
        .filter(Account.id == account_id, Account.user_id == current_user.id)
        .first()
    )

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Account not found"
        )

    # Round balance to 2 decimal places
    account.balance = round(account.balance, 2)

    return account


@router.put("/{account_id}", response_model=AccountResponse)
def update_account(
    account_id: int,
    account_data: AccountUpdate,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    """Update an account."""
    account = (
        db.query(Account)
        .filter(Account.id == account_id, Account.user_id == current_user.id)
        .first()
    )

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Account not found"
        )

    update_data = account_data.model_dump(exclude_unset=True)

    # A linked account's balance, currency and type mirror the bank and are
    # overwritten on every sync — accepting an edit here would silently discard
    # it. Cosmetic fields (name, description, icon, is_active) stay editable.
    if account.is_linked:
        bank_owned = {"balance", "currency", "type"} & update_data.keys()
        if bank_owned:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"{', '.join(sorted(bank_owned))} of '{account.name}' is synced from "
                    "your bank and cannot be edited. Disconnect the bank first."
                ),
            )

    for field, value in update_data.items():
        setattr(account, field, value)

    db.commit()
    db.refresh(account)

    return account


@router.delete("/{account_id}")
def delete_account(
    account_id: int,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    """Delete an account and all associated transactions."""
    account = (
        db.query(Account)
        .filter(Account.id == account_id, Account.user_id == current_user.id)
        .first()
    )

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Account not found"
        )

    if account.is_linked:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"'{account.name}' is linked to a bank. Disconnect it from the "
                "Connections page instead — that also revokes the bank consent."
            ),
        )

    # Delete all transactions associated with this account
    # This includes both regular transactions and transfer destination transactions.
    # The user_id filter matters: account ids are global, so without it a crafted
    # request could delete another user's transactions by id collision.
    deleted_count = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user.id,
            (Transaction.account_id == account_id)
            | (Transaction.destination_account_id == account_id),
        )
        .delete(synchronize_session=False)
    )

    # Now delete the account
    db.delete(account)
    db.commit()

    return {
        "message": "Account deleted successfully",
        "deleted_transactions": deleted_count,
    }


@router.get("/{account_id}/transactions")
def get_account_transactions(
    account_id: int,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
):
    """Get transactions for a specific account."""
    account = (
        db.query(Account)
        .filter(Account.id == account_id, Account.user_id == current_user.id)
        .first()
    )

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Account not found"
        )

    transactions = (
        db.query(Account)
        .filter(Account.id == account_id)
        .first()
        .transactions[skip : skip + limit]
    )

    return transactions


@router.get("/{account_id}/balance")
def get_account_balance_history(
    account_id: int,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    """Get account balance history."""
    account = (
        db.query(Account)
        .filter(Account.id == account_id, Account.user_id == current_user.id)
        .first()
    )

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Account not found"
        )

    # Return current balance and account info
    return {
        "account_id": account.id,
        "account_name": account.name,
        "current_balance": round(account.balance, 2),
        "currency": account.currency,
    }
