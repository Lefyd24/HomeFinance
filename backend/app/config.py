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
    """`<repo>/frontend/public` for local dev, `/app/frontend/public` under Docker (WORKDIR /app)."""
    repo_root = Path(__file__).resolve().parent.parent.parent
    candidate = repo_root / "frontend" / "public"
    if candidate.exists():
        return str(candidate)
    docker_candidate = Path("/app/frontend/public")
    if docker_candidate.exists():
        return str(docker_candidate)
    # Fall back to the dev path even if missing yet — startup code logs a warning and skips the mount.
    return str(candidate)


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=(
            str(_repo_root / ".env"),
            str(_backend_dir / ".env"),
        ),
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


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
