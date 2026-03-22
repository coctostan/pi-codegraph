import type { GraphStatistics } from "../graph/store.js";

export type TrustStatus = "fresh" | "stale" | "mixed" | "heuristic" | "runtime-backed";
export type TrustMode = "default" | "heuristic" | "runtime-backed";

export interface TrustHeaderContext {
  stats: GraphStatistics;
  mode?: TrustMode;
  hasLocalExceptions?: boolean;
}

export function collectEvidenceSources(stats: GraphStatistics): string[] {
  return Object.keys(stats.edges)
    .flatMap((kind) => Object.keys(stats.edges[kind] ?? {}))
    .filter((value, index, all) => all.indexOf(value) === index)
    .sort();
}

export function resolveTrustStatus(context: TrustHeaderContext): TrustStatus {
  const { stats, mode = "default", hasLocalExceptions = false } = context;
  const hasStaleFiles = stats.files.stale > 0;

  if (mode === "runtime-backed") {
    return hasStaleFiles || hasLocalExceptions ? "mixed" : "runtime-backed";
  }

  if (mode === "heuristic") {
    return hasStaleFiles || hasLocalExceptions ? "mixed" : "heuristic";
  }

  if (hasStaleFiles) return "stale";
  if (hasLocalExceptions) return "mixed";
  return "fresh";
}

export function formatTrustHeader(context: TrustHeaderContext): string {
  const status = resolveTrustStatus(context);
  const evidenceSources = collectEvidenceSources(context.stats);
  const evidence = evidenceSources.length > 0 ? evidenceSources.join(",") : "none";

  return [
    "## Trust",
    `status: ${status}`,
    `evidence: ${evidence}  stale-files: ${context.stats.files.stale}/${context.stats.files.total}`,
  ].join("\n");
}

export function prependTrustHeader(body: string, context: TrustHeaderContext): string {
  return `${formatTrustHeader(context)}\n${body}`;
}
