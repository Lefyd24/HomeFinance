from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List


class TransactionBase(BaseModel):
    account_id: int
    destination_account_id: Optional[int] = None  # Required for transfers
    category_id: Optional[int] = None
    amount: float = Field(..., gt=0)
    type: str = Field(..., pattern="^(income|expense|transfer)$")
    description: str = Field(..., min_length=1)
    date: datetime
    notes: Optional[str] = None
    
    def model_post_init(self, __context):
        """Validate transfer transactions require destination_account_id."""
        if self.type == "transfer" and not self.destination_account_id:
            raise ValueError("Transfer transactions require a destination account")


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(BaseModel):
    account_id: Optional[int] = None
    destination_account_id: Optional[int] = None
    category_id: Optional[int] = None
    amount: Optional[float] = Field(None, gt=0)
    type: Optional[str] = Field(None, pattern="^(income|expense|transfer)$")
    description: Optional[str] = Field(None, min_length=1)
    date: Optional[datetime] = None
    notes: Optional[str] = None


class TransactionResponse(TransactionBase):
    id: int
    user_id: int
    is_imported: bool
    # Not yet booked by the bank — shown differently and liable to change or
    # disappear on the next sync.
    is_pending: bool = False
    # Came from a bank sync, so its amount/date/account are locked. The UI uses
    # this to offer "break this transaction" instead of an amount field.
    is_bank_synced: bool = False
    import_batch_id: Optional[str]
    source_file: Optional[str]
    created_at: datetime
    updated_at: datetime
    account_name: Optional[str] = None
    destination_account_name: Optional[str] = None
    category_name: Optional[str] = None
    category_color: Optional[str] = None
    debt_payment_id: Optional[int] = None
    debt_id: Optional[int] = None
    debt_name: Optional[str] = None
    
    class Config:
        from_attributes = True


class TransactionList(BaseModel):
    items: List[TransactionResponse]
    total: int
    page: int
    per_page: int


class TransactionSplitPart(BaseModel):
    amount: float = Field(..., gt=0)
    category_id: Optional[int] = None
    notes: Optional[str] = None
    # Optional per-part label; the original description is kept when absent.
    description: Optional[str] = Field(None, min_length=1)


class TransactionSplitRequest(BaseModel):
    """Break one transaction into parts that still add up to the original.

    Used mainly for bank-synced rows, whose amount cannot be edited: a single
    supermarket charge might really be groceries plus household plus a gift, and
    this is the only way to categorise those separately without inventing
    transactions the bank never reported.
    """

    parts: List[TransactionSplitPart] = Field(..., min_length=2)


class BulkTransactionUpdate(BaseModel):
    ids: List[int]
    data: TransactionUpdate


class BulkTransactionDelete(BaseModel):
    ids: List[int]