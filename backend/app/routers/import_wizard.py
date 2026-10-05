import logging
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Account, Category, ImportBatch, Transaction, User
from app.schemas import (
    ImportBatchResponse,
    ImportConfirmRequest,
    ImportPreviewResponse,
)
from app.services import import_service, rule_service
from app.utils import linked_accounts
from app.utils.file_parsers import DATE_ORDERS, parse_bank_file
from app.utils.security import get_current_user

logger = logging.getLogger("app")

router = APIRouter(prefix="/import", tags=["Import"])


@router.post("/upload")
def upload_file(
    file: UploadFile | None = File(None),
    date_format: str = Form(...),
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

    if date_format not in DATE_ORDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose a date format: day first, month first or year first.",
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

    content = file.file.read(settings.MAX_UPLOAD_SIZE + 1)
    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"The file is larger than {settings.MAX_UPLOAD_SIZE // (1024 * 1024)} MB.",
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
        logger.debug("File size: %d bytes", len(content))

        # Parse file
        result = parse_bank_file(content, file_type, date_format)

        logger.info("Parsed %d transactions from %s", len(result.transactions), file.filename)

        batch.total_rows = len(result.transactions)
        batch.status = "pending"
        batch.parsed_data = [
            {
                "line": tx["line"],
                "date": tx["date"].isoformat(),
                "description": tx["description"],
                "amount": tx["amount"],
            }
            for tx in result.transactions
        ]
        db.commit()

        return {
            "batch_id": batch.id,
            "filename": batch.filename,
            "total_rows": batch.total_rows,
            "skipped": [
                {"line": s.line, "reason": s.reason, "value": s.value} for s in result.skipped
            ],
            "message": "File uploaded. Review the rows before importing.",
        }

    except ValueError as ve:
        # Validation errors from the parser (bad format, empty file, etc.) are
        # safe and useful to show the user as-is.
        batch.status = "error"
        batch.error_message = str(ve)
        db.commit()
        logger.info("Validation error parsing file %s: %s", file.filename, ve)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception:
        batch.status = "error"
        batch.error_message = "Unexpected error while parsing"
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
    account_id: int | None = None,
    invert_signs: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Parsed rows with suggested categories, flagged against `account_id` for duplicates."""
    batch = (
        db.query(ImportBatch)
        .filter(ImportBatch.id == batch_id, ImportBatch.user_id == current_user.id)
        .first()
    )
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Import batch not found")

    rows = import_service.batch_rows(batch.parsed_data, invert_signs)

    duplicate_ids: set[int] = set()
    if account_id is not None:
        account = (
            db.query(Account)
            .filter(Account.id == account_id, Account.user_id == current_user.id)
            .first()
        )
        if not account:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
        duplicate_ids = import_service.find_duplicate_row_ids(db, current_user.id, account_id, rows)

    rules = rule_service.load_rules(db, current_user.id)
    transactions = []
    for row in rows:
        suggested = rule_service.categorise(
            db,
            current_user.id,
            {
                "description": row["description"],
                "amount": row["abs_amount"],
                "type": row["type"],
                "account_id": account_id,
                "category_id": None,
            },
            rules=rules,
            record_stats=False,
        )
        transactions.append(
            {
                "id": row["row_id"],
                "line": row["line"],
                "date": row["date"].isoformat(),
                "description": row["description"],
                "amount": row["amount"],
                "type": row["type"],
                "category_id": suggested,
                "is_duplicate": row["row_id"] in duplicate_ids,
            }
        )

    return ImportPreviewResponse(
        transactions=transactions,
        duplicates=[t for t in transactions if t["is_duplicate"]],
        total=len(transactions),
    )


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

    rules = rule_service.load_rules(db, current_user.id)
    assigned = 0
    suggestions: list[dict] = []
    parsed = batch.parsed_data or []
    for i, tx in enumerate(parsed):
        amount = abs(float(tx.get("amount") or 0))
        tx_type = "income" if float(tx.get("amount") or 0) > 0 else "expense"
        category_id = rule_service.categorise(
            db,
            current_user.id,
            {
                "description": tx.get("description") or "",
                "amount": amount,
                "type": tx_type,
                "account_id": None,
                "category_id": None,
            },
            rules=rules,
            record_stats=False,
        )
        if category_id is not None:
            assigned += 1
            suggestions.append({"row": i + 1, "category_id": category_id})

    return {
        "message": "Auto-categorization completed",
        "categories_assigned": assigned,
        "suggestions": suggestions,
    }


@router.post("/confirm")
def confirm_import(
    request: ImportConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Import the selected rows of a pending batch into an account, once."""
    batch = (
        db.query(ImportBatch)
        .filter(ImportBatch.id == request.batch_id, ImportBatch.user_id == current_user.id)
        .first()
    )
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Import batch not found")

    account = (
        db.query(Account)
        .filter(Account.id == request.account_id, Account.user_id == current_user.id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    # A CSV import into a bank-linked account would double every row against
    # what the sync already pulled: file rows carry no external_id, so the dedup
    # index cannot see them as duplicates.
    linked_accounts.reject_if_linked(account, action="imported into")

    rows_by_id = {r["row_id"]: r for r in import_service.batch_rows(batch.parsed_data, request.invert_signs)}
    selected: dict[int, int | None] = {}
    for choice in request.rows:
        if choice.row_id not in rows_by_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Row {choice.row_id} is not part of this upload.",
            )
        selected[choice.row_id] = choice.category_id

    category_ids = {c for c in selected.values() if c is not None}
    if category_ids:
        owned = {
            cid
            for (cid,) in db.query(Category.id).filter(
                Category.id.in_(category_ids), Category.user_id == current_user.id
            )
        }
        if owned != category_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown category.")

    # Claim the batch atomically. A double-click or retry races here: SQLite
    # serialises the two UPDATEs, and the loser matches zero rows.
    claimed = (
        db.query(ImportBatch)
        .filter(ImportBatch.id == batch.id, ImportBatch.status == "pending")
        .update({"status": "importing"}, synchronize_session=False)
    )
    if not claimed:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This file has already been imported."
            if batch.status == "completed"
            else "This upload can no longer be imported. Upload the file again.",
        )

    try:
        for row_id, category_id in selected.items():
            row = rows_by_id[row_id]
            db.add(
                Transaction(
                    user_id=current_user.id,
                    account_id=account.id,
                    category_id=category_id,
                    amount=row["abs_amount"],
                    type=row["type"],
                    description=row["description"],
                    date=row["date"],
                    is_imported=True,
                    import_batch_id=str(batch.id),
                    source_file=batch.filename,
                )
            )
            account.balance = round(account.balance + row["amount"], 2)

        batch.status = "completed"
        batch.processed_rows = len(selected)
        batch.completed_at = datetime.utcnow()
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Error importing transactions for batch_id=%s", batch.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The import failed and nothing was saved. Please try again.",
        )

    return {
        "message": f"Imported {len(selected)} transactions",
        "imported_count": len(selected),
    }


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
