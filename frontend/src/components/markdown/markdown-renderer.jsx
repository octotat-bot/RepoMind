"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./code-block";
import { cn } from "@/lib/utils";

/** Collapse a React children tree back into the raw text of a fenced block. */
function toText(node) {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(toText).join("");
  return toText(node.props?.children);
}

const COMPONENTS = {
  h1: ({ children }) => (
    <h1 className="mt-5 mb-2 text-[15px] font-semibold text-ink first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-5 mb-2 text-[14px] font-semibold text-ink first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 mb-1.5 text-[13px] font-semibold text-ink first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-4 mb-1.5 text-[13px] font-medium text-ink first:mt-0">{children}</h4>
  ),
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-2 ml-1 list-disc space-y-1 pl-4 marker:text-ink-faint">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 ml-1 list-decimal space-y-1 pl-4 marker:text-ink-faint">{children}</ol>
  ),
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="text-ink-muted italic">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-ink underline decoration-line-strong underline-offset-2 transition-colors hover:decoration-white/60"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-line-strong pl-3 text-ink-subtle">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-line" />,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-xl border border-line">
      <table className="w-full border-collapse text-[12px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface-raised">{children}</thead>,
  tr: ({ children }) => <tr className="border-b border-line last:border-0">{children}</tr>,
  th: ({ children }) => (
    <th className="px-3 py-2 text-left font-medium whitespace-nowrap text-ink">{children}</th>
  ),
  td: ({ children }) => <td className="px-3 py-2 align-top text-ink-muted">{children}</td>,
  code: ({ children }) => (
    <code className="rounded-md border border-line bg-surface-raised px-1.5 py-0.5 font-mono text-[11.5px] text-ink">
      {children}
    </code>
  ),
  // Fenced blocks arrive as <pre><code class="language-x">; intercepting `pre`
  // means the inline `code` renderer above is never reached for them.
  pre: ({ children }) => {
    const child = Array.isArray(children) ? children[0] : children;
    const language = /language-([\w-]+)/.exec(child?.props?.className ?? "")?.[1] ?? "text";
    return <CodeBlock code={toText(child?.props?.children)} language={language} />;
  },
};

export function MarkdownRenderer({ content, className }) {
  return (
    <div className={cn("text-[13px] leading-[1.7] text-ink-muted", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
