"""End-to-end smoke test against a running backend.

Exercises the whole product path — register, import a real GitHub repository,
watch indexing progress, then chat, search and analyse — so regressions in the
pipeline surface as a single failing command.

Usage:  python tests/e2e_smoke.py [owner/repo]
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:8000/api/v1"
DEFAULT_REPO = "psf/requests"


def call(method: str, path: str, body: dict | None = None, token: str | None = None):
    url = f"{BASE}{path}"
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            raw = response.read().decode()
            return response.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as error:
        raw = error.read().decode()
        try:
            return error.code, json.loads(raw)
        except json.JSONDecodeError:
            return error.code, raw


def stream(path: str, token: str, body: dict | None = None, timeout: int = 900):
    """Yield (event, data) pairs from an SSE endpoint."""
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        f"{BASE}{path}", data=data, method="POST" if data else "GET"
    )
    request.add_header("Authorization", f"Bearer {token}")
    request.add_header("Accept", "text/event-stream")
    if data:
        request.add_header("Content-Type", "application/json")

    with urllib.request.urlopen(request, timeout=timeout) as response:
        event = None
        for raw_line in response:
            line = raw_line.decode().rstrip("\n")
            if line.startswith("event: "):
                event = line[7:]
            elif line.startswith("data: "):
                yield event, json.loads(line[6:])
                event = None


def check(label: str, condition: bool, detail: str = "") -> bool:
    print(f"  {'PASS' if condition else 'FAIL'}  {label}{f' — {detail}' if detail else ''}")
    return condition


def main() -> int:
    target = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_REPO
    failures = 0
    suffix = str(int(time.time()))

    print("\n[1] Auth")
    status, auth = call("POST", "/auth/register", {
        "email": f"e2e-{suffix}@repomind.dev", "name": "E2E Runner", "password": "supersecret123",
    })
    failures += not check("register", status == 201, f"status {status}")
    token = auth["tokens"]["accessToken"]

    status, me = call("GET", "/auth/me", token=token)
    failures += not check("authenticated /me", status == 200 and me["email"].startswith("e2e-"))

    status, _ = call("GET", "/repo")
    failures += not check("unauthenticated request rejected", status == 401, f"status {status}")

    print(f"\n[2] Import {target}")
    status, repo = call("POST", "/repo/import", {"url": f"https://github.com/{target}"}, token)
    failures += not check("import accepted", status == 202, f"status {status}")
    repo_id = repo["id"]

    print("\n[3] Indexing progress")
    started = time.perf_counter()
    stages, final = [], None
    for _, event in stream(f"/repo/{repo_id}/progress", token):
        if event["status"] not in stages:
            stages.append(event["status"])
            print(f"       {event['progress']:3d}%  {event['status']:<9}  {event['message']}")
        final = event
        if event["status"] in {"READY", "FAILED"}:
            break

    elapsed = time.perf_counter() - started
    failures += not check("indexing completed", final and final["status"] == "READY",
                          final.get("error") or f"{elapsed:.1f}s")
    if not final or final["status"] != "READY":
        return 1

    status, detail = call("GET", f"/repo/{repo_id}", token=token)
    stats = detail["repository"]
    print(f"       {stats['fileCount']} files · {stats['chunkCount']} chunks · "
          f"{stats['lineCount']} lines · {detail['index']['vectorCount']} vectors")
    failures += not check("chunks match vectors",
                          stats["chunkCount"] == detail["index"]["vectorCount"])
    failures += not check("languages detected", len(detail["languages"]) > 0,
                          ", ".join(f"{l['language']}:{l['files']}" for l in detail["languages"][:4]))

    print("\n[4] File tree + content")
    status, tree = call("GET", f"/repo/{repo_id}/files", token=token)
    failures += not check("file tree", status == 200 and len(tree["tree"]["children"]) > 0)

    def first_file(node):
        if node["type"] == "file":
            return node["path"]
        for child in node.get("children", []):
            if found := first_file(child):
                return found
        return None

    sample = first_file(tree["tree"])
    status, content = call(
        "GET", f"/repo/{repo_id}/file?path={urllib.parse.quote(sample)}", token=token
    )
    failures += not check("file content", status == 200 and len(content["content"]) > 0, sample)

    status, blocked = call("GET", f"/repo/{repo_id}/file?path=../../../etc/passwd", token=token)
    failures += not check("path traversal blocked", status in (400, 404, 422), f"status {status}")

    print("\n[5] Semantic search")
    for query in ("http connection pooling", "authentication"):
        status, results = call(
            "GET", f"/repo/{repo_id}/search?q={urllib.parse.quote(query)}&limit=5", token=token
        )
        hits = results.get("results", []) if status == 200 else []
        top = f"{hits[0]['filePath']} ({hits[0]['similarity']})" if hits else "no hits"
        failures += not check(f"search '{query}'", status == 200 and len(hits) > 0, top)

    print("\n[6] Architecture")
    status, arch = call("GET", f"/architecture/{repo_id}", token=token)
    failures += not check("architecture generated", status == 200 and arch["stats"]["modules"] > 0,
                          f"{arch['stats']['modules']} modules, {arch['stats']['edges']} edges, "
                          f"stack: {', '.join(arch['techStack'][:5])}")
    failures += not check("dependency graph has edges", len(arch["graph"]["edges"]) > 0)

    print("\n[7] Dead code")
    status, dead = call("GET", f"/repo/{repo_id}/dead-code", token=token)
    summary = dead.get("summary", {})
    failures += not check("dead-code analysis", status == 200,
                          ", ".join(f"{k}={v}" for k, v in summary.items()))

    print("\n[8] RAG chat (streaming)")
    question = "How does this project handle authentication?"
    started = time.perf_counter()
    tokens, context, done = 0, None, None
    for event, payload in stream(f"/repo/{repo_id}/chat", token, body={"message": question}):
        if event == "context":
            context = payload
        elif event == "token":
            tokens += 1
        elif event == "done":
            done = payload
        elif event == "error":
            print(f"       stream error: {payload}")

    latency = time.perf_counter() - started
    failures += not check("context retrieved", context and len(context["chunks"]) > 0,
                          f"{len(context['chunks']) if context else 0} chunks")
    failures += not check("tokens streamed", tokens > 0, f"{tokens} tokens in {latency:.1f}s")
    failures += not check("answer persisted", done is not None and len(done["content"]) > 0)
    if done:
        print(f"       confidence {done['confidence']:.0%} · {len(done['citations'])} citations "
              f"· {len(done['relatedFiles'])} related files")
        for citation in done["citations"][:3]:
            print(f"         [{citation['number']}] {citation['filePath']}:"
                  f"{citation['startLine']}-{citation['endLine']}")
        print("       ── answer ──")
        for line in done["content"].strip().split("\n")[:8]:
            print(f"       {line[:110]}")

    print("\n[9] History + export")
    status, history = call("GET", "/chat/history", token=token)
    failures += not check("chat history", status == 200 and len(history) > 0)

    status, detail = call("GET", f"/repo/{repo_id}/chat", token=token)
    failures += not check("conversation persisted",
                          status == 200 and len(detail["messages"]) >= 2,
                          f"{len(detail['messages'])} messages")

    print("\n[10] Delete")
    status, _ = call("DELETE", f"/repo/{repo_id}", token=token)
    failures += not check("repository deleted", status == 200)
    status, _ = call("GET", f"/repo/{repo_id}", token=token)
    failures += not check("deleted repo returns 404", status == 404, f"status {status}")

    print(f"\n{'ALL CHECKS PASSED' if failures == 0 else f'{failures} CHECK(S) FAILED'}\n")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
