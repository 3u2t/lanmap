export { displayName, timeAgo } from "@lanmap/shared";

export function fmtMs(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "Unknown";
  return v < 1 ? `${v.toFixed(1)} ms` : `${Math.round(v)} ms`;
}

export function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "Unknown";
  return `${v}%`;
}

export function fmtTime(v: number | null | undefined): string {
  if (!v) return "Unknown";
  return new Date(v).toLocaleString();
}
