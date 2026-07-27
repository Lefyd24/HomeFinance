import json, logging
from urllib.parse import urlparse
from pywebpush import webpush, WebPushException

logger = logging.getLogger("app.notifications")

# TTL for undelivered messages (seconds). Avoid 0 — some push services (e.g. WNS) reject it.
PUSH_TTL_SECONDS = 86400


class PushGone(Exception): ...


def _vapid_claims_for_endpoint(endpoint: str, subject: str) -> dict:
    """Build VAPID claims with audience matching the push service."""
    parsed = urlparse(endpoint)
    aud = f"{parsed.scheme}://{parsed.netloc}"
    return {"sub": subject, "aud": aud}


def send_push(sub, payload: dict, app) -> bool:
    if not app.VAPID_PRIVATE_KEY:
        logger.warning("No VAPID key configured; skipping push")
        return False
    try:
        webpush(
            subscription_info={
                "endpoint": sub.endpoint,
                "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
            },
            data=json.dumps(payload),
            vapid_private_key=app.VAPID_PRIVATE_KEY,
            vapid_claims=_vapid_claims_for_endpoint(sub.endpoint, app.VAPID_SUBJECT),
            ttl=PUSH_TTL_SECONDS,
        )
        return True
    except WebPushException as exc:
        response = getattr(exc, "response", None)
        status = getattr(response, "status_code", None)
        body = ""
        if response is not None:
            try:
                body = (response.text or "")[:500]
            except Exception:
                pass
        # 400 often means VAPID key mismatch (e.g. after rotating keys in .env).
        if status in (400, 404, 410):
            logger.warning(
                "Push subscription rejected (status=%s, endpoint=%s): %s %s",
                status,
                sub.endpoint[:80],
                exc,
                body,
            )
            raise PushGone() from exc
        logger.warning("Push failed (status=%s): %s %s", status, exc, body)
        return False
