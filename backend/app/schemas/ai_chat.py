"""Pydantic schemas for AI Chat endpoints"""

from datetime import datetime
from typing import List, Literal, Optional
from pydantic import BaseModel, Field, StringConstraints, field_validator, model_validator
from typing_extensions import Annotated


# What the user may type in one message. Generous: pasting a statement or a long
# question is a normal use, and the model-side budget is enforced by fit_history.
MAX_USER_MESSAGE_CHARS = 32_000
# Earlier answers are resent by the client on every turn. They are the server's own
# output, so an over-long one is shortened rather than rejected: rejecting it would
# make every later message in the conversation fail.
MAX_ASSISTANT_MESSAGE_CHARS = 60_000
# Older history beyond this is dropped (oldest first) instead of failing the request.
MAX_HISTORY_MESSAGES = 100
# Hard ceiling on what the endpoint accepts at all, before trimming.
_MAX_MESSAGES_ACCEPTED = 500
_TRUNCATION_MARKER = """

[… earlier answer shortened …]"""


class AiChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., max_length=200_000)

    @model_validator(mode="after")
    def limit_by_role(self) -> "AiChatMessage":
        if self.role == "user":
            if not self.content.strip():
                raise ValueError("A message cannot be empty")
            if len(self.content) > MAX_USER_MESSAGE_CHARS:
                raise ValueError(
                    f"Message is too long ({len(self.content)} characters); "
                    f"the limit is {MAX_USER_MESSAGE_CHARS}."
                )
        elif len(self.content) > MAX_ASSISTANT_MESSAGE_CHARS:
            keep = MAX_ASSISTANT_MESSAGE_CHARS - len(_TRUNCATION_MARKER)
            self.content = self.content[:keep] + _TRUNCATION_MARKER
        return self


class AiChatRequest(BaseModel):
    messages: List[AiChatMessage] = Field(..., min_length=1, max_length=_MAX_MESSAGES_ACCEPTED)
    # OpenRouter model id; None means the server's AI_DEFAULT_MODEL.
    model: Optional[str] = Field(default=None, max_length=200)
    # Skills already active (echoed from the previous turn's `done.active_skills`, or
    # pre-activated by a slash command). Unknown names are ignored server-side.
    skills: Optional[
        List[Annotated[str, StringConstraints(max_length=64)]]
    ] = Field(default=None, max_length=10)

    @field_validator("messages")
    @classmethod
    def last_message_must_be_user(cls, messages: List[AiChatMessage]) -> List[AiChatMessage]:
        if messages[-1].role != "user":
            raise ValueError("The last message must have role 'user'")
        # A stopped or failed answer is stored client-side with no text; it carries
        # nothing for the model, so drop it rather than reject the conversation.
        messages = [m for m in messages if m.role == "user" or m.content.strip()]
        if len(messages) > MAX_HISTORY_MESSAGES:
            messages = messages[-MAX_HISTORY_MESSAGES:]
            # History should open on a user turn, not a dangling answer.
            while messages and messages[0].role != "user":
                messages = messages[1:]
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


class SkillOut(BaseModel):
    name: str
    title: str
    description: str
    command: Optional[str] = None
    suggested_model: Optional[str] = None


class SkillListOut(BaseModel):
    skills: List[SkillOut]
