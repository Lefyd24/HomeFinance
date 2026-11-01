import ipaddress
import socket

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


def is_public_host(host: str) -> bool:
    """True only if every address the host resolves to is globally routable."""
    try:
        infos = socket.getaddrinfo(host, None)
    except (socket.gaierror, UnicodeError):
        return False
    if not infos:
        return False
    return all(ipaddress.ip_address(i[4][0].split("%")[0]).is_global for i in infos)
