"""Auth request/response schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import EmailStr, Field

from app.schemas.common import CamelModel

_PASSWORD = Field(min_length=8, max_length=128)


class RegisterRequest(CamelModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=120)
    password: str = _PASSWORD


class LoginRequest(CamelModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(CamelModel):
    refresh_token: str


class ChangePasswordRequest(CamelModel):
    current_password: str
    new_password: str = _PASSWORD


class UpdateProfileRequest(CamelModel):
    name: str | None = Field(default=None, max_length=120)
    avatar_url: str | None = Field(default=None, max_length=512)


class UserResponse(CamelModel):
    id: str
    email: str
    name: str
    avatar_url: str | None = None
    created_at: datetime


class TokenResponse(CamelModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class AuthResponse(CamelModel):
    user: UserResponse
    tokens: TokenResponse
