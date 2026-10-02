"""Pydantic schemas for AI Chat endpoints"""

from datetime import datetime
from typing import List, Literal, Optional
from pydantic import BaseModel, Field, field_validator


class AiChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=8000)


class AiChatRequest(BaseModel):
    messages: List[AiChatMessage] = Field(..., min_length=1, max_length=40)
    # OpenRouter model id; None means the server's AI_DEFAULT_MODEL.
    model: Optional[str] = Field(default=None, max_length=200)

    @field_validator("messages")
    @classmethod
    def last_message_must_be_user(cls, messages: List[AiChatMessage]) -> List[AiChatMessage]:
        if messages[-1].role != "user":
            raise ValueError("The last message must have role 'user'")
        return messages


class AiChatStatus(BaseModel):
    configured: bool
    # Lets the UI show investment-flavoured suggestions only when the portfolio
    # tools are actually registered.
    investment_tools_enabled: bool = True
    default_model: str


class ModelOut(BaseModel):
    id: str
    name: str
    context_length: int
    # USD per 1M tokens; None when the catalogue does not price the model.
    prompt_per_m: Optional[float] = None
    completion_per_m: Optional[float] = None
    cache_read_per_m: Optional[float] = None
    supports_tools: bool
    known: bool
    history_budget: int


class ModelCatalogOut(BaseModel):
    models: List[ModelOut]
    fetched_at: Optional[datetime] = None
