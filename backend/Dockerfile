# syntax=docker/dockerfile:1
#
# Build context is the PROJECT ROOT, not backend/, because the service also
# needs shared/constants.json:
#     docker build -f backend/Dockerfile .

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
RUN mkdir -p /app/data/repos /app/faiss/indexes \
    && chown -R repomind:repomind /app

USER repomind
WORKDIR /app/backend

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8000/api/v1/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
