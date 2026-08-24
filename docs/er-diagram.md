# Entity-relationship model

The canonical definition lives in
[`database/prisma/schema.prisma`](../database/prisma/schema.prisma). The FastAPI
backend maps the same tables with SQLAlchemy in `backend/database/models/`.

```mermaid
erDiagram
    USERS ||--o{ REPOSITORIES : owns
    USERS ||--o{ CHATS : starts
    REPOSITORIES ||--o{ REPOSITORY_FILES : contains
    REPOSITORIES ||--o{ CODE_CHUNKS : produces
    REPOSITORIES ||--o| INDEXES : "indexed by"
    REPOSITORIES ||--o{ CHATS : "discussed in"
    REPOSITORY_FILES ||--o{ CODE_CHUNKS : "split into"
    CHATS ||--o{ MESSAGES : contains

    USERS {
        varchar32  id PK
        varchar255 email UK
        varchar120 name
        varchar255 password_hash
        varchar512 avatar_url
        boolean    is_active
        timestamptz created_at
        timestamptz updated_at
    }

    REPOSITORIES {
        varchar32  id PK
        varchar32  user_id FK
        varchar512 url
        varchar120 owner
        varchar200 name
        varchar320 full_name
        text       description
        varchar120 default_branch
        varchar60  language
        int        stars
        int        forks
        enum       status "QUEUED..READY|FAILED"
        int        progress
        varchar255 status_message
        text       error_message
        int        file_count
        int        chunk_count
        bigint     total_bytes
        int        line_count
        timestamptz indexed_at
    }

    REPOSITORY_FILES {
        varchar32   id PK
        varchar32   repository_id FK
        varchar1024 path
        varchar255  name
        varchar32   extension
        varchar60   language
        int         size_bytes
        int         line_count
        int         chunk_count
    }

    CODE_CHUNKS {
        varchar32   id PK
        varchar32   repository_id FK
        varchar32   file_id FK
        int         vector_id "FAISS row offset"
        int         chunk_index
        text        content
        varchar1024 file_path
        varchar60   language
        int         start_line
        int         end_line
        int         token_count
        text        symbols
    }

    INDEXES {
        varchar32   id PK
        varchar32   repository_id FK,UK
        varchar60   provider
        varchar120  embedding_model
        int         dimension
        varchar32   metric
        int         vector_count
        varchar1024 index_path
        bigint      size_bytes
        int         build_duration_ms
    }

    CHATS {
        varchar32  id PK
        varchar32  repository_id FK
        varchar32  user_id FK
        varchar255 title
        int        message_count
    }

    MESSAGES {
        varchar32 id PK
        varchar32 chat_id FK
        enum      role "USER|ASSISTANT|SYSTEM"
        text      content
        text      reasoning
        float     confidence
        json      citations
        json      related_files
        int       latency_ms
        int       token_count
    }
```

## Notes on the design

**`code_chunks.vector_id` is the bridge to FAISS.** It stores the row offset of
the chunk's embedding inside the repository's index. A similarity search returns
row numbers; those map back to chunk ids, which carry the file path and line
range that become a citation. The pair `(repository_id, vector_id)` is unique.

**Chunk text lives in Postgres, vectors live on disk.** Storing the text in both
places would duplicate megabytes per repository. FAISS holds vectors plus an
ordered list of chunk ids; everything human-readable is hydrated from the
database after the search returns.

**File contents are not stored at all.** `repository_files` holds only metadata.
The file viewer reads from the shallow clone on disk, which keeps the database
small. Deleting the working copy therefore disables the viewer but leaves search
and chat fully functional, since retrieval only needs chunk text.

**Citations are denormalised onto messages.** `messages.citations` and
`related_files` are JSON snapshots taken at answer time. Re-deriving them later
would produce different results as the index changes, so a reloaded conversation
would no longer match what the user actually saw.

**Cascades are enforced by the database.** Every foreign key declares
`ON DELETE CASCADE`, and the ORM relationships set `passive_deletes=True` so
deleting a repository does not have to load tens of thousands of chunk rows into
memory first. SQLite needs `PRAGMA foreign_keys=ON` for this, which the engine
sets on every connection.

**Uniqueness.** `(user_id, full_name)` prevents importing the same repository
twice into one workspace, while still allowing different users to import it
independently.
