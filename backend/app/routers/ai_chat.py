"""AI Chat Advisor API Router

Streams a DeepSeek-backed conversational agent's response as Server-Sent
Events, including live tool-call status, so the frontend can show progress
before the final answer arrives.

The system prompt is built per request rather than being a constant: the model
needs today's date and the user's investor profile, neither of which is known at
import time. The disclaimer is emitted by this router, after the model is done,
so it cannot be omitted, softened or reworded by the model.
"""
import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User
from app.schemas.ai_chat import AiChatRequest, AiChatStatus
from app.services import ai_service
from app.services.ai_prompt import DISCLAIMER, build_system_prompt
from app.utils.rate_limit import SlidingWindowRateLimiter
from app.utils.security import get_current_user_authenticated as get_current_user

router = APIRouter(prefix="/ai", tags=["AI Advisor Chat"])

# Per-user, not per-IP: this is a single-household app behind auth, and the cost
# being guarded is the model bill, which is per user.
_chat_limiter = SlidingWindowRateLimiter(
    max_hits=settings.AI_CHAT_PER_HOUR, window_seconds=3600
)


@router.get("/status", response_model=AiChatStatus)
def get_ai_status(current_user: User = Depends(get_current_user)):
    """Whether the AI chat feature is configured (DeepSeek API key present)."""
    return AiChatStatus(
        configured=bool(settings.DEEPSEEK_API_KEY),
        investment_tools_enabled=settings.AI_INVESTMENT_TOOLS_ENABLED,
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

    full_messages = [
        {"role": "system", "content": build_system_prompt(db, current_user)}
    ] + [{"role": m.role, "content": m.content} for m in body.messages]

    def event_stream():
        gave_answer = False
        for event in ai_service.run_agent_stream(
            db, current_user.id, current_user.email, full_messages
        ):
            if event.get("type") == "done":
                gave_answer = bool(event.get("content"))
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
