# Deploying RepoMind

A complete walkthrough for putting RepoMind online for free, with nothing
running on your machine.

**Result:** a public URL you can put on a CV, backed by Vercel (frontend),
Render (API), Neon (Postgres) and Groq (generation).

**Time:** about 40 minutes, most of it waiting for builds.

**Cost:** nothing. No credit card is required at any step.

---

## Why the deployed build differs from local

RepoMind is designed local-first, and three parts of that assume a machine you
control. Each has a hosted counterpart, selected by environment variable — the
code is identical, only the configuration differs.

| Concern | Local | Deployed | Why |
| --- | --- | --- | --- |
| Generation | Ollama, `llama3.2:3b` | Groq, `llama-3.1-8b-instant` | No free host has a GPU |
| Embeddings | Ollama, `nomic-embed-text` | fastembed ONNX, in-process | Same reason, but small enough to run on CPU |
| Database | SQLite file | Neon Postgres | Free hosts wipe the disk |
| FAISS index | Files on disk | Rebuilt from Postgres on demand | Same reason |
| Repository checkout | `git clone` on disk | Restored from Postgres on demand | Same reason |

That last pair matters more than it looks. Render's free tier deletes the
filesystem on every restart, redeploy and idle spin-down. Setting
`EPHEMERAL_FILESYSTEM=true` makes indexing also write the embedding vectors and
file text into Postgres, so after a restart the FAISS index is rebuilt in
milliseconds and the working tree is written back on first use — no re-cloning,
no re-embedding, and no repeated API calls.

> **Nothing local stays required.** Ollama is only used when
> `CHAT_PROVIDER=ollama` or `EMBEDDING_PROVIDER=ollama`. The deployed
> configuration sets neither.

---

## Before you start

Push the project to GitHub. Render and Vercel both deploy from a repository.

```bash
cd /path/to/repomind
git init
git add .
git commit -m "RepoMind"
gh repo create repomind --public --source=. --push
```

No `gh`? Create an empty repo on github.com, then:

```bash
git remote add origin https://github.com/<you>/repomind.git
git branch -M main
git push -u origin main
```

Check that `backend/.env` and `data/` are **not** in the commit — `.gitignore`
already excludes them, but confirm with `git ls-files | grep -E '\.env$|^data/'`,
which should print nothing.

---

## Step 1 — Postgres on Neon

Neon's free tier does not expire. Render's free Postgres deletes itself after 30
days, which is why we are not using it.

1. Sign up at [neon.tech](https://neon.tech) with GitHub.
2. Create a project — name it `repomind`, any region near you.
3. On the dashboard, copy the **connection string**. It looks like:

```
postgresql://neondb_owner:npg_xxxx@ep-cool-name-12345.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

Keep it somewhere; you need it in Step 3.

> Paste it exactly as given. RepoMind rewrites the scheme and the `sslmode`
> parameter for asyncpg on startup, so you do not need to edit it. (Doing it by
> hand is the most common way to get a `TypeError: connect() got an unexpected
> keyword argument 'sslmode'` on first boot.)

You do not need to create any tables. The API creates its schema on startup.

---

## Step 2 — A Groq API key

Groq serves open Llama models on a free tier with no credit card, and its API is
OpenAI-compatible.

1. Sign up at [console.groq.com](https://console.groq.com).
2. Go to **API Keys** → **Create API Key**.
3. Copy it — it starts with `gsk_` and is shown only once.

The default model is `llama-3.1-8b-instant`, which has the most generous free
limits (30 requests/minute, 14,400/day). That is far more than a portfolio demo
will ever use.

---

## Step 3 — The API on Render

1. Sign up at [render.com](https://render.com) with GitHub.
2. **New +** → **Web Service** → connect your `repomind` repository.
3. Configure it:

| Field | Value |
| --- | --- |
| Name | `repomind-api` |
| Language | `Python 3` |
| Branch | `main` |
| Root Directory | `backend` |
| Build Command | see below |
| Start Command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Instance Type | `Free` |

Build command — the second line pre-downloads the embedding model so the first
request after a deploy is not stuck behind a 70-second download:

```bash
pip install -r requirements.txt && python -c "from fastembed import TextEmbedding; TextEmbedding(model_name='BAAI/bge-small-en-v1.5', cache_dir='../data/models')"
```

4. Add environment variables (**Advanced** → **Add Environment Variable**):

| Key | Value |
| --- | --- |
| `PYTHON_VERSION` | `3.13.0` |
| `ENVIRONMENT` | `production` |
| `DEBUG` | `false` |
| `DATABASE_URL` | your Neon string from Step 1 |
| `JWT_SECRET` | run `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `EPHEMERAL_FILESYSTEM` | `true` |
| `CHAT_PROVIDER` | `groq` |
| `CHAT_BASE_URL` | `https://api.groq.com/openai/v1` |
| `CHAT_MODEL` | `llama-3.1-8b-instant` |
| `CHAT_API_KEY` | your `gsk_...` key from Step 2 |
| `EMBEDDING_PROVIDER` | `fastembed` |
| `FASTEMBED_MODEL` | `BAAI/bge-small-en-v1.5` |
| `EMBEDDING_DIMENSION` | `384` |
| `EMBEDDING_BATCH_SIZE` | `16` |
| `MODEL_CACHE_DIR` | `../data/models` |
| `MAX_CONCURRENT_INDEXING_JOBS` | `1` |
| `CORS_ORIGINS` | `http://localhost:3000` for now — corrected in Step 5 |

5. **Create Web Service**. The first build takes 5–10 minutes, mostly compiling
   `faiss-cpu` and `onnxruntime`.

6. When it goes live, check it:

```bash
curl https://repomind-api.onrender.com/api/v1/health/ready
```

You want `"status": "ok"` with `chat.ok` and `database.ok` both true. If
anything is wrong, the response names it — see Troubleshooting below.

> **Why the small embedding model.** The free instance has 512 MB of RAM.
> `bge-small-en-v1.5` is 67 MB and produces 384-dimension vectors;
> `nomic-embed-text-v1.5` is better but roughly doubles memory and risks the
> instance being killed mid-index. If you upgrade to a paid instance, switch
> `FASTEMBED_MODEL` to `nomic-ai/nomic-embed-text-v1.5-Q` and
> `EMBEDDING_DIMENSION` to `768`, then re-index any repositories — vectors of
> different dimensions are not comparable.

---

## Step 4 — The frontend on Vercel

1. Sign up at [vercel.com](https://vercel.com) with GitHub.
2. **Add New** → **Project** → import `repomind`.
3. Configure:

| Field | Value |
| --- | --- |
| Framework Preset | Next.js (detected) |
| Root Directory | `frontend` |
| Build Command | default (`npm run build`) |

4. Add one environment variable:

| Key | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://repomind-api.onrender.com/api/v1` |

Use your real Render URL, and keep the `/api/v1` suffix.

5. **Deploy**. Vercel gives you `https://repomind-<something>.vercel.app`.

> `NEXT_PUBLIC_*` values are compiled into the JavaScript bundle at build time.
> Changing this variable later requires a **redeploy**, not just a restart.

---

## Step 5 — Let the two talk to each other

The API rejects browser requests from unknown origins, so it needs to be told
about the Vercel domain.

1. In Render → your service → **Environment**, set:

```
CORS_ORIGINS=https://repomind-<something>.vercel.app
```

Use the exact origin: `https`, no trailing slash, no path. Multiple origins are
comma-separated, which is useful if you add a custom domain later.

2. Save. Render restarts automatically.

Now open your Vercel URL, create an account, and import a repository. Try
`https://github.com/psf/requests` first — it indexes in well under a minute.

---

## What visitors will experience

Be aware of these so they do not look like bugs:

**The first visit after 15 minutes idle takes about a minute.** Render's free
tier sleeps. The app detects this and shows a "Waking the server" banner instead
of an error, and retries automatically.

**Indexing is slower than on your laptop.** A free instance has half a CPU. The
`requests` repository takes about 20 seconds locally and 1–3 minutes on Render.
Progress still streams live.

**Very large repositories may fail.** 512 MB of RAM is the limit. Repositories
of a few thousand files are fine; something like `vercel/next.js` is not. Suggest
small repositories on your landing page, which is what the sample list already
does.

A good way to handle all three: seed one repository yourself, and mention on your
CV that the demo has `psf/requests` pre-indexed.

---

## Verifying the deployment

Both verification scripts work against a remote instance:

```bash
# 41 checks over the real API: import, embeddings, retrieval, streaming chat
REPOMIND_API=https://repomind-api.onrender.com/api/v1 \
  backend/.venv/bin/python backend/tests/verify_frontend_contract.py

# Drive the deployed UI in a headless browser
cd frontend && APP_URL=https://your-app.vercel.app node scripts/verify-ui.mjs
```

The contract script imports and deletes a real repository, so it is safe to run
against production.

---

## Troubleshooting

**`TypeError: connect() got an unexpected keyword argument 'sslmode'`**
An old build. Current code rewrites this automatically; redeploy from `main`.

**`status: degraded` with `chat.ok: false`**
The response `detail` says which it is: a rejected key (`CHAT_API_KEY` wrong or
has a trailing space), or a model name Groq no longer serves — check
[console.groq.com/docs/models](https://console.groq.com/docs/models) and update
`CHAT_MODEL`.

**CORS errors in the browser console**
`CORS_ORIGINS` must match the browser's origin character for character. A
trailing slash or `http` instead of `https` is enough to break it.

**"Could not reach the RepoMind API"**
Either the backend is asleep — wait a minute — or `NEXT_PUBLIC_API_URL` is wrong.
Confirm it ends in `/api/v1`, and remember it needs a Vercel redeploy to change.

**Build fails on `faiss-cpu` or `onnxruntime`**
Almost always a Python version mismatch. Set `PYTHON_VERSION` to `3.13.0`.

**Indexing dies partway with no error**
The instance ran out of memory. Use a smaller repository, keep
`MAX_CONCURRENT_INDEXING_JOBS=1`, and make sure `EMBEDDING_DIMENSION` is `384`
with the small model rather than `768`.

**A repository worked, then stopped after a while**
It was indexed before `EPHEMERAL_FILESYSTEM=true` was set, so its vectors were
never stored in Postgres and could not be rebuilt. Delete it and import again.

---

## Optional: a custom domain

Both platforms support this free.

- **Vercel:** Project → Settings → Domains → add your domain and follow the DNS
  instructions.
- Then update `CORS_ORIGINS` on Render to the new origin, and
  `NEXT_PUBLIC_API_URL` if you also point a subdomain at the API. Redeploy the
  frontend afterwards, since that value is baked in at build time.

---

## Optional: keeping the backend awake

A cron ping every 10 minutes prevents spin-down. [cron-job.org](https://cron-job.org)
is free: schedule a `GET` on `https://repomind-api.onrender.com/api/v1/health`.

Render's free tier allows 750 instance-hours per month. One always-on service
uses about 730, so this fits — but only for a single service, and it does burn
the whole allowance.
