"use client";

import { CodeLines } from "@/components/workspace/code-lines";
import { CopyButton } from "@/components/workspace/copy-button";

export function CodeBlock({ code, language = "text" }) {
  return (
    <div className="my-3 overflow-hidden rounded-xl border border-line bg-canvas">
      <div className="flex items-center justify-between border-b border-line bg-surface px-3 py-1.5">
        <span className="font-mono text-[10px] tracking-wider text-ink-faint uppercase">
          {language}
        </span>
        <CopyButton value={code} label="Copy code" />
      </div>
      <div className="overflow-x-auto py-2.5">
        <CodeLines code={code} language={language} />
      </div>
    </div>
  );
}
