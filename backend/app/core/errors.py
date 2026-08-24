"""Domain exceptions and the handlers that render them as JSON."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.logging import get_logger

logger = get_logger(__name__)


class RepoMindError(Exception):
    """Base class for expected, user-facing failures."""

    status_code: int = status.HTTP_400_BAD_REQUEST
    code: str = "repomind_error"

    def __init__(self, message: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}


class NotFoundError(RepoMindError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "not_found"


class ConflictError(RepoMindError):
    status_code = status.HTTP_409_CONFLICT
    code = "conflict"


class ValidationError(RepoMindError):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    code = "validation_error"


class AuthError(RepoMindError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "unauthorized"


class ForbiddenError(RepoMindError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "forbidden"


class UpstreamError(RepoMindError):
    """A dependency we do not control failed (Ollama, GitHub, git)."""

    status_code = status.HTTP_502_BAD_GATEWAY
    code = "upstream_error"


class IndexingError(RepoMindError):
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    code = "indexing_error"


def _payload(code: str, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {"error": {"code": code, "message": message}}
    if details:
        body["error"]["details"] = details
    return body


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(RepoMindError)
    async def _handle_domain_error(_: Request, exc: RepoMindError) -> JSONResponse:
        if exc.status_code >= 500:
            logger.error("%s: %s", exc.code, exc.message, exc_info=exc)
        return JSONResponse(
            status_code=exc.status_code,
            content=_payload(exc.code, exc.message, exc.details),
        )

    @app.exception_handler(RequestValidationError)
    async def _handle_request_validation(
        _: Request, exc: RequestValidationError
    ) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else {}
        location = ".".join(str(part) for part in first.get("loc", [])[1:])
        message = first.get("msg", "Request validation failed")
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_payload(
                "validation_error",
                f"{location}: {message}" if location else message,
                {"errors": [
                    {"field": ".".join(str(p) for p in e.get("loc", [])[1:]),
                     "message": e.get("msg", "")}
                    for e in exc.errors()
                ]},
            ),
        )

    @app.exception_handler(Exception)
    async def _handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_payload("internal_error", "An unexpected error occurred."),
        )
