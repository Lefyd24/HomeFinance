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
    import_batch_id: Optional[str]
    source_file: Optional[str]
    created_at: datetime
    updated_at: datetime
    account_name: Optional[str] = None
    destination_account_name: Optional[str] = None
    category_name: Optional[str] = None
    category_color: Optional[str] = None
    
    class Config:
        from_attributes = True


class TransactionList(BaseModel):
    items: List[TransactionResponse]
    total: int
    page: int
    per_page: int


class BulkTransactionUpdate(BaseModel):
    ids: List[int]
    data: TransactionUpdate


class BulkTransactionDelete(BaseModel):
    ids: List[int]