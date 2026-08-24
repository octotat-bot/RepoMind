"""Shallow git cloning driven through asyncio subprocesses.

Cloning is done with ``--depth 1 --filter=blob:none`` so importing a large
repository stays fast and never blocks the event loop.
"""

from __future__ import annotations

import asyncio
import shutil
from pathlib import Path

from app.core.config import settings
from app.core.errors import UpstreamError
from app.core.logging import get_logger
from ingest.github import RepoRef

logger = get_logger(__name__)


def repo_workdir(repository_id: str) -> Path:
    return settings.repos_dir / repository_id


async def _run_git(*args: str, cwd: Path | None = None, timeout: int) -> tuple[int, str]:
    process = await asyncio.create_subprocess_exec(
        "git",
        *args,
        cwd=str(cwd) if cwd else None,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        env={"GIT_TERMINAL_PROMPT": "0", "PATH": "/usr/bin:/bin:/usr/local/bin"},
    )
    try:
        stdout, _ = await asyncio.wait_for(process.communicate(), timeout=timeout)
    except TimeoutError:
        process.kill()
        await process.wait()
        raise UpstreamError(f"git {args[0]} timed out after {timeout}s") from None
    return process.returncode or 0, stdout.decode("utf-8", errors="replace")


async def clone_repository(ref: RepoRef, destination: Path) -> Path:
    """Clone ``ref`` into ``destination``, replacing anything already there."""
    if destination.exists():
        shutil.rmtree(destination, ignore_errors=True)
    destination.parent.mkdir(parents=True, exist_ok=True)

    args = [
        "clone",
        "--depth",
        str(settings.clone_depth),
        "--single-branch",
        "--filter=blob:none",
        "--no-tags",
        "--quiet",
    ]
    if ref.branch:
        args += ["--branch", ref.branch]
    args += [ref.clone_url, str(destination)]

    logger.info("Cloning %s into %s", ref.full_name, destination)
    code, output = await _run_git(*args, timeout=settings.clone_timeout_seconds)

    if code != 0:
        shutil.rmtree(destination, ignore_errors=True)
        raise UpstreamError(_friendly_clone_error(ref, output))

    return destination


def _friendly_clone_error(ref: RepoRef, output: str) -> str:
    lowered = output.lower()
    if "not found" in lowered or "repository not found" in lowered:
        return f"Could not find {ref.full_name}. Public repositories only."
    if "could not resolve host" in lowered or "network" in lowered:
        return "Could not reach github.com. Check your network connection."
    if "authentication" in lowered or "permission denied" in lowered:
        return f"{ref.full_name} appears to be private."
    detail = output.strip().splitlines()[-1] if output.strip() else "unknown error"
    return f"git clone failed: {detail}"


async def read_head_commit(directory: Path) -> str | None:
    code, output = await _run_git("rev-parse", "HEAD", cwd=directory, timeout=30)
    return output.strip() if code == 0 else None


async def read_default_branch(directory: Path) -> str | None:
    code, output = await _run_git(
        "rev-parse", "--abbrev-ref", "HEAD", cwd=directory, timeout=30
    )
    return output.strip() if code == 0 else None


def remove_workdir(repository_id: str) -> None:
    target = repo_workdir(repository_id)
    if target.exists():
        shutil.rmtree(target, ignore_errors=True)
        logger.info("Removed working directory %s", target)
