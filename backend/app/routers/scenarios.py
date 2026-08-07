from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.services.market_data.errors import SymbolNotFound

from app.database import get_db
from app.models import User
from app.schemas.scenario import (
    BacktestResultSchema,
    ScenarioCreate,
    ScenarioDetail,
    ScenarioPatch,
    ScenarioResponse,
    ScenarioSpecIn,
    ScenarioSummary,
    TrackRecord,
)
from app.services import scenario_service
from app.services.backtest_service import ScenarioSymbolError, ScenarioValidationError
from app.services.market_data import MarketDataUnavailable
from app.services.scenario_service import ScenarioNotFoundError
from app.utils.rate_limit import SlidingWindowRateLimiter
from app.utils.security import get_current_user_authenticated

router = APIRouter(prefix="/scenarios", tags=["Scenarios"])

_preview_limiter = SlidingWindowRateLimiter(max_hits=30, window_seconds=5 * 60)


def _handle(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except ScenarioSymbolError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ScenarioNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found") from exc
    except ScenarioValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.message) from exc
    except MarketDataUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except SymbolNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown symbol: {exc.symbol}") from exc


@router.post("/preview", response_model=BacktestResultSchema)
def preview_scenario(
    data: ScenarioSpecIn,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    allowed, retry_after = _preview_limiter.check(f"user:{current_user.id}")
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many preview requests. Please wait before trying again.",
            headers={"Retry-After": str(retry_after)},
        )
    return _handle(scenario_service.run_preview, db, current_user, data)


@router.post("", response_model=ScenarioResponse, status_code=status.HTTP_201_CREATED)
def create_scenario(
    data: ScenarioCreate,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    return _handle(scenario_service.create_scenario, db, current_user, data)


@router.get("", response_model=List[ScenarioSummary])
def list_scenarios(
    kind: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    sort: str = Query("newest"),
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    return scenario_service.list_scenarios(
        db, current_user, kind=kind, status_=status_filter, sort=sort
    )


@router.get("/track-record", response_model=TrackRecord)
def track_record(
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    return scenario_service.get_track_record(db, current_user)


@router.get("/{scenario_id}", response_model=ScenarioDetail)
def get_scenario(
    scenario_id: int,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    row, result = _handle(scenario_service.get_scenario_detail, db, current_user, scenario_id)
    return ScenarioDetail(
        **ScenarioResponse.model_validate(row).model_dump(),
        result=result,
    )


@router.patch("/{scenario_id}", response_model=ScenarioResponse)
def patch_scenario(
    scenario_id: int,
    data: ScenarioPatch,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    return _handle(scenario_service.patch_scenario, db, current_user, scenario_id, data)


@router.delete("/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scenario(
    scenario_id: int,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    _handle(scenario_service.delete_scenario, db, current_user, scenario_id)
    return None


@router.post("/{scenario_id}/rebuild", response_model=ScenarioResponse)
def rebuild_scenario(
    scenario_id: int,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    return _handle(scenario_service.rebuild_scenario, db, current_user, scenario_id)
