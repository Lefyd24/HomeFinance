from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Optional, List, Union


class ImportTransactionPreview(BaseModel):
    id: int
    line: Optional[int] = None
    date: str
    description: str
    amount: float
    type: str
    category_id: Optional[int] = None
    is_duplicate: bool = False


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


class ImportConfirmRow(BaseModel):
    row_id: int = Field(ge=1)
    category_id: Optional[int] = None


class ImportConfirmRequest(BaseModel):
    batch_id: int
    account_id: int
    invert_signs: bool = False
    rows: List[ImportConfirmRow] = Field(min_length=1)
