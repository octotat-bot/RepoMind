"""Verify the live API returns exactly what the frontend pages consume.

Run against a serving backend:

    .venv/bin/python tests/verify_frontend_contract.py
    REPOMIND_API=http://127.0.0.1:8001/api/v1 .venv/bin/python tests/verify_frontend_contract.py

Unlike the unit tests, this talks to the real server, real database, real FAISS
index and real Ollama, so it catches contract drift the mocks cannot.
"""

from __future__ import annotations

import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get("REPOMIND_API", "http://127.0.0.1:8000/api/v1").rstrip("/")

# A python.org build on macOS ships without the system trust store, so every
# HTTPS call fails with CERTIFICATE_VERIFY_FAILED — which looks like a broken
# deployment rather than a broken local install. certifi is already a transitive
# dependency, so use its bundle.
try:
    import certifi

    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:  # pragma: no cover - certifi ships with httpx
    SSL_CONTEXT = None
SAMPLE_REPO = os.environ.get("REPOMIND_SAMPLE_REPO", "https://github.com/psf/requests")

failures: list[str] = []
checks = 0


def check(condition: bool, label: str) -> None:
    global checks
    checks += 1
    if condition:
        print(f"  ok   {label}")
    else:
        print(f"  FAIL {label}")
        failures.append(label)


def call(path: str, method: str = "GET", body=None, token: str | None = None, raw=False):
    request = urllib.request.Request(f"{BASE}{path}", method=method)
    request.add_header("Accept", "*/*")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, data, timeout=180, context=SSL_CONTEXT) as response:
            payload = response.read().decode()
            return response.status, (payload if raw else json.loads(payload or "null"))
    except urllib.error.HTTPError as error:
        payload = error.read().decode()
        try:
            return error.code, json.loads(payload)
        except json.JSONDecodeError:
            return error.code, payload


def stream(path: str, body: dict, token: str) -> list[tuple[str, dict]]:
    """Consume an SSE endpoint the way the browser client does."""
    request = urllib.request.Request(f"{BASE}{path}", method="POST")
    request.add_header("Authorization", f"Bearer {token}")
    request.add_header("Content-Type", "application/json")
    request.add_header("Accept", "text/event-stream")

    events: list[tuple[str, dict]] = []
    with urllib.request.urlopen(
        request, json.dumps(body).encode(), timeout=300, context=SSL_CONTEXT
    ) as response:
        buffer = ""
        while True:
            piece = response.read1(1024).decode("utf-8", errors="replace")
            if not piece:
                break
            buffer += piece
            while "\n\n" in buffer:
                frame, buffer = buffer.split("\n\n", 1)
                name, payload = "message", []
                for line in frame.split("\n"):
                    if line.startswith("event:"):
                        name = line[6:].strip()
                    elif line.startswith("data:"):
                        payload.append(line[5:].strip())
                if payload:
                    events.append((name, json.loads("\n".join(payload))))
    return events


def has_keys(payload: dict, *keys: str) -> bool:
    missing = [key for key in keys if key not in payload]
    if missing:
        print(f"       missing keys: {missing}")
    return not missing


def main() -> int:
    print("\n[1] auth: register + me + profile update")
    email = f"contract-{int(time.time())}@repomind.dev"
    status, auth = call("/auth/register", "POST",
                        {"email": email, "name": "Contract Bot", "password": "verify-me-1234"})
    check(status == 201, f"register returns 201 (got {status})")
    check(has_keys(auth, "user", "tokens"), "register payload has user + tokens")
    check(has_keys(auth["tokens"], "accessToken", "refreshToken", "expiresIn"),
          "tokens are camelCase as the client expects")
    token = auth["tokens"]["accessToken"]

    status, me = call("/auth/me", token=token)
    check(status == 200 and me["email"] == email, "GET /auth/me returns the caller")

    status, updated = call("/auth/me", "PATCH", {"name": "Renamed"}, token=token)
    check(status == 200 and updated["name"] == "Renamed", "PATCH /auth/me renames the user")

    status, refreshed = call("/auth/refresh", "POST",
                             {"refreshToken": auth["tokens"]["refreshToken"]})
    check(status == 200 and "tokens" in refreshed, "refresh returns a new token pair")

    print("\n[2] auth: rejection paths the UI surfaces")
    status, _ = call("/auth/login", "POST", {"email": email, "password": "wrong-password"})
    check(status == 401, f"bad password is 401 (got {status})")
    status, body = call("/repo", token="not-a-real-token")
    check(status == 401, f"garbage token is 401 (got {status})")
    check(isinstance(body, dict) and "error" in body, "errors use the { error: {...} } envelope")

    print("\n[3] repositories: import and index")
    status, repo = call("/repo/import", "POST", {"url": SAMPLE_REPO}, token=token)
    check(status in (200, 202), f"import accepted (got {status})")
    repo_id = repo["id"]
    check(has_keys(repo, "id", "fullName", "status", "progress"), "import returns a repository")

    deadline = time.time() + 900
    last = None
    while time.time() < deadline:
        _, current = call(f"/repo/{repo_id}", token=token)
        state = current["repository"]
        if state["status"] != last:
            print(f"       {state['status']:<9} {state['progress']:>3}%  {state.get('statusMessage') or ''}")
            last = state["status"]
        if state["status"] in ("READY", "FAILED"):
            break
        time.sleep(3)

    _, detail = call(f"/repo/{repo_id}", token=token)
    repository = detail["repository"]
    check(repository["status"] == "READY", f"indexing reached READY (got {repository['status']})")
    if repository["status"] != "READY":
        print(f"       error: {repository.get('errorMessage')}")
        return 1

    check(repository["fileCount"] > 0 and repository["chunkCount"] > 0,
          f"indexed {repository['fileCount']} files / {repository['chunkCount']} chunks")
    check(has_keys(detail, "repository", "index", "languages"),
          "detail carries index + languages for the Details tab")
    check(detail["index"]["vectorCount"] == repository["chunkCount"],
          "vector count matches chunk count")

    print("\n[4] file explorer + viewer")
    status, tree = call(f"/repo/{repo_id}/files", token=token)
    check(status == 200 and has_keys(tree, "tree", "fileCount"), "file tree returns tree + count")

    def first_file(node):
        if node["type"] == "file":
            return node
        for child in node.get("children", []):
            found = first_file(child)
            if found:
                return found
        return None

    sample = first_file(tree["tree"])
    check(sample is not None, "tree contains at least one file node")
    check(has_keys(sample, "name", "path", "type", "language"), "file nodes carry the fields the tree renders")

    status, content = call(f"/repo/{repo_id}/file?path={sample['path']}", token=token)
    check(status == 200 and has_keys(content, "path", "language", "content", "lineCount"),
          "file content endpoint feeds the viewer")

    status, _ = call(f"/repo/{repo_id}/file?path=../../../etc/passwd", token=token)
    check(status in (400, 404), f"path traversal is rejected (got {status})")

    print("\n[5] semantic search")
    status, results = call(f"/repo/{repo_id}/search?q=how%20are%20http%20sessions%20handled&limit=8",
                           token=token)
    check(status == 200 and results["count"] > 0, f"search returned {results.get('count')} results")
    if results["results"]:
        top = results["results"][0]
        check(has_keys(top, "filePath", "language", "startLine", "endLine", "snippet",
                       "similarity", "rank"),
              "search results carry every field the result card renders")
        print(f"       top hit: {top['filePath']}:{top['startLine']}-{top['endLine']} "
              f"({top['similarity']:.3f})")

    print("\n[6] chat: streaming, citations, persistence")
    events = stream(f"/repo/{repo_id}/chat",
                    {"message": "How does this library send an HTTP GET request?"}, token)
    names = [name for name, _ in events]
    check("context" in names, "stream emits a context event before tokens")
    check(names.count("token") > 0, f"stream emitted {names.count('token')} token frames")
    check(names[-1] == "done", f"stream ends with done (got {names[-1]})")

    context = next(payload for name, payload in events if name == "context")
    check(len(context["chunks"]) > 0, f"retrieved {len(context['chunks'])} chunks")
    if context["chunks"]:
        check(has_keys(context["chunks"][0], "chunkId", "filePath", "content", "startLine",
                       "endLine", "vectorScore", "rank"),
              "context chunks carry what the right panel renders")

    done = next(payload for name, payload in events if name == "done")
    check(has_keys(done, "messageId", "chatId", "content", "citations", "relatedFiles",
                   "confidence", "reasoning", "latencyMs"),
          "done payload carries citations + confidence + reasoning")
    print(f"       {len(done['citations'])} citations, confidence {done['confidence']:.2f}, "
          f"{done['latencyMs']}ms")
    for citation in done["citations"]:
        check(has_keys(citation, "chunkId", "filePath", "startLine", "endLine", "number"),
              f"citation [{citation.get('number')}] is renderable")

    chat_id = done["chatId"]
    status, conversation = call(f"/repo/{repo_id}/chat?chatId={chat_id}", token=token)
    check(status == 200 and len(conversation["messages"]) == 2,
          f"conversation persisted both turns (got {len(conversation['messages'])})")

    status, markdown = call(f"/chat/{chat_id}/export", token=token, raw=True)
    check(status == 200 and "# " in markdown, "chat exports as Markdown")

    status, history = call("/chat/history", token=token)
    check(status == 200 and len(history) >= 1, "chat history lists the conversation")

    print("\n[7] architecture + dead code")
    status, architecture = call(f"/architecture/{repo_id}", token=token)
    check(status == 200 and has_keys(architecture, "techStack", "hierarchy", "graph",
                                     "relationships", "entryPoints", "stats"),
          "architecture payload matches the panel")
    check(len(architecture["graph"]["nodes"]) > 0,
          f"graph has {len(architecture['graph']['nodes'])} nodes / "
          f"{len(architecture['graph']['edges'])} edges")
    if architecture["graph"]["nodes"]:
        check(has_keys(architecture["graph"]["nodes"][0], "id", "label", "path", "group",
                       "language", "degree"),
              "graph nodes carry the fields the SVG layout needs")
    print(f"       tech stack: {', '.join(architecture['techStack'][:6])}")

    status, dead = call(f"/repo/{repo_id}/dead-code", token=token)
    check(status == 200 and has_keys(dead, "findings", "summary"), "dead-code payload matches the panel")
    print(f"       {dead['summary']['total']} findings across "
          f"{dead['summary']['modulesAnalysed']} modules")
    if dead["findings"]:
        check(has_keys(dead["findings"][0], "kind", "severity", "filePath", "line", "message"),
              "findings carry the fields the list renders")

    print("\n[8] ownership isolation")
    _, other = call("/auth/register", "POST", {
        "email": f"other-{int(time.time())}@repomind.dev",
        "name": "Other", "password": "verify-me-1234",
    })
    other_token = other["tokens"]["accessToken"]
    status, _ = call(f"/repo/{repo_id}", token=other_token)
    check(status == 404, f"another user cannot read the repository (got {status})")
    status, _ = call(f"/repo/{repo_id}", "DELETE", token=other_token)
    check(status == 404, f"another user cannot delete the repository (got {status})")

    print("\n[9] cleanup")
    status, _ = call(f"/repo/{repo_id}", "DELETE", token=token)
    check(status == 200, "owner can delete the repository")
    status, _ = call(f"/repo/{repo_id}", token=token)
    check(status == 404, "deleted repository is gone")

    print(f"\n{'─' * 60}")
    if failures:
        print(f"{len(failures)}/{checks} checks FAILED:")
        for failure in failures:
            print(f"  · {failure}")
        return 1
    print(f"All {checks} contract checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
