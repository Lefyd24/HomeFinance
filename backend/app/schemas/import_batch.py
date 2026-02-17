from pydantic import BaseModel, field_validator
from datetime import datetime
from typing import Optional, List, Union


class ImportTransactionPreview(BaseModel):
    id: Optional[int] = None
    date: Union[str, datetime]
    description: str
    amount: float
    suggested_category: Optional[str] = None
    confidence: Optional[float] = None
    is_duplicate: bool = False
    category_id: Optional[int] = None


class ImportPreviewResponse(BaseModel):
    transactions: List[ImportTransactionPreview]
    duplicates: List[ImportTransactionPreview]
    total: int


class ImportBatchResponse(BaseModel):
    id: int
    filename: str
    file_type: str
    status: str
    total_rows: int
    processed_rows: int
    error_message: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]
    
    class Config:
        from_attributes = True


class ImportConfirmRequest(BaseModel):
    batch_id: int
    account_id: int
    transactions: List[dict]