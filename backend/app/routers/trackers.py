from datetime import datetime, time
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Account, Category, Tracker, TrackerTransaction, Transaction, User
from app.schemas.tracker import (
    TrackerCreate,
    TrackerResponse,
    TrackerTransactionCreate,
    TrackerTransactionEntry,
    TrackerTransactionLink,
    TrackerTransactionList,
    TrackerUpdate,
)
from app.schemas.transaction import TransactionCreate
from app.services.transaction_service import TransactionService
from app.utils import linked_accounts
from app.utils.security import get_current_user_authenticated as get_current_user

router = APIRouter(prefix="/trackers", tags=["Trackers"])


def _tracker_or_404(db: Session, tracker_id: int, user_id: int) -> Tracker:
    tracker = (
        db.query(Tracker)
        .filter(Tracker.id == tracker_id, Tracker.user_id == user_id)
        .first()
    )
    if not tracker:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tracker not found"
        )
    return tracker


def _linked_transactions(db: Session, tracker_id: int) -> List[Transaction]:
    """The transactions in a tracker, newest first."""
    return (
        db.query(Transaction)
        .join(TrackerTransaction, TrackerTransaction.transaction_id == Transaction.id)
        .filter(TrackerTransaction.tracker_id == tracker_id)
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .all()
    )


def _serialize_tracker(db: Session, tracker: Tracker) -> dict:
    """Flatten a tracker plus the totals derived from its transactions.

    Income inside a tracker (a refund on the trip, say) subtracts from the
    total, so what you read is what the bucket actually cost you.
    """
    transactions = _linked_transactions(db, tracker.id)
    total = 0.0
    for tx in transactions:
        if tx.type == "income":
            total -= tx.amount
        else:
            total += tx.amount
    total = round(total, 2)

    dates = [tx.date for tx in transactions if tx.date]
    progress = None
    remaining = None
    if tracker.target_amount and tracker.target_amount > 0:
        progress = round(total / tracker.target_amount * 100, 2)
        remaining = round(tracker.target_amount - total, 2)

    return {
        "id": tracker.id,
        "user_id": tracker.user_id,
        "name": tracker.name,
        "description": tracker.description,
        "target_amount": tracker.target_amount,
        "currency": tracker.currency or "EUR",
        "icon": tracker.icon,
        "color": tracker.color,
        "is_active": bool(tracker.is_active),
        "created_at": tracker.created_at,
        "updated_at": tracker.updated_at,
        "transaction_count": len(transactions),
        "total_amount": total,
        "last_transaction_date": max(dates) if dates else None,
        "first_transaction_date": min(dates) if dates else None,
        "progress_percentage": progress,
        "remaining_amount": remaining,
    }


@router.get("/", response_model=List[TrackerResponse])
def get_trackers(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    active_only: bool = False,
):
    """List trackers, newest first."""
    query = db.query(Tracker).filter(Tracker.user_id == current_user.id)
    if active_only:
        query = query.filter(Tracker.is_active == True)  # noqa: E712

    trackers = query.order_by(Tracker.created_at.desc()).all()
    return [_serialize_tracker(db, tracker) for tracker in trackers]


@router.post("/", response_model=TrackerResponse, status_code=status.HTTP_201_CREATED)
def create_tracker(
    tracker_data: TrackerCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a tracker."""
    tracker = Tracker(user_id=current_user.id, **tracker_data.model_dump())
    db.add(tracker)
    db.commit()
    db.refresh(tracker)
    return _serialize_tracker(db, tracker)


@router.get("/{tracker_id}", response_model=TrackerResponse)
def get_tracker(
    tracker_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get one tracker with its totals."""
    tracker = _tracker_or_404(db, tracker_id, current_user.id)
    return _serialize_tracker(db, tracker)


@router.put("/{tracker_id}", response_model=TrackerResponse)
def update_tracker(
    tracker_id: int,
    tracker_data: TrackerUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a tracker, including activating or deactivating it."""
    tracker = _tracker_or_404(db, tracker_id, current_user.id)

    for field, value in tracker_data.model_dump(exclude_unset=True).items():
        setattr(tracker, field, value)

    db.commit()
    db.refresh(tracker)
    return _serialize_tracker(db, tracker)


@router.delete("/{tracker_id}")
def delete_tracker(
    tracker_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a tracker. The transactions themselves are left untouched."""
    tracker = _tracker_or_404(db, tracker_id, current_user.id)
    db.delete(tracker)
    db.commit()
    return {"message": "Tracker deleted successfully"}


@router.get("/{tracker_id}/transactions", response_model=TrackerTransactionList)
def get_tracker_transactions(
    tracker_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The transactions filed under a tracker, plus their total."""
    _tracker_or_404(db, tracker_id, current_user.id)

    links = {
        link.transaction_id: link
        for link in db.query(TrackerTransaction)
        .filter(TrackerTransaction.tracker_id == tracker_id)
        .all()
    }
    transactions = _linked_transactions(db, tracker_id)

    items = [
        TrackerTransactionEntry(
            id=links[tx.id].id,
            transaction_id=tx.id,
            amount=tx.amount,
            type=tx.type,
            description=tx.description,
            date=tx.date,
            notes=tx.notes,
            account_name=tx.account.name if tx.account else None,
            category_name=tx.category.name if tx.category else None,
            category_color=tx.category.color if tx.category else None,
            added_at=links[tx.id].created_at,
        )
        for tx in transactions
        if tx.id in links
    ]

    total = round(
        sum(-tx.amount if tx.type == "income" else tx.amount for tx in transactions), 2
    )

    return TrackerTransactionList(items=items, total_amount=total, count=len(items))


@router.post(
    "/{tracker_id}/transactions",
    response_model=TrackerResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_tracker_transaction(
    tracker_id: int,
    payload: TrackerTransactionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a real transaction and file it under this tracker."""
    tracker = _tracker_or_404(db, tracker_id, current_user.id)

    account = (
        db.query(Account)
        .filter(Account.id == payload.account_id, Account.user_id == current_user.id)
        .first()
    )
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Account not found"
        )

    # Bank-linked accounts own their own ledger — the next sync would contradict
    # anything typed here.
    linked_accounts.reject_linked_account_ids(db, current_user.id, payload.account_id)

    if payload.category_id is not None:
        category = (
            db.query(Category)
            .filter(
                Category.id == payload.category_id,
                Category.user_id == current_user.id,
            )
            .first()
        )
        if not category:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Category not found"
            )

    transaction = TransactionService.create_transaction(
        db,
        TransactionCreate(
            account_id=payload.account_id,
            category_id=payload.category_id,
            amount=payload.amount,
            type=payload.type,
            description=payload.description,
            # The ledger stores a datetime; noon keeps the date stable whichever
            # way a timezone shifts it.
            date=datetime.combine(payload.date, time(12, 0)),
            notes=payload.notes,
        ),
        current_user.id,
    )

    db.add(
        TrackerTransaction(
            tracker_id=tracker.id,
            transaction_id=transaction.id,
            user_id=current_user.id,
        )
    )
    db.commit()

    return _serialize_tracker(db, tracker)


@router.post("/{tracker_id}/transactions/link", response_model=TrackerResponse)
def link_tracker_transaction(
    tracker_id: int,
    payload: TrackerTransactionLink,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add an existing transaction to this tracker."""
    tracker = _tracker_or_404(db, tracker_id, current_user.id)

    transaction = (
        db.query(Transaction)
        .filter(
            Transaction.id == payload.transaction_id,
            Transaction.user_id == current_user.id,
        )
        .first()
    )
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found"
        )

    existing = (
        db.query(TrackerTransaction)
        .filter(
            TrackerTransaction.tracker_id == tracker.id,
            TrackerTransaction.transaction_id == transaction.id,
        )
        .first()
    )
    if not existing:
        db.add(
            TrackerTransaction(
                tracker_id=tracker.id,
                transaction_id=transaction.id,
                user_id=current_user.id,
            )
        )
        db.commit()

    return _serialize_tracker(db, tracker)


@router.delete("/{tracker_id}/transactions/{transaction_id}")
def remove_tracker_transaction(
    tracker_id: int,
    transaction_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Take a transaction out of a tracker. The transaction itself stays."""
    _tracker_or_404(db, tracker_id, current_user.id)

    link = (
        db.query(TrackerTransaction)
        .filter(
            TrackerTransaction.tracker_id == tracker_id,
            TrackerTransaction.transaction_id == transaction_id,
            TrackerTransaction.user_id == current_user.id,
        )
        .first()
    )
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction is not in this tracker",
        )

    db.delete(link)
    db.commit()
    return {"message": "Transaction removed from tracker"}


def set_transaction_trackers(
    db: Session, user_id: int, transaction: Transaction, tracker_ids: List[int]
) -> List[int]:
    """Make `tracker_ids` the complete set of trackers for one transaction.

    Only the user's own trackers are considered; unknown ids are rejected rather
    than silently dropped so a stale UI cannot quietly lose an assignment.
    """
    wanted = set(tracker_ids)
    if wanted:
        owned = {
            row.id
            for row in db.query(Tracker.id)
            .filter(Tracker.user_id == user_id, Tracker.id.in_(wanted))
            .all()
        }
        missing = wanted - owned
        if missing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Tracker not found"
            )

    existing = (
        db.query(TrackerTransaction)
        .filter(
            TrackerTransaction.transaction_id == transaction.id,
            TrackerTransaction.user_id == user_id,
        )
        .all()
    )
    current = {link.tracker_id: link for link in existing}

    for tracker_id, link in current.items():
        if tracker_id not in wanted:
            db.delete(link)

    for tracker_id in wanted - set(current):
        db.add(
            TrackerTransaction(
                tracker_id=tracker_id,
                transaction_id=transaction.id,
                user_id=user_id,
            )
        )

    db.commit()
    return sorted(wanted)


def tracker_ids_for_transaction(db: Session, transaction_id: int) -> List[int]:
    """Tracker ids a transaction currently belongs to."""
    return [
        row.tracker_id
        for row in db.query(TrackerTransaction.tracker_id)
        .filter(TrackerTransaction.transaction_id == transaction_id)
        .all()
    ]


def tracker_names_for_transaction(db: Session, transaction_id: int) -> List[str]:
    """Tracker names a transaction currently belongs to, for display."""
    return [
        row.name
        for row in db.query(Tracker.name)
        .join(TrackerTransaction, TrackerTransaction.tracker_id == Tracker.id)
        .filter(TrackerTransaction.transaction_id == transaction_id)
        .order_by(Tracker.name)
        .all()
    ]
