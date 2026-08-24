"""Aggregate every route module under a single versioned router."""

from fastapi import APIRouter

from app.api import (
    routes_analysis,
    routes_auth,
    routes_chat,
    routes_health,
    routes_repos,
)

api_router = APIRouter()
api_router.include_router(routes_health.router)
api_router.include_router(routes_auth.router)
api_router.include_router(routes_repos.router)
api_router.include_router(routes_chat.router)
api_router.include_router(routes_analysis.router)

__all__ = ["api_router"]
