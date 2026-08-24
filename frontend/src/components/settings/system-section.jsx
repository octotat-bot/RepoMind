"use client";

import { CheckCircle2, RotateCcw, TriangleAlert } from "lucide-react";
import { SettingsSection } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import { Badge, Skeleton } from "@/components/ui/primitives";
import { api, BASE_URL } from "@/lib/api";
import { useAsync } from "@/lib/hooks";

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-line py-3 last:border-0">
      <span className="shrink-0 text-[13px] text-ink-muted">{label}</span>
      <div className="min-w-0 text-right">{children}</div>
    </div>
  );
}

function Mono({ children }) {
  return <span className="font-mono text-[12px] break-all text-ink">{children}</span>;
}

/** Live dependency health, so a broken local setup is visible without the logs. */
export function SystemSection() {
  const { data, error, loading, refetch } = useAsync(() => api.system.health(), []);

  const database = data?.checks?.database;
  const ollama = data?.checks?.ollama;
  const healthy = data?.status === "ok";

  return (
    <SettingsSection
      title="System"
      description="RepoMind runs entirely on your machine. This is the live state of its dependencies."
      delay={0.1}
      footer={
        <>
          <p className="text-[12px] text-ink-faint">
            {loading
              ? "Checking…"
              : error
                ? "The API did not respond."
                : healthy
                  ? "All dependencies are reachable."
                  : "One or more dependencies need attention."}
          </p>
          <Button variant="secondary" size="sm" onClick={refetch} loading={loading}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Re-check
          </Button>
        </>
      }
    >
      {loading && !data ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-critical/25 bg-critical/10 px-3.5 py-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-critical" aria-hidden />
          <div className="text-[13px] leading-relaxed text-critical">
            <p>Could not reach the API at {BASE_URL}.</p>
            <p className="mt-1 text-critical/80">{error.message}</p>
          </div>
        </div>
      ) : (
        <div>
          <Row label="Overall">
            <Badge tone={healthy ? "positive" : "caution"}>
              {healthy ? (
                <CheckCircle2 className="h-3 w-3" aria-hidden />
              ) : (
                <TriangleAlert className="h-3 w-3" aria-hidden />
              )}
              {healthy ? "Healthy" : "Degraded"}
            </Badge>
          </Row>

          <Row label="API">
            <Mono>{BASE_URL}</Mono>
          </Row>

          <Row label="Database">
            <div className="flex items-center justify-end gap-2">
              <Mono>{database?.engine ?? "unknown"}</Mono>
              <Badge tone={database?.ok ? "positive" : "critical"}>
                {database?.ok ? "Connected" : "Unavailable"}
              </Badge>
            </div>
          </Row>

          <Row label="Ollama">
            <div className="flex items-center justify-end gap-2">
              <Mono>{ollama?.baseUrl}</Mono>
              <Badge tone={ollama?.ok ? "positive" : "critical"}>
                {ollama?.ok ? "Reachable" : "Unavailable"}
              </Badge>
            </div>
          </Row>

          <Row label="Chat model">
            <Mono>{ollama?.chatModel}</Mono>
          </Row>

          <Row label="Embedding model">
            <Mono>{ollama?.embedModel}</Mono>
          </Row>

          {ollama?.missingModels?.length > 0 && (
            <div className="mt-4 rounded-xl border border-caution/25 bg-caution/10 px-3.5 py-3">
              <p className="text-[13px] text-caution">
                {ollama.missingModels.length === 1 ? "A model is" : "Models are"} not installed
                yet. Pull {ollama.missingModels.length === 1 ? "it" : "them"} with:
              </p>
              <pre className="mt-2 overflow-x-auto font-mono text-[12px] text-ink">
                {ollama.missingModels.map((model) => `ollama pull ${model}`).join("\n")}
              </pre>
            </div>
          )}
        </div>
      )}
    </SettingsSection>
  );
}
