"use client";

import { memo } from "react";
import { ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import { languageColor } from "@/lib/constants";
import { cn } from "@/lib/utils";

const INDENT_PX = 12;

function TreeNode({ node, depth, expanded, onToggle, onSelect, activePath }) {
  const isDirectory = node.type === "directory";
  const isOpen = expanded.has(node.path);
  const isActive = activePath === node.path;

  const activate = () => (isDirectory ? onToggle(node.path) : onSelect(node));

  return (
    <li>
      <button
        type="button"
        onClick={activate}
        aria-expanded={isDirectory ? isOpen : undefined}
        aria-current={isActive ? "true" : undefined}
        title={node.path}
        style={{ paddingLeft: 8 + depth * INDENT_PX }}
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-md py-[5px] pr-2 text-left transition-colors",
          isActive
            ? "bg-surface-hover text-ink"
            : "text-ink-muted hover:bg-surface-hover/60 hover:text-ink",
        )}
      >
        {isDirectory ? (
          <>
            <ChevronRight
              className={cn(
                "h-3 w-3 shrink-0 text-ink-faint transition-transform duration-150",
                isOpen && "rotate-90",
              )}
              aria-hidden
            />
            {isOpen ? (
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-ink-subtle" aria-hidden />
            ) : (
              <Folder className="h-3.5 w-3.5 shrink-0 text-ink-subtle" aria-hidden />
            )}
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" aria-hidden />
            <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
              <File className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
              {node.language && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ring-2 ring-surface"
                  style={{ background: languageColor(node.language) }}
                  aria-hidden
                />
              )}
            </span>
          </>
        )}

        <span className="truncate font-mono text-[12px]">{node.name}</span>
      </button>

      {isDirectory && isOpen && node.children?.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              activePath={activePath}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Recursive directory tree. Children render only while their folder is open. */
export const FileTree = memo(function FileTree({
  nodes = [],
  expanded,
  onToggle,
  onSelect,
  activePath,
}) {
  return (
    <ul className="pb-2">
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          depth={0}
          expanded={expanded}
          onToggle={onToggle}
          onSelect={onSelect}
          activePath={activePath}
        />
      ))}
    </ul>
  );
});

/** Flat result rows for an active filter, where tree structure only gets in the way. */
export function FileMatches({ matches, onSelect, activePath }) {
  return (
    <ul className="pb-2">
      {matches.map((node) => {
        const directory = node.path.slice(0, node.path.length - node.name.length - 1);
        return (
          <li key={node.path}>
            <button
              type="button"
              onClick={() => onSelect(node)}
              title={node.path}
              className={cn(
                "flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors",
                activePath === node.path
                  ? "bg-surface-hover"
                  : "hover:bg-surface-hover/60",
              )}
            >
              <span className="flex w-full items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: languageColor(node.language) }}
                  aria-hidden
                />
                <span className="truncate font-mono text-[12px] text-ink">{node.name}</span>
              </span>
              {directory && (
                <span className="w-full truncate pl-3 font-mono text-[10.5px] text-ink-faint">
                  {directory}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
