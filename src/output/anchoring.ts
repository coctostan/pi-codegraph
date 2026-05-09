import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GraphNode } from "../graph/types.js";
import type { NeighborResult } from "../graph/store.js";
import { formatRoleTags, type NodeSignals } from "./signals.js";
import xxhashWasm from "xxhash-wasm";

const HASH_LEN = 3;
const RADIX = 16;
const HASH_MOD = RADIX ** HASH_LEN;
const HASH_DICT = Array.from({ length: HASH_MOD }, (_, i) => i.toString(RADIX).padStart(HASH_LEN, "0"));

let h32Fn: ((input: string, seed?: number) => number) | null = null;
let initPromise: Promise<void> | null = null;

export async function ensureHashInit(): Promise<void> {
  if (h32Fn) return;
  if (!initPromise) {
    initPromise = xxhashWasm().then((hasher) => {
      h32Fn = hasher.h32;
    });
  }
  await initPromise;
}

function xxh32(input: string): number {
  if (!h32Fn) throw new Error("Hash not initialized — call ensureHashInit() first");
  return h32Fn(input, 0) >>> 0;
}

export function computeLineHash(_lineNumber: number, line: string): string {
  if (line.endsWith("\r")) line = line.slice(0, -1);
  line = line.replace(/\s+/g, "");
  return HASH_DICT[xxh32(line) % HASH_MOD]!;
}
export interface AnchorResult {
  file: string;
  anchor: string;
  stale: boolean;
}

function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function computeAnchor(node: GraphNode, projectRoot: string): AnchorResult {
  const fullPath = join(projectRoot, node.file);

  if (!existsSync(fullPath)) {
    return { file: node.file, anchor: `${node.start_line}:?`, stale: true };
  }

  let fileContent: string;
  try {
    fileContent = readFileSync(fullPath, "utf-8");
  } catch {
    return { file: node.file, anchor: `${node.start_line}:?`, stale: true };
  }

  const currentHash = sha256Hex(fileContent);
  const stale = currentHash !== node.content_hash;
  const lines = fileContent.split("\n");
  const lineIndex = node.start_line - 1;

  if (lineIndex < 0 || lineIndex >= lines.length) {
    return { file: node.file, anchor: `${node.start_line}:?`, stale: true };
  }

  const lineHash = computeLineHash(node.start_line, lines[lineIndex]!);
  return { file: node.file, anchor: `${node.start_line}:${lineHash}`, stale };
}

export function formatLegacyAnchorLocation(anchor: AnchorResult): string {
  if (!anchor.file) return anchor.anchor;
  const match = anchor.anchor.match(/^(\d+):([0-9a-f]{3})$/);
  if (!match) return `${anchor.file}:${anchor.anchor}`;
  return `${anchor.file}:${match[1]}:${match[2].padStart(4, "0")}`;
}

export function formatAnchorLocation(anchor: AnchorResult): string {
  return `${anchor.file}  ${anchor.anchor}`;
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
      `  ${formatAnchorLocation(item.anchor)}  ${item.name}  ${item.edgeKind}  confidence:${item.confidence}  ${item.provenanceSource}${staleMarker}${signalTags}`,
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
  const header = `## ${symbol.name} (${symbol.kind})\n${formatAnchorLocation(symbol.anchor)}${staleMarker}${signalTags}`;
  const renderedSections = sections
    .map((s) => formatSection(s.title, s.section))
    .filter((s) => s.length > 0)
    .join("\n");
  return `${header}${renderedSections}\n`;
}