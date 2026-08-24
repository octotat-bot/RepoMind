# syntax=docker/dockerfile:1
#
# Build context is the PROJECT ROOT, not backend/, because the service also
# needs shared/constants.json:
#     docker build -f backend/Dockerfile .
#
# On Render, that means Root Directory must be left blank (the repository root)
# and Dockerfile Path set to `backend/Dockerfile`. Pointing Root Directory at
# backend/ instead makes the `COPY shared/` below fail, because shared/ is then
# outside the build context.

# ── Builder ───────────────────────────────────────────────────────────────────
# Wheels are built in a throwaway stage so the runtime image carries neither
# compilers nor build caches.
FROM python:3.13-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade pip \
    && /opt/venv/bin/pip install -r requirements.txt

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

# git is a runtime dependency: the ingestion pipeline shells out to clone.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1001 repomind

COPY --from=builder /opt/venv /opt/venv

WORKDIR /app
COPY --chown=repomind:repomind backend/ /app/backend/
COPY --chown=repomind:repomind shared/ /app/shared/

# Writable mount points for clones and FAISS indexes.
RUN mkdir -p /app/data/repos /app/faiss/indexes /app/data/models \
    && chown -R repomind:repomind /app

USER repomind
WORKDIR /app/backend

# Bake the embedding model into the image when one is configured. Downloading
# it lazily costs ~70 seconds on the first request after every deploy, and on a
# host with an ephemeral disk that cost is paid again after each restart.
ARG FASTEMBED_MODEL=""
RUN if [ -n "$FASTEMBED_MODEL" ]; then \
      python -c "from fastembed import TextEmbedding; \
TextEmbedding(model_name='$FASTEMBED_MODEL', cache_dir='/app/data/models')"; \
    fi

ENV PORT=8000
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS "http://localhost:${PORT}/api/v1/health" || exit 1

# Shell form so ${PORT} is expanded: hosts such as Render assign the port at
# runtime and expect the process to bind whatever they hand it.
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT}
