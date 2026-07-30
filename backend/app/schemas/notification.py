from pydantic import BaseModel, Field, model_validator
from datetime import datetime
from typing import Optional, Any


_SETTINGS_READ_FIELDS = (
    "id",
    "user_id",
    "email_enabled",
    "push_enabled",
    "default_days_before",
    "quiet_hours_start",
    "quiet_hours_end",
    "smtp_host",
    "smtp_port",
    "smtp_user",
    "smtp_from",
    "smtp_use_tls",
    "created_at",
    "updated_at",
)


class NotificationSettingsRead(BaseModel):
    id: int
    user_id: int
    email_enabled: bool = True
    push_enabled: bool = False
    default_days_before: int = 3
    quiet_hours_start: Optional[int] = Field(None, ge=0, le=23)
    quiet_hours_end: Optional[int] = Field(None, ge=0, le=23)
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_from: Optional[str] = None
    smtp_use_tls: Optional[bool] = None
    smtp_password_set: bool = False
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="before")
    @classmethod
    def _map_password_set(cls, data: Any) -> Any:
        if hasattr(data, "smtp_password_encrypted"):
            return {
                **{field: getattr(data, field) for field in _SETTINGS_READ_FIELDS},
                "smtp_password_set": bool(data.smtp_password_encrypted),
            }
        if isinstance(data, dict):
            mapped = dict(data)
            if "smtp_password_encrypted" in mapped:
                mapped["smtp_password_set"] = bool(mapped.pop("smtp_password_encrypted"))
            mapped.pop("smtp_password", None)
            return mapped
        return data

    class Config:
        from_attributes = True


class NotificationSettingsUpdate(BaseModel):
    email_enabled: Optional[bool] = None
    push_enabled: Optional[bool] = None
    default_days_before: Optional[int] = Field(None, ge=1, le=90)
    quiet_hours_start: Optional[int] = Field(None, ge=0, le=23)
    quiet_hours_end: Optional[int] = Field(None, ge=0, le=23)
    smtp_host: Optional[str] = Field(None, max_length=255)
    smtp_port: Optional[int] = Field(None, ge=1, le=65535)
    smtp_user: Optional[str] = Field(None, max_length=255)
    smtp_password: Optional[str] = None
    smtp_from: Optional[str] = Field(None, max_length=255)
    smtp_use_tls: Optional[bool] = None


class NotificationRuleCreate(BaseModel):
    type: str = Field(
        ...,
        pattern="^(balance_below|budget_percent|scheduled_report|investment_return_below|investment_scheduled)$",
    )
    name: str = Field(..., min_length=1, max_length=200)
    target_id: Optional[int] = None
    threshold: Optional[float] = None
    report_type: Optional[str] = Field(None, max_length=40)
    schedule_kind: Optional[str] = Field(
        None,
        pattern="^(every_n_days|weekly|monthly)$",
    )
    schedule_value: Optional[int] = Field(None, ge=1)
    channels: str = Field(default="email", max_length=40)
    is_active: bool = True


class NotificationRuleUpdate(BaseModel):
    type: Optional[str] = Field(
        None,
        pattern="^(balance_below|budget_percent|scheduled_report|investment_return_below|investment_scheduled)$",
    )
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    target_id: Optional[int] = None
    threshold: Optional[float] = None
    report_type: Optional[str] = Field(None, max_length=40)
    schedule_kind: Optional[str] = Field(
        None,
        pattern="^(every_n_days|weekly|monthly)$",
    )
    schedule_value: Optional[int] = Field(None, ge=1)
    channels: Optional[str] = Field(None, max_length=40)
    is_active: Optional[bool] = None


class NotificationRuleRead(BaseModel):
    id: int
    user_id: int
    type: str
    name: str
    target_id: Optional[int] = None
    threshold: Optional[float] = None
    report_type: Optional[str] = None
    schedule_kind: Optional[str] = None
    schedule_value: Optional[int] = None
    channels: str = "email"
    is_active: bool = True
    last_fired_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PushSubscriptionCreate(BaseModel):
    endpoint: str
    p256dh: str
    auth: str
    user_agent: Optional[str] = Field(None, max_length=255)


class NotificationLogRead(BaseModel):
    id: int
    user_id: int
    dedupe_key: str
    type: str
    title: str
    body: Optional[str] = None
    channels_sent: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
