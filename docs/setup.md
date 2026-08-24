# Setup guide

Two paths: run everything locally (best for development and fastest inference on
Apple Silicon), or run the whole stack with Docker.

---

## Prerequisites

| Requirement | Version | Notes |
| --- | --- | --- |
| Python | 3.11+ | 3.13 recommended |
| Node.js | 20+ | 22 recommended |
| git | any | The pipeline shells out to it |
| Ollama | latest | [ollama.com/download](https://ollama.com/download) |
| PostgreSQL | 14+ | Optional — SQLite is the zero-setup default |

Roughly 4 GB of disk is needed for the two models plus cloned repositories.

---

## 1. Ollama

RepoMind runs entirely on local models. Pull both:

```bash
ollama pull nomic-embed-text   # 274 MB — embeddings
ollama pull llama3.2:3b        # 2.0 GB — generation
```

Start the server if it is not already running:

```bash
ollama serve
```

Verify:

```bash
curl http://localhost:11434/api/tags
```

> A larger generation model gives noticeably better answers if you have the
> memory. Pull it and set `OLLAMA_CHAT_MODEL` accordingly — `llama3.1:8b` and
> `qwen2.5-coder:7b` both work well, and the latter is particularly strong on
> code.

---

## 2. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(48))"   # paste into JWT_SECRET
```

Start it:

```bash
uvicorn main:app --reload --port 8000
```

Confirm every dependency is healthy:

```bash
curl http://localhost:8000/api/v1/health/ready
```

`status: "ok"` means the database and both Ollama models are reachable. Anything
missing is named explicitly in the response.

The database defaults to SQLite at `data/repomind.db` and tables are created on
startup, so no migration step is needed to get going.

### Using PostgreSQL instead

```bash
createdb repomind
```

Set in `backend/.env`:

```
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/repomind
```

Tables are still created automatically on startup. To manage the schema with
Prisma migrations instead:

```bash
cd database
npm install
DATABASE_URL="postgresql://user:password@localhost:5432/repomind" npx prisma migrate dev --name init
```

---

## 3. Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Open <http://localhost:3000>.

`npm run dev` first runs `scripts/sync-shared.mjs`, which vendors
`shared/constants.json` into the frontend so both sides share one definition of
languages, ignore rules and retrieval parameters.

---

## 4. Seed a demo account

```bash
backend/.venv/bin/python database/seed.py
```

Creates `demo@repomind.dev` / `demo12345`.

Add `--with-repo` to also import and fully index `psf/requests` (about 20
seconds on an M-series Mac), which gives you something to query immediately:

```bash
backend/.venv/bin/python database/seed.py --with-repo
```

It is safe to re-run: an existing account is reused, and a repository that is
already indexed is left alone. Other flags:

| Flag | Effect |
| --- | --- |
| `--force` | Re-index the sample repository even if it is already indexed |
| `--repo URL` | Seed a different repository |
| `--email` / `--password` | Use different demo credentials |
| `--reset` | Drop every table **and** delete all clones and vector indexes |

`--reset` is destructive: it removes every account. It also clears
`data/repos/` and `faiss/indexes/`, which would otherwise be left orphaned —
hundreds of megabytes of checkouts that no database row references.

The script exits non-zero if indexing fails, so it can be used in a script or
CI step.

---

## Docker

Runs Postgres, Ollama, the API and the web app together:

```bash
docker compose up --build
```

The `ollama-pull` service fetches both models on first start, so the initial run
takes several minutes. Then open <http://localhost:3000>.

> **macOS and Windows:** Docker cannot access the GPU, so generation inside the
> container is slow. Run Ollama natively on the host instead and point the
> backend at it:
>
> ```bash
> docker compose up -d postgres backend frontend
> OLLAMA_BASE_URL=http://host.docker.internal:11434 docker compose up -d backend
> ```

---

## Verifying the whole pipeline

With the backend running:

```bash
backend/.venv/bin/python backend/tests/e2e_smoke.py psf/requests
```

This registers a user, imports a real repository, watches indexing to
completion, then exercises search, architecture analysis, dead-code detection,
streaming chat with citations, and deletion. Every step prints PASS or FAIL.

Unit tests:

```bash
cd backend && .venv/bin/pytest tests/ -v
```

---

## Troubleshooting

**`Could not reach Ollama at http://localhost:11434`**
`ollama serve` is not running. Start it and re-check `/api/v1/health/ready`.

**`Ollama does not have 'llama3.2:3b'`**
Pull it: `ollama pull llama3.2:3b`. The exact tag matters — `llama3.2` and
`llama3.2:3b` are different names to Ollama. `GET /api/v1/health/ready` lists
what is actually installed.

**Indexing fails with "No supported source files were found"**
The repository contains only binaries or unsupported languages. Supported
extensions are listed in `shared/constants.json`.

**`Could not find owner/repo. Public repositories only.`**
Private repositories are not supported; cloning is unauthenticated.

**GitHub metadata is missing (0 stars, no description)**
Unauthenticated API requests are limited to 60/hour. Set `GITHUB_TOKEN` in
`backend/.env` to raise it to 5000/hour. This never blocks an import — the clone
is the source of truth and metadata is best-effort.

**CORS errors in the browser**
`CORS_ORIGINS` in `backend/.env` must include the frontend origin exactly,
including port and scheme.

**Frontend cannot reach the API**
Set `NEXT_PUBLIC_API_URL` in `frontend/.env.local`. It is inlined at build time,
so a deployed frontend must be rebuilt after changing it.

**Chat returns "still indexing"**
Wait for `READY`. Watch progress live in the UI, or poll `GET /api/v1/repo/{id}`.
