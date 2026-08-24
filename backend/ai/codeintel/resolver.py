"""Resolve import specifiers to files that actually exist in the repository.

Only intra-repository edges matter for the architecture graph, so anything that
resolves outside the tree (npm/PyPI packages, Node builtins) is dropped rather
than guessed at.
"""

from __future__ import annotations

from posixpath import normpath

_JS_EXTENSIONS = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs")
_JS_INDEX_FILES = tuple(f"index{extension}" for extension in _JS_EXTENSIONS)

# Common bundler aliases pointing at a source root.
_ALIAS_PREFIXES = ("@/", "~/", "#/")
_ALIAS_ROOTS = ("src/", "app/", "", "frontend/src/", "lib/")


class ModuleResolver:
    def __init__(self, file_paths: set[str]) -> None:
        self.files = file_paths
        # Python dotted path -> file, e.g. "app.core.config" -> "app/core/config.py"
        self._python_modules = self._build_python_index(file_paths)
        # Dotted package name -> directory. Packages are tracked separately
        # because an empty __init__.py is skipped by the indexer (nothing to
        # embed), which would otherwise make the whole package unresolvable.
        self._python_packages = self._build_package_index(file_paths)

    @staticmethod
    def _build_package_index(paths: set[str]) -> dict[str, str]:
        directories = {
            path.rsplit("/", 1)[0] for path in paths if path.endswith(".py") and "/" in path
        }
        index: dict[str, str] = {}
        for directory in directories:
            dotted = directory.replace("/", ".")
            index[dotted] = directory
            parts = dotted.split(".")
            for start in range(1, len(parts)):
                index.setdefault(".".join(parts[start:]), directory)
        return index

    @staticmethod
    def _build_python_index(paths: set[str]) -> dict[str, str]:
        index: dict[str, str] = {}
        for path in paths:
            if not path.endswith(".py"):
                continue
            module = path[:-3].replace("/", ".")
            index[module] = path
            if module.endswith(".__init__"):
                index[module[: -len(".__init__")]] = path
            # Also index suffixes so "app.core.config" resolves when the repo
            # root sits one directory below the checkout root.
            parts = module.split(".")
            for start in range(1, len(parts)):
                index.setdefault(".".join(parts[start:]), path)
        return index

    # ── JavaScript / TypeScript ─────────────────────────────────────────────

    def resolve_js(self, specifier: str, importer: str) -> str | None:
        if specifier.startswith("."):
            base = normpath(f"{_dirname(importer)}/{specifier}").lstrip("./")
            return self._try_js_candidates(base)

        for prefix in _ALIAS_PREFIXES:
            if specifier.startswith(prefix):
                tail = specifier[len(prefix) :]
                for root in _ALIAS_ROOTS:
                    if resolved := self._try_js_candidates(f"{root}{tail}"):
                        return resolved
                return None

        # Bare specifiers are third-party unless a matching source path exists.
        if "/" in specifier and not specifier.startswith("@"):
            return self._try_js_candidates(specifier)
        return None

    def _try_js_candidates(self, base: str) -> str | None:
        base = base.strip("/")
        if not base:
            return None
        if base in self.files:
            return base
        for extension in _JS_EXTENSIONS:
            candidate = f"{base}{extension}"
            if candidate in self.files:
                return candidate
        for index_file in _JS_INDEX_FILES:
            candidate = f"{base}/{index_file}"
            if candidate in self.files:
                return candidate
        return None

    # ── Python ──────────────────────────────────────────────────────────────

    def resolve_python(self, specifier: str, importer: str) -> str | None:
        if specifier.startswith("."):
            level = len(specifier) - len(specifier.lstrip("."))
            module = specifier.lstrip(".")

            directory = _dirname(importer)
            for _ in range(level - 1):
                directory = _dirname(directory)

            base = f"{directory}/{module.replace('.', '/')}" if module else directory
            base = base.strip("/")
            for candidate in (f"{base}.py", f"{base}/__init__.py"):
                if candidate in self.files:
                    return candidate
            return None

        return self._python_modules.get(specifier)

    def resolve(self, specifier: str, importer: str, language: str) -> str | None:
        if language == "python":
            return self.resolve_python(specifier, importer)
        if language in {"javascript", "jsx", "typescript", "tsx"}:
            return self.resolve_js(specifier, importer)
        return None

    def resolve_targets(
        self, specifier: str, importer: str, language: str, names: list[str]
    ) -> set[str]:
        """Resolve an import to every repository file it actually reaches.

        ``from package import submodule`` binds a *module*, not a symbol, so the
        real dependency is ``package/submodule.py`` rather than the package
        ``__init__.py`` that ``resolve`` returns.
        """
        primary = self.resolve(specifier, importer, language)

        if language != "python":
            return {primary} if primary else set()

        targets = {primary} if primary else set()

        package_dir = self._package_dir_for(specifier, importer, primary)
        if package_dir is not None:
            for name in names:
                for candidate in (f"{package_dir}/{name}.py", f"{package_dir}/{name}/__init__.py"):
                    if candidate in self.files:
                        targets.add(candidate)

        return targets

    def _package_dir_for(
        self, specifier: str, importer: str, primary: str | None
    ) -> str | None:
        if primary and primary.endswith("__init__.py"):
            return primary[: -len("/__init__.py")]
        if primary is not None:
            return None

        if specifier.startswith("."):
            level = len(specifier) - len(specifier.lstrip("."))
            module = specifier.lstrip(".")
            directory = _dirname(importer)
            for _ in range(level - 1):
                directory = _dirname(directory)
            candidate = f"{directory}/{module.replace('.', '/')}".strip("/") if module else directory
            return candidate if candidate in self._python_packages.values() else None

        return self._python_packages.get(specifier)


def _dirname(path: str) -> str:
    return path.rsplit("/", 1)[0] if "/" in path else ""
