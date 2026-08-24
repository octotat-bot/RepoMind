"""Repository import, listing, inspection and deletion."""

from __future__ import annotations

from fastapi import APIRouter, Query, status
from fastapi.responses import StreamingResponse

from app.api.deps import CurrentUser, OwnedRepository, SSEUser, SessionDep
from app.schemas.common import MessageResponse
from app.schemas.repo import (
    FileContentResponse,
    FileTreeResponse,
    ImportRequest,
    IndexRecordResponse,
    ProgressResponse,
    RepositoryDetailResponse,
    RepositoryResponse,
)
from app.services import analysis_service, file_service, progress, repo_service
from app.services.chat_stream import sse

router = APIRouter(prefix="/repo", tags=["repositories"])


@router.post("/import", response_model=RepositoryResponse, status_code=status.HTTP_202_ACCEPTED)
async def import_repository(
    payload: ImportRequest, user: CurrentUser, session: SessionDep
) -> RepositoryResponse:
    """Queue a repository for indexing; progress streams from ``/repo/{id}/progress``."""
    repository = await repo_service.import_repository(
        session, user.id, payload.url, force=payload.force
    )
    return RepositoryResponse.model_validate(repository)


@router.get("", response_model=list[RepositoryResponse])
async def list_repositories(user: CurrentUser, session: SessionDep) -> list[RepositoryResponse]:
    repositories = await repo_service.list_repositories(session, user.id)
    return [RepositoryResponse.model_validate(repo) for repo in repositories]


@router.get("/{repo_id}", response_model=RepositoryDetailResponse)
async def get_repository(
    repository: OwnedRepository, session: SessionDep
) -> RepositoryDetailResponse:
    languages = await repo_service.language_breakdown(session, repository.id)
    record = repository.index_record
    return RepositoryDetailResponse(
        repository=RepositoryResponse.model_validate(repository),
        index=IndexRecordResponse.model_validate(record) if record else None,
        languages=languages,
    )


@router.delete("/{repo_id}", response_model=MessageResponse)
async def delete_repository(
    repo_id: str, user: CurrentUser, session: SessionDep
) -> MessageResponse:
    await repo_service.delete_repository(session, user.id, repo_id)
    analysis_service.invalidate(repo_id)
    return MessageResponse(message="Repository deleted.")


@router.post("/{repo_id}/reindex", response_model=RepositoryResponse)
async def reindex_repository(
    repo_id: str, user: CurrentUser, session: SessionDep
) -> RepositoryResponse:
    analysis_service.invalidate(repo_id)
    repository = await repo_service.reindex_repository(session, user.id, repo_id)
    return RepositoryResponse.model_validate(repository)


@router.get("/{repo_id}/progress")
async def stream_progress(repo_id: str, user: SSEUser, session: SessionDep) -> StreamingResponse:
    """Live indexing progress as Server-Sent Events."""
    repository = await repo_service.get_repository(session, user.id, repo_id)

    async def event_stream():
        # Emit current database state first so a reconnecting client is never
        # left staring at an empty progress bar.
        yield sse("progress", ProgressResponse(
            repository_id=repository.id,
            status=repository.status,
            progress=repository.progress,
            message=repository.status_message or "Waiting…",
            error=repository.error_message,
        ).model_dump(by_alias=True))

        if repository.status.is_terminal:
            return

        async for event in progress.subscribe(repository.id):
            yield sse("progress", event.to_dict())

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@router.get("/{repo_id}/files", response_model=FileTreeResponse)
async def get_file_tree(repository: OwnedRepository, session: SessionDep) -> FileTreeResponse:
    tree = await repo_service.file_tree(session, repository.id)
    return FileTreeResponse(tree=tree, file_count=repository.file_count)


@router.get("/{repo_id}/file", response_model=FileContentResponse)
async def get_file_content(
    repository: OwnedRepository,
    session: SessionDep,
    path: str = Query(min_length=1, max_length=1024, description="Repository-relative path"),
) -> FileContentResponse:
    content = await file_service.get_file_content(session, repository.id, path)
    return FileContentResponse.model_validate(content)
