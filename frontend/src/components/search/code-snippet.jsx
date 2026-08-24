"use client";

import { Highlight, themes } from "prism-react-renderer";
import { cn } from "@/lib/utils";

// The backend labels languages with its own taxonomy; Prism needs grammar names.
const PRISM_GRAMMAR = {
  typescript: "typescript",
  tsx: "tsx",
  javascript: "jsx",
  jsx: "jsx",
  python: "python",
  java: "java",
  cpp: "cpp",
  c: "c",
  go: "go",
  rust: "rust",
  ruby: "ruby",
  php: "php",
  markdown: "markdown",
  json: "json",
  html: "markup",
  css: "css",
  shell: "bash",
  yaml: "yaml",
  sql: "sql",
  toml: "ini",
};

export function CodeSnippet({ code = "", language, startLine = 1, className }) {
  const grammar = PRISM_GRAMMAR[language?.toLowerCase()] ?? "text";

  return (
    <Highlight theme={themes.vsDark} code={code.replace(/\s+$/, "")} language={grammar}>
      {({ className: themeClass, style, tokens, getLineProps, getTokenProps }) => (
        <pre
          className={cn(
            "no-scrollbar overflow-x-auto px-3 py-3 font-mono text-[12px] leading-[1.7]",
            themeClass,
            className,
          )}
          style={{ ...style, background: "transparent" }}
        >
          {tokens.map((line, index) => {
            const lineProps = getLineProps({ line });
            return (
              <div
                key={index}
                {...lineProps}
                className={cn(lineProps.className, "flex w-max min-w-full")}
              >
                <span className="mr-4 min-w-8 shrink-0 select-none text-right text-ink-faint tabular-nums">
                  {startLine + index}
                </span>
                <span className="whitespace-pre">
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </span>
              </div>
            );
          })}
        </pre>
      )}
    </Highlight>
  );
}
