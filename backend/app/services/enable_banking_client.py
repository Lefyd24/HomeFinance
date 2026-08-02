"""Thin client for the Enable Banking API (PSD2 account information).

Deliberately synchronous: it is called both from request handlers and from the
APScheduler background thread (see services/scheduler.py), and a sync client
works in both without an asyncio.run() wrapper. Matches the house style of
ai_service.py / push_service.py — explicit timeouts, a config-presence guard up
front, narrow exception types, and upstream error text kept out of responses.

Auth is a self-signed RS256 JWT rather than an OAuth exchange: there is no token
endpoint and no refresh cycle. The application's private key (downloaded once at
registration) signs a short-lived assertion sent as a bearer token.

Flow:  list_aspsps -> start_authorization -> [user does SCA at the bank]
       -> create_session(code) -> get_accounts -> get_balances / get_transactions
"""

import logging
import threading
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx
from jose import jwt

from app.config import settings

logger = logging.getLogger("app.bank_sync")

_JWT_TTL_SECONDS = 3600
# Re-sign this long before expiry so a request never carries a token that dies mid-flight.
_JWT_REFRESH_MARGIN_SECONDS = 300
_HTTP_TIMEOUT = 30.0


class EnableBankingError(Exception):
    """Base for every Enable Banking failure. Message is safe to log, not to return."""


class BankSyncNotConfigured(EnableBankingError):
    """BANK_SYNC_ENABLED is false, or the application id / private key is missing."""


class ConsentExpired(EnableBankingError):
    """The user's SCA consent has lapsed; they must re-authorise at the bank."""


class RateLimited(EnableBankingError):
    """The bank or Enable Banking rejected the call for rate limiting.

    Banks cap AIS access hard — as low as 4 calls per account per day — so this
    is an expected, recoverable condition, not an error worth failing a whole
    sync tick over.
    """


class NotWhitelisted(EnableBankingError):
    """The account is not linked to the application in Enable Banking's Control Panel.

    In restricted (free tier) mode Enable Banking compares the accounts a bank
    returns at authorisation against the list of accounts linked to the
    application, and filters out everything else. The user sees an apparently
    successful bank login that yields no accounts — the single most confusing
    onboarding failure, so it gets its own type and an explicit message.
    """


class _TokenCache:
    """Process-wide cached assertion. Signing per request is pure CPU waste."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._token: str | None = None
        self._expires_at: float = 0.0

    def get(self, sign) -> str:
        with self._lock:
            now = time.time()
            if self._token and now < self._expires_at - _JWT_REFRESH_MARGIN_SECONDS:
                return self._token
            self._token = sign()
            self._expires_at = now + _JWT_TTL_SECONDS
            return self._token

    def clear(self) -> None:
        with self._lock:
            self._token = None
            self._expires_at = 0.0


_token_cache = _TokenCache()


def is_configured() -> bool:
    """True when bank sync is switched on and has everything it needs to run."""
    return bool(
        settings.BANK_SYNC_ENABLED
        and settings.EB_APPLICATION_ID
        and settings.EB_PRIVATE_KEY_PATH
        and settings.EB_REDIRECT_URL
    )


def _require_configured() -> None:
    if not is_configured():
        raise BankSyncNotConfigured(
            "Bank sync is not configured. Set BANK_SYNC_ENABLED=true along with "
            "EB_APPLICATION_ID, EB_PRIVATE_KEY_PATH and EB_REDIRECT_URL."
        )


def _read_private_key() -> str:
    path = Path(settings.EB_PRIVATE_KEY_PATH)
    try:
        return path.read_text()
    except OSError as exc:
        raise BankSyncNotConfigured(
            f"Could not read the Enable Banking private key at {path}: {exc}"
        ) from exc


def _sign_jwt() -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "iss": "enablebanking.com",
            "aud": "api.enablebanking.com",
            "iat": now,
            "exp": now + _JWT_TTL_SECONDS,
        },
        _read_private_key(),
        algorithm="RS256",
        headers={"typ": "JWT", "alg": "RS256", "kid": settings.EB_APPLICATION_ID},
    )


def _auth_header() -> dict[str, str]:
    _require_configured()
    return {"Authorization": f"Bearer {_token_cache.get(_sign_jwt)}"}


def _classify(response: httpx.Response) -> EnableBankingError:
    """Map an error response onto the narrowest exception we have."""
    body = response.text[:500]
    status = response.status_code

    if status == 429:
        return RateLimited(f"Rate limited by Enable Banking (429): {body}")
    if status in (401, 403):
        lowered = body.lower()
        # Enable Banking surfaces both a lapsed consent and a non-whitelisted
        # account as 401/403, so the body is the only discriminator.
        if "expired" in lowered or "consent" in lowered or "session" in lowered:
            return ConsentExpired(f"Consent/session no longer valid ({status}): {body}")
        if "linked" in lowered or "restricted" in lowered or "whitelist" in lowered:
            return NotWhitelisted(f"Account not linked to the application ({status}): {body}")
    return EnableBankingError(f"Enable Banking returned {status}: {body}")


def _request(method: str, path: str, **kwargs: Any) -> dict[str, Any]:
    _require_configured()
    url = f"{settings.EB_API_BASE.rstrip('/')}{path}"
    headers = {**_auth_header(), "Accept": "application/json"}
    try:
        with httpx.Client(timeout=_HTTP_TIMEOUT) as client:
            response = client.request(method, url, headers=headers, **kwargs)
    except httpx.HTTPError as exc:
        raise EnableBankingError(f"Enable Banking request to {path} failed: {exc}") from exc

    if response.status_code >= 400:
        if response.status_code in (401, 403):
            # Could be a stale signing key rather than a bad consent; drop the
            # cached assertion so the next call re-signs.
            _token_cache.clear()
        raise _classify(response)

    if not response.content:
        return {}
    try:
        return response.json()
    except ValueError as exc:
        raise EnableBankingError(f"Enable Banking returned non-JSON for {path}") from exc


# --- API surface ----------------------------------------------------------


def list_aspsps(country: str) -> list[dict[str, Any]]:
    """Banks available in a country, e.g. "GR" -> Eurobank, Alpha, Piraeus, NBG."""
    data = _request("GET", "/aspsps", params={"country": country.upper()})
    return data.get("aspsps", [])


def start_authorization(
    *,
    aspsp_name: str,
    aspsp_country: str,
    state: str,
    valid_until: datetime | None = None,
    psu_type: str = "personal",
) -> dict[str, Any]:
    """Begin an authorisation and get back the URL to send the user's browser to.

    `state` is our own single-use nonce; the bank echoes it to the callback and
    it is what binds the returned code back to a user.
    """
    if valid_until is None:
        valid_until = datetime.now(timezone.utc) + timedelta(days=settings.EB_CONSENT_DAYS)
    body = {
        "access": {"valid_until": valid_until.isoformat()},
        "aspsp": {"name": aspsp_name, "country": aspsp_country.upper()},
        "state": state,
        "redirect_url": settings.EB_REDIRECT_URL,
        "psu_type": psu_type,
    }
    return _request("POST", "/auth", json=body)


def create_session(code: str) -> dict[str, Any]:
    """Exchange the callback code for a session plus the accessible accounts."""
    return _request("POST", "/sessions", json={"code": code})


def get_session(session_id: str) -> dict[str, Any]:
    return _request("GET", f"/sessions/{session_id}")


def get_accounts(session_id: str) -> list[dict[str, Any]]:
    """Accounts reachable through a session.

    In restricted mode this is already filtered down to whitelisted accounts, so
    an empty list here is the NotWhitelisted case arriving quietly rather than
    as an error status.
    """
    return get_session(session_id).get("accounts", [])


def delete_session(session_id: str) -> None:
    """Revoke a session. Best-effort: a failure here must not block unlinking."""
    try:
        _request("DELETE", f"/sessions/{session_id}")
    except EnableBankingError as exc:
        logger.warning("Failed to revoke Enable Banking session: %s", exc)


def get_balances(account_uid: str) -> list[dict[str, Any]]:
    data = _request("GET", f"/accounts/{account_uid}/balances")
    return data.get("balances", [])


def get_transactions(
    account_uid: str,
    date_from: date,
    date_to: date | None = None,
    transaction_status: str | None = "BOOK",
) -> list[dict[str, Any]]:
    """Transactions in a window, following continuation keys.

    Enable Banking paginates with an opaque `continuation_key`; without following
    it a busy account silently returns only its first page.

    Defaults to booked transactions only. Not every ASPSP honours the filter, so
    the normalizer re-checks `status` rather than trusting this.
    """
    params: dict[str, Any] = {"date_from": date_from.isoformat()}
    if date_to:
        params["date_to"] = date_to.isoformat()
    if transaction_status:
        params["transaction_status"] = transaction_status

    transactions: list[dict[str, Any]] = []
    seen_keys: set[str] = set()
    while True:
        data = _request("GET", f"/accounts/{account_uid}/transactions", params=params)
        transactions.extend(data.get("transactions", []))

        key = data.get("continuation_key")
        # Guard against a server that keeps handing back the same key forever.
        if not key or key in seen_keys:
            break
        seen_keys.add(key)
        params["continuation_key"] = key

    return transactions
