import type { GraphStore } from "../graph/store.js";
import type { NodeKind } from "../graph/types.js";
import { BM25Index } from "./bm25.js";

export interface SymbolSearchParams {
  query: string;
  kind?: NodeKind;
  file?: string;
  limit?: number;
  store: GraphStore;
  projectRoot: string;
}

interface CachedIndex {
  index: BM25Index;
  nodeMap: Map<string, { name: string; kind: string; file: string; startLine: number; signature?: string }>;
  fingerprint: string;
}

let cachedIndex: CachedIndex | null = null;

export function resetSearchCacheForTesting(): void {
  cachedIndex = null;
}

function computeFingerprint(store: GraphStore): string {
  const stats = store.getStatistics();
  const totalNodes = Object.values(stats.nodes).reduce((a, b) => a + b, 0);
  const totalFiles = stats.files.total;
  return `${totalNodes}:${totalFiles}`;
}

function getOrBuildIndex(store: GraphStore): CachedIndex {
  const fingerprint = computeFingerprint(store);
  if (cachedIndex && cachedIndex.fingerprint === fingerprint) {
    return cachedIndex;
  }

  const rows = store.queryRows<{
    id: string; name: string; kind: string; file: string;
    start_line: number; signature: string | null;
  }>("SELECT id, name, kind, file, start_line, signature FROM nodes ORDER BY id");

  const index = new BM25Index();
  const nodeMap = new Map<string, { name: string; kind: string; file: string; startLine: number; signature?: string }>();

  for (const row of rows) {
    index.addDocument(row.id, {
      name: row.name,
      signature: row.signature ?? "",
      file: row.file,
    });
    nodeMap.set(row.id, {
      name: row.name,
      kind: row.kind,
      file: row.file,
      startLine: row.start_line,
      ...(row.signature ? { signature: row.signature } : {}),
    });
  }

  index.build();
  cachedIndex = { index, nodeMap, fingerprint };
  return cachedIndex;
}

function matchGlob(filePath: string, pattern: string): boolean {
  const regexStr = "^" + pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\0")
    .replace(/\*/g, "[^/]*")
    .replace(/\0/g, ".*")
    + "$";
  return new RegExp(regexStr).test(filePath);
}
export function symbolSearch(params: SymbolSearchParams): string {
  const { query, kind, file, limit = 20, store } = params;
  const { index, nodeMap } = getOrBuildIndex(store);
  const fetchLimit = (kind || file) ? Math.max(limit * 5, 200) : limit;
  const rawResults = index.search(query, fetchLimit);

  const filtered = rawResults.filter((result) => {
    const meta = nodeMap.get(result.id);
    if (!meta) return false;
    if (kind && meta.kind !== kind) return false;
    if (file && !matchGlob(meta.file, file)) return false;
    return true;
  });

  const limited = filtered.slice(0, limit);

  if (limited.length === 0) {
    return "No results found.\n";
  }
  const lines: string[] = [];
  lines.push(`## Search Results (${limited.length})\n`);
  let rank = 0;
  for (const result of limited) {
    const meta = nodeMap.get(result.id)!;
    rank++;
    lines.push(`${rank}. **${meta.name}** (${meta.kind})  score: ${result.score}`);
    lines.push(`   ${meta.file}:${meta.startLine}`);
    if (meta.signature) {
      lines.push(`   ${meta.signature}`);
    }
  }
  return lines.join("\n") + "\n";
}
