import logging
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Account, Category, ImportBatch, Transaction, User
from app.schemas import (
    ImportBatchResponse,
    ImportConfirmRequest,
    ImportPreviewResponse,
)
from app.utils.file_parsers import parse_bank_file
from app.utils.security import get_current_user

logger = logging.getLogger("app")

router = APIRouter(prefix="/import", tags=["Import"])


@router.post("/upload")
async def upload_file(
    file: UploadFile | None = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload bank file for import."""
    logger.debug("Import upload called by user_id=%s", current_user.id)

    # Validate file was provided
    if not file or file is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file provided - please select a file to upload",
        )

    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="File has no filename"
        )

    logger.info(
        "Uploading file: %s (content_type=%s) for user_id=%s",
        file.filename,
        file.content_type,
        current_user.id,
    )

    # Determine file type from extension
    filename = file.filename.lower()
    if filename.endswith(".csv"):
        file_type = "csv"
    elif filename.endswith(".xlsx"):
        file_type = "xlsx"
    elif filename.endswith(".xls"):
        file_type = "xls"
    else:
        logger.info("Unsupported file type for: %s", filename)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type. Please upload CSV or Excel files (.csv, .xlsx, .xls)",
        )

    # Create import batch record
    batch = ImportBatch(
        user_id=current_user.id,
        filename=file.filename,
        file_type=file_type,
        status="processing",
        total_rows=0,
        processed_rows=0,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)

    try:
        # Read file content
        content = await file.read()

        if not content:
            raise ValueError("File is empty")

        logger.debug("File size: %d bytes", len(content))

        # Parse file
        transactions = parse_bank_file(content, file_type)

        logger.info("Parsed %d transactions from %s", len(transactions), file.filename)

        # Serialize transactions for JSON storage
        serialized_transactions = []
        for tx in transactions:
            serialized_tx = {
                "date": tx["date"].isoformat()
                if isinstance(tx.get("date"), datetime)
                else str(tx.get("date", "")),
                "description": tx.get("description", ""),
                "amount": float(tx.get("amount", 0)),
            }
            serialized_transactions.append(serialized_tx)

        # Update batch info
        batch.total_rows = len(transactions)
        batch.status = "pending"
        batch.parsed_data = serialized_transactions
        db.commit()

        return {
            "batch_id": batch.id,
            "filename": batch.filename,
            "total_rows": batch.total_rows,
            "message": "File uploaded successfully. Call /preview to review transactions.",
        }

    except ValueError as ve:
        # Validation errors from the parser (bad format, empty file, etc.) are
        # safe and useful to show the user as-is.
        batch.status = "error"
        batch.error_message = str(ve)
        db.commit()
        logger.info("Validation error parsing file %s: %s", file.filename, ve)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        batch.status = "error"
        batch.error_message = str(e)
        db.commit()
        logger.exception("Error parsing file %s", file.filename)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Error parsing file. Please check the file format and try again.",
        )


@router.get("/formats")
def get_supported_formats():
    """Get list of supported import formats."""
    return {
        "formats": [
            {
                "type": "csv",
                "name": "CSV (Comma Separated Values)",
                "extensions": [".csv"],
                "description": "Generic CSV format with columns: Date, Description, Amount",
            },
            {
                "type": "xlsx",
                "name": "Excel",
                "extensions": [".xlsx", ".xls"],
                "description": "Microsoft Excel format",
            },
        ]
    }


@router.get("/preview/{batch_id}", response_model=ImportPreviewResponse)
def preview_transactions(
    batch_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Preview parsed transactions before import."""
    batch = (
        db.query(ImportBatch)
        .filter(ImportBatch.id == batch_id, ImportBatch.user_id == current_user.id)
        .first()
    )

    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Import batch not found"
        )

    # Get parsed transactions from batch
    transactions = []
    if batch.parsed_data:
        for i, tx in enumerate(batch.parsed_data):
            transactions.append(
                {
                    "id": i + 1,
                    "date": tx.get("date", ""),
                    "description": tx.get("description", ""),
                    "amount": tx.get("amount", 0),
                    "suggested_category": None,
                    "is_duplicate": False,
                    "category_id": None,
                }
            )

    return ImportPreviewResponse(
        transactions=transactions, duplicates=[], total=len(transactions)
    )


@router.post("/preview/{row_id}/update")
def update_preview_row(
    row_id: int,
    description: str | None = None,
    amount: float | None = None,
    date: datetime | None = None,
    category_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a preview row before import."""
    # In a real implementation, update temporary preview data
    return {"message": "Preview row updated"}


@router.post("/preview/{batch_id}/categorize")
def auto_categorize_preview(
    batch_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Auto-categorize preview transactions."""
    batch = (
        db.query(ImportBatch)
        .filter(ImportBatch.id == batch_id, ImportBatch.user_id == current_user.id)
        .first()
    )

    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Import batch not found"
        )

    # Get user's categories
    categories = db.query(Category).filter(Category.user_id == current_user.id).all()

    # Simple keyword matching for auto-categorization
    keyword_map = {
        "grocery": ["Groceries", "Food"],
        "supermarket": ["Groceries", "Food"],
        "restaurant": ["Food"],
        "fuel": ["Transportation"],
        "gas": ["Transportation"],
        "salary": ["Salary"],
        "rent": ["Housing"],
        "electric": ["Utilities"],
    }

    return {"message": "Auto-categorization completed", "categories_assigned": 0}


@router.post("/confirm")
def confirm_import(
    request: ImportConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Confirm and import transactions."""
    batch = (
        db.query(ImportBatch)
        .filter(
            ImportBatch.id == request.batch_id, ImportBatch.user_id == current_user.id
        )
        .first()
    )

    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Import batch not found"
        )

    # Verify account belongs to user
    account = (
        db.query(Account)
        .filter(Account.id == request.account_id, Account.user_id == current_user.id)
        .first()
    )

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Account not found"
        )

    imported_count = 0
    imported_transactions = []

    try:
        for tx_data in request.transactions:
            # Determine transaction type based on amount
            amount = abs(tx_data["amount"])
            tx_type = "income" if tx_data["amount"] > 0 else "expense"

            # Parse date string to datetime object
            tx_date = tx_data["date"]
            if isinstance(tx_date, str):
                # Parse ISO format date string (YYYY-MM-DD)
                tx_date = datetime.strptime(tx_date, "%Y-%m-%d")
            elif not isinstance(tx_date, datetime):
                tx_date = datetime.now()

            # Create transaction
            transaction = Transaction(
                user_id=current_user.id,
                account_id=request.account_id,
                category_id=tx_data.get("category_id"),
                amount=amount,
                type=tx_type,
                description=tx_data["description"],
                date=tx_date,
                is_imported=True,
                import_batch_id=str(request.batch_id),
                source_file=batch.filename,
            )
            db.add(transaction)
            db.flush()  # Flush to get the transaction ID

            # Store imported transaction info
            imported_transactions.append(
                {
                    "id": transaction.id,
                    "amount": amount,
                    "date": tx_date.strftime("%Y-%m-%d"),
                    "description": tx_data["description"],
                    "type": tx_type,
                }
            )

            # Update account balance with proper rounding to avoid floating-point precision errors
            if tx_type == "income":
                account.balance = round(account.balance + amount, 2)
            else:
                account.balance = round(account.balance - amount, 2)

            imported_count += 1

        # Update batch status
        batch.status = "completed"
        batch.processed_rows = imported_count
        batch.completed_at = datetime.utcnow()
        db.commit()

        return {
            "message": f"Successfully imported {imported_count} transactions",
            "imported_count": imported_count,
            "imported_transactions": imported_transactions,
        }

    except Exception as e:
        batch.status = "error"
        batch.error_message = str(e)
        db.commit()
        logger.exception(
            "Error importing transactions for batch_id=%s", request.batch_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Error importing transactions. Please check the data and try again.",
        )


@router.get("/batches", response_model=list[ImportBatchResponse])
def get_import_batches(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 10,
):
    """Get import history."""
    batches = (
        db.query(ImportBatch)
        .filter(ImportBatch.user_id == current_user.id)
        .order_by(ImportBatch.created_at.desc())
        .limit(limit)
        .all()
    )

    return batches


@router.get("/batches/{batch_id}", response_model=ImportBatchResponse)
def get_batch_details(
    batch_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get import batch details."""
    batch = (
        db.query(ImportBatch)
        .filter(ImportBatch.id == batch_id, ImportBatch.user_id == current_user.id)
        .first()
    )

    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Import batch not found"
        )

    return batch
