"""Registration, login and token refresh."""

from __future__ import annotations

import jwt
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import AuthError, ConflictError, ForbiddenError
from app.core.logging import get_logger
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from database.base import new_id
from database.models.user import User

logger = get_logger(__name__)


def _normalise_email(email: str) -> str:
    return email.strip().lower()


async def find_by_email(session: AsyncSession, email: str) -> User | None:
    result = await session.execute(
        select(User).where(func.lower(User.email) == _normalise_email(email))
    )
    return result.scalar_one_or_none()


async def register(session: AsyncSession, email: str, name: str, password: str) -> User:
    if not settings.allow_registration:
        raise ForbiddenError("Registration is disabled on this instance.")

    if await find_by_email(session, email) is not None:
        raise ConflictError("An account with that email already exists.")

    user = User(
        id=new_id(),
        email=_normalise_email(email),
        name=name.strip() or _normalise_email(email).split("@")[0],
        password_hash=hash_password(password),
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    logger.info("Registered user %s", user.email)
    return user


async def authenticate(session: AsyncSession, email: str, password: str) -> User:
    user = await find_by_email(session, email)

    # Always run a hash comparison so a missing account and a wrong password
    # take the same time, leaking nothing about which emails exist.
    password_hash = user.password_hash if user else hash_password("timing-equaliser")
    is_valid = verify_password(password, password_hash)

    if user is None or not is_valid:
        raise AuthError("Incorrect email or password.")
    if not user.is_active:
        raise ForbiddenError("This account has been deactivated.")

    return user


def issue_tokens(user: User) -> dict[str, object]:
    return {
        "accessToken": create_access_token(user.id),
        "refreshToken": create_refresh_token(user.id),
        "tokenType": "bearer",
        "expiresIn": settings.access_token_ttl_minutes * 60,
    }


async def refresh_tokens(session: AsyncSession, refresh_token: str) -> tuple[User, dict]:
    try:
        payload = decode_token(refresh_token, "refresh")
    except jwt.ExpiredSignatureError as exc:
        raise AuthError("Your session has expired. Please sign in again.") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthError("Invalid refresh token.") from exc

    user = await session.get(User, payload["sub"])
    if user is None or not user.is_active:
        raise AuthError("Account no longer exists.")

    return user, issue_tokens(user)


async def change_password(
    session: AsyncSession, user: User, current_password: str, new_password: str
) -> None:
    if not verify_password(current_password, user.password_hash):
        raise AuthError("Your current password is incorrect.")
    user.password_hash = hash_password(new_password)
    await session.commit()


async def update_profile(
    session: AsyncSession, user: User, name: str | None, avatar_url: str | None
) -> User:
    if name is not None:
        user.name = name.strip() or user.name
    if avatar_url is not None:
        user.avatar_url = avatar_url.strip() or None
    await session.commit()
    await session.refresh(user)
    return user
