"""Prove the app survives the filesystem being wiped underneath it.

Free hosting tiers delete the disk on every restart, redeploy and idle
spin-down. This indexes a repository, deletes the FAISS index and the checkout
exactly as a restart would, and then checks that search, chat, the file viewer
and the analysis views all still work — rebuilt from the database, with no
re-indexing and no calls to the embedding model.

Run it in two phases so the backend can be restarted in between, which is what
clears its in-memory index cache and makes the rebuild genuine:

    python tests/verify_ephemeral_recovery.py setup    # index, then wipe the disk
    # ... restart the backend here ...
    python tests/verify_ephemeral_recovery.py verify   # must all still work

Running it with no argument does both without a restart, which still exercises
the on-disk recovery paths but leaves the vector index served from memory.

The backend must be running with EPHEMERAL_FILESYSTEM=true.
"""

from __future__ import annotations

import json
import os
import shutil
import ssl
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# A python.org build on macOS ships without the system trust store, so HTTPS
# calls fail with CERTIFICATE_VERIFY_FAILED against a deployed instance.
try:
    import certifi

    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:  # pragma: no cover - certifi ships with httpx
    SSL_CONTEXT = None

BASE = os.environ.get("REPOMIND_API", "http://127.0.0.1:8000/api/v1").rstrip("/")
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ.get("REPOMIND_DATA", PROJECT_ROOT / "data"))
FAISS_DIR = Path(os.environ.get("REPOMIND_FAISS", PROJECT_ROOT / "faiss" / "indexes"))
SAMPLE_REPO = os.environ.get("REPOMIND_SAMPLE_REPO", "https://github.com/psf/requests")
STATE_FILE = Path(os.environ.get("REPOMIND_STATE", "/tmp/repomind-ephemeral-state.json"))

failures: list[str] = []
checks = 0


def check(condition: bool, label: str) -> None:
    global checks
    checks += 1
    print(f"  {'ok  ' if condition else 'FAIL'} {label}")
    if not condition:
        failures.append(label)


def call(path: str, method: str = "GET", body=None, token: str | None = None, raw=False):
    request = urllib.request.Request(f"{BASE}{path}", method=method)
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, data, timeout=300, context=SSL_CONTEXT) as response:
            payload = response.read().decode()
            return response.status, (payload if raw else json.loads(payload or "null"))
    except urllib.error.HTTPError as error:
        payload = error.read().decode()
        try:
            return error.code, json.loads(payload)
        except json.JSONDecodeError:
            return error.code, payload


def stream_chat(repo_id: str, message: str, token: str) -> list[tuple[str, dict]]:
    request = urllib.request.Request(f"{BASE}/repo/{repo_id}/chat", method="POST")
    request.add_header("Authorization", f"Bearer {token}")
    request.add_header("Content-Type", "application/json")
    events: list[tuple[str, dict]] = []
    with urllib.request.urlopen(
        request, json.dumps({"message": message}).encode(), timeout=300, context=SSL_CONTEXT
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


def setup() -> tuple[str, str] | None:
    """Index a repository, confirm it works, then delete its files from disk."""
    print("\n[1] index a repository")
    email = f"ephemeral-{int(time.time())}@repomind.dev"
    _, auth = call("/auth/register", "POST",
                   {"email": email, "name": "Ephemeral", "password": "verify-me-1234"})
    token = auth["tokens"]["accessToken"]

    status, repo = call("/repo/import", "POST", {"url": SAMPLE_REPO}, token=token)
    check(status in (200, 202), f"import accepted ({status})")
    repo_id = repo["id"]

    deadline = time.time() + 900
    while time.time() < deadline:
        _, detail = call(f"/repo/{repo_id}", token=token)
        if detail["repository"]["status"] in ("READY", "FAILED"):
            break
        time.sleep(3)

    _, detail = call(f"/repo/{repo_id}", token=token)
    repository = detail["repository"]
    check(repository["status"] == "READY", f"indexed ({repository['status']})")
    if repository["status"] != "READY":
        print(f"       {repository.get('errorMessage')}")
        return None
    print(f"       {repository['fileCount']} files, {repository['chunkCount']} chunks")

    print("\n[2] confirm it works before the wipe")
    _, before = call(f"/repo/{repo_id}/search?q=how%20are%20retries%20configured", token=token)
    check(before.get("count", 0) > 0, f"search returns {before.get('count')} results")
    baseline_top = before["results"][0]["filePath"] if before.get("results") else None

    print("\n[3] wipe the filesystem, exactly as a restart would")
    index_dir = FAISS_DIR / repo_id
    work_dir = DATA_DIR / "repos" / repo_id
    check(index_dir.exists(), f"FAISS index existed at {index_dir.name}")
    check(work_dir.exists(), f"checkout existed at {work_dir.name}")

    shutil.rmtree(index_dir, ignore_errors=True)
    shutil.rmtree(work_dir, ignore_errors=True)
    check(not index_dir.exists() and not work_dir.exists(), "both deleted from disk")

    STATE_FILE.write_text(
        json.dumps({"repoId": repo_id, "token": token, "baselineTop": baseline_top})
    )
    return repo_id, token


def verify(repo_id: str, token: str, baseline_top: str | None) -> None:
    """Every feature must work with nothing on disk but rows in the database."""
    print("\n[4] everything must still work, rebuilt from the database")

    index_dir = FAISS_DIR / repo_id
    work_dir = DATA_DIR / "repos" / repo_id
    check(not index_dir.exists(), "FAISS index is still absent from disk")
    check(not work_dir.exists(), "checkout is still absent from disk")

    _, after = call(f"/repo/{repo_id}/search?q=how%20are%20retries%20configured", token=token)
    check(after.get("count", 0) > 0, f"search still works ({after.get('count')} results)")
    if after.get("results") and baseline_top:
        check(
            after["results"][0]["filePath"] == baseline_top,
            "search returns the same top result as before the wipe",
        )

    status, content = call(
        f"/repo/{repo_id}/file?path=src/requests/adapters.py", token=token
    )
    check(status == 200 and len(content.get("content", "")) > 0,
          "file viewer still serves source")

    status, architecture = call(f"/architecture/{repo_id}", token=token)
    check(status == 200 and architecture["graph"]["nodes"],
          f"architecture still works ({len(architecture.get('graph', {}).get('nodes', []))} nodes)")

    status, dead = call(f"/repo/{repo_id}/dead-code", token=token)
    check(status == 200 and "summary" in dead,
          f"dead-code still works ({dead.get('summary', {}).get('total')} findings)")

    events = stream_chat(repo_id, "How are retries configured?", token)
    names = [name for name, _ in events]
    check("context" in names and names[-1] == "done", "chat still streams an answer")
    context = next((p for n, p in events if n == "context"), {})
    check(len(context.get("chunks", [])) > 0,
          f"retrieval still finds context ({len(context.get('chunks', []))} chunks)")

    print("\n[5] cleanup")
    status, _ = call(f"/repo/{repo_id}", "DELETE", token=token)
    check(status == 200, "repository deleted")


def summarise() -> int:
    print(f"\n{'─' * 60}")
    if failures:
        print(f"{len(failures)}/{checks} checks FAILED:")
        for failure in failures:
            print(f"  · {failure}")
        return 1
    print(f"All {checks} recovery checks passed.")
    return 0


def main() -> int:
    phase = sys.argv[1] if len(sys.argv) > 1 else "all"

    print(f"\nAPI:   {BASE}")
    print(f"Data:  {DATA_DIR}")
    print(f"FAISS: {FAISS_DIR}")

    if phase in ("setup", "all"):
        result = setup()
        if result is None:
            return 1
        if phase == "setup":
            print(f"\nState written to {STATE_FILE}.")
            print("Restart the backend, then run: verify_ephemeral_recovery.py verify")
            return summarise()
        repo_id, token = result
        baseline_top = json.loads(STATE_FILE.read_text())["baselineTop"]
    else:
        if not STATE_FILE.exists():
            print(f"No state at {STATE_FILE}; run the 'setup' phase first.")
            return 1
        state = json.loads(STATE_FILE.read_text())
        repo_id, token, baseline_top = state["repoId"], state["token"], state["baselineTop"]

    verify(repo_id, token, baseline_top)
    STATE_FILE.unlink(missing_ok=True)
    return summarise()


if __name__ == "__main__":
    sys.exit(main())
