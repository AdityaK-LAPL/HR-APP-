"""Centralized application configuration.

All configuration is read from environment variables (optionally via a local
.env file during development). Nothing here should ever contain a real
secret value - see .env.example for the variables a deployment must supply.
"""

from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

MIN_JWT_SECRET_LENGTH = 32


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

    # A connection the pooler silently stalls would otherwise leave a request waiting forever
    # (asyncpg has no default timeout). With these, a stalled query fails after
    # `db_command_timeout_seconds` (the request answers 500 and the client may retry) and a
    # connection attempt gives up after `db_connect_timeout_seconds`.
    db_command_timeout_seconds: float = Field(default=60.0)
    db_connect_timeout_seconds: float = Field(default=30.0)

    # The database role each request's transaction switches to (SET LOCAL ROLE
    # semantics, via set_config('role', ..., true)). It must be NOBYPASSRLS so
    # PostgreSQL RLS applies to application queries - the connecting role
    # (Supabase's `postgres`) has BYPASSRLS. Created by migration 0013. Set to an
    # empty string to disable (only sensible for a local database without it).
    app_db_role: str = Field(default="hr_app_rls")

    # The company's single timezone (IANA name). Attendance days, "today" and any other
    # business calendar date follow it; stored timestamps stay UTC. See app/core/company_time.py.
    company_timezone: str = Field(default="Asia/Kolkata")

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

    @field_validator("company_timezone")
    @classmethod
    def validate_company_timezone(cls, value: str) -> str:
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError(f"COMPANY_TIMEZONE {value!r} is not a valid IANA timezone") from exc
        return value

    @field_validator("cors_allowed_origins", mode="before")
    @classmethod
    def _split_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @model_validator(mode="after")
    def _refuse_unsafe_configuration(self) -> "Settings":
        """Fail at start-up, not in production traffic, when a secret or switch is unsafe.

        The JWT key signs every session, so a short or copied-from-the-example value would let
        anyone mint an Owner token. `test` (the automated suite) is the only exemption.
        """
        if self.environment.lower() == "test":
            return self
        problems: list[str] = []
        key = self.jwt_secret_key
        if len(key) < MIN_JWT_SECRET_LENGTH or key.lower().startswith(("changeme", "test-secret")):
            problems.append(
                f"JWT_SECRET_KEY must be a random value of at least {MIN_JWT_SECRET_LENGTH} "
                'characters (python -c "import secrets; print(secrets.token_urlsafe(64))")'
            )
        if self.is_production:
            if self.debug:
                problems.append("DEBUG must be false in production")
            if not self.cors_allowed_origins:
                problems.append("CORS_ALLOWED_ORIGINS must list the production frontend origin")
            for origin in self.cors_allowed_origins:
                if origin == "*" or not origin.startswith("https://"):
                    problems.append(
                        f"CORS_ALLOWED_ORIGINS entry {origin!r} must be an https:// origin "
                        "(never '*': cookies are sent with credentials)"
                    )
        if problems:
            raise ValueError("Unsafe configuration: " + "; ".join(problems))
        return self

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
