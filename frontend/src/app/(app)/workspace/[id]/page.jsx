"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import {
  FileCode2,
  Loader2,
  MessagesSquare,
  Network,
  ScanSearch,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Spinner } from "@/components/ui/primitives";
import { ArchitecturePanel } from "@/components/workspace/architecture-panel";
import { ChatPanel } from "@/components/workspace/chat-panel";
import { ContextPanel } from "@/components/workspace/context-panel";
import { DeadCodePanel } from "@/components/workspace/dead-code-panel";
import { FileExplorer } from "@/components/workspace/file-explorer";
import { FileViewer } from "@/components/workspace/file-viewer";
import { WorkspaceHeader } from "@/components/workspace/workspace-header";
import { api } from "@/lib/api";
import { useAsync, useKeyboardShortcut } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "chat", label: "Chat", icon: MessagesSquare },
  { id: "file", label: "File", icon: FileCode2 },
  { id: "architecture", label: "Architecture", icon: Network },
  { id: "deadcode", label: "Dead code", icon: ScanSearch },
];

function Workspace() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState("chat");
  const [openFile, setOpenFile] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [showExplorer, setShowExplorer] = useState(true);
  const [showContext, setShowContext] = useState(true);
  const [reindexing, setReindexing] = useState(false);

  const detail = useAsync(() => api.repos.get(id), [id]);
  const files = useAsync(() => api.repos.files(id), [id]);

  const layout = useDefaultLayout({ id: "repomind.workspace" });

  /** Open a path in the centre viewer, highlighting a cited range when present. */
  const openFileAt = useCallback((target) => {
    if (!target?.filePath) return;
    setOpenFile({
      path: target.filePath,
      highlight: target.startLine
        ? { start: target.startLine, end: target.endLine ?? target.startLine }
        : null,
    });
    setTab("file");
  }, []);

  // Deep link from a search result: /workspace/{id}?file=…&line=…&to=…
  const deepLinkFile = searchParams.get("file");
  const deepLinkLine = searchParams.get("line");
  const deepLinkEnd = searchParams.get("to");

  useEffect(() => {
    if (!deepLinkFile) return;
    openFileAt({
      filePath: deepLinkFile,
      startLine: Number(deepLinkLine) || undefined,
      endLine: Number(deepLinkEnd) || undefined,
    });
  }, [deepLinkFile, deepLinkLine, deepLinkEnd, openFileAt]);

  useKeyboardShortcut("b", () => setShowExplorer((value) => !value), { meta: true });
  useKeyboardShortcut("i", () => setShowContext((value) => !value), { meta: true });

  const repository = detail.data?.repository;

  const reindex = async () => {
    setReindexing(true);
    try {
      await api.repos.reindex(id);
      toast.success("Re-indexing started. Progress is on the dashboard.");
      detail.refetch();
    } catch (error) {
      toast.error(error.message ?? "Could not start re-indexing.");
    } finally {
      setReindexing(false);
    }
  };

  if (detail.loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }

  if (detail.error || !repository) {
    return (
      <div className="mx-auto max-w-lg px-6 py-20">
        <Card>
          <EmptyState
            icon={TriangleAlert}
            title="This workspace is unavailable"
            description={detail.error?.message ?? "The repository could not be loaded."}
            action={
              <Button variant="primary" onClick={() => router.push("/dashboard")}>
                Back to repositories
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  if (repository.status !== "READY") {
    return (
      <div className="mx-auto max-w-lg px-6 py-20">
        <Card>
          <EmptyState
            icon={repository.status === "FAILED" ? TriangleAlert : Loader2}
            title={
              repository.status === "FAILED"
                ? `Indexing ${repository.fullName} failed`
                : `${repository.fullName} is still indexing`
            }
            description={
              repository.status === "FAILED"
                ? repository.errorMessage ?? "Re-index the repository to try again."
                : "The workspace opens as soon as the vector index is built. Progress is shown on the dashboard."
            }
            action={
              <Button variant="primary" onClick={() => router.push("/dashboard")}>
                Back to repositories
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    // Fills the app shell's main area; every scroll happens inside a panel.
    <div className="flex h-full flex-col">
      <WorkspaceHeader
        repository={repository}
        showExplorer={showExplorer}
        showContext={showContext}
        onToggleExplorer={() => setShowExplorer((value) => !value)}
        onToggleContext={() => setShowContext((value) => !value)}
        onReindex={reindex}
        reindexing={reindexing}
      />

      <Group
        orientation="horizontal"
        className="min-h-0 flex-1"
        defaultLayout={layout.defaultLayout}
        onLayoutChanged={layout.onLayoutChanged}
      >
        {showExplorer && (
          <>
            <Panel id="explorer" defaultSize="20%" minSize="14%" maxSize="34%">
              <FileExplorer
                tree={files.data?.tree}
                fileCount={files.data?.fileCount}
                loading={files.loading}
                activePath={openFile?.path}
                onSelect={(node) => openFileAt({ filePath: node.path })}
              />
            </Panel>
            <ResizeSeparator />
          </>
        )}

        <Panel id="main" minSize="30%">
          <div className="flex h-full flex-col border-x border-line">
            <nav
              role="tablist"
              aria-label="Workspace views"
              className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2"
            >
              {TABS.map(({ id: tabId, label, icon: Icon }) => {
                const disabled = tabId === "file" && !openFile;
                return (
                  <button
                    key={tabId}
                    role="tab"
                    aria-selected={tab === tabId}
                    disabled={disabled}
                    onClick={() => setTab(tabId)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] transition-colors",
                      "disabled:pointer-events-none disabled:opacity-35",
                      tab === tabId
                        ? "bg-surface-hover text-ink"
                        : "text-ink-subtle hover:text-ink-muted",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {label}
                  </button>
                );
              })}
            </nav>

            <div className="min-h-0 flex-1">
              {/* Chat stays mounted so switching tabs never interrupts a stream. */}
              <div className={cn("h-full", tab !== "chat" && "hidden")}>
                <ChatPanel
                  repository={repository}
                  onContext={setChunks}
                  onOpenFile={openFileAt}
                />
              </div>

              {tab === "file" && openFile && (
                <FileViewer
                  repositoryId={id}
                  path={openFile.path}
                  highlight={openFile.highlight}
                  onClose={() => {
                    setOpenFile(null);
                    setTab("chat");
                  }}
                />
              )}

              {tab === "architecture" && (
                <div className="h-full overflow-y-auto">
                  <ArchitecturePanel repositoryId={id} onOpenFile={openFileAt} />
                </div>
              )}

              {tab === "deadcode" && (
                <div className="h-full overflow-y-auto">
                  <DeadCodePanel repositoryId={id} onOpenFile={openFileAt} />
                </div>
              )}
            </div>
          </div>
        </Panel>

        {showContext && (
          <>
            <ResizeSeparator />
            <Panel id="context" defaultSize="26%" minSize="18%" maxSize="40%">
              <ContextPanel detail={detail.data} chunks={chunks} onOpenFile={openFileAt} />
            </Panel>
          </>
        )}
      </Group>
    </div>
  );
}

export default function WorkspacePage() {
  // useSearchParams requires a Suspense boundary during prerendering.
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Spinner className="h-5 w-5" />
        </div>
      }
    >
      <Workspace />
    </Suspense>
  );
}

function ResizeSeparator() {
  return (
    <Separator
      className={cn(
        "group relative w-px shrink-0 bg-line transition-colors",
        "hover:bg-line-strong data-[state=drag]:bg-white/40",
      )}
    >
      {/* Widen the grab target without widening the visible hairline. */}
      <span className="absolute inset-y-0 -left-1 -right-1 cursor-col-resize" aria-hidden />
    </Separator>
  );
}
