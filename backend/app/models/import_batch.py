from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class ImportBatch(Base):
    """Import batch model for tracking file imports."""
    __tablename__ = "import_batches"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    filename = Column(String(255))
    file_type = Column(String(50))  # csv, xlsx, pdf
    status = Column(String(20), default="pending")  # pending, processing, completed, error
    total_rows = Column(Integer, default=0)
    processed_rows = Column(Integer, default=0)
    parsed_data = Column(JSON)  # Store parsed transactions as JSON
    error_message = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)
    
    # Relationships
    user = relationship("User", back_populates="import_batches")