from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import (
    Account,
    InvestmentCredential,
    InvestmentTransaction,
    PortfolioPosition,
    PortfolioSnapshot,
    User,
)
from app.schemas import (
    CompanyProfileResponse,
    InvestmentAccountCreate,
    InvestmentAccountResponse,
    InvestmentCredentialUpdate,
    InvestmentSyncResult,
    InvestmentTransactionResponse,
    NewsItemResponse,
    NewsPageResponse,
    PortfolioPositionResponse,
    PortfolioSnapshotResponse,
    SymbolSearchResult,
)
from app.services.investment_sync_service import (
    create_credential,
    get_provider_for_account,
    sync_account,
)
from app.services.investment_providers.yahoo import yahoo_market_data
from app.utils.crypto import encrypt
from app.utils.security import get_current_user_authenticated

router = APIRouter(prefix="/investments", tags=["Investments"])

MARKET_DATA_PROVIDERS = ("yahoo", "freedom24", "binance")
DEFAULT_MARKET_DATA_PROVIDER = "yahoo"


def _base_market_value(position: PortfolioPosition) -> float:
    """A position's market value in the account's currency.

    Falls back to the native value for rows written before the base-currency
    columns existed, and for single-currency accounts where they are equal.
    """
    return (
        position.market_value_base
        if position.market_value_base is not None
        else position.market_value
    )


def _base_cost_basis(position: PortfolioPosition) -> Optional[float]:
    if position.cost_basis_base is not None:
        return position.cost_basis_base
    if position.cost_basis is not None:
        return position.cost_basis
    if position.avg_price is not None:
        return position.avg_price * position.quantity
    return None


def _to_response(db: Session, account: Account) -> InvestmentAccountResponse:
    """Account row plus the portfolio aggregates the UI leads with.

    Everything is summed from the base-currency columns, so an account holding
    EUR and USD instruments reports one coherent total rather than adding
    unlike currencies together.
    """
    credential = account.investment_credential
    positions = (
        db.query(PortfolioPosition).filter(PortfolioPosition.account_id == account.id).all()
    )

    total_market_value = sum(_base_market_value(p) for p in positions)
    total_cost_basis = sum(_base_cost_basis(p) or 0.0 for p in positions)
    total_unrealized_pnl = total_market_value - total_cost_basis
    total_return_pct = (
        round(total_unrealized_pnl / total_cost_basis * 100, 2) if total_cost_basis else None
    )

    # Day change is the sum of each position's own move, weighted by size —
    # a plain average of the percentages would let a tiny holding outvote the
    # rest of the portfolio.
    day_change = 0.0
    day_change_covered = 0.0
    for position in positions:
        if position.day_change_pct is None:
            continue
        value = _base_market_value(position)
        previous = value / (1 + position.day_change_pct / 100) if position.day_change_pct != -100 else 0.0
        day_change += value - previous
        day_change_covered += previous
    has_day_change = day_change_covered > 0

    # The latest snapshot is written on every sync, so it carries the current
    # cash/invested split without a second broker call.
    snapshot = (
        db.query(PortfolioSnapshot)
        .filter(PortfolioSnapshot.account_id == account.id)
        .order_by(PortfolioSnapshot.date.desc())
        .first()
    )

    return InvestmentAccountResponse(
        id=account.id,
        user_id=account.user_id,
        name=account.name,
        provider=account.provider,
        currency=account.currency,
        balance=round(account.balance, 2),
        icon=account.icon,
        is_active=account.is_active,
        last_synced_at=account.last_synced_at,
        sync_status=credential.sync_status if credential else "pending",
        sync_error=credential.sync_error if credential else None,
        total_cost_basis=round(total_cost_basis, 2),
        total_market_value=round(total_market_value, 2),
        total_return_pct=total_return_pct,
        total_unrealized_pnl=round(total_unrealized_pnl, 2),
        cash_balance=round(snapshot.cash_balance or 0, 2) if snapshot else 0,
        positions_value=round(
            snapshot.positions_value if snapshot and snapshot.positions_value else total_market_value,
            2,
        ),
        day_change=round(day_change, 2) if has_day_change else None,
        day_change_pct=(
            round(day_change / day_change_covered * 100, 2) if has_day_change else None
        ),
        position_count=len(positions),
        created_at=account.created_at,
        updated_at=account.updated_at,
    )


def _position_response(
    position: PortfolioPosition, portfolio_value: float = 0.0
) -> PortfolioPositionResponse:
    cost_basis = position.cost_basis
    if cost_basis is None and position.avg_price is not None:
        cost_basis = position.avg_price * position.quantity
    unrealized_pnl = position.market_value - cost_basis if cost_basis is not None else None
    unrealized_return_pct = round(unrealized_pnl / cost_basis * 100, 2) if cost_basis else None

    market_value_base = _base_market_value(position)
    cost_basis_base = _base_cost_basis(position)
    unrealized_pnl_base = (
        market_value_base - cost_basis_base if cost_basis_base is not None else None
    )

    return PortfolioPositionResponse(
        id=position.id,
        account_id=position.account_id,
        symbol=position.symbol,
        name=position.name,
        quantity=position.quantity,
        avg_price=position.avg_price,
        current_price=position.current_price,
        market_value=position.market_value,
        currency=position.currency,
        synced_at=position.synced_at,
        cost_basis=round(cost_basis, 2) if cost_basis is not None else None,
        unrealized_pnl=round(unrealized_pnl, 2) if unrealized_pnl is not None else None,
        unrealized_return_pct=unrealized_return_pct,
        market_value_base=round(market_value_base, 2),
        cost_basis_base=round(cost_basis_base, 2) if cost_basis_base is not None else None,
        unrealized_pnl_base=(
            round(unrealized_pnl_base, 2) if unrealized_pnl_base is not None else None
        ),
        fx_rate=position.fx_rate if position.fx_rate is not None else 1.0,
        day_change=position.day_change,
        day_change_pct=position.day_change_pct,
        exchange=position.exchange,
        weight_pct=(
            round(market_value_base / portfolio_value * 100, 2) if portfolio_value else None
        ),
    )


def _get_investment_account(db: Session, account_id: int, user: User) -> Account:
    account = (
        db.query(Account)
        .filter(
            Account.id == account_id,
            Account.user_id == user.id,
            Account.provider.isnot(None),
        )
        .first()
    )
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investment account not found")
    return account


@router.get("/accounts", response_model=List[InvestmentAccountResponse])
def list_investment_accounts(
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    accounts = (
        db.query(Account)
        .filter(Account.user_id == current_user.id, Account.provider.isnot(None))
        .all()
    )
    return [_to_response(db, a) for a in accounts]


@router.post("/accounts", response_model=InvestmentAccountResponse, status_code=status.HTTP_201_CREATED)
def create_investment_account(
    data: InvestmentAccountCreate,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    account = Account(
        user_id=current_user.id,
        name=data.name,
        type="investment",
        currency=data.currency,
        balance=0,
        description=data.description,
        icon=data.icon,
        provider=data.provider,
    )
    db.add(account)
    db.commit()
    db.refresh(account)

    create_credential(db, account.id, data.provider, data.public_key, data.private_key)
    db.refresh(account)

    # Sync immediately so a bad key pair fails visibly at connect-time, rather
    # than waiting for the next scheduled tick.
    sync_account(db, account)
    db.refresh(account)

    return _to_response(db, account)


class InvestmentAccountUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    icon: Optional[str] = None


@router.put("/accounts/{account_id}", response_model=InvestmentAccountResponse)
def update_investment_account(
    account_id: int,
    data: InvestmentAccountUpdate,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    """Edit name/icon/description — balance/type/currency come from the sync only."""
    account = _get_investment_account(db, account_id, current_user)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(account, field, value)
    db.commit()
    db.refresh(account)
    return _to_response(db, account)


@router.get("/accounts/{account_id}/positions", response_model=List[PortfolioPositionResponse])
def get_investment_positions(
    account_id: int,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    account = _get_investment_account(db, account_id, current_user)
    positions = (
        db.query(PortfolioPosition)
        .filter(PortfolioPosition.account_id == account.id)
        .order_by(PortfolioPosition.market_value.desc())
        .all()
    )
    # Ordered by base-currency value so the largest holding is genuinely first
    # even when positions are priced in different currencies.
    portfolio_value = sum(_base_market_value(p) for p in positions)
    positions.sort(key=_base_market_value, reverse=True)
    return [_position_response(p, portfolio_value) for p in positions]


@router.get("/accounts/{account_id}/transactions", response_model=List[InvestmentTransactionResponse])
def get_investment_transactions(
    account_id: int,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
):
    account = _get_investment_account(db, account_id, current_user)
    transactions = (
        db.query(InvestmentTransaction)
        .filter(InvestmentTransaction.account_id == account.id)
        .order_by(InvestmentTransaction.date.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return transactions


@router.get("/accounts/{account_id}/history", response_model=List[PortfolioSnapshotResponse])
def get_investment_history(
    account_id: int,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
):
    account = _get_investment_account(db, account_id, current_user)
    query = db.query(PortfolioSnapshot).filter(PortfolioSnapshot.account_id == account.id)
    if start_date:
        query = query.filter(PortfolioSnapshot.date >= start_date)
    if end_date:
        query = query.filter(PortfolioSnapshot.date <= end_date)
    return query.order_by(PortfolioSnapshot.date.asc()).all()


def _resolve_market_data_account(
    db: Session, user: User, account_id: Optional[int]
) -> Account:
    """The account whose broker connection serves market data.

    Ticker search and news are properties of the market, not of one portfolio,
    but Freedom24 still needs somebody's API keys. An explicit `account_id` wins;
    otherwise any of the user's connected accounts will do, preferring one whose
    last sync succeeded so a broken key pair isn't picked over a working one.
    """
    if account_id is not None:
        return _get_investment_account(db, account_id, user)

    accounts = (
        db.query(Account)
        .filter(Account.user_id == user.id, Account.provider.isnot(None))
        .all()
    )
    usable = [a for a in accounts if a.investment_credential is not None]
    if not usable:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Connect an investment account to use broker market data.",
        )
    usable.sort(key=lambda a: a.investment_credential.sync_status != "ok")
    return usable[0]


def _normalize_market_provider(provider: Optional[str]) -> str:
    name = (provider or DEFAULT_MARKET_DATA_PROVIDER).strip().lower()
    if name not in MARKET_DATA_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported market-data provider: {provider}",
        )
    return name


def _provider_for_market_data(
    db: Session,
    user: User,
    account_id: Optional[int],
    provider: Optional[str] = None,
):
    """Resolve the market-data backend.

    Yahoo Finance needs no broker account. Freedom24 (and future brokers) still
    proxy through a connected investment account's credentials.
    """
    name = _normalize_market_provider(provider)
    if name == "yahoo":
        return yahoo_market_data

    account = _resolve_market_data_account(db, user, account_id)
    try:
        return get_provider_for_account(account)
    except NotImplementedError as exc:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=str(exc))
    except Exception as exc:  # noqa: BLE001 - surface the broker's own error message
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


def _news_response(item) -> NewsItemResponse:
    return NewsItemResponse(
        story_id=item.story_id,
        title=item.title,
        summary=item.summary,
        url=item.url,
        source=item.source,
        published_at=item.published_at,
        sentiment=item.sentiment,
        image_url=item.image_url,
        symbols=item.symbols,
        body_html=item.body_html,
    )


@router.get("/search", response_model=List[SymbolSearchResult])
def search_symbols(
    q: str = Query(..., min_length=1, max_length=50),
    provider: str = Query(DEFAULT_MARKET_DATA_PROVIDER),
    account_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    """Ticker/instrument search via the selected market-data provider."""
    backend = _provider_for_market_data(db, current_user, account_id, provider)
    try:
        results = backend.search_symbols(q)
    except NotImplementedError as exc:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=str(exc))
    except Exception as exc:  # noqa: BLE001 - surface the provider's own error message
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    return [
        SymbolSearchResult(
            symbol=r.symbol,
            name=r.name,
            exchange=r.exchange,
            instrument_type=r.instrument_type,
            currency=r.currency,
            isin=r.isin,
            last_price=r.last_price,
            day_change_pct=r.day_change_pct,
        )
        for r in results
    ]


@router.get("/news", response_model=NewsPageResponse)
def get_news(
    q: str = Query("", max_length=100),
    symbol: Optional[str] = Query(None, max_length=50),
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    language: Optional[str] = Query(None, max_length=5),
    provider: str = Query(DEFAULT_MARKET_DATA_PROVIDER),
    account_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    """A page of market news, optionally scoped to one symbol or search term."""
    backend = _provider_for_market_data(db, current_user, account_id, provider)
    try:
        page = backend.get_news(
            query=q, symbol=symbol, limit=limit, offset=offset, language=language
        )
    except NotImplementedError as exc:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=str(exc))
    except Exception as exc:  # noqa: BLE001 - surface the provider's own error message
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    return NewsPageResponse(
        items=[_news_response(item) for item in page.items],
        total=page.total,
        limit=limit,
        offset=offset,
    )


@router.get("/news/{story_id}", response_model=NewsItemResponse)
def get_news_story(
    story_id: str,
    provider: str = Query(DEFAULT_MARKET_DATA_PROVIDER),
    account_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    """One story including its article body."""
    backend = _provider_for_market_data(db, current_user, account_id, provider)
    try:
        return _news_response(backend.get_news_story(story_id))
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except NotImplementedError as exc:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=str(exc))
    except Exception as exc:  # noqa: BLE001 - surface the provider's own error message
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


@router.get("/company/{symbol}", response_model=CompanyProfileResponse)
def get_company_profile(
    symbol: str,
    provider: str = Query(DEFAULT_MARKET_DATA_PROVIDER),
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    """Company / instrument research profile (Yahoo Finance)."""
    name = _normalize_market_provider(provider)
    if name != "yahoo":
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Company research is only available via Yahoo Finance.",
        )
    # Auth still required; db/user kept for consistent dependency wiring.
    _ = (current_user, db)
    try:
        return CompanyProfileResponse(**yahoo_market_data.get_company_profile(symbol))
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception as exc:  # noqa: BLE001 - surface Yahoo's own error message
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


@router.post("/accounts/{account_id}/sync", response_model=InvestmentSyncResult)
def sync_investment_account(
    account_id: int,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    account = _get_investment_account(db, account_id, current_user)

    cooldown = timedelta(seconds=settings.INVESTMENT_MANUAL_SYNC_COOLDOWN_SECONDS)
    if account.last_synced_at and datetime.utcnow() - account.last_synced_at < cooldown:
        retry_after = cooldown - (datetime.utcnow() - account.last_synced_at)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Please wait {int(retry_after.total_seconds())}s before syncing again.",
        )

    credential = sync_account(db, account)
    db.refresh(account)
    return InvestmentSyncResult(
        account_id=account.id,
        sync_status=credential.sync_status,
        sync_error=credential.sync_error,
        balance=round(account.balance, 2),
        last_synced_at=account.last_synced_at,
    )


@router.put("/accounts/{account_id}/credentials", response_model=InvestmentAccountResponse)
def update_investment_credentials(
    account_id: int,
    data: InvestmentCredentialUpdate,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    account = _get_investment_account(db, account_id, current_user)
    credential = account.investment_credential
    if credential is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No credentials on file")

    credential.encrypted_public_key = encrypt(data.public_key)
    credential.encrypted_private_key = encrypt(data.private_key)
    credential.sync_status = "pending"
    credential.sync_error = None
    db.commit()

    sync_account(db, account)
    db.refresh(account)
    return _to_response(db, account)
