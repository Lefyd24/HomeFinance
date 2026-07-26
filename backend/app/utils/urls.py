from fastapi import Request

from app.config import settings


def public_base_url(request: Request) -> str:
    """Absolute base URL for links in emails.

    Prefers the explicit PUBLIC_BASE_URL setting (e.g. the Tailscale Funnel
    hostname) since request.base_url can be wrong behind a proxy that doesn't
    set forwarded headers; falls back to the request's own origin so this
    still works out of the box in dev.
    """
    if settings.PUBLIC_BASE_URL:
        return settings.PUBLIC_BASE_URL.rstrip("/")
    return str(request.base_url).rstrip("/")
