# API reference

Base URL: `http://localhost:8000/api/v1`

Interactive documentation is generated from the code and served at
[`/docs`](http://localhost:8000/docs) (Swagger) and
[`/redoc`](http://localhost:8000/redoc).

## Conventions

- Request and response bodies are **camelCase**. The Python codebase is
  snake_case internally; Pydantic translates at the boundary.
- Authenticated endpoints expect `Authorization: Bearer <accessToken>`.
- Errors always use one envelope:

```json
{ "error": { "code": "not_found", "message": "Repository not found." } }
```

| Code | HTTP | Meaning |
| --- | --- | --- |
| `validation_error` | 422 | Malformed input or an action invalid for the current state |
| `unauthorized` | 401 | Missing, expired or invalid token |
| `forbidden` | 403 | Authenticated but not permitted |
| `not_found` | 404 | Resource missing or not owned by the caller |
| `conflict` | 409 | Already exists |
| `upstream_error` | 502 | Ollama, GitHub or git failed |
| `internal_error` | 500 | Unhandled failure |

---

## Authentication

Access tokens live 60 minutes; refresh tokens live 30 days. The frontend client
refreshes transparently on a 401 and coalesces concurrent refreshes into one
request.

### `POST /auth/register`

```json
{ "email": "you@example.com", "name": "Your Name", "password": "at-least-8-chars" }
```

`201` → `{ "user": {...}, "tokens": { "accessToken", "refreshToken", "tokenType", "expiresIn" } }`

### `POST /auth/login`
Same response shape as register. `401` on bad credentials.

Login runs a password hash comparison even when the email does not exist, so
response timing does not reveal which addresses are registered.

### `POST /auth/refresh`
```json
{ "refreshToken": "..." }
```

### `GET /auth/me` · `PATCH /auth/me` · `POST /auth/change-password`
Read or update the current profile. `PATCH` accepts `name` and `avatarUrl`.

---

## Repositories

### `POST /repo/import`

```json
{ "url": "https://github.com/vercel/next.js", "force": false }
```

Accepts full URLs, `github.com/owner/repo`, bare `owner/repo`, `.git` suffixes,
and `/tree/<branch>` links. Returns `202` immediately with the repository row in
`QUEUED`; indexing continues in the background. Pass `force: true` to re-import
an existing repository from scratch.

### `GET /repo`
Every repository owned by the caller, newest first.

### `GET /repo/{id}`

```json
{
  "repository": { "id": "...", "fullName": "psf/requests", "status": "READY",
                  "fileCount": 64, "chunkCount": 446, "lineCount": 15260, "...": "..." },
  "index": { "embeddingModel": "nomic-embed-text", "dimension": 768,
             "vectorCount": 446, "sizeBytes": 1387000, "buildDurationMs": 18100 },
  "languages": [{ "language": "python", "files": 36, "bytes": 412903 }]
}
```

### `GET /repo/{id}/progress` — Server-Sent Events

Streams indexing progress. The current database state is emitted first so a
client that connects late or reconnects is never left with an empty bar. The
stream closes on `READY` or `FAILED`.

```
event: progress
data: {"repositoryId":"...","status":"EMBEDDING","progress":72,
       "message":"Embedding chunks (288/446)","detail":"batch 9/14","error":null}
```

`status` progresses through `QUEUED → CLONING → PARSING → CHUNKING → EMBEDDING → INDEXING → READY`, or ends at `FAILED` with `error` populated.

Because `EventSource` cannot set an `Authorization` header, this endpoint also
accepts the access token as a `?token=` query parameter.

### `DELETE /repo/{id}`
Deletes the database rows, the FAISS index and the working copy on disk.

### `POST /repo/{id}/reindex`
Re-clones and rebuilds from scratch.

### `GET /repo/{id}/files`
The full file tree as nested nodes, directories before files:

```json
{ "tree": { "name": "", "path": "", "type": "directory",
            "children": [{ "name": "src", "type": "directory", "children": [...] }] },
  "fileCount": 64 }
```

### `GET /repo/{id}/file?path=src/requests/auth.py`
File content plus metadata. Paths are resolved inside the working copy and
rejected if they escape it, so `../` traversal returns an error.

---

## Chat

### `POST /repo/{id}/chat` — Server-Sent Events

```json
{ "message": "Where is JWT verified?", "chatId": null }
```

Omit `chatId` to continue the most recent conversation, or create one on first
use. Returns `422` if the repository is not `READY`.

Events arrive in a fixed order:

```
event: context
data: {"chunks":[{"chunkId":"...","filePath":"src/requests/auth.py","startLine":1,
                  "endLine":31,"language":"python","content":"...","symbols":["HTTPBasicAuth"],
                  "score":0.71,"vectorScore":0.68,"rank":1}], "chatId":"..."}

event: token
data: {"value":"The "}

event: done
data: {"messageId":"...","chatId":"...","content":"full answer","latencyMs":8700,
       "confidence":0.72,"reasoning":"Searched the vector index and retrieved 6 chunks…",
       "citations":[{"number":4,"filePath":"src/requests/auth.py","startLine":1,
                     "endLine":31,"snippet":"...","score":0.66}],
       "relatedFiles":["src/requests/sessions.py"]}
```

`context` is deliberately sent before generation starts so the UI can render
retrieved files while the model is still thinking. On failure a single
`event: error` with `{ code, message }` is emitted and the stream closes
cleanly.

Citations are the numbered context blocks the model actually referenced in its
answer. `confidence` is derived from retrieval strength, the agreement between
top hits and citation coverage — it is not self-reported by the model.

### `GET /repo/{id}/chat?chatId=` · `GET /repo/{id}/chats`
Load one conversation with its messages, or list all conversations for a
repository.

### `GET /chat/history`
Recent conversations across every repository.

### `DELETE /chat/{chatId}` · `POST /chat/{chatId}/clear`
Delete a conversation, or empty it while keeping it.

### `GET /chat/{chatId}/export`
The conversation rendered as Markdown, including citations and confidence,
served as a file download.

---

## Search and analysis

### `GET /repo/{id}/search?q=database+connection&limit=12&groupByFile=true`

```json
{ "query": "database connection", "count": 5,
  "results": [{ "chunkId": "...", "filePath": "src/requests/adapters.py",
                "language": "python", "startLine": 120, "endLine": 158,
                "snippet": "…", "symbols": ["HTTPAdapter", "init_poolmanager"],
                "score": 0.71, "similarity": 0.68, "rank": 1,
                "matches": 2, "otherMatches": [{ "startLine": 201, "endLine": 233 }] }] }
```

`similarity` is the raw cosine score; `score` is the reranked blend. With
`groupByFile=true` (default) chunk hits are folded into one row per file,
strongest passage first.

### `GET /architecture/{id}`

```json
{ "techStack": ["Python", "FastAPI", "SQLAlchemy"],
  "hierarchy": [{ "path": "src/requests", "files": 18, "language": "python" }],
  "graph": { "nodes": [{ "id": "src/requests/sessions.py", "label": "sessions.py",
                         "group": "src", "language": "python", "imports": 8,
                         "importedBy": 4, "degree": 12, "lines": 833 }],
             "edges": [{ "source": "...", "target": "..." }],
             "truncated": false, "totalModules": 36 },
  "relationships": [{ "source": "src", "target": "tests", "weight": 14 }],
  "entryPoints": ["src/requests/__init__.py"],
  "stats": { "modules": 36, "files": 64, "edges": 101, "externalPackages": 22 } }
```

Only the most connected 60 modules are returned; `truncated` reports whether
anything was dropped.

### `GET /repo/{id}/dead-code`

```json
{ "findings": [{ "kind": "UNUSED_EXPORT", "severity": "MEDIUM",
                 "filePath": "src/requests/utils.py", "symbol": "unquote_header_value",
                 "symbolKind": "function", "line": 412,
                 "message": "`unquote_header_value` is exported … but never imported elsewhere." }],
  "summary": { "total": 57, "unusedExports": 19, "unreferencedFiles": 1,
               "duplicateUtilities": 0, "unusedImports": 37, "modulesAnalysed": 36 } }
```

`kind` is one of `UNUSED_EXPORT`, `UNREFERENCED_FILE`, `DUPLICATE_UTILITY`,
`UNUSED_IMPORT`; `severity` is `LOW`, `MEDIUM` or `HIGH`. Findings are advisory —
see [dead-code.md](./dead-code.md) for the limits of the analysis.

Architecture and dead-code results are cached for 15 minutes per repository, and
both require the working copy to still be on disk.

---

## System

### `GET /health`
Liveness. Always `{"status":"ok"}` when the process is up.

### `GET /health/ready`
Dependency health, useful when diagnosing a fresh setup:

```json
{ "status": "ok",
  "checks": { "database": { "ok": true, "engine": "postgres" },
              "ollama": { "ok": true, "baseUrl": "http://localhost:11434",
                          "chatModel": "llama3.2:3b", "embedModel": "nomic-embed-text",
                          "installedModels": ["nomic-embed-text:latest", "llama3.2:3b"],
                          "missingModels": [] } } }
```

Returns `status: "degraded"` when a dependency is unreachable or a required
model is not pulled.
