"""AI usage/cost summary for the current user and household."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas.ai_usage import AiUsageOut
from app.services import ai_usage_service
from app.utils.security import get_current_user_authenticated as get_current_user

router = APIRouter(prefix="/ai", tags=["AI Usage"])


@router.get("/usage", response_model=AiUsageOut)
def get_ai_usage(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return ai_usage_service.usage_summary(db, current_user.id)
