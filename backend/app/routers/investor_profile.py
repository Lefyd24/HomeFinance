"""Investor Profile API

The risk tolerance, horizon and constraints the AI advisor reasons against, plus
the revision log — which matters here because the advisor can write to this
profile itself, and such a change must stay visible and reversible.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.models.investor_profile import (
    ALLOCATION_CLASSES,
    EXPERIENCE_LEVELS,
    INCOME_STABILITIES,
    PRIMARY_OBJECTIVES,
    RISK_TOLERANCES,
)
from app.schemas.investor_profile import (
    InvestorProfileOptions,
    InvestorProfileResponse,
    InvestorProfileRevisionResponse,
    InvestorProfileUpdate,
)
from app.services import investor_profile_service
from app.utils.security import get_current_user_authenticated as get_current_user

router = APIRouter(prefix="/investor-profile", tags=["Investor Profile"])


@router.get("", response_model=InvestorProfileResponse)
def read_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = investor_profile_service.get_profile(db, current_user.id)
    return investor_profile_service.to_dict(profile)


@router.put("", response_model=InvestorProfileResponse)
def update_profile(
    body: InvestorProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Apply a partial update. Fields omitted from the request are left alone;
    send an explicit `null` to clear one."""
    updates = body.model_dump(exclude_unset=True)
    try:
        result = investor_profile_service.apply_updates(
            db, current_user.id, updates, source="user"
        )
    except investor_profile_service.ProfileValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    return result["profile"]


@router.get("/options", response_model=InvestorProfileOptions)
def read_options(current_user: User = Depends(get_current_user)):
    return InvestorProfileOptions(
        risk_tolerances=list(RISK_TOLERANCES),
        primary_objectives=list(PRIMARY_OBJECTIVES),
        income_stabilities=list(INCOME_STABILITIES),
        experience_levels=list(EXPERIENCE_LEVELS),
        allocation_classes=list(ALLOCATION_CLASSES),
        editable_fields=list(investor_profile_service.EDITABLE_FIELDS),
    )


@router.get("/revisions", response_model=List[InvestorProfileRevisionResponse])
def read_revisions(
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return investor_profile_service.list_revisions(db, current_user.id, limit=limit)


@router.post("/revisions/{revision_id}/undo", response_model=InvestorProfileResponse)
def undo_revision(
    revision_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Restore the field this revision changed to its previous value."""
    try:
        result = investor_profile_service.undo_revision(db, current_user.id, revision_id)
    except investor_profile_service.ProfileValidationError as exc:
        message = str(exc)
        code = (
            status.HTTP_404_NOT_FOUND
            if message == "Revision not found"
            else status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(status_code=code, detail=message)
    return result["profile"]
