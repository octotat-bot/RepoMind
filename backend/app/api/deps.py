"""Shared FastAPI dependencies."""

from __future__ import annotations

from typing import Annotated

import jwt
from fastapi import Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AuthError
from app.core.security import decode_token
from app.services import repo_service
from database.base import get_session
from database.models.repository import Repository
from database.models.user import User

# auto_error=False lets us raise our own JSON error shape instead of FastAPI's.
_bearer = HTTPBearer(auto_error=False, description="JWT access token")

SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def _user_from_token(session: AsyncSession, token: str) -> User:
    try:
        payload = decode_token(token, "access")
    except jwt.ExpiredSignatureError as exc:
        raise AuthError("Your session has expired. Please sign in again.") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthError("Invalid authentication token.") from exc

    user = await session.get(User, payload["sub"])
    if user is None or not user.is_active:
        raise AuthError("Account no longer exists.")
    return user


async def get_current_user(
    session: SessionDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)] = None,
) -> User:
    if credentials is None or not credentials.credentials:
        raise AuthError("Authentication required.")
    return await _user_from_token(session, credentials.credentials)


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_current_user_sse(
    session: SessionDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)] = None,
    token: Annotated[str | None, Query(description="Access token for EventSource clients")] = None,
) -> User:
    """Authenticate SSE endpoints.

    ``EventSource`` cannot set an Authorization header, so these routes also
    accept the access token as a query parameter.
    """
    raw = credentials.credentials if credentials else token
    if not raw:
        raise AuthError("Authentication required.")
    return await _user_from_token(session, raw)


SSEUser = Annotated[User, Depends(get_current_user_sse)]


async def get_owned_repository(
    repo_id: str,
    session: SessionDep,
    user: CurrentUser,
) -> Repository:
    """Load a repository, enforcing that it belongs to the caller."""
    return await repo_service.get_repository(session, user.id, repo_id)


OwnedRepository = Annotated[Repository, Depends(get_owned_repository)]
