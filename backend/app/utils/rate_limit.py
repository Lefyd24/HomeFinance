"""Small in-process sliding-window rate limiter.

Single-container deployment, so an in-memory limiter is sufficient — no
external dependency (redis, slowapi, etc.) needed. Two independent limiters
are meant to be combined by callers: one keyed by client IP, one keyed by a
business key (e.g. the target email), so an attacker can't spread login
attempts across many accounts from one IP, and one account can't be trivially
locked out by hitting it from many IPs.

Buckets are evicted lazily on access so memory stays bounded — nothing grows
unbounded, and idle keys are dropped as soon as their window fully elapses.
"""

import threading
import time
from dataclasses import dataclass, field

from fastapi import HTTPException, Request, status

from app.config import settings


@dataclass
class _Bucket:
    hits: list[float] = field(default_factory=list)


class SlidingWindowRateLimiter:
    """Tracks hit timestamps per key within a fixed time window."""

    def __init__(self, max_hits: int, window_seconds: int):
        self.max_hits = max_hits
        self.window_seconds = window_seconds
        self._buckets: dict[str, _Bucket] = {}
        self._lock = threading.Lock()

    def _prune(self, bucket: _Bucket, now: float) -> None:
        cutoff = now - self.window_seconds
        while bucket.hits and bucket.hits[0] < cutoff:
            bucket.hits.pop(0)

    def check(self, key: str) -> tuple[bool, int]:
        """Record a hit for `key`. Returns (allowed, retry_after_seconds).

        `retry_after_seconds` is 0 when allowed, otherwise the number of
        seconds until the oldest hit in the window expires.
        """
        now = time.monotonic()
        with self._lock:
            # Evict any bucket that's gone fully idle, bounding memory use.
            for stale_key in [
                k
                for k, b in self._buckets.items()
                if b.hits and b.hits[-1] < now - self.window_seconds
            ]:
                del self._buckets[stale_key]

            bucket = self._buckets.setdefault(key, _Bucket())
            self._prune(bucket, now)

            if len(bucket.hits) >= self.max_hits:
                retry_after = int(self.window_seconds - (now - bucket.hits[0])) + 1
                return False, max(retry_after, 1)

            bucket.hits.append(now)
            return True, 0

    def reset(self, key: str) -> None:
        """Forget every recorded hit for `key`."""
        with self._lock:
            self._buckets.pop(key, None)


def get_client_ip(request: Request) -> str:
    """Best-effort client IP, respecting TRUST_PROXY_HEADERS.

    `request.client.host` is the proxy's own address behind Tailscale Funnel
    or any reverse proxy — only trust the first hop of X-Forwarded-For when
    TRUST_PROXY_HEADERS is explicitly enabled (default false), since a
    forwarded header from an untrusted source is a spoofable way to bypass
    per-IP rate limiting entirely.
    """
    if settings.TRUST_PROXY_HEADERS:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            first_hop = forwarded.split(",")[0].strip()
            if first_hop:
                return first_hop
    return request.client.host if request.client else "unknown"


# Shared limiter instances — per-IP and per-email windows for auth endpoints.
ip_limiter = SlidingWindowRateLimiter(
    max_hits=settings.RATE_LIMIT_PER_IP_MAX,
    window_seconds=settings.RATE_LIMIT_PER_IP_WINDOW_SECONDS,
)
email_limiter = SlidingWindowRateLimiter(
    max_hits=settings.RATE_LIMIT_PER_EMAIL_MAX,
    window_seconds=settings.RATE_LIMIT_PER_EMAIL_WINDOW_SECONDS,
)


def enforce_rate_limit(request: Request, email: str | None = None) -> None:
    """Check both the per-IP and (if given) per-email limiters.

    Raises HTTP 429 with a Retry-After header on the first limiter that
    rejects the request.
    """
    ip = get_client_ip(request)
    allowed, retry_after = ip_limiter.check(f"ip:{ip}")
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    if email:
        allowed, retry_after = email_limiter.check(f"email:{email.strip().lower()}")
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please try again later.",
                headers={"Retry-After": str(retry_after)},
            )


def clear_rate_limit(request: Request, email: str | None = None) -> None:
    """Forgive the budget spent by a request that turned out to be legitimate.

    `enforce_rate_limit` has to record its hit *before* credentials are
    checked, so without this a successful sign-in costs the same as a failed
    one — someone logging in on their phone and laptop inside a minute would
    lock themselves out. Call this once an attempt is known to be genuine so
    only failures accumulate.
    """
    ip_limiter.reset(f"ip:{get_client_ip(request)}")
    if email:
        email_limiter.reset(f"email:{email.strip().lower()}")
