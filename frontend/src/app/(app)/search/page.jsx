"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RepoSelector } from "@/components/search/repo-selector";
import { SearchBar } from "@/components/search/search-bar";
import { SearchResult } from "@/components/search/search-result";
import {
  NoReadyRepositories,
  NoResults,
  SearchIntro,
  SearchSkeletons,
} from "@/components/search/search-states";
import { Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useAsync, useKeyboardShortcut, useLocalStorage } from "@/lib/hooks";
import { formatDuration } from "@/lib/utils";

const RESULT_LIMIT = 15;
const IDLE = { phase: "idle", results: [], query: "", elapsed: 0 };

export default function SearchPage() {
  const router = useRouter();
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState(IDLE);

  const { data: repositories, loading: loadingRepos } = useAsync(() => api.repos.list(), []);
  const ready = useMemo(
    () => (repositories ?? []).filter((repo) => repo.status === "READY"),
    [repositories],
  );

  const [repoId, setRepoId] = useLocalStorage("repomind.search.repository", null);

  // Fall back to the first ready repository when the stored one is gone.
  useEffect(() => {
    if (!ready.length) return;
    if (!repoId || !ready.some((repo) => repo.id === repoId)) setRepoId(ready[0].id);
  }, [ready, repoId, setRepoId]);

  useEffect(() => setOutcome(IDLE), [repoId]);

  useKeyboardShortcut("/", () => inputRef.current?.focus());

  const runSearch = useCallback(
    async (raw) => {
      const term = (raw ?? "").trim();
      if (!term || !repoId) return;

      const startedAt = performance.now();
      setOutcome((current) => ({ ...current, phase: "searching" }));
      try {
        const response = await api.repos.search(repoId, term, RESULT_LIMIT, true);
        setOutcome({
          phase: "done",
          results: response.results ?? [],
          query: term,
          elapsed: performance.now() - startedAt,
        });
      } catch (error) {
        setOutcome(IDLE);
        toast.error(error.message ?? "Search failed.");
      }
    },
    [repoId],
  );

  const pickExample = (example) => {
    setQuery(example);
    runSearch(example);
  };

  const selected = ready.find((repo) => repo.id === repoId) ?? null;
  const searching = outcome.phase === "searching";

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Semantic search</h1>
          <p className="mt-1.5 text-[13px] text-ink-subtle">
            Retrieve code by intent across an indexed repository.
          </p>
        </div>
        {loadingRepos ? (
          <Skeleton className="h-10 w-[220px] rounded-xl" />
        ) : (
          <RepoSelector
            repositories={ready}
            selectedId={repoId}
            onSelect={setRepoId}
            disabled={searching}
          />
        )}
      </header>

      <div className="mt-7">
        <SearchBar
          ref={inputRef}
          value={query}
          onChange={setQuery}
          onSubmit={runSearch}
          loading={searching}
          disabled={!selected}
          placeholder={
            selected
              ? `Search ${selected.fullName} by meaning…`
              : "Import a repository to start searching"
          }
        />
      </div>

      <div className="mt-6">
        {loadingRepos ? (
          <SearchSkeletons count={3} />
        ) : ready.length === 0 ? (
          <NoReadyRepositories />
        ) : searching ? (
          <SearchSkeletons />
        ) : outcome.phase === "idle" ? (
          <SearchIntro onPick={pickExample} disabled={!selected} />
        ) : outcome.results.length === 0 ? (
          <NoResults query={outcome.query} />
        ) : (
          <>
            <div className="mb-3 flex items-baseline justify-between px-1">
              <p className="text-[13px] text-ink-muted">
                <span className="font-medium text-ink">{outcome.results.length}</span>{" "}
                {outcome.results.length === 1 ? "file" : "files"} for “{outcome.query}”
              </p>
              <p className="font-mono text-[11px] tabular-nums text-ink-faint">
                {formatDuration(outcome.elapsed)}
              </p>
            </div>
            <div className="space-y-3">
              {outcome.results.map((result, index) => (
                <SearchResult
                  key={result.chunkId}
                  result={result}
                  index={index}
                  onOpen={() =>
                    router.push(
                      `/workspace/${repoId}?file=${encodeURIComponent(result.filePath)}` +
                        `&line=${result.startLine}&to=${result.endLine}`,
                    )
                  }
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
