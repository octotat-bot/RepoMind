"""Auth primitives, GitHub URL parsing and path-traversal defence."""

from __future__ import annotations

import time

import jwt
import pytest

from app.core.config import Settings
from app.core.errors import ValidationError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.services.file_service import _safe_join
from ingest.github import parse_repo_url


# ── Passwords ────────────────────────────────────────────────────────────────

def test_password_round_trip() -> None:
    digest = hash_password("correct horse battery staple")
    assert digest != "correct horse battery staple"
    assert verify_password("correct horse battery staple", digest)
    assert not verify_password("wrong password", digest)


def test_password_hashes_are_salted() -> None:
    assert hash_password("same") != hash_password("same")


def test_long_passwords_do_not_raise() -> None:
    """bcrypt rejects inputs over 72 bytes, so they must be truncated first."""
    long_password = "a" * 200
    digest = hash_password(long_password)
    assert verify_password(long_password, digest)


def test_verify_rejects_malformed_hash() -> None:
    assert not verify_password("anything", "not-a-bcrypt-hash")


# ── Tokens ───────────────────────────────────────────────────────────────────

def test_access_token_round_trip() -> None:
    token = create_access_token("user-123")
    payload = decode_token(token, "access")
    assert payload["sub"] == "user-123"
    assert payload["type"] == "access"


def test_token_type_is_enforced() -> None:
    """A refresh token must never be accepted where an access token is required."""
    refresh = create_refresh_token("user-123")
    with pytest.raises(jwt.InvalidTokenError):
        decode_token(refresh, "access")


def test_tampered_token_is_rejected() -> None:
    token = create_access_token("user-123")
    tampered = f"{token[:-4]}beef"
    with pytest.raises(jwt.InvalidTokenError):
        decode_token(tampered, "access")


def test_token_signed_with_another_secret_is_rejected() -> None:
    forged = jwt.encode(
        {"sub": "attacker", "type": "access", "exp": int(time.time()) + 600},
        "some-other-secret",
        algorithm="HS256",
    )
    with pytest.raises(jwt.InvalidTokenError):
        decode_token(forged, "access")


def test_tokens_are_unique_per_issue() -> None:
    """Distinct jti values make individual tokens revocable later."""
    first = decode_token(create_access_token("u"), "access")
    second = decode_token(create_access_token("u"), "access")
    assert first["jti"] != second["jti"]


# ── GitHub URL parsing ───────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "raw",
    [
        "https://github.com/vercel/next.js",
        "http://github.com/vercel/next.js",
        "https://www.github.com/vercel/next.js",
        "github.com/vercel/next.js",
        "https://github.com/vercel/next.js.git",
        "git@github.com:vercel/next.js.git",
        "vercel/next.js",
        "https://github.com/vercel/next.js/",
        "https://github.com/vercel/next.js?tab=readme",
        "https://github.com/vercel/next.js#readme",
    ],
)
def test_url_forms_normalise_to_the_same_reference(raw: str) -> None:
    ref = parse_repo_url(raw)
    assert ref.owner == "vercel"
    assert ref.name == "next.js"
    assert ref.full_name == "vercel/next.js"
    assert ref.clone_url == "https://github.com/vercel/next.js.git"


def test_branch_is_extracted_from_tree_urls() -> None:
    ref = parse_repo_url("https://github.com/vercel/next.js/tree/canary")
    assert ref.branch == "canary"


@pytest.mark.parametrize("raw", ["", "   ", "not a url", "https://gitlab.com/a/b", "https://github.com/"])
def test_invalid_urls_are_rejected(raw: str) -> None:
    with pytest.raises(ValidationError):
        parse_repo_url(raw)


# ── Path traversal ───────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "path",
    ["../../../etc/passwd", "/etc/passwd", "src/../../../../etc/passwd", "", "a\x00b"],
)
def test_traversal_attempts_are_blocked(tmp_path, path: str) -> None:
    with pytest.raises(ValidationError):
        _safe_join(tmp_path, path)


def test_legitimate_paths_resolve(tmp_path) -> None:
    target = tmp_path / "src" / "main.py"
    target.parent.mkdir(parents=True)
    target.write_text("print('hello')")

    assert _safe_join(tmp_path, "src/main.py") == target.resolve()


# ── Connection strings copied from managed Postgres providers ────────────────


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        # Neon hands out exactly this shape, and both extra parameters break asyncpg.
        (
            "postgresql://u:p@ep-x.aws.neon.tech/db?sslmode=require&channel_binding=require",
            "postgresql+asyncpg://u:p@ep-x.aws.neon.tech/db?ssl=require",
        ),
        # Render and Heroku still use the legacy postgres:// scheme.
        (
            "postgres://u:p@host:5432/db",
            "postgresql+asyncpg://u:p@host:5432/db",
        ),
        (
            "postgresql://u:p@host/db?sslmode=require",
            "postgresql+asyncpg://u:p@host/db?ssl=require",
        ),
        # sslmode=disable genuinely means no TLS, so it must not become ssl=require.
        (
            "postgresql://u:p@host/db?sslmode=disable",
            "postgresql+asyncpg://u:p@host/db",
        ),
        # Unrelated parameters are preserved.
        (
            "postgresql://u:p@host/db?application_name=repomind",
            "postgresql+asyncpg://u:p@host/db?application_name=repomind",
        ),
        # An explicit async URL is left alone.
        (
            "postgresql+asyncpg://u:p@host/db",
            "postgresql+asyncpg://u:p@host/db",
        ),
    ],
)
def test_database_urls_are_normalised_for_asyncpg(given: str, expected: str) -> None:
    assert Settings(database_url=given).database_url == expected


def test_sqlite_url_gets_the_async_driver() -> None:
    assert Settings(database_url="sqlite:///./local.db").database_url == (
        "sqlite+aiosqlite:///./local.db"
    )


# ── CORS origin parsing ──────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        ("https://a.vercel.app", ["https://a.vercel.app"]),
        # A trailing slash never matches: browsers send the bare origin.
        ("https://a.vercel.app/", ["https://a.vercel.app"]),
        ("https://a.app, https://b.app", ["https://a.app", "https://b.app"]),
        ("  https://a.app  ,  ", ["https://a.app"]),
        # An empty value must not silently allow nothing while looking healthy.
        ("", []),
    ],
)
def test_cors_origins_are_parsed_from_a_plain_list(given: str, expected: list[str]) -> None:
    assert Settings(cors_origins=given).cors_origins == expected
