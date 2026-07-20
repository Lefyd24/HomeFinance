"""Pydantic schemas for AI Chat endpoints"""

from typing import List, Literal
from pydantic import BaseModel, Field, field_validator


class AiChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=8000)


class AiChatRequest(BaseModel):
    messages: List[AiChatMessage] = Field(..., min_length=1, max_length=40)

    @field_validator("messages")
    @classmethod
    def last_message_must_be_user(cls, messages: List[AiChatMessage]) -> List[AiChatMessage]:
        if messages[-1].role != "user":
            raise ValueError("The last message must have role 'user'")
        return messages


class AiChatStatus(BaseModel):
    configured: bool
