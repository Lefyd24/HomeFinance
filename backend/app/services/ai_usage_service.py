"""Record and summarise AI chat usage/cost. Timestamps are naive UTC."""
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models.ai_usage import AiUsage


def _utc_now(now: datetime | None) -> datetime:
    if now is None:
        return datetime.utcnow()
    if now.tzinfo is not None:
        return now.astimezone(timezone.utc).replace(tzinfo=None)
    return now


def _month_bounds(now: datetime | None) -> tuple[datetime, datetime]:
    n = _utc_now(now)
    start = datetime(n.year, n.month, 1)
    end = datetime(n.year + 1, 1, 1) if n.month == 12 else datetime(n.year, n.month + 1, 1)
    return start, end


def record_usage(db: Session, user_id: int, model: str, usage: dict) -> None:
    usage = usage or {}
    db.add(
        AiUsage(
            user_id=user_id,
            model=model,
            prompt_tokens=int(usage.get("prompt_tokens") or 0),
            completion_tokens=int(usage.get("completion_tokens") or 0),
            cached_tokens=int(usage.get("cached_tokens") or 0),
            cost_usd=float(usage.get("cost_usd") or 0.0),
            cost_estimated=bool(usage.get("cost_estimated") or False),
            duration_ms=int(usage.get("duration_ms") or 0),
        )
    )
    db.commit()


def household_month_spend(db: Session, now: datetime | None = None) -> float:
    start, end = _month_bounds(now)
    total = (
        db.query(func.coalesce(func.sum(AiUsage.cost_usd), 0.0))
        .filter(AiUsage.created_at >= start, AiUsage.created_at < end)
        .scalar()
    )
    return float(total or 0.0)


def usage_summary(db: Session, user_id: int, now: datetime | None = None) -> dict:
    start, end = _month_bounds(now)
    rows = (
        db.query(
            AiUsage.model,
            func.count(AiUsage.id),
            func.coalesce(func.sum(AiUsage.cost_usd), 0.0),
            func.coalesce(func.sum(AiUsage.prompt_tokens), 0),
            func.coalesce(func.sum(AiUsage.completion_tokens), 0),
        )
        .filter(
            AiUsage.user_id == user_id,
            AiUsage.created_at >= start,
            AiUsage.created_at < end,
        )
        .group_by(AiUsage.model)
        .all()
    )
    by_model = sorted(
        (
            {
                "model": m,
                "turns": int(t),
                "cost_usd": float(c),
                "prompt_tokens": int(p),
                "completion_tokens": int(o),
            }
            for m, t, c, p, o in rows
        ),
        key=lambda r: (-r["cost_usd"], r["model"]),
    )
    return {
        "month": start.strftime("%Y-%m"),
        "cost_usd": sum(r["cost_usd"] for r in by_model),
        "turns": sum(r["turns"] for r in by_model),
        "prompt_tokens": sum(r["prompt_tokens"] for r in by_model),
        "completion_tokens": sum(r["completion_tokens"] for r in by_model),
        "household_cost_usd": household_month_spend(db, now),
        "cap_usd": settings.AI_MONTHLY_CAP_USD,
        "by_model": by_model,
    }
