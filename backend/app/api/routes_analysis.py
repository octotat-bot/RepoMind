"""Semantic search, architecture generation and dead-code analysis."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from app.api.deps import OwnedRepository, SessionDep
from app.core.errors import ValidationError
from app.services import analysis_service, search_service
from database.enums import IndexStatus

router = APIRouter(tags=["analysis"])


def _require_ready(repository) -> None:
    if repository.status != IndexStatus.READY:
        raise ValidationError(
            f"{repository.full_name} is still {repository.status.value.lower()}. "
            "Wait for indexing to finish."
        )


@router.get("/repo/{repo_id}/search")
async def semantic_search(
    repository: OwnedRepository,
    session: SessionDep,
    q: str = Query(min_length=1, max_length=500, description="Natural-language query"),
    limit: int = Query(default=12, ge=1, le=50),
    group_by_file: bool = Query(default=True, alias="groupByFile"),
) -> dict[str, Any]:
    _require_ready(repository)
    return await search_service.search_repository(
        session, repository.id, q, limit=limit, group_by_file=group_by_file
    )


@router.get("/architecture/{repo_id}")
async def get_architecture(repository: OwnedRepository) -> dict[str, Any]:
    """Folder hierarchy, module relationships, dependency graph and tech stack."""
    _require_ready(repository)
    return await analysis_service.get_architecture(repository.id)


@router.get("/repo/{repo_id}/dead-code")
async def get_dead_code(repository: OwnedRepository) -> dict[str, Any]:
    _require_ready(repository)
    return await analysis_service.get_dead_code(repository.id)
