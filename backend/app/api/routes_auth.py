"""Authentication endpoints."""

from __future__ import annotations

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, SessionDep
from app.schemas.auth import (
    AuthResponse,
    ChangePasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UpdateProfileRequest,
    UserResponse,
)
from app.schemas.common import MessageResponse
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, session: SessionDep) -> AuthResponse:
    user = await auth_service.register(
        session, payload.email, payload.name, payload.password
    )
    return AuthResponse(
        user=UserResponse.model_validate(user),
        tokens=TokenResponse.model_validate(auth_service.issue_tokens(user)),
    )


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, session: SessionDep) -> AuthResponse:
    user = await auth_service.authenticate(session, payload.email, payload.password)
    return AuthResponse(
        user=UserResponse.model_validate(user),
        tokens=TokenResponse.model_validate(auth_service.issue_tokens(user)),
    )


@router.post("/refresh", response_model=AuthResponse)
async def refresh(payload: RefreshRequest, session: SessionDep) -> AuthResponse:
    user, tokens = await auth_service.refresh_tokens(session, payload.refresh_token)
    return AuthResponse(
        user=UserResponse.model_validate(user),
        tokens=TokenResponse.model_validate(tokens),
    )


@router.get("/me", response_model=UserResponse)
async def me(user: CurrentUser) -> UserResponse:
    return UserResponse.model_validate(user)


@router.patch("/me", response_model=UserResponse)
async def update_me(
    payload: UpdateProfileRequest, user: CurrentUser, session: SessionDep
) -> UserResponse:
    updated = await auth_service.update_profile(
        session, user, payload.name, payload.avatar_url
    )
    return UserResponse.model_validate(updated)


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    payload: ChangePasswordRequest, user: CurrentUser, session: SessionDep
) -> MessageResponse:
    await auth_service.change_password(
        session, user, payload.current_password, payload.new_password
    )
    return MessageResponse(message="Password updated.")
