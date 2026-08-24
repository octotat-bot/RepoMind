"""RepoMind API entry point.

Run locally with:  uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ai.llm import close_chat_model, get_chat_model
from app.api import api_router
from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging, get_logger
from database.session import dispose_engine, init_database
from embeddings.factory import close_embedder

configure_logging("DEBUG" if settings.debug else "INFO")
logger = get_logger(__name__)

DESCRIPTION = """
RepoMind indexes any public GitHub repository and answers questions about it
with retrieval-augmented generation, citing the exact files and line ranges the
answer came from.

Retrieval always runs on **FAISS**. Generation and embeddings are pluggable: by
default both run locally through **Ollama**, and deployed instances point at a
hosted OpenAI-compatible endpoint plus in-process ONNX embeddings, because no
free host offers a GPU.
"""


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.ensure_directories()
    await init_database()

    status = await get_chat_model().status()
    if status.ok:
        logger.info("Chat: %s via %s", status.model, status.provider)
    else:
        # Not fatal: the API still serves auth, listings and cached results.
        logger.warning("Chat backend '%s' is not ready: %s", status.provider, status.detail)

    logger.info(
        "Embeddings: %s (%s)",
        settings.embedding_provider,
        settings.ollama_embed_model
        if settings.embedding_provider == "ollama"
        else settings.fastembed_model,
    )

    logger.info("%s ready on %s", settings.app_name, settings.api_prefix)
    yield

    await close_chat_model()
    await close_embedder()
    await dispose_engine()


app = FastAPI(
    title=f"{settings.app_name} API",
    description=DESCRIPTION,
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

if not settings.cors_origins and not settings.cors_origin_regex:
    logger.warning(
        "CORS_ORIGINS is empty — every browser request will be blocked. "
        "Set it to the exact frontend origin, e.g. https://your-app.vercel.app"
    )

register_exception_handlers(app)
app.include_router(api_router, prefix=settings.api_prefix)


@app.get("/", tags=["system"])
async def root() -> dict[str, str]:
    return {
        "name": settings.app_name,
        "version": "1.0.0",
        "docs": "/docs",
        "api": settings.api_prefix,
    }
