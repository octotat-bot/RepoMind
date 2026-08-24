# Dead-code detection: what it can and cannot see

The detector reports four kinds of finding. Every one of them is **advisory**.
Static analysis cannot observe runtime behaviour, so the honest framing is
"here are candidates worth a look", not "delete these".

## What it detects

| Kind | Rule | Severity |
| --- | --- | --- |
| `UNUSED_EXPORT` | Exported symbol that no other module imports by name | MEDIUM (LOW in entry-point files) |
| `UNREFERENCED_FILE` | Module with exports that nothing imports | HIGH over 80 lines, else MEDIUM |
| `DUPLICATE_UTILITY` | Functions with identical structural fingerprints in different files | HIGH over 25 lines, else MEDIUM |
| `UNUSED_IMPORT` | Imported binding never referenced in the importing module | LOW |

## How the two languages are analysed

**Python — real AST.** Parsed with the standard library `ast` module. A name
counts as referenced only when it appears in a `Load` context, so a function
that is defined but never called is genuinely detected rather than guessed at.
The analyser understands:

- `__all__` as an explicit declaration of the public API
- `if TYPE_CHECKING:` blocks, whose imports exist only for annotations
- string forward references such as `Mapped["Repository"]`
- `# noqa` and `# type: ignore`, which suppress a finding on that line
- `from __future__ import ...`, which binds nothing
- `from package import submodule`, which depends on the submodule file rather
  than the package `__init__.py`

**JavaScript / TypeScript — scoped regexes.** Shipping a JavaScript parser into
a Python service (tree-sitter, dukpy, a Node sidecar) is a heavy dependency for
a linting feature, so import/export extraction uses carefully scoped patterns
instead. Comments and string literals are stripped first so commented-out code
does not register as a real import.

## Known limitations

These are the cases that produce false positives or misses. They are listed
because a tool that hides its blind spots is worse than one that names them.

**Dynamic access is invisible.** `getattr(module, name)`, `obj[methodName]`,
computed imports and reflection-based dependency injection all break the
analysis. A symbol reached only that way looks dead.

**Framework conventions.** Files invoked by a router or bundler rather than
imported — Next.js `page`/`layout`/`route`, Django `urls.py`, pytest
`conftest.py` — are never imported by anything. Common entry-point names and
directories (`pages/`, `app/`, `routes/`, `migrations/`, `scripts/`, `bin/`) are
exempted, but the list is heuristic and cannot cover every framework.

**Library public APIs.** In a repository that *is* a library, the whole point of
many exports is to be imported by consumers outside the repository. Those will
be reported as unused. This is why `psf/requests` shows unused exports: they are
public API, not dead code.

**Re-exports in JavaScript.** `export * from "./module"` is not traced through
to the underlying symbols, so a symbol re-exported that way can look unused.

**Test files are skipped.** Paths containing `test`, `spec`, `__tests__`,
`fixtures`, `mocks`, `e2e` or `stories` are excluded from unused-export and
unreferenced-file analysis, since test-only helpers would otherwise dominate the
results. A symbol used *only* by tests is therefore not reported.

**Duplicate detection is structural, not semantic.** Functions are normalised —
comments, whitespace and string contents removed — and hashed. Two functions
that do the same thing with different structure will not match; two that are
structurally identical but intentionally separate will.

**Results are capped.** Each category returns at most 40 findings (25 for
duplicates), ordered by severity, to keep the response and the UI usable.

## Reading the results

Treat a finding as a question, not a verdict:

- **`UNREFERENCED_FILE` on a large module** is the highest-value signal. A file
  with many exports that nothing imports is usually genuinely orphaned.
- **`UNUSED_EXPORT` in an application** (not a library) is usually real.
- **`UNUSED_EXPORT` in a library** is usually the public API.
- **`UNUSED_IMPORT`** is nearly always correct for Python and worth cleaning up.
- **`DUPLICATE_UTILITY`** is worth reviewing even when intentional, since it
  often marks a missing shared module.

Verify with a project-wide search before deleting anything.
