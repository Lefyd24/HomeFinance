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
# ASPSP_ERROR retries. Kept small: this runs inside the scheduler thread, and a
# genuinely unwell bank will still be unwell tomorrow.
_MAX_ASPSP_RETRIES = 3
_RETRY_BASE_DELAY_SECONDS = 2.0


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


class WrongTransactionsPeriod(EnableBankingError):
    """The requested date range is not available for this account.

    Banks restrict how far back they will serve. Crucially, Enable Banking notes
    that full history is only reachable for a short window after authorisation —
    "typically around one hour" — after which many institutions clamp retrieval
    to the last 90 days. A `date_from` beyond that is the most common cause.
    """


class AspspError(EnableBankingError):
    """The bank itself failed (ASPSP_ERROR).

    Per Enable Banking: "uncategorized failures, primarily stemming from the
    financial institution's side (maintenance, bugs, etc.)" — retry with
    exponential backoff. Banks also return this instead of a precise error for
    requests they dislike, notably an out-of-range date_from.
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

    # Enable Banking puts a machine-readable code in the body; prefer it over the
    # HTTP status, which is 400 for a whole family of unrelated conditions.
    error_code = ""
    try:
        error_code = str((response.json() or {}).get("error") or "")
    except ValueError:
        pass

    if error_code == "WRONG_TRANSACTIONS_PERIOD":
        return WrongTransactionsPeriod(f"Requested transaction period unavailable: {body}")
    if error_code == "ASPSP_ERROR":
        return AspspError(f"The bank rejected the request ({status}): {body}")

    return EnableBankingError(f"Enable Banking returned {status}: {body}")


def _request_once(method: str, path: str, **kwargs: Any) -> dict[str, Any]:
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


def _request(method: str, path: str, **kwargs: Any) -> dict[str, Any]:
    """Perform a request, retrying transient bank-side failures with backoff.

    Enable Banking's guidance for ASPSP_ERROR is explicitly to "retry with
    exponential backoff" — these are usually the bank being briefly unwell
    rather than anything wrong with the request. Deliberately narrow: rate
    limits are NOT retried (that would burn the account's tiny daily quota), and
    neither is anything the caller can act on.
    """
    delay = _RETRY_BASE_DELAY_SECONDS
    for attempt in range(1, _MAX_ASPSP_RETRIES + 1):
        try:
            return _request_once(method, path, **kwargs)
        except AspspError:
            if attempt == _MAX_ASPSP_RETRIES:
                raise
            logger.info(
                "Bank returned ASPSP_ERROR for %s (attempt %s/%s); retrying in %.1fs",
                path,
                attempt,
                _MAX_ASPSP_RETRIES,
                delay,
            )
            time.sleep(delay)
            delay *= 2
    raise AssertionError("unreachable")


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

    The `access.transactionsLimitDays` field is the consent-scope counterpart
    to `get_transactions(strategy="longest")`: it caps, at the ASPSP's SCA
    consent screen, how much history the bank will EVER hand over for this
    authorisation, regardless of what strategy is later used to fetch it. Left
    unset, Enable Banking's docs do not commit to a particular default, and
    some ASPSPs appear to fall back to a short window (observed: a fresh
    reconnect still yielded only ~90 days). Explicitly requesting 0 ("no
    explicit limit") closes that off — `strategy=longest` can only ever return
    as much history as the consent itself was scoped to allow.
    """
    if valid_until is None:
        valid_until = datetime.now(timezone.utc) + timedelta(days=settings.EB_CONSENT_DAYS)
    body = {
        "access": {
            "valid_until": valid_until.isoformat(),
            "balances": True,
            "transactions": True,
            "transactionsLimitDays": 0,
        },
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
    strategy: str = "default",
) -> list[dict[str, Any]]:
    """Transactions in a window, following continuation keys.

    Enable Banking paginates with an opaque `continuation_key`; without following
    it a busy account silently returns only its first page.

    `strategy` picks how the date range is honoured:

    - ``default`` — pass the range straight to the bank. Raises
      WrongTransactionsPeriod if the bank will not serve it. Right for routine
      incremental syncs of recent activity.
    - ``longest`` — ask Enable Banking to find the earliest transaction actually
      available and fetch from there, treating `date_from` as a hint and ignoring
      `date_to`. Never fails on an out-of-range period. Right for the first pull
      of an account, where we do not know how much history the bank will give.

    No `transaction_status` filter is sent: not every ASPSP accepts it, and some
    reject the whole request when it is present. The normalizer filters to booked
    entries itself, so the filter was only ever an optimisation.
    """
    params: dict[str, Any] = {"date_from": date_from.isoformat(), "strategy": strategy}
    # date_to is ignored by the `longest` strategy — sending it anyway is noise.
    if date_to and strategy != "longest":
        params["date_to"] = date_to.isoformat()

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
