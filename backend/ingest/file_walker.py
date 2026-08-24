"""Walk a cloned repository and select the files worth indexing."""

from __future__ import annotations

import fnmatch
from dataclasses import dataclass
from pathlib import Path

from app.core.logging import get_logger
from app.core.shared_config import (
    binary_extensions,
    ignored_directories,
    ignored_file_globs,
    language_by_extension,
    limits,
)

logger = get_logger(__name__)

# A NUL byte in the first block is the same heuristic git uses to detect binaries.
_BINARY_SNIFF_BYTES = 8192


@dataclass(frozen=True)
class DiscoveredFile:
    path: str  # repo-relative, POSIX separators
    absolute: Path
    name: str
    extension: str
    language: str
    size_bytes: int


def detect_language(path: Path) -> str | None:
    return language_by_extension().get(path.suffix.lower())


def _is_ignored_directory(name: str) -> bool:
    return name in ignored_directories() or (name.startswith(".") and name != ".github")


def _is_ignored_file(name: str) -> bool:
    return any(fnmatch.fnmatch(name, pattern) for pattern in ignored_file_globs())


def _looks_binary(path: Path) -> bool:
    if path.suffix.lower() in binary_extensions():
        return True
    try:
        with path.open("rb") as handle:
            return b"\x00" in handle.read(_BINARY_SNIFF_BYTES)
    except OSError:
        return True


def discover_files(root: Path) -> list[DiscoveredFile]:
    """Return every indexable source file beneath ``root``.

    Filtering happens in cost order — cheap name/extension checks before any
    file is opened — because large repositories contain far more skippable
    files than indexable ones.
    """
    rules = limits()
    discovered: list[DiscoveredFile] = []
    total_bytes = 0
    skipped_binary = 0
    skipped_large = 0

    for current_dir, dirnames, filenames in root.walk():
        dirnames[:] = [name for name in dirnames if not _is_ignored_directory(name)]

        for filename in sorted(filenames):
            if len(discovered) >= rules.max_files_per_repo:
                logger.warning("Hit the %d-file cap; truncating", rules.max_files_per_repo)
                return discovered

            absolute = current_dir / filename
            extension = absolute.suffix.lower()

            language = language_by_extension().get(extension)
            if language is None or _is_ignored_file(filename):
                continue

            try:
                size = absolute.stat().st_size
            except OSError:
                continue

            if size == 0:
                continue
            if size > rules.max_file_bytes:
                skipped_large += 1
                continue
            if total_bytes + size > rules.max_repo_bytes:
                logger.warning("Hit the repository byte budget; truncating")
                return discovered
            if _looks_binary(absolute):
                skipped_binary += 1
                continue

            total_bytes += size
            discovered.append(
                DiscoveredFile(
                    path=absolute.relative_to(root).as_posix(),
                    absolute=absolute,
                    name=filename,
                    extension=extension,
                    language=language,
                    size_bytes=size,
                )
            )

    logger.info(
        "Discovered %d files (%.1f MB); skipped %d binary, %d oversized",
        len(discovered),
        total_bytes / 1_048_576,
        skipped_binary,
        skipped_large,
    )
    return discovered


def read_text(path: Path) -> str | None:
    """Read a source file, tolerating the encoding zoo found in real repos."""
    for encoding in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            return path.read_text(encoding=encoding)
        except (UnicodeDecodeError, UnicodeError):
            continue
        except OSError as exc:
            logger.debug("Could not read %s: %s", path, exc)
            return None
    return None


def build_file_tree(files: list[DiscoveredFile]) -> dict:
    """Fold a flat path list into the nested tree the explorer renders."""
    root: dict = {"name": "", "path": "", "type": "directory", "children": {}}

    for file in files:
        parts = file.path.split("/")
        node = root
        for index, part in enumerate(parts):
            is_leaf = index == len(parts) - 1
            children = node["children"]
            if part not in children:
                children[part] = {
                    "name": part,
                    "path": "/".join(parts[: index + 1]),
                    "type": "file" if is_leaf else "directory",
                    "children": {},
                    **(
                        {"language": file.language, "size": file.size_bytes}
                        if is_leaf
                        else {}
                    ),
                }
            node = children[part]

    def to_list(node: dict) -> dict:
        children = [to_list(child) for child in node.pop("children", {}).values()]
        if children:
            # Directories first, then alphabetical — standard explorer ordering.
            children.sort(key=lambda item: (item["type"] == "file", item["name"].lower()))
            node["children"] = children
        return node

    return to_list(root)
