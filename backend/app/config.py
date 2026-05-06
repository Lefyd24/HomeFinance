from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings


def _default_log_dir() -> str:
    """`<repo>/logs`: same folder Docker maps as `./logs:/app/logs` (WORKDIR /app ⇒ repo root there)."""
    repo_root = Path(__file__).resolve().parent.parent.parent
    return str(repo_root / "logs")


def _default_documents_dir() -> str:
    repo_root = Path(__file__).resolve().parent.parent.parent
    return str(repo_root / "data" / "documents")


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    APP_NAME: str = "Personal Finance API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

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

    # CORS
    CORS_ORIGINS: list = [
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:3100",
        "http://127.0.0.1:3100",
        "http://100.101.185.10:3100",
        "http://100.101.185.10:8223",
        "http://homeserver.burbot-karat.ts.net:3100",
        "http://100.101.125.41:3100",
        "http://localhost:3101",
        "http://100.65.10.29"
    ]

    # File Upload
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024  # 10MB
    UPLOAD_DIR: str = "./uploads"

    # Documents storage
    DOCUMENTS_DIR: str = Field(default_factory=_default_documents_dir)
    DOCUMENTS_MAX_FILE_SIZE: int = 50 * 1024 * 1024  # 50MB

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
