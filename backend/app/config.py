"""Application settings loaded from environment variables."""

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "local"
    cors_origins: str = "http://localhost:5173"

    # AI agent (Phase 5). The key lives only in backend/.env (gitignored) or the
    # environment; it is never sent to the browser.
    openai_api_key: str = ""
    # ASSUMPTION: configurable defaults, not business rules (see docs/agent.md).
    openai_chat_model: str = "gpt-6-luna"
    openai_reasoning_effort: str = "low"
    openai_timeout_seconds: float = 60.0
    agent_max_repairs: int = 2
    agent_rate_limit_per_minute: int = 20
    # HMAC key for signed proposals. Empty = a random per-process key (fine locally;
    # set a fixed value per environment in deployment).
    proposal_signing_key: str = ""

    @field_validator("openai_chat_model", "openai_reasoning_effort", mode="before")
    @classmethod
    def _empty_means_default(cls, value: object, info) -> object:
        # `OPENAI_CHAT_MODEL=` (blank, as in .env.example) keeps the default.
        if isinstance(value, str) and not value.strip():
            return cls.model_fields[info.field_name].default
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def agent_configured(self) -> bool:
        return bool(self.openai_api_key.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
