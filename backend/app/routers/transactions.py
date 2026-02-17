from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import List, Optional
from datetime import datetime, date

from app.database import get_db
from app.utils.security import get_current_user
from app.schemas import (
    TransactionCreate, TransactionUpdate, TransactionResponse,
    TransactionList, BulkTransactionUpdate, BulkTransactionDelete
)
from app.models import User, Transaction, Account, Category

router = APIRouter(prefix="/transactions", tags=["Transactions"])


@router.get("/", response_model=TransactionList)
def get_transactions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=1000),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    account_id: Optional[int] = None,
    category_id: Optional[int] = None,
    type: Optional[str] = Query(None, pattern="^(income|expense|transfer)$"),
    search: Optional[str] = None
):
    """Get transactions with filters."""
    print(f"Fetching transactions for user {current_user.id} with filters: start_date={start_date}, end_date={end_date}, account_id={account_id}, category_id={category_id}, type={type}, search={search}, skip={skip}, limit={limit}")
    query = db.query(Transaction).filter(Transaction.user_id == current_user.id)
    # Apply filters
    if start_date:
        query = query.filter(Transaction.date >= start_date)
    if end_date:
        query = query.filter(Transaction.date <= end_date)
    if account_id:
        print(f"Filtering transactions for account_id={account_id}")
        query = query.filter(Transaction.account_id == account_id)
    if category_id:
        query = query.filter(Transaction.category_id == category_id)
    if type:
        query = query.filter(Transaction.type == type)
    if search:
        query = query.filter(Transaction.description.ilike(f"%{search}%"))
    
    # Order by date descending
    query = query.order_by(desc(Transaction.date))
    
    # Get total count
    total = query.count()
    
    # Get paginated results
    transactions = query.offset(skip).limit(limit).all()
    print(f"Fetched {len(transactions)} transactions (total: {total}) for user {current_user.id}")
    # Enhance with account and category names
    result = []
    for tx in transactions:
        tx_dict = {
            "id": tx.id,
            "user_id": tx.user_id,
            "account_id": tx.account_id,
            "destination_account_id": tx.destination_account_id,
            "category_id": tx.category_id,
            "amount": tx.amount,
            "type": tx.type,
            "description": tx.description,
            "date": tx.date,
            "notes": tx.notes,
            "is_imported": tx.is_imported,
            "import_batch_id": tx.import_batch_id,
            "source_file": tx.source_file,
            "created_at": tx.created_at,
            "updated_at": tx.updated_at,
            "account_name": tx.account.name if tx.account else None,
            "destination_account_name": tx.destination_account.name if tx.destination_account else None,
            "category_name": tx.category.name if tx.category else None,
            "category_color": tx.category.color if tx.category else None
        }
        result.append(tx_dict)
    
    return {
        "items": result,
        "total": total,
        "page": skip // limit + 1 if limit > 0 else 1,
        "per_page": limit
    }


@router.post("/", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
def create_transaction(
    transaction_data: TransactionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new transaction."""
    # Verify source account belongs to user
    account = db.query(Account).filter(
        Account.id == transaction_data.account_id,
        Account.user_id == current_user.id
    ).first()
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source account not found"
        )
    
    # Verify destination account for transfers
    if transaction_data.type == "transfer":
        if not transaction_data.destination_account_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Transfer transactions require a destination account"
            )
        if transaction_data.account_id == transaction_data.destination_account_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Source and destination accounts cannot be the same"
            )
        
        destination_account = db.query(Account).filter(
            Account.id == transaction_data.destination_account_id,
            Account.user_id == current_user.id
        ).first()
        
        if not destination_account:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Destination account not found"
            )
    
    # Verify category belongs to user if provided
    if transaction_data.category_id:
        category = db.query(Category).filter(
            Category.id == transaction_data.category_id,
            Category.user_id == current_user.id
        ).first()
        
        if not category:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Category not found"
            )
    
    # Create transaction
    db_transaction = Transaction(
        user_id=current_user.id,
        **transaction_data.model_dump()
    )
    db.add(db_transaction)
    
    # Update account balance(s) with proper rounding
    if transaction_data.type == "income":
        account.balance = round(account.balance + transaction_data.amount, 2)
    elif transaction_data.type == "expense":
        account.balance = round(account.balance - transaction_data.amount, 2)
    elif transaction_data.type == "transfer":
        # Deduct from source account
        account.balance = round(account.balance - transaction_data.amount, 2)
        # Add to destination account
        destination_account.balance = round(destination_account.balance + transaction_data.amount, 2)
    
    db.commit()
    db.refresh(db_transaction)
    
    # Add account and category names
    result = db_transaction.__dict__.copy()
    result["account_name"] = account.name
    result["destination_account_name"] = destination_account.name if transaction_data.type == "transfer" and transaction_data.destination_account_id else None
    result["category_name"] = db_transaction.category.name if db_transaction.category else None
    result["category_color"] = db_transaction.category.color if db_transaction.category else None
    
    return result


@router.get("/{transaction_id}", response_model=TransactionResponse)
def get_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get transaction by ID."""
    transaction = db.query(Transaction).filter(
        Transaction.id == transaction_id,
        Transaction.user_id == current_user.id
    ).first()
    
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found"
        )
    
    # Add account and category names
    result = transaction.__dict__.copy()
    result["account_name"] = transaction.account.name if transaction.account else None
    result["destination_account_name"] = transaction.destination_account.name if transaction.destination_account else None
    result["category_name"] = transaction.category.name if transaction.category else None
    result["category_color"] = transaction.category.color if transaction.category else None
    
    return result


@router.put("/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    transaction_id: int,
    transaction_data: TransactionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a transaction."""
    from app.services import TransactionService
    
    transaction = db.query(Transaction).filter(
        Transaction.id == transaction_id,
        Transaction.user_id == current_user.id
    ).first()
    
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found"
        )
    
    # Verify destination account if changing to transfer
    if transaction_data.type == "transfer" or (transaction.type == "transfer" and transaction_data.destination_account_id):
        dest_id = transaction_data.destination_account_id or transaction.destination_account_id
        if not dest_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Transfer transactions require a destination account"
            )
        
        source_id = transaction_data.account_id or transaction.account_id
        if source_id == dest_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Source and destination accounts cannot be the same"
            )
        
        destination_account = db.query(Account).filter(
            Account.id == dest_id,
            Account.user_id == current_user.id
        ).first()
        
        if not destination_account:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Destination account not found"
            )
    
    # Use service to update transaction with proper balance handling
    try:
        updated_transaction = TransactionService.update_transaction(
            db, transaction, transaction_data
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    
    # Add account and category names
    result = updated_transaction.__dict__.copy()
    result["account_name"] = updated_transaction.account.name if updated_transaction.account else None
    result["destination_account_name"] = updated_transaction.destination_account.name if updated_transaction.destination_account else None
    result["category_name"] = updated_transaction.category.name if updated_transaction.category else None
    result["category_color"] = updated_transaction.category.color if updated_transaction.category else None
    
    return result


@router.delete("/{transaction_id}")
def delete_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a transaction."""
    from app.services import TransactionService
    
    transaction = db.query(Transaction).filter(
        Transaction.id == transaction_id,
        Transaction.user_id == current_user.id
    ).first()
    
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found"
        )
    
    # Use service to delete with proper balance handling
    TransactionService.delete_transaction(db, transaction)
    
    return {"message": "Transaction deleted successfully"}


@router.post("/bulk-update")
def bulk_update_transactions(
    bulk_data: BulkTransactionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Bulk update transactions."""
    transactions = db.query(Transaction).filter(
        Transaction.id.in_(bulk_data.ids),
        Transaction.user_id == current_user.id
    ).all()
    
    update_data = bulk_data.data.model_dump(exclude_unset=True)
    for transaction in transactions:
        for field, value in update_data.items():
            setattr(transaction, field, value)
    
    db.commit()
    
    return {"message": f"Updated {len(transactions)} transactions"}


@router.post("/bulk-delete")
def bulk_delete_transactions(
    bulk_data: BulkTransactionDelete,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Bulk delete transactions."""
    from app.services import TransactionService
    
    transactions = db.query(Transaction).filter(
        Transaction.id.in_(bulk_data.ids),
        Transaction.user_id == current_user.id
    ).all()
    
    # Use service to delete each with proper balance handling
    for transaction in transactions:
        TransactionService.delete_transaction(db, transaction)
    
    return {"message": f"Deleted {len(transactions)} transactions"}