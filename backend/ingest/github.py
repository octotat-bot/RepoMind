"""GitHub URL parsing and repository metadata lookup."""

from __future__ import annotations

import re
from dataclasses import dataclass

import httpx

from app.core.config import settings
from app.core.errors import UpstreamError, ValidationError
from app.core.logging import get_logger

logger = get_logger(__name__)

GITHUB_API = "https://api.github.com"

# Accepts: full https URLs, scp-style git remotes, bare "owner/repo", and any of
# those with a trailing .git, /tree/<branch>, query string or fragment.
_PATTERNS = (
    re.compile(r"^(?:https?://)?(?:www\.)?github\.com/(?P<owner>[\w.-]+)/(?P<name>[\w.-]+)"),
    re.compile(r"^git@github\.com:(?P<owner>[\w.-]+)/(?P<name>[\w.-]+)"),
    re.compile(r"^(?P<owner>[\w.-]+)/(?P<name>[\w.-]+)$"),
)

_BRANCH_PATTERN = re.compile(r"github\.com/[\w.-]+/[\w.-]+/tree/(?P<branch>[\w./-]+)")


@dataclass(frozen=True)
class RepoRef:
    owner: str
    name: str
    branch: str | None = None

    @property
    def full_name(self) -> str:
        return f"{self.owner}/{self.name}"

    @property
    def clone_url(self) -> str:
        return f"https://github.com/{self.owner}/{self.name}.git"

    @property
    def html_url(self) -> str:
        return f"https://github.com/{self.owner}/{self.name}"


@dataclass(frozen=True)
class RepoMetadata:
    description: str | None = None
    language: str | None = None
    stars: int = 0
    forks: int = 0
    default_branch: str = "main"
    size_kb: int = 0
    is_fallback: bool = False


def parse_repo_url(raw: str) -> RepoRef:
    """Normalise any common GitHub reference into an owner/name pair."""
    candidate = (raw or "").strip()
    if not candidate:
        raise ValidationError("Repository URL is required.")

    candidate = candidate.split("?")[0].split("#")[0].rstrip("/")

    branch_match = _BRANCH_PATTERN.search(candidate)
    branch = branch_match.group("branch") if branch_match else None

    for pattern in _PATTERNS:
        match = pattern.match(candidate)
        if match:
            name = match.group("name")
            if name.endswith(".git"):
                name = name[:-4]
            owner = match.group("owner")
            if not owner or not name:
                break
            return RepoRef(owner=owner, name=name, branch=branch)

    raise ValidationError(
        "That does not look like a GitHub repository. "
        "Try a URL such as https://github.com/vercel/next.js"
    )


async def fetch_metadata(ref: RepoRef) -> RepoMetadata:
    """Best-effort metadata lookup.

    A failure here must never block an import — the clone is the source of
    truth, so we fall back to neutral defaults and carry on.
    """
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "RepoMind"}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"

    url = f"{GITHUB_API}/repos/{ref.owner}/{ref.name}"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers)
    except httpx.HTTPError as exc:
        logger.warning("GitHub metadata request failed for %s: %s", ref.full_name, exc)
        return RepoMetadata(is_fallback=True)

    if response.status_code == 404:
        raise UpstreamError(
            f"Repository {ref.full_name} was not found. It may be private or renamed."
        )
    if response.status_code == 403:
        logger.warning("GitHub rate limit hit for %s", ref.full_name)
        return RepoMetadata(is_fallback=True)
    if response.status_code >= 400:
        logger.warning("GitHub returned %s for %s", response.status_code, ref.full_name)
        return RepoMetadata(is_fallback=True)

    payload = response.json()
    return RepoMetadata(
        description=payload.get("description"),
        language=payload.get("language"),
        stars=payload.get("stargazers_count", 0) or 0,
        forks=payload.get("forks_count", 0) or 0,
        default_branch=payload.get("default_branch") or "main",
        size_kb=payload.get("size", 0) or 0,
    )
