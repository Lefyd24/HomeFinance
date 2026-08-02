from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_
from typing import List, Optional
from datetime import datetime, date

from app.database import get_db
from app.utils import linked_accounts
from app.utils.security import get_current_user_authenticated
from app.schemas import (
    TransactionCreate,
    TransactionUpdate,
    TransactionResponse,
    TransactionList,
    BulkTransactionUpdate,
    BulkTransactionDelete,
    TransactionSplitRequest,
)
from app.models import User, Transaction, Account, Category, DebtPayment

router = APIRouter(prefix="/transactions", tags=["Transactions"])


def _serialize_transaction(db: Session, tx: Transaction) -> dict:
    """Flatten a transaction plus its related names for the API response.

    One place to build the shape, so a newly added column cannot be silently
    omitted here and fall back to a schema default — which is exactly how
    `is_pending` ended up always reading False.
    """
    debt_payment = (
        db.query(DebtPayment).filter(DebtPayment.transaction_id == tx.id).first()
    )
    return {
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
        "is_pending": tx.is_pending,
        "is_bank_synced": bool(tx.external_id),
        "import_batch_id": tx.import_batch_id,
        "source_file": tx.source_file,
        "created_at": tx.created_at,
        "updated_at": tx.updated_at,
        "account_name": tx.account.name if tx.account else None,
        "destination_account_name": (
            tx.destination_account.name if tx.destination_account else None
        ),
        "category_name": tx.category.name if tx.category else None,
        "category_color": tx.category.color if tx.category else None,
        "debt_payment_id": debt_payment.id if debt_payment else None,
        "debt_id": debt_payment.debt_id if debt_payment else None,
        "debt_name": (
            debt_payment.debt.name if debt_payment and debt_payment.debt else None
        ),
    }


@router.get("/", response_model=TransactionList)
def get_transactions(
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=1000, alias="per_page"),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    account_id: Optional[int] = None,
    category_id: Optional[int] = None,
    type: Optional[str] = Query(None, pattern="^(income|expense|transfer)$"),
    search: Optional[str] = None,
):
    """Get transactions with filters."""
    # Calculate skip from page
    skip = (page - 1) * per_page
    query = db.query(Transaction).filter(Transaction.user_id == current_user.id)
    # Apply filters
    if start_date:
        query = query.filter(Transaction.date >= start_date)
    if end_date:
        query = query.filter(Transaction.date <= end_date)
    if account_id:
        query = query.filter(Transaction.account_id == account_id)
    if category_id:
        query = query.filter(Transaction.category_id == category_id)
    if type:
        query = query.filter(Transaction.type == type)
    if search:
        search_lower = search.lower()
        query = query.filter(
            or_(
                Transaction.description.ilike(f"%{search_lower}%"),
                Transaction.notes.ilike(f"%{search_lower}%"),
            )
        )

    # Order by date descending
    query = query.order_by(desc(Transaction.date))

    # Get total count
    total = query.count()

    # Get paginated results
    transactions = query.offset(skip).limit(per_page).all()
    print(
        f"Fetched {len(transactions)} transactions (total: {total}) for user {current_user.id}"
    )
    # Enhance with account, category, and debt payment info
    result = [_serialize_transaction(db, tx) for tx in transactions]

    return {
        "items": result,
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.post(
    "/", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED
)
def create_transaction(
    transaction_data: TransactionCreate,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    """Create a new transaction."""
    # Verify source account belongs to user
    account = (
        db.query(Account)
        .filter(
            Account.id == transaction_data.account_id,
            Account.user_id == current_user.id,
        )
        .first()
    )

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Source account not found"
        )

    # Bank-linked accounts are read-only — their balance is overwritten from the
    # bank on every sync, so a manual row would be silently contradicted.
    # Covers the transfer destination too.
    linked_accounts.reject_linked_account_ids(
        db,
        current_user.id,
        transaction_data.account_id,
        transaction_data.destination_account_id,
    )

    # Verify destination account for transfers
    if transaction_data.type == "transfer":
        if not transaction_data.destination_account_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Transfer transactions require a destination account",
            )
        if transaction_data.account_id == transaction_data.destination_account_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Source and destination accounts cannot be the same",
            )

        destination_account = (
            db.query(Account)
            .filter(
                Account.id == transaction_data.destination_account_id,
                Account.user_id == current_user.id,
            )
            .first()
        )

        if not destination_account:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Destination account not found",
            )

    # Verify category belongs to user if provided
    if transaction_data.category_id:
        category = (
            db.query(Category)
            .filter(
                Category.id == transaction_data.category_id,
                Category.user_id == current_user.id,
            )
            .first()
        )

        if not category:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Category not found"
            )

    # Create transaction
    db_transaction = Transaction(
        user_id=current_user.id, **transaction_data.model_dump()
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
        destination_account.balance = round(
            destination_account.balance + transaction_data.amount, 2
        )

    db.commit()
    db.refresh(db_transaction)

    # Add account and category names
    result = db_transaction.__dict__.copy()
    result["account_name"] = account.name
    result["destination_account_name"] = (
        destination_account.name
        if transaction_data.type == "transfer"
        and transaction_data.destination_account_id
        else None
    )
    result["category_name"] = (
        db_transaction.category.name if db_transaction.category else None
    )
    result["category_color"] = (
        db_transaction.category.color if db_transaction.category else None
    )

    # Initialize debt payment fields (will be populated if linked later)
    result["debt_payment_id"] = None
    result["debt_id"] = None
    result["debt_name"] = None

    return result


@router.get("/income-vs-spending")
def get_income_vs_spending(
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    group_by: Optional[str] = Query("month", pattern="^(month|week)$"),
):
    """Get income vs spending grouped by month or week.
    
    Returns arrays of labels (dates), income amounts, and spending amounts
    based on the selected time range and grouping.
    """
    if not start_date:
        start_date = date.today().replace(day=1)
    if not end_date:
        end_date = date.today()
    
    if group_by == "week":
        date_format = "%Y-W%W"
        date_label_format = "Week %W, %Y"
        date_grouping = func.strftime('%Y-W%W', Transaction.date)
    else:
        date_format = "%Y-%m"
        date_label_format = "%b %Y"
        date_grouping = func.strftime('%Y-%m', Transaction.date)
    
    income_data = db.query(
        date_grouping.label('period'),
        func.sum(Transaction.amount).label('total')
    ).filter(
        Transaction.user_id == current_user.id,
        Transaction.type == "income",
        Transaction.date >= start_date,
        Transaction.date <= end_date
    ).group_by(date_grouping).order_by('period').all()
    
    spending_data = db.query(
        date_grouping.label('period'),
        func.sum(Transaction.amount).label('total')
    ).filter(
        Transaction.user_id == current_user.id,
        Transaction.type == "expense",
        Transaction.date >= start_date,
        Transaction.date <= end_date
    ).group_by(date_grouping).order_by('period').all()
    
    income_dict = {r.period: float(r.total) for r in income_data}
    spending_dict = {r.period: float(r.total) for r in spending_data}
    
    all_periods = sorted(set(list(income_dict.keys()) + list(spending_dict.keys())))
    
    if group_by == "week":
        labels = []
        for period in all_periods:
            try:
                year, week = period.split('-W')
                labels.append(f"Week {week}, {year}")
            except:
                labels.append(period)
    else:
        labels = []
        for period in all_periods:
            try:
                year, month = period.split('-')
                month_names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                               'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                labels.append(f"{month_names[int(month) - 1]} {year}")
            except:
                labels.append(period)
    
    income = [income_dict.get(p, 0) for p in all_periods]
    spending = [spending_dict.get(p, 0) for p in all_periods]
    
    return {
        "labels": labels,
        "income": income,
        "spending": spending,
        "group_by": group_by,
        "start_date": start_date.isoformat() if start_date else None,
        "end_date": end_date.isoformat() if end_date else None
    }


@router.get("/{transaction_id}", response_model=TransactionResponse)
def get_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    """Get transaction by ID."""
    transaction = (
        db.query(Transaction)
        .filter(
            Transaction.id == transaction_id, Transaction.user_id == current_user.id
        )
        .first()
    )

    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found"
        )

    # Add account, category, and debt payment info
    result = transaction.__dict__.copy()
    result["account_name"] = transaction.account.name if transaction.account else None
    result["destination_account_name"] = (
        transaction.destination_account.name
        if transaction.destination_account
        else None
    )
    result["category_name"] = (
        transaction.category.name if transaction.category else None
    )
    result["category_color"] = (
        transaction.category.color if transaction.category else None
    )

    # Check if transaction has a linked debt payment
    debt_payment = (
        db.query(DebtPayment)
        .filter(DebtPayment.transaction_id == transaction.id)
        .first()
    )
    result["debt_payment_id"] = debt_payment.id if debt_payment else None
    result["debt_id"] = debt_payment.debt_id if debt_payment else None
    result["debt_name"] = (
        debt_payment.debt.name if debt_payment and debt_payment.debt else None
    )

    return result


@router.put("/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    transaction_id: int,
    transaction_data: TransactionUpdate,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    """Update a transaction."""
    from app.services import TransactionService

    transaction = (
        db.query(Transaction)
        .filter(
            Transaction.id == transaction_id, Transaction.user_id == current_user.id
        )
        .first()
    )

    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found"
        )

    update_data = transaction_data.model_dump(exclude_unset=True)
    # Synced rows stay categorisable and annotatable; only the bank's own
    # figures are frozen.
    linked_accounts.reject_synced_field_edits(transaction, update_data)
    # Manual rows must not be MOVED onto a linked account. Only a genuine change
    # counts — the edit form resubmits the current account_id every time, and
    # treating that as a move made synced rows uneditable.
    linked_accounts.reject_linked_account_ids(
        db,
        current_user.id,
        transaction_data.account_id
        if transaction_data.account_id != transaction.account_id
        else None,
        transaction_data.destination_account_id
        if transaction_data.destination_account_id != transaction.destination_account_id
        else None,
    )

    # Re-sent bank-owned values are dropped rather than re-applied, so the
    # balance maths in TransactionService never sees a no-op change.
    transaction_data = TransactionUpdate(
        **linked_accounts.strip_unchanged_synced_fields(transaction, update_data)
    )

    # Verify destination account if changing to transfer
    if transaction_data.type == "transfer" or (
        transaction.type == "transfer" and transaction_data.destination_account_id
    ):
        dest_id = (
            transaction_data.destination_account_id
            or transaction.destination_account_id
        )
        if not dest_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Transfer transactions require a destination account",
            )

        source_id = transaction_data.account_id or transaction.account_id
        if source_id == dest_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Source and destination accounts cannot be the same",
            )

        destination_account = (
            db.query(Account)
            .filter(Account.id == dest_id, Account.user_id == current_user.id)
            .first()
        )

        if not destination_account:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Destination account not found",
            )

    # Use service to update transaction with proper balance handling
    try:
        updated_transaction = TransactionService.update_transaction(
            db, transaction, transaction_data
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Add account, category, and debt payment info
    result = updated_transaction.__dict__.copy()
    result["account_name"] = (
        updated_transaction.account.name if updated_transaction.account else None
    )
    result["destination_account_name"] = (
        updated_transaction.destination_account.name
        if updated_transaction.destination_account
        else None
    )
    result["category_name"] = (
        updated_transaction.category.name if updated_transaction.category else None
    )
    result["category_color"] = (
        updated_transaction.category.color if updated_transaction.category else None
    )

    # Check if transaction has a linked debt payment
    debt_payment = (
        db.query(DebtPayment)
        .filter(DebtPayment.transaction_id == updated_transaction.id)
        .first()
    )
    result["debt_payment_id"] = debt_payment.id if debt_payment else None
    result["debt_id"] = debt_payment.debt_id if debt_payment else None
    result["debt_name"] = (
        debt_payment.debt.name if debt_payment and debt_payment.debt else None
    )

    return result


@router.delete("/{transaction_id}")
def delete_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    """Delete a transaction."""
    from app.services import TransactionService

    transaction = (
        db.query(Transaction)
        .filter(
            Transaction.id == transaction_id, Transaction.user_id == current_user.id
        )
        .first()
    )

    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found"
        )

    linked_accounts.reject_synced_delete(transaction)

    # Use service to delete with proper balance handling
    TransactionService.delete_transaction(db, transaction)

    return {"message": "Transaction deleted successfully"}


@router.post("/{transaction_id}/split", response_model=List[TransactionResponse])
def split_transaction(
    transaction_id: int,
    request: TransactionSplitRequest,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    """Break one transaction into parts that still sum to the original amount.

    A bank reports one charge; the money may really belong to several
    categories. Editing the amount is refused on synced rows because the next
    sync would contradict it — splitting is the sanctioned alternative.

    The ORIGINAL row is kept and reduced to the first part rather than deleted
    and replaced. It carries the `external_id` that deduplication keys on, so
    deleting it would make the next sync re-import the whole charge alongside
    the parts. Extra parts get derived ids (`<original>:split:N`) which no bank
    can produce, so they are equally safe from re-import.

    Account balances are untouched: the total is unchanged by construction.
    """
    transaction = (
        db.query(Transaction)
        .filter(
            Transaction.id == transaction_id, Transaction.user_id == current_user.id
        )
        .first()
    )
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found"
        )

    if transaction.type == "transfer":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transfers cannot be split — they move money rather than categorise it.",
        )

    # Compared in cents: summing floats will not land exactly on the total.
    total_cents = round(transaction.amount * 100)
    parts_cents = sum(round(part.amount * 100) for part in request.parts)
    if parts_cents != total_cents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"The parts add up to {parts_cents / 100:.2f}, but the transaction is "
                f"{total_cents / 100:.2f}. They must match exactly."
            ),
        )

    category_ids = {part.category_id for part in request.parts if part.category_id}
    if category_ids:
        owned = {
            row_id
            for (row_id,) in db.query(Category.id).filter(
                Category.id.in_(category_ids), Category.user_id == current_user.id
            )
        }
        missing = category_ids - owned
        if missing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Unknown category: {sorted(missing)[0]}",
            )

    first, *rest = request.parts

    created = []
    for index, part in enumerate(rest, start=1):
        created.append(
            Transaction(
                user_id=transaction.user_id,
                account_id=transaction.account_id,
                destination_account_id=None,
                category_id=part.category_id,
                amount=round(part.amount, 2),
                type=transaction.type,
                # Same description and date as the original unless overridden,
                # so the parts stay recognisable as one real-world purchase.
                description=part.description or transaction.description,
                date=transaction.date,
                notes=part.notes,
                is_imported=transaction.is_imported,
                is_pending=transaction.is_pending,
                import_batch_id=transaction.import_batch_id,
                source_file=transaction.source_file,
                external_id=(
                    f"{transaction.external_id}:split:{index}"
                    if transaction.external_id
                    else None
                ),
            )
        )

    transaction.amount = round(first.amount, 2)
    if first.category_id is not None:
        transaction.category_id = first.category_id
    if first.notes is not None:
        transaction.notes = first.notes
    if first.description:
        transaction.description = first.description

    db.add_all(created)
    db.commit()

    db.refresh(transaction)
    for row in created:
        db.refresh(row)

    return [
        _serialize_transaction(db, row) for row in (transaction, *created)
    ]


@router.post("/bulk-update")
def bulk_update_transactions(
    bulk_data: BulkTransactionUpdate,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    """Bulk update transactions."""
    transactions = (
        db.query(Transaction)
        .filter(
            Transaction.id.in_(bulk_data.ids), Transaction.user_id == current_user.id
        )
        .all()
    )

    update_data = bulk_data.data.model_dump(exclude_unset=True)

    # Same rules as the single-transaction path — bulk must not be a way around
    # them. Bulk-categorising synced rows is the main use of this endpoint, so
    # only bank-owned fields are refused.
    for transaction in transactions:
        linked_accounts.reject_synced_field_edits(transaction, update_data)
    linked_accounts.reject_linked_account_ids(
        db,
        current_user.id,
        update_data.get("account_id"),
        update_data.get("destination_account_id"),
    )

    for transaction in transactions:
        for field, value in update_data.items():
            setattr(transaction, field, value)

    db.commit()

    return {"message": f"Updated {len(transactions)} transactions"}


@router.post("/bulk-delete")
def bulk_delete_transactions(
    bulk_data: BulkTransactionDelete,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    """Bulk delete transactions."""
    from app.services import TransactionService

    transactions = (
        db.query(Transaction)
        .filter(
            Transaction.id.in_(bulk_data.ids), Transaction.user_id == current_user.id
        )
        .all()
    )

    # Refuse the whole batch rather than silently skipping synced rows — a
    # partial delete that reports success is worse than a clear rejection.
    for transaction in transactions:
        linked_accounts.reject_synced_delete(transaction)

    # Use service to delete each with proper balance handling
    for transaction in transactions:
        TransactionService.delete_transaction(db, transaction)

    return {"message": f"Deleted {len(transactions)} transactions"}

