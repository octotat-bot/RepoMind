"""Serve source-file content to the workspace viewer."""

from __future__ import annotations

import asyncio
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.core.shared_config import limits
from database.models.code import RepositoryFile
from ingest.file_walker import read_text
from ingest.git_clone import repo_workdir

logger = get_logger(__name__)


def _safe_join(root: Path, relative_path: str) -> Path:
    """Resolve ``relative_path`` inside ``root``, refusing to escape it.

    The path arrives from the client, so traversal (``../``), absolute paths and
    symlinks that point outside the checkout are all rejected here.
    """
    if not relative_path or relative_path.startswith("/") or "\x00" in relative_path:
        raise ValidationError("Invalid file path.")

    root = root.resolve()
    candidate = (root / relative_path).resolve()

    if not candidate.is_relative_to(root):
        logger.warning("Blocked path traversal attempt: %r", relative_path)
        raise ValidationError("Invalid file path.")

    return candidate


async def get_file_content(
    session: AsyncSession, repository_id: str, path: str
) -> dict:
    record = (
        await session.execute(
            select(RepositoryFile).where(
                RepositoryFile.repository_id == repository_id,
                RepositoryFile.path == path,
            )
        )
    ).scalar_one_or_none()

    if record is None:
        raise NotFoundError(f"{path} is not part of this repository's index.")

    # On an ephemeral host the row itself carries the text, so the viewer keeps
    # working after a restart has wiped the checkout.
    if record.content is not None:
        return _payload(record, record.content)

    absolute = _safe_join(repo_workdir(repository_id), path)
    if not absolute.is_file():
        # The checkout may be restorable from previously stored file contents.
        from app.services.rehydrate import ensure_workdir

        if await ensure_workdir(repository_id) is None or not absolute.is_file():
            raise NotFoundError(
                f"{path} is no longer on disk. Re-index the repository to restore it."
            )

    if absolute.stat().st_size > limits().max_file_bytes:
        raise ValidationError("That file is too large to display.")

    content = await asyncio.to_thread(read_text, absolute)
    if content is None:
        raise ValidationError("That file could not be decoded as text.")

    return _payload(record, content)


def _payload(record: RepositoryFile, content: str) -> dict:
    return {
        "path": record.path,
        "name": record.name,
        "language": record.language,
        "sizeBytes": record.size_bytes,
        "lineCount": content.count("\n") + 1,
        "content": content,
    }
