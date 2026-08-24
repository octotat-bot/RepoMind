"""Liveness and dependency health."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from sqlalchemy import text

from ai.llm import get_chat_model
from app.api.deps import SessionDep
from app.core.config import settings

router = APIRouter(tags=["system"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name}


@router.get("/health/ready")
async def readiness(session: SessionDep) -> dict[str, Any]:
    """Report on every dependency so setup problems are obvious at a glance."""
    checks: dict[str, Any] = {}

    try:
        await session.execute(text("SELECT 1"))
        checks["database"] = {
            "ok": True,
            "engine": "sqlite" if settings.is_sqlite else "postgres",
        }
    except Exception as exc:  # noqa: BLE001 - health must never raise
        checks["database"] = {"ok": False, "error": str(exc)}

    status = await get_chat_model().status()
    checks["chat"] = status.to_dict()

    checks["embeddings"] = {
        "ok": True,
        "provider": settings.embedding_provider,
        "model": (
            settings.ollama_embed_model
            if settings.embedding_provider == "ollama"
            else settings.fastembed_model
        ),
        "dimension": settings.embedding_dimension,
    }

    # A misconfigured CORS list is invisible from the server's side — the API
    # looks healthy while every browser call is blocked — so the configured
    # origins are reported here. They are not secret.
    checks["cors"] = {
        "ok": bool(settings.cors_origins or settings.cors_origin_regex),
        "allowedOrigins": settings.cors_origins,
        "allowedOriginRegex": settings.cors_origin_regex,
    }
    if not checks["cors"]["ok"]:
        checks["cors"]["detail"] = (
            "No origins allowed. Set CORS_ORIGINS to the frontend origin exactly, "
            "with no trailing slash."
        )

    # Kept for backwards compatibility: the settings page and older clients
    # read `checks.ollama`. It mirrors whichever backend is actually serving.
    checks["ollama"] = {
        "ok": status.ok,
        "baseUrl": status.endpoint,
        "chatModel": status.model,
        "embedModel": checks["embeddings"]["model"],
        "installedModels": status.available_models,
        "missingModels": status.missing_models,
    }

    return {
        "status": "ok" if all(check.get("ok") for check in checks.values()) else "degraded",
        "checks": checks,
    }
