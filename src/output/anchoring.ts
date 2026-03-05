import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GraphNode } from "../graph/types.js";
import type { NeighborResult } from "../graph/store.js";

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

export function rankNeighbors(neighbors: NeighborResult[], limit: number): RankResult {
  const sorted = [...neighbors].sort((a, b) => {
    const confidenceDiff = b.edge.provenance.confidence - a.edge.provenance.confidence;
    if (confidenceDiff !== 0) return confidenceDiff;

    return b.edge.created_at - a.edge.created_at;
  });

  const kept = sorted.slice(0, limit);

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
}

export interface NeighborSection {
  items: AnchoredNeighbor[];
  omitted: number;
}

export interface SymbolHeader {
  name: string;
  kind: string;
  anchor: AnchorResult;
}

function formatSection(title: string, section: NeighborSection): string {
  if (section.items.length === 0 && section.omitted === 0) {
    return "";
  }

  const lines: string[] = [];
  lines.push(`\n### ${title}`);

  for (const item of section.items) {
    const staleMarker = item.anchor.stale ? " [stale]" : "";
    lines.push(
      `  ${item.anchor.anchor}  ${item.name}  ${item.edgeKind}  confidence:${item.confidence}  ${item.provenanceSource}${staleMarker}`,
    );
  }

  if (section.omitted > 0) {
    lines.push(`  (${section.omitted} more omitted)`);
  }

  return lines.join("\n");
}

export function formatNeighborhood(
  symbol: SymbolHeader,
  callers: NeighborSection,
  callees: NeighborSection,
  imports: NeighborSection,
  unresolved: NeighborSection,
): string {
  const staleMarker = symbol.anchor.stale ? " [stale]" : "";
  const header = `## ${symbol.name} (${symbol.kind})\n${symbol.anchor.anchor}${staleMarker}`;

  const sections = [
    formatSection("Callers", callers),
    formatSection("Callees", callees),
    formatSection("Imports", imports),
    formatSection("Unresolved", unresolved),
  ]
    .filter((s) => s.length > 0)
    .join("\n");

  return `${header}${sections}\n`;
}