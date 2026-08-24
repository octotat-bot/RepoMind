"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Kbd } from "@/components/ui/primitives";
import { GithubMark } from "@/components/repo/github-mark";
import { SampleRepositories } from "@/components/repo/sample-repositories";
import { cn } from "@/lib/utils";

const GITHUB_URL = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i;
const SHORTHAND = /^([\w-][\w.-]*)\/([\w.-]+?)(?:\.git)?$/;
const INVALID = "Enter a GitHub repository, for example https://github.com/vercel/next.js";

/** Accepts full URLs, host-relative URLs and `owner/repo` shorthand. */
export function parseRepoInput(raw) {
  const value = (raw ?? "").trim().replace(/^git@github\.com:/i, "github.com/");
  if (!value) return { error: "Paste a GitHub repository URL to get started." };

  // Anything host-like must satisfy the stricter URL shape, so a bare
  // "github.com/vercel" cannot be mistaken for owner/repo shorthand.
  const hostLike = /github\.com|:\/\/|\s/i.test(value);
  const match = hostLike ? GITHUB_URL.exec(value) : SHORTHAND.exec(value);
  if (!match) return { error: INVALID };

  const [, owner, name] = match;
  return { url: `https://github.com/${owner}/${name}`, fullName: `${owner}/${name}` };
}

function firstUrlLine(text) {
  return text
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"));
}

export function ImportForm({ onSubmit, submitting = false }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const dragDepth = useRef(0);

  const fill = (next) => {
    setValue(next);
    setError(null);
    inputRef.current?.focus();
  };

  // Let the URL be pasted anywhere on the page, not just into the field.
  useEffect(() => {
    const onPaste = (event) => {
      const target = event.target;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      const text = firstUrlLine(event.clipboardData?.getData("text/plain") ?? "");
      if (text) fill(text);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const handleSubmit = (event) => {
    event.preventDefault();
    const parsed = parseRepoInput(value);
    if (parsed.error) {
      setError(parsed.error);
      inputRef.current?.focus();
      return;
    }
    setError(null);
    onSubmit?.(parsed.url);
  };

  const handleDragEnter = (event) => {
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragging(false);
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const dropped =
      event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
    const text = firstUrlLine(dropped ?? "");
    if (text) fill(text);
    else setError("That drop did not contain a URL.");
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative rounded-panel border border-dashed p-6 transition-colors duration-200",
        dragging ? "border-white/40 bg-surface-raised" : "border-line bg-surface/40",
      )}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-panel bg-canvas/80 backdrop-blur-sm">
          <Download className="h-5 w-5 text-ink-muted" aria-hidden />
          <p className="text-[13px] font-medium text-ink">Drop the repository URL</p>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="min-w-0 flex-1">
            <Input
              ref={inputRef}
              icon={GithubMark}
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                if (error) setError(null);
              }}
              disabled={submitting}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              aria-label="GitHub repository URL"
              aria-invalid={Boolean(error)}
              placeholder="https://github.com/vercel/next.js"
              className="h-14 pl-11 text-[15px]"
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={submitting}
            className="h-14 shrink-0 px-6"
          >
            Import
            {!submitting && <ArrowRight className="h-4 w-4" aria-hidden />}
          </Button>
        </div>

        <div className="mt-2.5 flex min-h-5 items-center gap-2 px-1">
          {error ? (
            <p role="alert" className="text-[12px] text-critical">
              {error}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-[12px] text-ink-faint">
              Drop, paste or type a URL — <Kbd>owner/repo</Kbd> works too
            </p>
          )}
        </div>
      </form>

      <div className="mt-6 border-t border-line pt-6">
        <SampleRepositories onPick={fill} disabled={submitting} />
      </div>
    </div>
  );
}
