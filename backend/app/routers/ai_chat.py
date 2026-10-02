"""AI Chat Advisor API Router

Streams an OpenRouter-backed conversational agent's response as Server-Sent
Events, including live tool-call status, so the frontend can show progress
before the final answer arrives.

The system prompt is built per request rather than being a constant: the model
needs today's date and the user's investor profile, neither of which is known at
import time. The disclaimer is emitted by this router, after the model is done,
so it cannot be omitted, softened or reworded by the model.
"""
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app import ai_skills
from app.config import settings
from app.database import get_db
from app.models import User
from app.schemas.ai_chat import (
    AiChatRequest,
    AiChatStatus,
    ModelCatalogOut,
    ModelOut,
    SkillListOut,
    SkillOut,
)
from app.services import ai_models, ai_service, ai_usage_service
from app.services.ai_prompt import DISCLAIMER, build_system_prompt
from app.utils.rate_limit import SlidingWindowRateLimiter
from app.utils.security import get_current_user_authenticated as get_current_user

router = APIRouter(prefix="/ai", tags=["AI Advisor Chat"])
logger = logging.getLogger("app.ai")

# Per-user, not per-IP: this is a single-household app behind auth, and the cost
# being guarded is the model bill, which is per user.
_chat_limiter = SlidingWindowRateLimiter(
    max_hits=settings.AI_CHAT_PER_HOUR, window_seconds=3600
)


def _catalog_out(force: bool) -> ModelCatalogOut:
    client = ai_models.make_client()
    if client is None:  # no key: nothing to list, and no network call
        return ModelCatalogOut(models=[], fetched_at=None)
    models = ai_models.catalog.all_models(client, force=force)
    return ModelCatalogOut(
        models=[
            ModelOut(
                id=m.id,
                name=m.name,
                context_length=m.context_length,
                prompt_per_m=m.prompt_per_m,
                completion_per_m=m.completion_per_m,
                cache_read_per_m=m.cache_read_per_m,
                supports_tools=m.supports_tools,
                known=m.known,
                history_budget=m.history_budget(settings),
            )
            for m in models
        ],
        fetched_at=ai_models.catalog.fetched_at,
    )


@router.get("/status", response_model=AiChatStatus)
def get_ai_status(current_user: User = Depends(get_current_user)):
    """Whether the AI chat feature is configured (OpenRouter API key present)."""
    return AiChatStatus(
        configured=bool(settings.OPENROUTER_API_KEY),
        investment_tools_enabled=settings.AI_INVESTMENT_TOOLS_ENABLED,
        default_model=settings.AI_DEFAULT_MODEL,
    )


@router.get("/models", response_model=ModelCatalogOut)
def list_ai_models(current_user: User = Depends(get_current_user)):
    """Tool-capable OpenRouter models, with prices per 1M tokens (cached for a day)."""
    return _catalog_out(force=False)


@router.post("/models/refresh", response_model=ModelCatalogOut)
def refresh_ai_models(current_user: User = Depends(get_current_user)):
    """Refetch the model catalogue now instead of waiting for the daily cache to expire."""
    return _catalog_out(force=True)


@router.get("/skills", response_model=SkillListOut)
def list_ai_skills(current_user: User = Depends(get_current_user)):
    """Skills the advisor can load (and the slash commands that pre-activate them)."""
    return SkillListOut(
        skills=[
            SkillOut(
                name=s.name,
                title=s.title,
                description=s.description,
                command=s.command,
                suggested_model=s.suggested_model,
            )
            for s in ai_skills.available_skills()
        ]
    )


@router.post("/chat")
def ai_chat(
    body: AiChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Stream a conversational answer, with live tool-call events, as SSE."""
    allowed, retry_after = _chat_limiter.check(f"ai-chat:{current_user.id}")
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many messages. Try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )

    client = ai_models.make_client()
    # Resolved before streaming so an unknown model is a clean 422, not a stream error.
    model = ai_models.resolve_model(body.model, client)

    cap = settings.AI_MONTHLY_CAP_USD
    if cap is not None and ai_usage_service.household_month_spend(db) >= cap:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Monthly AI budget reached.",
        )

    system_prompt = build_system_prompt(db, current_user)
    messages = [{"role": m.role, "content": m.content} for m in body.messages]
    user_id = current_user.id

    def event_stream():
        gave_answer = False
        for event in ai_service.run_agent_stream(
            db,
            user_id,
            current_user.email,
            system_prompt,
            messages,
            model,
            client,
            active_skills=body.skills,
        ):
            if event.get("type") == "done":
                gave_answer = bool(event.get("content"))
                try:
                    ai_usage_service.record_usage(db, user_id, event["model"], event["usage"])
                except Exception:
                    # A failed bookkeeping write must never break the answer.
                    logger.exception("Could not record AI usage for user %s", user_id)
                    db.rollback()
            yield f"data: {json.dumps(event)}\n\n"

        # Server-generated, so it is present on every answer and the model can
        # never talk its way out of it.
        if gave_answer:
            yield f"data: {json.dumps({'type': 'disclaimer', 'text': DISCLAIMER})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
