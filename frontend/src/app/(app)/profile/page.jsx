"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Boxes,
  Files,
  Layers,
  MessagesSquare,
  Pencil,
  ScrollText,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { useAsync } from "@/lib/hooks";
import { languageColor } from "@/lib/constants";
import { formatNumber, formatRelativeTime } from "@/lib/utils";

function initialsOf(user) {
  return (user?.name || user?.email || "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function Stat({ icon: Icon, label, value, loading }) {
  return (
    <div className="bg-surface px-5 py-4">
      <p className="flex items-center gap-2 text-[11px] font-medium tracking-wider text-ink-faint uppercase">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </p>
      {loading ? (
        <Skeleton className="mt-2.5 h-7 w-16" />
      ) : (
        <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-ink">
          {formatNumber(value)}
        </p>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  const repos = useAsync(() => api.repos.list(), []);
  const chats = useAsync(() => api.chat.history(), []);

  useEffect(() => {
    if (repos.error) console.warn(repos.error.message);
  }, [repos.error]);

  const repositories = useMemo(() => repos.data ?? [], [repos.data]);
  const conversations = useMemo(() => chats.data ?? [], [chats.data]);

  const totals = useMemo(
    () =>
      repositories.reduce(
        (sum, repository) => ({
          files: sum.files + (repository.fileCount ?? 0),
          chunks: sum.chunks + (repository.chunkCount ?? 0),
          lines: sum.lines + (repository.lineCount ?? 0),
        }),
        { files: 0, chunks: 0, lines: 0 },
      ),
    [repositories],
  );

  const questionsAsked = useMemo(
    () =>
      conversations.reduce(
        // Each exchange is a user message plus an assistant reply.
        (sum, chat) => sum + Math.floor((chat.messageCount ?? 0) / 2),
        0,
      ),
    [conversations],
  );

  const languages = useMemo(() => {
    const counts = new Map();
    for (const repository of repositories) {
      if (!repository.language) continue;
      counts.set(repository.language, (counts.get(repository.language) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [repositories]);

  const loading = repos.loading || chats.loading;

  return (
    <div className="mx-auto w-full max-w-[880px] px-6 py-10 sm:px-8">
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className="text-gradient text-[26px] font-semibold tracking-tight">Profile</h1>
        <p className="mt-1.5 text-[13px] text-ink-muted">
          Your account and everything you have indexed.
        </p>
      </motion.header>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        className="mt-8"
      >
        <Card className="p-6">
          <div className="flex flex-wrap items-center gap-5">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface-raised text-[20px] font-semibold text-ink-muted">
              {initialsOf(user) || "?"}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[18px] font-medium text-ink">
                {user?.name ?? "—"}
              </p>
              <p className="truncate text-[13px] text-ink-subtle">{user?.email ?? "—"}</p>
              <p className="mt-1.5 text-[12px] text-ink-faint">
                Member since {formatRelativeTime(user?.createdAt)}
              </p>
            </div>

            <Button variant="secondary" size="sm" onClick={() => router.push("/settings")}>
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Edit in settings
            </Button>
          </div>
        </Card>
      </motion.div>

      <motion.dl
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-4"
      >
        <Stat icon={Boxes} label="Repositories" value={repositories.length} loading={loading} />
        <Stat icon={Files} label="Files indexed" value={totals.files} loading={loading} />
        <Stat icon={Layers} label="Chunks" value={totals.chunks} loading={loading} />
        <Stat icon={ScrollText} label="Lines of code" value={totals.lines} loading={loading} />
      </motion.dl>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        >
          <Card>
            <div className="border-b border-line px-5 py-3.5">
              <h2 className="text-[13px] font-medium text-ink">Repositories</h2>
            </div>

            {loading ? (
              <div className="space-y-2 p-5">
                {[0, 1, 2].map((index) => (
                  <Skeleton key={index} className="h-9 w-full" />
                ))}
              </div>
            ) : repositories.length === 0 ? (
              <EmptyState
                icon={Boxes}
                title="Nothing indexed yet"
                description="Import a repository to see it here."
                className="py-10"
                action={
                  <Button variant="primary" size="sm" onClick={() => router.push("/import")}>
                    Import a repository
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-line">
                {repositories.slice(0, 6).map((repository) => (
                  <li key={repository.id}>
                    <button
                      type="button"
                      onClick={() => router.push(`/workspace/${repository.id}`)}
                      className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-hover/50"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: languageColor(repository.language) }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-ink">
                          {repository.fullName}
                        </span>
                        <span className="block text-[11px] text-ink-faint">
                          {formatNumber(repository.fileCount)} files ·{" "}
                          {formatRelativeTime(repository.indexedAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <Card>
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <h2 className="text-[13px] font-medium text-ink">Conversations</h2>
              {!loading && questionsAsked > 0 && (
                <Badge tone="neutral">{formatNumber(questionsAsked)} questions</Badge>
              )}
            </div>

            {loading ? (
              <div className="space-y-2 p-5">
                {[0, 1, 2].map((index) => (
                  <Skeleton key={index} className="h-9 w-full" />
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <EmptyState
                icon={MessagesSquare}
                title="No questions yet"
                description="Open a repository workspace and ask something about the code."
                className="py-10"
              />
            ) : (
              <ul className="divide-y divide-line">
                {conversations.slice(0, 6).map((chat) => (
                  <li key={chat.id}>
                    <button
                      type="button"
                      onClick={() => router.push(`/workspace/${chat.repositoryId}`)}
                      className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-hover/50"
                    >
                      <MessagesSquare
                        className="h-3.5 w-3.5 shrink-0 text-ink-faint"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-ink">{chat.title}</span>
                        <span className="block truncate text-[11px] text-ink-faint">
                          {chat.repositoryFullName ?? "—"} ·{" "}
                          {formatRelativeTime(chat.updatedAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </motion.section>
      </div>

      {languages.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="mt-5"
        >
          <Card className="p-5">
            <h2 className="mb-3 text-[13px] font-medium text-ink">Languages you work with</h2>
            <div className="flex flex-wrap gap-2">
              {languages.map(([language, count]) => (
                <Badge key={language} tone="neutral">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: languageColor(language) }}
                    aria-hidden
                  />
                  {language}
                  <span className="text-ink-faint">{count}</span>
                </Badge>
              ))}
            </div>
          </Card>
        </motion.section>
      )}

      {repos.error && (
        <Card className="mt-5">
          <EmptyState
            icon={TriangleAlert}
            title="Could not load your activity"
            description={repos.error.message}
            className="py-10"
            action={
              <Button variant="secondary" size="sm" onClick={repos.refetch}>
                Try again
              </Button>
            }
          />
        </Card>
      )}
    </div>
  );
}
