from typing import List, Literal, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User
from app.models.notification import (
    NotificationLog,
    NotificationRule,
    NotificationSettings,
    PushSubscription,
)
from app.schemas.notification import (
    NotificationLogRead,
    NotificationRuleCreate,
    NotificationRuleRead,
    NotificationRuleUpdate,
    NotificationSettingsRead,
    NotificationSettingsUpdate,
    PushSubscriptionCreate,
)
from app.services import notification_service as ns
from app.services.scheduler import evaluate_for_user
from app.utils import crypto
from app.utils.security import get_current_user_authenticated as get_current_user

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def _get_or_create_settings(db: Session, user_id: int) -> NotificationSettings:
    row = (
        db.query(NotificationSettings)
        .filter(NotificationSettings.user_id == user_id)
        .first()
    )
    if row is None:
        row = NotificationSettings(user_id=user_id)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get("/settings", response_model=NotificationSettingsRead)
def get_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get notification settings for the current user (creates defaults if missing)."""
    return _get_or_create_settings(db, current_user.id)


@router.put("/settings", response_model=NotificationSettingsRead)
def update_settings(
    payload: NotificationSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update notification settings for the current user."""
    row = _get_or_create_settings(db, current_user.id)
    data = payload.model_dump(exclude_unset=True)
    password = data.pop("smtp_password", None)
    for key, value in data.items():
        setattr(row, key, value)
    if password is not None:
        row.smtp_password_encrypted = crypto.encrypt(password)
    db.commit()
    db.refresh(row)
    return row


@router.get("/rules", response_model=List[NotificationRuleRead])
def list_rules(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List notification rules for the current user."""
    return (
        db.query(NotificationRule)
        .filter(NotificationRule.user_id == current_user.id)
        .order_by(NotificationRule.created_at.desc())
        .all()
    )


@router.post("/rules", response_model=NotificationRuleRead, status_code=status.HTTP_201_CREATED)
def create_rule(
    payload: NotificationRuleCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a notification rule."""
    rule = NotificationRule(user_id=current_user.id, **payload.model_dump())
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.put("/rules/{rule_id}", response_model=NotificationRuleRead)
def update_rule(
    rule_id: int,
    payload: NotificationRuleUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a notification rule."""
    rule = (
        db.query(NotificationRule)
        .filter(
            NotificationRule.id == rule_id,
            NotificationRule.user_id == current_user.id,
        )
        .first()
    )
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(rule, key, value)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rule(
    rule_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a notification rule."""
    rule = (
        db.query(NotificationRule)
        .filter(
            NotificationRule.id == rule_id,
            NotificationRule.user_id == current_user.id,
        )
        .first()
    )
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    db.delete(rule)
    db.commit()


@router.get("/log", response_model=List[NotificationLogRead])
def get_log(
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get recent notification log entries."""
    limit = max(1, min(limit, 200))
    return (
        db.query(NotificationLog)
        .filter(NotificationLog.user_id == current_user.id)
        .order_by(NotificationLog.created_at.desc())
        .limit(limit)
        .all()
    )


@router.get("/push/vapid-public-key")
def vapid_public_key():
    """Return the configured VAPID public key for Web Push subscription."""
    return {"key": settings.VAPID_PUBLIC_KEY}


class PushUnsubscribeRequest(BaseModel):
    endpoint: str


@router.post("/push/subscribe", status_code=status.HTTP_204_NO_CONTENT)
def push_subscribe(
    payload: PushSubscriptionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Register or update a Web Push subscription."""
    sub = (
        db.query(PushSubscription)
        .filter(PushSubscription.endpoint == payload.endpoint)
        .first()
    )
    if sub:
        if sub.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Endpoint registered to another user",
            )
        sub.p256dh = payload.p256dh
        sub.auth = payload.auth
        sub.user_agent = payload.user_agent
    else:
        sub = PushSubscription(
            user_id=current_user.id,
            endpoint=payload.endpoint,
            p256dh=payload.p256dh,
            auth=payload.auth,
            user_agent=payload.user_agent,
        )
        db.add(sub)
    db.commit()


@router.post("/push/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
def push_unsubscribe(
    payload: PushUnsubscribeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a Web Push subscription by endpoint."""
    sub = (
        db.query(PushSubscription)
        .filter(
            PushSubscription.endpoint == payload.endpoint,
            PushSubscription.user_id == current_user.id,
        )
        .first()
    )
    if sub:
        db.delete(sub)
        db.commit()


class TestNotificationRequest(BaseModel):
    channel: Literal["email", "push", "all"] = "all"


class TestNotificationResponse(BaseModel):
    email: bool
    push: bool
    push_detail: str | None = None
    email_detail: str | None = None


class PushStatusResponse(BaseModel):
    vapid_configured: bool
    push_enabled: bool
    subscription_count: int


@router.get("/push/status", response_model=PushStatusResponse)
def push_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return desktop push readiness for the current user."""
    settings_row = _get_or_create_settings(db, current_user.id)
    count = (
        db.query(PushSubscription)
        .filter(PushSubscription.user_id == current_user.id)
        .count()
    )
    return PushStatusResponse(
        vapid_configured=bool(settings.VAPID_PUBLIC_KEY and settings.VAPID_PRIVATE_KEY),
        push_enabled=bool(settings_row.push_enabled),
        subscription_count=count,
    )


class RunNotificationsResponse(BaseModel):
    evaluated: int
    sent: int
    skipped_dedupe: int
    skipped_quiet: int
    failed: int
    pending: list[dict]
    message: str


@router.post("/run", response_model=RunNotificationsResponse)
def run_notifications_now(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Evaluate notification rules immediately for the current user."""
    result = evaluate_for_user(db, current_user, settings)
    if result["sent"]:
        msg = f"Sent {result['sent']} notification(s)."
    elif result["evaluated"] and result["skipped_dedupe"]:
        msg = (
            f"{result['evaluated']} alert(s) matched but were already sent today. "
            "They won't repeat until tomorrow."
        )
    elif result["evaluated"] and result["failed"]:
        msg = f"{result['evaluated']} alert(s) matched but delivery failed — check SMTP settings and logs."
    elif result["evaluated"]:
        msg = f"{result['evaluated']} alert(s) matched but none were sent."
    else:
        msg = "No alerts matched your current rules."
    return RunNotificationsResponse(message=msg, **result)


@router.post("/test", response_model=TestNotificationResponse)
def send_test_notification(
    payload: Optional[TestNotificationRequest] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Send a test notification via the requested channel (default: both)."""
    channel = (payload.channel if payload else "all")
    want_email = channel in ("email", "all")
    want_push = channel in ("push", "all")

    settings_row = _get_or_create_settings(db, current_user.id)
    notif = ns.Notification(
        dedupe_key=f"test:{current_user.id}:{datetime.utcnow().isoformat()}",
        type="test",
        title="Test notification",
        body="This is a test notification from Personal Finance.",
        channels=["email", "push"],
    )
    email_ok = False
    push_ok = False
    push_detail = None
    email_detail = None

    if want_email:
        if not settings_row.email_enabled:
            email_detail = "Email disabled — turn on the Email notifications toggle"
        else:
            email_ok, email_detail = ns._send_email_detailed(current_user, notif, settings_row, settings)
            if email_ok:
                email_detail = None

    if want_push:
        if not settings_row.push_enabled:
            push_detail = "Push disabled — turn on the Push notifications toggle"
        else:
            sub_count = (
                db.query(PushSubscription)
                .filter(PushSubscription.user_id == current_user.id)
                .count()
            )
            if sub_count == 0:
                push_detail = "No browser subscription — click Enable desktop notifications first"
            elif not settings.VAPID_PUBLIC_KEY or not settings.VAPID_PRIVATE_KEY:
                push_detail = "Server VAPID keys not configured — restart backend after updating .env"
            else:
                push_ok = ns._send_push(db, current_user, notif, settings)
                if not push_ok:
                    remaining = (
                        db.query(PushSubscription)
                        .filter(PushSubscription.user_id == current_user.id)
                        .count()
                    )
                    if remaining == 0 and sub_count > 0:
                        push_detail = (
                            "Browser subscription was reset (often after VAPID key changes) — "
                            "click Enable desktop notifications again"
                        )
                    else:
                        push_detail = (
                            "Push delivery failed — try Disable then Enable desktop notifications"
                        )

    return TestNotificationResponse(email=email_ok, push=push_ok, push_detail=push_detail, email_detail=email_detail)
