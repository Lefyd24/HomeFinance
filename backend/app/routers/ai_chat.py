"""AI Chat Advisor API Router

Streams a DeepSeek-backed conversational agent's response as Server-Sent
Events, including live tool-call status, so the frontend can show progress
before the final answer arrives.
"""
import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User
from app.schemas.ai_chat import AiChatRequest, AiChatStatus
from app.services import ai_service
from app.utils.security import get_current_user_authenticated as get_current_user

router = APIRouter(prefix="/ai", tags=["AI Advisor Chat"])


@router.get("/status", response_model=AiChatStatus)
def get_ai_status(current_user: User = Depends(get_current_user)):
    """Whether the AI chat feature is configured (DeepSeek API key present)."""
    return AiChatStatus(configured=bool(settings.DEEPSEEK_API_KEY))


@router.post("/chat")
def ai_chat(
    body: AiChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Stream a conversational answer, with live tool-call events, as SSE."""
    full_messages = [{"role": "system", "content": ai_service.SYSTEM_PROMPT}] + [
        {"role": m.role, "content": m.content} for m in body.messages
    ]

    def event_stream():
        for event in ai_service.run_agent_stream(db, current_user.id, current_user.email, full_messages):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
