from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Account, InvestmentProviderSettings, User
from app.schemas.investment_performance import (
    PerformanceResponse,
    ProviderSettingsResponse,
    ProviderSettingsUpdate,
)
from app.services import performance_service
from app.utils.security import get_current_user_authenticated

router = APIRouter(prefix="/investments", tags=["Investment performance"])

PROVIDERS = ("freedom24", "binance")


@router.get("/performance", response_model=PerformanceResponse)
def get_performance(
    account_ids: Optional[str] = Query(None, description="Comma-separated account ids; default all"),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    benchmark: str = Query(performance_service.DEFAULT_BENCHMARK, pattern=r"^[\^A-Za-z0-9.=\-]{1,20}$"),
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    query = db.query(Account).filter(Account.user_id == current_user.id, Account.provider.isnot(None))
    if account_ids:
        try:
            ids = {int(x) for x in account_ids.split(",") if x.strip()}
        except ValueError:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="account_ids must be integers")
        accounts = query.filter(Account.id.in_(ids)).all()
        if len(accounts) != len(ids):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investment account not found")
    else:
        accounts = query.all()
    if len({a.currency for a in accounts}) > 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Selected accounts use different currencies; pick accounts that share one currency",
        )
    return performance_service.compute_performance(db, accounts, start_date, end_date, benchmark)


@router.get("/provider-settings", response_model=List[ProviderSettingsResponse])
def list_provider_settings(
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    return db.query(InvestmentProviderSettings).filter(InvestmentProviderSettings.user_id == current_user.id).all()


@router.put("/provider-settings/{provider}", response_model=ProviderSettingsResponse)
def upsert_provider_settings(
    provider: str,
    payload: ProviderSettingsUpdate,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    if provider not in PROVIDERS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unknown provider")
    row = (
        db.query(InvestmentProviderSettings)
        .filter(InvestmentProviderSettings.user_id == current_user.id, InvestmentProviderSettings.provider == provider)
        .first()
    )
    if row is None:
        row = InvestmentProviderSettings(user_id=current_user.id, provider=provider)
        db.add(row)
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row
