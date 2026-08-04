import logging
from functools import lru_cache
from pathlib import Path
from typing import Self

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_backend_dir = Path(__file__).resolve().parent.parent
_repo_root = _backend_dir.parent

DEFAULT_SECRET_KEY = "your-secret-key-change-in-production"
MIN_SECRET_KEY_LENGTH = 32


def _normalize_database_url(url: str) -> str:
    """Resolve SQLite paths for local dev vs Docker and ensure parent dirs exist."""
    if not url.lower().startswith("sqlite:"):
        return url

    # Docker Compose default — remap to <repo>/data/ when /app is not a real path
    if "/app/data/" in url or url.startswith("sqlite:////app/"):
        db_path = (_repo_root / "data" / "finance.db").resolve()
    elif url.startswith("sqlite:////"):
        # Four slashes = absolute filesystem path (e.g. sqlite:////var/lib/db.sqlite)
        db_path = Path(url[len("sqlite://") :]).resolve()
    elif url.startswith("sqlite:///"):
        # Three slashes = path relative to backend/ (typical local dev CWD)
        relative = url[len("sqlite:///") :]
        db_path = (_backend_dir / relative).resolve()
    else:
        return url

    db_path.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{db_path.as_posix()}"


def _default_log_dir() -> str:
    """`<repo>/logs`: same folder Docker maps as `./logs:/app/logs` (WORKDIR /app ⇒ repo root there)."""
    repo_root = Path(__file__).resolve().parent.parent.parent
    return str(repo_root / "logs")


def _default_documents_dir() -> str:
    repo_root = Path(__file__).resolve().parent.parent.parent
    return str(repo_root / "data" / "documents")


def _default_frontend_dir() -> str:
    """`<repo>/frontend/app/dist` for local dev, `/app/frontend/public` under Docker (WORKDIR /app).

    Local dev normally runs `vite dev`, which serves the SPA itself, so a missing
    dist is expected and harmless — startup logs a warning and skips the mount.
    """
    repo_root = Path(__file__).resolve().parent.parent.parent
    candidate = repo_root / "frontend" / "app" / "dist"
    if candidate.exists():
        return str(candidate)
    docker_candidate = Path("/app/frontend/public")
    if docker_candidate.exists():
        return str(docker_candidate)
    return str(candidate)


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Exactly one .env, at the repo root — the same file docker compose forwards
    # into the container. There used to be a second entry for backend/.env, and
    # because later files win in pydantic-settings, a stale backend/.env silently
    # overrode the real config (emptying SECRET_KEY, forcing DEBUG=true).
    model_config = SettingsConfigDict(
        env_file=str(_repo_root / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    # Application
    APP_NAME: str = "Personal Finance API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # Service ports (compose / .env — also used for CORS localhost origins)
    BACKEND_PORT: int = 8223
    FRONTEND_PORT: int = 3100
    # Interface `python main.py` listens on. Loopback by default so a
    # Tailscale Serve/Funnel proxy is the only reachable entrypoint, which is
    # what makes trusting X-Forwarded-For safe (see TRUST_PROXY_HEADERS).
    BIND_HOST: str = "127.0.0.1"

    # Database
    DATABASE_URL: str = "sqlite:///./finance.db"

    # Logging
    LOG_DIR: str = Field(default_factory=_default_log_dir)
    LOG_LEVEL: str = "INFO"

    # Security
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    API_KEY_HEADER: str = "X-API-Key"
    API_KEY_MIN_LENGTH: int = 32

    # CORS — set CORS_ORIGINS in .env as JSON, e.g. ["*"] or explicit origins.
    # Default is [] (same-origin only) since the frontend is served by this same app.
    # Non-wildcard, non-empty lists are merged with http://localhost:{FRONTEND_PORT} and 127.0.0.1 when DEBUG=true.
    CORS_ORIGINS: list[str] = Field(default_factory=list)

    # File Upload
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024  # 10MB
    UPLOAD_DIR: str = "./uploads"

    # Documents storage
    DOCUMENTS_DIR: str = Field(default_factory=_default_documents_dir)
    DOCUMENTS_MAX_FILE_SIZE: int = 50 * 1024 * 1024  # 50MB

    # Frontend static files (served by this app so Tailscale Funnel can expose one origin)
    FRONTEND_DIR: str = Field(default_factory=_default_frontend_dir)

    # Investment account syncing (Freedom24 and future brokers)
    INVESTMENT_SYNC_ENABLED: bool = True
    INVESTMENT_SYNC_INTERVAL_HOURS: int = 4
    # Manual "Sync now" cooldown per account, to avoid hammering broker APIs.
    INVESTMENT_MANUAL_SYNC_COOLDOWN_SECONDS: int = 60

    # Notifications
    NOTIFICATIONS_ENABLED: bool = True
    NOTIFICATION_ENCRYPTION_KEY: str | None = None
    # SMTP (defaults; per-user UI settings override these)
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM: str | None = None
    SMTP_USE_TLS: bool = True
    # Web Push (VAPID)
    VAPID_PUBLIC_KEY: str | None = None
    VAPID_PRIVATE_KEY: str | None = None
    VAPID_SUBJECT: str = "mailto:admin@example.com"

    # AI Chat (DeepSeek)
    DEEPSEEK_API_KEY: str | None = None
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"
    DEEPSEEK_MODEL: str = "deepseek-chat"
    AI_CHAT_MAX_TOOL_ROUNDS: int = 6

    # Bank sync (Enable Banking — PSD2 account information)
    # Off by default: without a registered application and its private key the
    # whole feature is inert, and every route/scheduler job checks this flag.
    BANK_SYNC_ENABLED: bool = False
    EB_API_BASE: str = "https://api.enablebanking.com"
    # Application ID from the Enable Banking Control Panel. Becomes the JWT `kid`.
    EB_APPLICATION_ID: str | None = None
    # Filesystem path to the RS256 private key (.pem) downloaded once at app
    # registration. NEVER commit this or bake it into the Docker image — mount
    # it as a volume. *.pem is gitignored.
    EB_PRIVATE_KEY_PATH: str | None = None
    # Where the bank sends the user back after SCA. Must EXACTLY match one of
    # the redirect URLs registered with Enable Banking, and must be reachable
    # from the user's browser (i.e. the public Tailscale Funnel origin in prod).
    EB_REDIRECT_URL: str | None = None
    # Requested consent lifetime. Banks cap this — Greek ASPSPs typically at 90
    # days — and will silently grant less, so we store what the bank returns.
    EB_CONSENT_DAYS: int = 90
    # Days of history to request on the very first sync of a newly linked account.
    EB_INITIAL_HISTORY_DAYS: int = 365
    # Also import transactions the bank has not booked yet (card authorisations,
    # in-flight transfers). They arrive in the same response as booked ones, so
    # this costs no extra API call.
    #
    # Off by default because they are ephemeral: amounts change, entries vanish,
    # and they reappear as booked entries under a different identifier. The sync
    # handles that by replacing the whole pending set each run — but it does mean
    # a pending row can disappear from the ledger without the user deleting it.
    # Turning this on also switches the account balance to the bank's *available*
    # balance so the total still ties to the transactions shown.
    EB_INCLUDE_PENDING: bool = False
    # Re-fetch this many days before last_sync_at on every sync: banks backdate
    # bookings, so a strict "since last sync" window silently drops transactions.
    EB_SYNC_OVERLAP_DAYS: int = 3
    # Minimum gap between manual syncs of one connection. Banks rate-limit AIS
    # hard (as low as 4 calls per account per day), so an impatient refresh
    # button can burn the daily quota and break the scheduled sync.
    EB_MANUAL_SYNC_COOLDOWN_MINUTES: int = 60
    # Warn this many days before consent expires. Without the warning, sync goes
    # silently dark and the register quietly stops updating.
    EB_CONSENT_WARN_DAYS: int = 7
    # Absolute base URL of the frontend, used to redirect the browser back after
    # the bank callback is processed server-side. In local dev this is the Vite
    # dev server; in production it is the same origin as the API.
    FRONTEND_BASE_URL: str | None = None

    # Admin bootstrap — any EXISTING user whose email is in this list gets
    # is_admin=True at startup (see main.py lifespan). Does not create users.
    ADMIN_EMAILS: list[str] = Field(default_factory=list)

    # Absolute base URL used to build links in transactional emails (password
    # reset, email verification). Falls back to the incoming request's own
    # origin when unset — set this explicitly for a stable public URL (e.g.
    # the Tailscale Funnel hostname) so links are correct regardless of which
    # origin the request came in on.
    PUBLIC_BASE_URL: str | None = None

    # Reverse-proxy trust — only read X-Forwarded-For's first hop for client-IP
    # based rate limiting when explicitly enabled (Tailscale Funnel / any proxy
    # sits in front of this app in production). Left False by default because a
    # trusted header from an untrusted source is a spoofable rate-limit bypass.
    TRUST_PROXY_HEADERS: bool = False

    # Login / register / forgot-password rate limiting (in-process sliding
    # window — see app/utils/rate_limit.py). Two independent limiters apply:
    # one keyed by client IP, one keyed by the target email, so an attacker
    # can't spread attempts across accounts from one IP, nor lock an account
    # out from many IPs trivially.
    RATE_LIMIT_PER_IP_MAX: int = 10
    RATE_LIMIT_PER_IP_WINDOW_SECONDS: int = 60
    RATE_LIMIT_PER_EMAIL_MAX: int = 5
    RATE_LIMIT_PER_EMAIL_WINDOW_SECONDS: int = 60

    @model_validator(mode="after")
    def normalize_database_url(self) -> Self:
        self.DATABASE_URL = _normalize_database_url(self.DATABASE_URL)
        return self

    @model_validator(mode="after")
    def normalize_cors_origins(self) -> Self:
        logger = logging.getLogger("app")
        if any(o.strip() == "*" for o in self.CORS_ORIGINS):
            self.CORS_ORIGINS = ["*"]
            logger.warning(
                "CORS_ORIGINS=['*'] is configured — allow_credentials will be forced to False "
                "(browsers reject wildcard origins with credentialed requests). "
                "Prefer CORS_ORIGINS=[] for same-origin deployments (e.g. behind Tailscale Funnel)."
            )
            return self
        if not self.DEBUG:
            # In production, same-origin (frontend served by this app) needs no CORS at all.
            return self
        # DEBUG dev convenience: merge in the split-port local dev origins.
        local = (
            f"http://127.0.0.1:{self.FRONTEND_PORT}",
            f"http://localhost:{self.FRONTEND_PORT}",
        )
        self.CORS_ORIGINS = list(dict.fromkeys([*self.CORS_ORIGINS, *local]))
        return self

    @model_validator(mode="after")
    def validate_secret_key(self) -> Self:
        logger = logging.getLogger("app")
        problems = []
        if not self.SECRET_KEY:
            problems.append("is empty")
        elif self.SECRET_KEY == DEFAULT_SECRET_KEY:
            problems.append("is still the placeholder default")
        elif len(self.SECRET_KEY) < MIN_SECRET_KEY_LENGTH:
            problems.append(
                f"is only {len(self.SECRET_KEY)} characters (minimum {MIN_SECRET_KEY_LENGTH})"
            )

        if problems:
            message = (
                f"SECRET_KEY {' and '.join(problems)}. Generate a strong key with "
                "`openssl rand -hex 32` and set SECRET_KEY in your .env file before starting the app. "
                "This key signs JWTs and (unless NOTIFICATION_ENCRYPTION_KEY is set) derives the key "
                "used to encrypt stored SMTP passwords — do not skip this in production."
            )
            if self.DEBUG:
                logger.warning(
                    "DEBUG=true — bypassing SECRET_KEY validation. NEVER run production like this. %s",
                    message,
                )
            else:
                raise ValueError(message)
        return self

    @model_validator(mode="after")
    def validate_notification_encryption_key(self) -> Self:
        logger = logging.getLogger("app")
        if self.NOTIFICATIONS_ENABLED and not self.NOTIFICATION_ENCRYPTION_KEY:
            message = (
                "NOTIFICATIONS_ENABLED=true but NOTIFICATION_ENCRYPTION_KEY is not set. "
                "Without it, the Fernet key used to encrypt per-user SMTP passwords is derived from "
                "SECRET_KEY — rotating SECRET_KEY later will silently make every stored SMTP password "
                "undecryptable. Set NOTIFICATION_ENCRYPTION_KEY in .env NOW, pinned to the CURRENT "
                "SECRET_KEY value, before you ever rotate SECRET_KEY. Generate a fresh one instead with "
                "`openssl rand -hex 32` if no SMTP passwords are stored yet."
            )
            if self.DEBUG:
                logger.warning(
                    "DEBUG=true — bypassing NOTIFICATION_ENCRYPTION_KEY validation. %s",
                    message,
                )
            else:
                raise ValueError(message)
        return self


    @model_validator(mode="after")
    def validate_bank_sync(self) -> Self:
        logger = logging.getLogger("app")
        if not self.BANK_SYNC_ENABLED:
            return self

        missing = [
            name
            for name in ("EB_APPLICATION_ID", "EB_PRIVATE_KEY_PATH", "EB_REDIRECT_URL")
            if not getattr(self, name)
        ]
        problems = []
        if missing:
            problems.append(f"{', '.join(missing)} not set")
        elif not Path(self.EB_PRIVATE_KEY_PATH).is_file():
            problems.append(f"EB_PRIVATE_KEY_PATH does not exist: {self.EB_PRIVATE_KEY_PATH}")

        if problems:
            message = (
                f"BANK_SYNC_ENABLED=true but {' and '.join(problems)}. Register an application in the "
                "Enable Banking Control Panel, download its private key (.pem), and set EB_APPLICATION_ID, "
                "EB_PRIVATE_KEY_PATH and EB_REDIRECT_URL in .env. EB_REDIRECT_URL must exactly match a "
                "redirect URL registered with Enable Banking or every bank authorisation will fail."
            )
            if self.DEBUG:
                logger.warning("DEBUG=true — bypassing bank sync validation. %s", message)
            else:
                raise ValueError(message)
        return self


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
