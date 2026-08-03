from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Float,
    Text,
    Date,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class Transaction(Base):
    """Transaction model for income, expenses, and transfers."""
    __tablename__ = "transactions"
    __table_args__ = (
        # The entire dedup story for bank sync: re-syncing an overlapping date
        # range re-sends transactions we already have, and this constraint
        # absorbs them. Scoped to user_id because external ids are only unique
        # within one bank's namespace.
        UniqueConstraint("user_id", "external_id", name="uq_transactions_user_external"),
    )


    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)  # Source account
    destination_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)  # Destination account for transfers
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    amount = Column(Float, nullable=False)
    type = Column(String(20), nullable=False)  # income, expense, transfer
    description = Column(Text, nullable=False)
    date = Column(Date, nullable=False)
    notes = Column(Text)
    is_imported = Column(Boolean, default=False)
    import_batch_id = Column(String(100))
    source_file = Column(String(255))
    # Stable per-transaction id from the bank, used solely for deduplication of
    # synced rows. NULL for everything entered manually or via CSV import —
    # SQLite treats NULLs as distinct in a unique index, so those never collide.
    # See uq_transactions_user_external below.
    external_id = Column(String(255), nullable=True)
    # True for a bank transaction the bank has not yet booked. These are
    # ephemeral: they change, vanish, or reappear as a booked entry under a
    # different identifier, so bank_sync_service replaces the whole pending set
    # for an account on every sync rather than accumulating it.
    is_pending = Column(Boolean, nullable=False, default=False)

    # --- Transfer retagging (linked-account transfers) --------------------
    # A linked account's synced row can be retagged as a transfer leg without
    # losing its bank-owned identity. See TransactionService.pair_as_transfer /
    # retag_as_transfer / unmark_transfer.
    # Set on both rows when two pre-existing transactions (e.g. the expense on
    # one linked account and the income on another) are matched as the two
    # legs of the same real-world transfer.
    paired_transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=True)
    # "outgoing" | "incoming" — which way money actually flowed. Needed because
    # a linked account's account_id can never be repointed (it's tied to its
    # bank statement line), so it stays in `account_id` even when it is really
    # the destination of the transfer (an incoming retagged row).
    transfer_direction = Column(String(10), nullable=True)
    # The row's type before it was retagged to "transfer", so unmark_transfer
    # can restore it.
    original_type = Column(String(20), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="transactions")
    account = relationship("Account", back_populates="transactions", foreign_keys="Transaction.account_id")
    destination_account = relationship("Account", foreign_keys="Transaction.destination_account_id")
    paired_transaction = relationship("Transaction", remote_side=[id], foreign_keys="Transaction.paired_transaction_id")
    category = relationship("Category", back_populates="transactions")
    debt_payment = relationship("DebtPayment", back_populates="transaction", uselist=False)