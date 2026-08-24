"""Seed the database with a demo account and, optionally, a sample repository.

    python database/seed.py                     # demo user only
    python database/seed.py --with-repo         # also import psf/requests
    python database/seed.py --with-repo --force # re-index it even if present
    python database/seed.py --reset             # wipe tables, clones and indexes

Run it with the backend virtualenv so the ORM and settings are importable:

    backend/.venv/bin/python database/seed.py --with-repo

Safe to re-run: an existing demo user is reused, and a repository that is
already indexed is left alone unless --force is passed.
"""

# The imports below resolve only after backend/ is put on sys.path at runtime,
# which static analysis cannot follow.
# pyright: reportMissingImports=false

from __future__ import annotations

import argparse
import asyncio
import shutil
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

from sqlalchemy import select  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.errors import RepoMindError  # noqa: E402
from app.core.logging import configure_logging, get_logger  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.services import repo_service  # noqa: E402
from database.base import SessionFactory, new_id  # noqa: E402
from database.enums import IndexStatus  # noqa: E402
from database.models.repository import Repository  # noqa: E402
from database.models.user import User  # noqa: E402
from database.session import drop_database, init_database  # noqa: E402

logger = get_logger("seed")

DEMO_EMAIL = "demo@repomind.dev"
DEMO_PASSWORD = "demo12345"
DEMO_NAME = "Demo User"
SAMPLE_REPO = "https://github.com/psf/requests"

# Indexing psf/requests takes ~20s locally; allow generously for slower hosts
# and larger repositories without hanging forever.
INDEX_TIMEOUT_SECONDS = 900


def clear_disk_artifacts() -> None:
    """Remove clones and vector indexes.

    Dropping the tables alone would orphan these: hundreds of megabytes of
    checkouts and FAISS files that no row references any more.
    """
    for directory in (settings.repos_dir, settings.faiss_dir):
        if not directory.exists():
            continue
        for entry in directory.iterdir():
            if entry.name == ".gitkeep":
                continue
            shutil.rmtree(entry, ignore_errors=True) if entry.is_dir() else entry.unlink(
                missing_ok=True
            )
        logger.info("Cleared %s", directory)


async def get_or_create_user(session, email: str, password: str, name: str) -> User:
    user = (
        await session.execute(select(User).where(User.email == email))
    ).scalar_one_or_none()

    if user is not None:
        logger.info("Demo user already exists: %s", email)
        return user

    user = User(id=new_id(), email=email, name=name, password_hash=hash_password(password))
    session.add(user)
    await session.commit()
    await session.refresh(user)
    logger.info("Created demo user %s", email)
    return user


async def wait_for_indexing(session, repository: Repository) -> bool:
    """Block until indexing settles. Returns True when it reached READY."""
    last_message: str | None = None

    for _ in range(INDEX_TIMEOUT_SECONDS):
        await session.refresh(repository)
        if repository.status.is_terminal:
            break

        # Log only when something changes; refreshing every second would
        # otherwise print the same line twenty times.
        message = f"{repository.progress:3d}%  {repository.status_message or ''}"
        if message != last_message:
            logger.info("  %s", message)
            last_message = message

        await asyncio.sleep(1)
    else:
        logger.error(
            "Indexing did not finish within %d seconds (last status: %s).",
            INDEX_TIMEOUT_SECONDS,
            repository.status.value,
        )
        return False

    if repository.status == IndexStatus.READY:
        logger.info(
            "Indexed %s: %d files, %d chunks",
            repository.full_name,
            repository.file_count,
            repository.chunk_count,
        )
        return True

    logger.error("Indexing failed: %s", repository.error_message or "unknown error")
    return False


async def seed_repository(session, user: User, url: str, force: bool) -> bool:
    """Import and index ``url`` for ``user``. Returns True on success."""
    existing = (
        await session.execute(
            select(Repository).where(
                Repository.user_id == user.id, Repository.url == url
            )
        )
    ).scalar_one_or_none()

    # Re-importing an already-indexed repository raises ConflictError, so decide
    # here rather than letting the service refuse.
    if existing is not None and not force:
        if existing.status == IndexStatus.READY:
            logger.info(
                "%s is already indexed (%d files, %d chunks). Use --force to re-index.",
                existing.full_name,
                existing.file_count,
                existing.chunk_count,
            )
            return True
        if existing.status.is_active:
            logger.info("%s is already being indexed; waiting.", existing.full_name)
            return await wait_for_indexing(session, existing)
        logger.info("%s previously failed; re-indexing.", existing.full_name)

    logger.info("Importing %s — this runs the full pipeline", url)
    repository = await repo_service.import_repository(
        session, user.id, url, force=existing is not None
    )
    return await wait_for_indexing(session, repository)


async def seed(*, reset: bool, with_repo: bool, force: bool, url: str,
               email: str, password: str) -> int:
    """Returns a process exit code."""
    if reset:
        logger.warning("Dropping all tables")
        await drop_database()
        clear_disk_artifacts()

    await init_database()

    async with SessionFactory() as session:
        user = await get_or_create_user(session, email, password, DEMO_NAME)

        if with_repo:
            try:
                if not await seed_repository(session, user, url, force):
                    return 1
            except RepoMindError as exc:
                # Bad URL, private repository, GitHub unreachable — all expected
                # failures that should not surface as a traceback.
                logger.error("Could not import %s: %s", url, exc.message)
                return 1

    print("\n  Seed complete.")
    print(f"    email:    {email}")
    print(f"    password: {password}\n")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the RepoMind database.")
    parser.add_argument("--reset", action="store_true",
                        help="drop all tables and delete clones and indexes first")
    parser.add_argument("--with-repo", action="store_true",
                        help="also import and index a sample repository")
    parser.add_argument("--force", action="store_true",
                        help="re-index the sample repository even if it is already indexed")
    parser.add_argument("--repo", default=SAMPLE_REPO,
                        help=f"repository to import (default: {SAMPLE_REPO})")
    parser.add_argument("--email", default=DEMO_EMAIL,
                        help=f"demo account email (default: {DEMO_EMAIL})")
    parser.add_argument("--password", default=DEMO_PASSWORD,
                        help="demo account password")
    args = parser.parse_args()

    configure_logging()
    try:
        exit_code = asyncio.run(
            seed(
                reset=args.reset,
                with_repo=args.with_repo,
                force=args.force,
                url=args.repo,
                email=args.email,
                password=args.password,
            )
        )
    except KeyboardInterrupt:
        # Interrupting mid-index leaves a repository stuck in a non-terminal
        # state; say so rather than dumping a traceback.
        print("\n  Interrupted. Re-run with --force to finish an incomplete import.\n")
        exit_code = 130

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
