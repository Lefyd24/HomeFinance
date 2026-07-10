import json, logging
from urllib.parse import urlparse
from pywebpush import webpush, WebPushException
from py_vapid import Vapid

logger = logging.getLogger("app.notifications")


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
        vapid_key: str | Vapid = app.VAPID_PRIVATE_KEY
        try:
            vapid_key = Vapid.from_string(app.VAPID_PRIVATE_KEY)
        except Exception:
            pass
        webpush(
            subscription_info={
                "endpoint": sub.endpoint,
                "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
            },
            data=json.dumps(payload),
            vapid_private_key=vapid_key,
            vapid_claims=_vapid_claims_for_endpoint(sub.endpoint, app.VAPID_SUBJECT),
        )
        return True
    except WebPushException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        body = ""
        if getattr(exc, "response", None) is not None:
            try:
                body = exc.response.text[:500]
            except Exception:
                pass
        if status in (404, 410):
            raise PushGone() from exc
        logger.warning("Push failed (status=%s): %s %s", status, exc, body)
        return False
