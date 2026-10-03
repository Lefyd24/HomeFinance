"""
Documents Router

Local file storage for user documents (bank agreements, insurance, bills, receipts, etc.).
Files are stored on disk; metadata is persisted in a per-user JSON index file.
No database tables are used.

Index format (v2):
{
    "version": 2,
    "documents": [...],
    "folders": ["Banking", "Insurance", ...]
}
"""

import json
import mimetypes
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.utils.security import get_current_user_authenticated as get_current_user, user_from_access_token

router = APIRouter(prefix="/documents", tags=["Documents"])

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/csv",
    "application/zip",
}

# Uploaded files are user-controlled content served from the app's own origin.
# An SVG (or anything sniffed as HTML) opened via /preview would otherwise run
# its scripts with access to the logged-in session. The sandbox CSP makes the
# browser treat the response as an opaque origin with scripts disabled. PDFs
# are exempt: Chrome refuses to render a PDF in a sandboxed document, and the
# preview sheet shows them in an iframe.
def _untrusted_file_headers(mime_type: str) -> dict[str, str]:
    headers = {"X-Content-Type-Options": "nosniff"}
    if mime_type != "application/pdf":
        headers["Content-Security-Policy"] = (
            "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'"
        )
    return headers


ALLOWED_EXTENSIONS = {
    ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg",
    ".doc", ".docx", ".xls", ".xlsx", ".txt", ".csv", ".zip",
}


def get_user_for_file(
    request: Request,
    token: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> User:
    """Auth for preview/download: accepts Bearer header OR ?token= query param."""
    raw = token
    if not raw:
        auth = request.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            raw = auth[7:]
    if not raw:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = user_from_access_token(raw, db)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user


def _safe_name(name: str) -> str:
    name = re.sub(r"[^\w\s\-.()\[\]@#,]", "", name, flags=re.UNICODE)
    return name.strip()[:120] or "Untitled"


def _user_dir(user_id: int) -> Path:
    base = Path(settings.DOCUMENTS_DIR) / str(user_id)
    base.mkdir(parents=True, exist_ok=True)
    return base


def _index_path(user_id: int) -> Path:
    return _user_dir(user_id) / "_index.json"


def _load_index(user_id: int) -> dict[str, Any]:
    """Load index; upgrades legacy plain-array format to v2 dict format."""
    p = _index_path(user_id)
    if not p.exists():
        return {"version": 2, "documents": [], "folders": []}
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(raw, list):
            # Legacy v1: plain array of documents
            return {"version": 2, "documents": raw, "folders": []}
        if isinstance(raw, dict):
            raw.setdefault("version", 2)
            raw.setdefault("documents", [])
            raw.setdefault("folders", [])
            return raw
    except (json.JSONDecodeError, OSError):
        pass
    return {"version": 2, "documents": [], "folders": []}


def _save_index(user_id: int, index: dict[str, Any]) -> None:
    _index_path(user_id).write_text(
        json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _get_doc(documents: list[dict], doc_id: str) -> dict | None:
    return next((d for d in documents if d["id"] == doc_id), None)


def _ensure_folder(index: dict[str, Any], folder_name: str) -> None:
    """Add folder to the folders list if it isn't already present."""
    if folder_name and folder_name not in index["folders"]:
        index["folders"].append(folder_name)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/folders")
def list_folders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    index = _load_index(current_user.id)
    docs = index["documents"]
    folders = index["folders"]

    # Also include any folder names found in documents but not in the folders list
    doc_folders = {d["folder"] for d in docs if d.get("folder")}
    all_folder_names = sorted(set(folders) | doc_folders)

    counts = {}
    for d in docs:
        f = d.get("folder", "")
        if f:
            counts[f] = counts.get(f, 0) + 1

    return {
        "folders": [{"name": f, "count": counts.get(f, 0)} for f in all_folder_names],
        "total": len(docs),
    }


@router.post("/folders")
def create_folder(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    name = _safe_name(body.get("name", ""))
    if not name:
        raise HTTPException(status_code=400, detail="Folder name is required")

    index = _load_index(current_user.id)
    existing = [f.lower() for f in index["folders"]]
    if name.lower() in existing:
        raise HTTPException(status_code=409, detail="Folder already exists")

    index["folders"].append(name)
    _save_index(current_user.id, index)
    return {"name": name}


@router.delete("/folders/{folder_name}")
def delete_folder(
    folder_name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    index = _load_index(current_user.id)
    # Move documents in this folder to root
    for doc in index["documents"]:
        if doc.get("folder", "").lower() == folder_name.lower():
            doc["folder"] = ""
    # Remove from folders list
    index["folders"] = [f for f in index["folders"] if f.lower() != folder_name.lower()]
    _save_index(current_user.id, index)
    return {"detail": "Folder deleted; documents moved to root"}


@router.post("/upload", status_code=status.HTTP_201_CREATED)
def upload_document(
    file: UploadFile = File(...),
    title: str = Form(...),
    description: str = Form(""),
    folder: str = Form(""),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    content = file.file.read()
    if len(content) > settings.DOCUMENTS_MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the {settings.DOCUMENTS_MAX_FILE_SIZE // (1024*1024)} MB limit",
        )

    original_name = file.filename or "upload"
    suffix = Path(original_name).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail=f"File type '{suffix}' is not allowed")

    mime = file.content_type or mimetypes.guess_type(original_name)[0] or ""
    if mime not in ALLOWED_MIME_TYPES and mime != "application/octet-stream":
        raise HTTPException(status_code=415, detail=f"MIME type '{mime}' is not allowed")
    if mime == "application/octet-stream":
        guessed, _ = mimetypes.guess_type(original_name)
        mime = guessed or mime

    doc_id = str(uuid.uuid4())
    stored_name = f"{doc_id}{suffix}"
    dest = _user_dir(current_user.id) / stored_name
    dest.write_bytes(content)

    folder_clean = _safe_name(folder)
    entry: dict[str, Any] = {
        "id": doc_id,
        "title": _safe_name(title) or Path(original_name).stem,
        "description": description[:500],
        "filename": original_name,
        "stored_name": stored_name,
        "folder": folder_clean,
        "size": len(content),
        "mime_type": mime,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }

    index = _load_index(current_user.id)
    index["documents"].append(entry)
    if folder_clean:
        _ensure_folder(index, folder_clean)
    _save_index(current_user.id, index)
    return entry


@router.get("")
def list_documents(
    folder: str | None = None,
    search: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    index = _load_index(current_user.id)
    docs = index["documents"]

    if folder is not None:
        docs = [d for d in docs if d.get("folder", "").lower() == folder.lower()]

    if search:
        q = search.lower()
        docs = [
            d for d in docs
            if q in d.get("title", "").lower()
            or q in d.get("description", "").lower()
            or q in d.get("filename", "").lower()
            or q in d.get("folder", "").lower()
        ]

    return sorted(docs, key=lambda d: d.get("uploaded_at", ""), reverse=True)


@router.get("/{doc_id}/preview")
def preview_document(
    doc_id: str,
    current_user: User = Depends(get_user_for_file),
):
    index = _load_index(current_user.id)
    doc = _get_doc(index["documents"], doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = _user_dir(current_user.id) / doc["stored_name"]
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        path=str(file_path),
        media_type=doc.get("mime_type", "application/octet-stream"),
        filename=doc["filename"],
        content_disposition_type="inline",
        headers=_untrusted_file_headers(doc.get("mime_type", "")),
    )


@router.get("/{doc_id}/download")
def download_document(
    doc_id: str,
    current_user: User = Depends(get_user_for_file),
):
    index = _load_index(current_user.id)
    doc = _get_doc(index["documents"], doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = _user_dir(current_user.id) / doc["stored_name"]
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        path=str(file_path),
        media_type=doc.get("mime_type", "application/octet-stream"),
        filename=doc["filename"],
        headers=_untrusted_file_headers(doc.get("mime_type", "")),
    )


@router.put("/{doc_id}")
def update_document(
    doc_id: str,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    index = _load_index(current_user.id)
    doc = _get_doc(index["documents"], doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if "title" in body:
        doc["title"] = _safe_name(body["title"]) or doc["title"]
    if "description" in body:
        doc["description"] = str(body["description"])[:500]
    if "folder" in body:
        folder_clean = _safe_name(body["folder"])
        doc["folder"] = folder_clean
        if folder_clean:
            _ensure_folder(index, folder_clean)

    _save_index(current_user.id, index)
    return doc


@router.delete("/{doc_id}")
def delete_document(
    doc_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    index = _load_index(current_user.id)
    doc = _get_doc(index["documents"], doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = _user_dir(current_user.id) / doc["stored_name"]
    if file_path.exists():
        file_path.unlink()

    index["documents"] = [d for d in index["documents"] if d["id"] != doc_id]
    _save_index(current_user.id, index)
    return {"detail": "Document deleted"}
