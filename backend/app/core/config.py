"""Centralized application configuration.

All configuration is read from environment variables (optionally via a local
.env file during development). Nothing here should ever contain a real
secret value - see .env.example for the variables a deployment must supply.
"""

from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: str = Field(default="development")
    debug: bool = Field(default=False)

    database_url: str = Field(
        ...,
        description="Async SQLAlchemy connection string, e.g. postgresql+asyncpg://...",
    )

    # Supabase's pooled connection modes (Session/Transaction pooler) cap the
    # number of concurrent client connections per project on a shared,
    # fairly low limit - SQLAlchemy's own defaults (pool_size=5,
    # max_overflow=10, i.e. up to 15 connections from this process alone)
    # can exceed that on their own. Kept conservative and configurable
    # rather than hardcoded so a direct (unpooled) connection in production
    # can raise these later without a code change.
    db_pool_size: int = Field(default=5)
    db_max_overflow: int = Field(default=2)

    supabase_url: str | None = Field(default=None)
    supabase_service_role_key: str | None = Field(default=None)
    supabase_storage_bucket: str = Field(default="attachments")

    # Attachment storage falls back to the local filesystem whenever Supabase
    # credentials aren't configured (e.g. this environment, local dev, CI) -
    # see app/services/storage.py.
    local_storage_dir: str = Field(default="var/attachments")
    attachment_signed_url_expire_seconds: int = Field(default=300)
    attachment_max_size_bytes: int = Field(default=25 * 1024 * 1024)

    @property
    def use_supabase_storage(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)

    jwt_secret_key: str = Field(...)
    jwt_algorithm: str = Field(default="HS256")
    access_token_expire_minutes: int = Field(default=15)
    refresh_token_expire_days: int = Field(default=14)

    cors_allowed_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)

    log_level: str = Field(default="INFO")

    # In-memory, single-process rate limiting on the unauthenticated auth
    # endpoints (see app/core/rate_limit.py) - a multi-instance deployment
    # needs a shared store (Redis) instead; see architecture.md open
    # question 6, still unresolved.
    login_rate_limit_max: int = Field(default=10)
    login_rate_limit_window_seconds: float = Field(default=60.0)

    @field_validator("cors_allowed_origins", mode="before")
    @classmethod
    def _split_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    """Cached settings accessor.

    Using a dependency-injectable function (rather than a module-level
    singleton) keeps tests free to override configuration via
    `app.dependency_overrides` or by clearing the lru_cache.
    """

    return Settings()
