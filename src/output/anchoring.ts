import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GraphNode } from "../graph/types.js";
import type { NeighborResult } from "../graph/store.js";
import { formatRoleTags, type NodeSignals } from "./signals.js";

export interface AnchorResult {
  anchor: string;
  stale: boolean;
}

function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function computeAnchor(node: GraphNode, projectRoot: string): AnchorResult {
  const fullPath = join(projectRoot, node.file);

  if (!existsSync(fullPath)) {
    return {
      anchor: `${node.file}:${node.start_line}:?`,
      stale: true,
    };
  }

  const fileContent = readFileSync(fullPath, "utf-8");
  const currentHash = sha256Hex(fileContent);
  const stale = currentHash !== node.content_hash;

  const lines = fileContent.split(/\r?\n/);
  const lineIndex = node.start_line - 1;

  if (lineIndex < 0 || lineIndex >= lines.length) {
    return {
      anchor: `${node.file}:${node.start_line}:?`,
      stale: true,
    };
  }

  const lineContent = lines[lineIndex]!.trim();
  const lineHash = sha256Hex(lineContent).slice(0, 4);

  return {
    anchor: `${node.file}:${node.start_line}:${lineHash}`,
    stale,
  };
}

export interface RankResult {
  kept: NeighborResult[];
  omitted: number;
}

const DEFAULT_NEIGHBOR_LIMIT = 10;

export function rankNeighbors(neighbors: NeighborResult[], limit: number): RankResult {
  const effectiveLimit = limit < 0 ? DEFAULT_NEIGHBOR_LIMIT : limit;

  const sorted = [...neighbors].sort((a, b) => {
    const confidenceDiff = b.edge.provenance.confidence - a.edge.provenance.confidence;
    if (confidenceDiff !== 0) return confidenceDiff;

    return b.edge.created_at - a.edge.created_at;
  });

  const kept = sorted.slice(0, effectiveLimit);

  return {
    kept,
    omitted: sorted.length - kept.length,
  };
}

export interface AnchoredNeighbor {
  anchor: AnchorResult;
  name: string;
  edgeKind: string;
  confidence: number;
  provenanceSource: string;
  signals?: NodeSignals;
}
export interface NeighborSection {
  items: AnchoredNeighbor[];
  omitted: number;
}

export interface SymbolHeader {
  name: string;
  kind: string;
  anchor: AnchorResult;
  signals?: NodeSignals;
}
function formatSection(title: string, section: NeighborSection): string {
  if (section.items.length === 0 && section.omitted === 0) {
    return "";
  }

  const lines: string[] = [];
  lines.push(`\n### ${title}`);

  for (const item of section.items) {
    const staleMarker = item.anchor.stale ? " [stale]" : "";
    const signalTags = item.signals ? ` ${formatRoleTags(item.signals)}` : "";
    lines.push(
      `  ${item.anchor.anchor}  ${item.name}  ${item.edgeKind}  confidence:${item.confidence}  ${item.provenanceSource}${staleMarker}${signalTags}`,
    );
  }

  if (section.omitted > 0) {
    lines.push(`  (${section.omitted} more omitted)`);
  }

  return lines.join("\n");
}

export interface NamedSection {
  title: string;
  section: NeighborSection;
}
export function formatNeighborhood(
  symbol: SymbolHeader,
  sections: NamedSection[],
): string {
  const staleMarker = symbol.anchor.stale ? " [stale]" : "";
  const signalTags = symbol.signals ? ` ${formatRoleTags(symbol.signals)}` : "";
  const header = `## ${symbol.name} (${symbol.kind})\n${symbol.anchor.anchor}${staleMarker}${signalTags}`;
  const renderedSections = sections
    .map((s) => formatSection(s.title, s.section))
    .filter((s) => s.length > 0)
    .join("\n");
  return `${header}${renderedSections}\n`;
}