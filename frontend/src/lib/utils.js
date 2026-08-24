import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names, letting later Tailwind utilities win. */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

export function formatNumber(value) {
  if (value === null || value === undefined) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

export function formatRelativeTime(input) {
  if (!input) return "never";
  const then = new Date(input).getTime();
  if (Number.isNaN(then)) return "never";

  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return "just now";

  const steps = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.348, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];

  let value = seconds;
  for (const [divisor, unit] of steps) {
    if (value < divisor) {
      const rounded = Math.floor(value);
      return `${rounded} ${unit}${rounded === 1 ? "" : "s"} ago`;
    }
    value /= divisor;
  }
  return "a long time ago";
}

export function formatDuration(ms) {
  if (!ms) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Split a repo-relative path into its directory and file name. */
export function splitPath(path = "") {
  const index = path.lastIndexOf("/");
  return index === -1
    ? { directory: "", name: path }
    : { directory: path.slice(0, index), name: path.slice(index + 1) };
}

export function truncateMiddle(text = "", max = 46) {
  if (text.length <= max) return text;
  const half = Math.floor((max - 1) / 2);
  return `${text.slice(0, half)}…${text.slice(-half)}`;
}

/** Trailing-edge debounce for search-as-you-type inputs. */
export function debounce(fn, delay = 250) {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
