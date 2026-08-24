"""Repository lifecycle: import, list, inspect, delete."""

from __future__ import annotations

import asyncio

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.core.logging import get_logger
from app.services.indexing_service import run_indexing_job
from app.services.progress import forget
from database.base import new_id
from database.enums import IndexStatus
from database.models.code import CodeChunk, RepositoryFile
from database.models.repository import Repository
from ingest.file_walker import build_file_tree, DiscoveredFile
from ingest.git_clone import remove_workdir
from ingest.github import fetch_metadata, parse_repo_url
from vectorstore import registry

logger = get_logger(__name__)

# Background tasks must be referenced or the event loop may garbage-collect them.
_running: set[asyncio.Task] = set()


async def import_repository(
    session: AsyncSession, user_id: str, url: str, *, force: bool = False
) -> Repository:
    ref = parse_repo_url(url)

    existing = (
        await session.execute(
            select(Repository).where(
                Repository.user_id == user_id, Repository.full_name == ref.full_name
            )
        )
    ).scalar_one_or_none()

    if existing is not None and not force:
        if existing.status.is_active:
            return existing
        raise ConflictError(
            f"{ref.full_name} is already in your workspace.",
            details={"repositoryId": existing.id},
        )

    metadata = await fetch_metadata(ref)

    repository = existing or Repository(id=new_id(), user_id=user_id)
    repository.url = ref.html_url
    repository.owner = ref.owner
    repository.name = ref.name
    repository.full_name = ref.full_name
    repository.description = metadata.description
    repository.language = metadata.language
    repository.stars = metadata.stars
    repository.forks = metadata.forks
    repository.default_branch = ref.branch or metadata.default_branch
    repository.status = IndexStatus.QUEUED
    repository.progress = 0
    repository.status_message = "Queued for indexing"
    repository.error_message = None

    if existing is None:
        session.add(repository)
    await session.commit()
    await session.refresh(repository)

    if existing is not None:
        await _purge_index_artifacts(session, repository.id)

    _spawn(run_indexing_job(repository.id, ref))
    logger.info("Queued %s for indexing", repository.full_name)
    return repository


def _spawn(coroutine) -> None:
    task = asyncio.create_task(coroutine)
    _running.add(task)
    task.add_done_callback(_running.discard)


async def list_repositories(session: AsyncSession, user_id: str) -> list[Repository]:
    result = await session.execute(
        select(Repository)
        .where(Repository.user_id == user_id)
        .order_by(Repository.created_at.desc())
    )
    return list(result.scalars().all())


async def get_repository(session: AsyncSession, user_id: str, repository_id: str) -> Repository:
    repository = await session.get(Repository, repository_id)
    if repository is None or repository.user_id != user_id:
        raise NotFoundError("Repository not found.")
    return repository


async def delete_repository(session: AsyncSession, user_id: str, repository_id: str) -> None:
    repository = await get_repository(session, user_id, repository_id)

    await session.delete(repository)
    await session.commit()

    # Cascades clear the rows; these clear the bytes on disk.
    await registry.delete_index(repository_id)
    await asyncio.to_thread(remove_workdir, repository_id)
    forget(repository_id)
    logger.info("Deleted repository %s", repository_id)


async def reindex_repository(
    session: AsyncSession, user_id: str, repository_id: str
) -> Repository:
    repository = await get_repository(session, user_id, repository_id)
    return await import_repository(session, user_id, repository.url, force=True)


async def _purge_index_artifacts(session: AsyncSession, repository_id: str) -> None:
    from sqlalchemy import delete as sql_delete

    await session.execute(sql_delete(CodeChunk).where(CodeChunk.repository_id == repository_id))
    await session.execute(
        sql_delete(RepositoryFile).where(RepositoryFile.repository_id == repository_id)
    )
    await session.commit()
    await registry.delete_index(repository_id)


async def list_files(session: AsyncSession, repository_id: str) -> list[RepositoryFile]:
    result = await session.execute(
        select(RepositoryFile)
        .where(RepositoryFile.repository_id == repository_id)
        .order_by(RepositoryFile.path)
    )
    return list(result.scalars().all())


async def file_tree(session: AsyncSession, repository_id: str) -> dict:
    files = await list_files(session, repository_id)
    discovered = [
        DiscoveredFile(
            path=row.path,
            absolute=None,  # type: ignore[arg-type]  # unused by the tree builder
            name=row.name,
            extension=row.extension,
            language=row.language,
            size_bytes=row.size_bytes,
        )
        for row in files
    ]
    return build_file_tree(discovered)


async def language_breakdown(session: AsyncSession, repository_id: str) -> list[dict]:
    result = await session.execute(
        select(
            RepositoryFile.language,
            func.count(RepositoryFile.id),
            func.sum(RepositoryFile.size_bytes),
        )
        .where(RepositoryFile.repository_id == repository_id)
        .group_by(RepositoryFile.language)
        .order_by(func.count(RepositoryFile.id).desc())
    )
    return [
        {"language": language, "files": count, "bytes": int(size or 0)}
        for language, count, size in result.all()
    ]
