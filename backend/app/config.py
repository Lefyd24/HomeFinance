from functools import lru_cache
from pathlib import Path
from typing import Self

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_backend_dir = Path(__file__).resolve().parent.parent
_repo_root = _backend_dir.parent


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
    # Non-wildcard lists are merged with http://localhost:{FRONTEND_PORT} and 127.0.0.1.
    CORS_ORIGINS: list[str] = Field(default_factory=lambda: ["*"])

    # File Upload
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024  # 10MB
    UPLOAD_DIR: str = "./uploads"

    # Documents storage
    DOCUMENTS_DIR: str = Field(default_factory=_default_documents_dir)
    DOCUMENTS_MAX_FILE_SIZE: int = 50 * 1024 * 1024  # 50MB

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

    @model_validator(mode="after")
    def normalize_database_url(self) -> Self:
        self.DATABASE_URL = _normalize_database_url(self.DATABASE_URL)
        return self

    @model_validator(mode="after")
    def normalize_cors_origins(self) -> Self:
        if any(o.strip() == "*" for o in self.CORS_ORIGINS):
            self.CORS_ORIGINS = ["*"]
            return self
        local = (
            f"http://127.0.0.1:{self.FRONTEND_PORT}",
            f"http://localhost:{self.FRONTEND_PORT}",
        )
        self.CORS_ORIGINS = list(dict.fromkeys([*self.CORS_ORIGINS, *local]))
        return self


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
