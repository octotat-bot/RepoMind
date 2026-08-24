"""Application configuration.

All settings are environment-driven with sane local defaults so that the stack
boots with zero configuration during development.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# backend/app/core/config.py -> backend/app/core -> backend/app -> backend -> <root>
PROJECT_ROOT = Path(__file__).resolve().parents[3]
BACKEND_ROOT = PROJECT_ROOT / "backend"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BACKEND_ROOT / ".env", PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ── Application ─────────────────────────────────────────────────────────
    app_name: str = "RepoMind"
    environment: str = Field(default="development")
    debug: bool = True
    api_prefix: str = "/api/v1"

    # ── Database ────────────────────────────────────────────────────────────
    # Postgres in production/Docker; SQLite fallback keeps local dev zero-setup.
    database_url: str = Field(
        default_factory=lambda: f"sqlite+aiosqlite:///{PROJECT_ROOT / 'data' / 'repomind.db'}"
    )
    db_echo: bool = False

    # ── Auth ────────────────────────────────────────────────────────────────
    jwt_secret: str = Field(default="dev-secret-change-me-in-production")
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 60
    refresh_token_ttl_days: int = 30
    allow_registration: bool = True

    # ── Generation ──────────────────────────────────────────────────────────
    # "ollama" keeps everything on this machine. Any other value routes to an
    # OpenAI-compatible endpoint, which is how deployed instances run, since no
    # free host provides a GPU: groq | openai | openrouter | together | custom
    chat_provider: str = "ollama"
    chat_base_url: str = "https://api.groq.com/openai/v1"
    # Groq's catalogue changes: it has already retired the Llama models this
    # once defaulted to. Check /models against your key if generation 404s.
    chat_model: str = "openai/gpt-oss-20b"
    chat_api_key: str | None = None

    # ── Ollama ──────────────────────────────────────────────────────────────
    ollama_base_url: str = "http://localhost:11434"
    ollama_chat_model: str = "llama3.2:3b"
    ollama_embed_model: str = "nomic-embed-text"
    ollama_timeout_seconds: float = 180.0
    ollama_num_ctx: int = 8192
    ollama_temperature: float = 0.2

    # ── Embeddings ──────────────────────────────────────────────────────────
    # "ollama" for the local daemon, "fastembed" to run ONNX in-process (needed
    # on hosts without Ollama), "hash" for a deterministic offline fallback.
    embedding_provider: str = "ollama"
    fastembed_model: str = "nomic-ai/nomic-embed-text-v1.5-Q"
    embedding_dimension: int = 768
    embedding_batch_size: int = 32
    # ONNX working memory scales with both batch size and thread count. Set to
    # 1 on a memory-capped host; 0 leaves the library to choose.
    embedding_threads: int = 0

    # ── Storage ─────────────────────────────────────────────────────────────
    data_dir: Path = PROJECT_ROOT / "data"
    repos_dir: Path = PROJECT_ROOT / "data" / "repos"
    faiss_dir: Path = PROJECT_ROOT / "faiss" / "indexes"
    model_cache_dir: Path = PROJECT_ROOT / "data" / "models"

    # Hosts like Render wipe the filesystem on every restart. With this on, the
    # vectors and file contents needed to rebuild local state are kept in the
    # database, and the working tree is regenerated on demand.
    ephemeral_filesystem: bool = False

    # ── Ingestion ───────────────────────────────────────────────────────────
    clone_depth: int = 1
    clone_timeout_seconds: int = 600
    max_concurrent_indexing_jobs: int = 2
    github_token: str | None = None

    # ── CORS ────────────────────────────────────────────────────────────────
    # NoDecode keeps pydantic-settings from JSON-parsing the raw env value so
    # the validator below can accept a plain comma-separated list.
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ]
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("database_url", mode="after")
    @classmethod
    def _normalise_driver(cls, value: str) -> str:
        """Make a connection string copied from any provider work as-is.

        Managed Postgres providers hand out libpq-style URLs. Two things in them
        break asyncpg, and both are silent until the first query:

        * the ``postgres://`` / ``postgresql://`` scheme selects the sync driver
        * ``?sslmode=require`` is a libpq option asyncpg does not accept, and
          raises ``TypeError: connect() got an unexpected keyword argument``

        Rewriting them here means a URL pasted straight from Neon, Render or
        Railway just works.
        """
        if value.startswith("postgres://"):
            value = value.replace("postgres://", "postgresql://", 1)
        if value.startswith("postgresql://"):
            value = value.replace("postgresql://", "postgresql+asyncpg://", 1)
        if value.startswith("sqlite:///"):
            value = value.replace("sqlite:///", "sqlite+aiosqlite:///", 1)

        if value.startswith("postgresql+asyncpg://") and "?" in value:
            base, _, query = value.partition("?")
            keep: list[str] = []
            for parameter in query.split("&"):
                if not parameter:
                    continue
                key, _, setting = parameter.partition("=")
                lowered = key.lower()
                if lowered == "sslmode":
                    # asyncpg spells this "ssl"; "disable" means no TLS at all.
                    if setting.lower() not in {"disable", "allow"}:
                        keep.append("ssl=require")
                elif lowered in {"channel_binding", "options", "target_session_attrs"}:
                    continue  # libpq-only, meaningless to asyncpg
                else:
                    keep.append(parameter)
            value = f"{base}?{'&'.join(keep)}" if keep else base

        return value

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"production", "prod"}

    @property
    def uses_local_ollama(self) -> bool:
        """True when any part of the pipeline still depends on the Ollama daemon."""
        return self.chat_provider.lower() == "ollama" or self.embedding_provider.lower() == "ollama"

    def ensure_directories(self) -> None:
        for directory in (self.data_dir, self.repos_dir, self.faiss_dir, self.model_cache_dir):
            directory.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_directories()
    return settings


settings = get_settings()
