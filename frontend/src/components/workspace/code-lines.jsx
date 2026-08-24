"use client";

import { Highlight, themes } from "prism-react-renderer";
import { cn } from "@/lib/utils";

/** RepoMind language ids mapped onto the grammars prism-react-renderer bundles. */
const GRAMMAR = {
  c: "c",
  cpp: "cpp",
  css: "css",
  go: "go",
  html: "markup",
  java: "clike",
  javascript: "javascript",
  jsx: "jsx",
  json: "json",
  markdown: "markdown",
  php: "clike",
  python: "python",
  rust: "rust",
  sql: "sql",
  tsx: "tsx",
  typescript: "typescript",
  yaml: "yaml",
};

const THEME = {
  ...themes.vsDark,
  plain: { color: "#d4d4d4", backgroundColor: "transparent" },
};

// Prism tokenises synchronously, so beyond this the main thread stalls long
// enough to feel like a hang. Past the ceiling the same rows render unstyled.
const MAX_HIGHLIGHT_CHARS = 120_000;

function Row({ number, active, showLineNumbers, wrap, className, style, children }) {
  return (
    <div
      data-line={number}
      style={style}
      className={cn(
        "flex px-3",
        active && "bg-white/[0.07] shadow-[inset_2px_0_0_0_rgba(255,255,255,0.55)]",
        className,
      )}
    >
      {showLineNumbers && (
        <span className="mr-4 w-10 shrink-0 select-none text-right text-ink-faint tabular-nums">
          {number}
        </span>
      )}
      <span
        className={cn(
          "min-w-0",
          wrap ? "flex-1 whitespace-pre-wrap break-words" : "whitespace-pre",
        )}
      >
        {children}
      </span>
    </div>
  );
}

/**
 * Syntax-highlighted code rows with optional line numbers.
 *
 * `startLine` lets a chunk keep its real line numbers from the source file, and
 * `highlight` ({ start, end }) marks a cited range. Every row carries a
 * `data-line` attribute so callers can scroll a specific line into view.
 */
export function CodeLines({
  code = "",
  language = "text",
  startLine = 1,
  highlight,
  showLineNumbers = false,
  wrap = false,
  className,
}) {
  const body = code.replace(/\n+$/, "");
  const isActive = (number) =>
    Boolean(highlight) && number >= highlight.start && number <= highlight.end;
  const preClass = cn("w-fit min-w-full font-mono text-[12px] leading-[1.65]", className);

  if (body.length > MAX_HIGHLIGHT_CHARS) {
    return (
      <pre className={cn(preClass, "text-ink-muted")}>
        {body.split("\n").map((line, index) => {
          const number = startLine + index;
          return (
            <Row
              key={number}
              number={number}
              active={isActive(number)}
              showLineNumbers={showLineNumbers}
              wrap={wrap}
            >
              {line || "\n"}
            </Row>
          );
        })}
      </pre>
    );
  }

  return (
    <Highlight theme={THEME} code={body} language={GRAMMAR[language] ?? "plain"}>
      {({ tokens, getLineProps, getTokenProps, style }) => (
        <pre className={preClass} style={style}>
          {tokens.map((line, index) => {
            const number = startLine + index;
            const lineProps = getLineProps({ line });
            return (
              <Row
                key={number}
                number={number}
                active={isActive(number)}
                showLineNumbers={showLineNumbers}
                wrap={wrap}
                className={lineProps.className}
                style={lineProps.style}
              >
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </Row>
            );
          })}
        </pre>
      )}
    </Highlight>
  );
}
