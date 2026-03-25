import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GraphStore } from "../graph/store.js";

interface SessionStats {
  totalCalls: number;
  totalTokensSaved: number;
}

let session: SessionStats = { totalCalls: 0, totalTokensSaved: 0 };

export function estimateNaiveCost(files: string[], projectRoot: string): number {
  let totalBytes = 0;
  for (const file of files) {
    try {
      const content = readFileSync(join(projectRoot, file), "utf8");
      totalBytes += content.length;
    } catch {
      // File missing or unreadable — skip
    }
  }
  return Math.floor(totalBytes / 4);
}

export function trackCall(_toolName: string, naiveTokens: number, actualTokens: number): void {
  session.totalCalls += 1;
  session.totalTokensSaved += Math.max(0, naiveTokens - actualTokens);
}

export function getSessionStats(): SessionStats {
  return { ...session };
}

export function resetSession(): void {
  session = { totalCalls: 0, totalTokensSaved: 0 };
}

export function formatMetaLine(_toolName: string, naiveTokens: number, actualTokens: number): string {
  trackCall(_toolName, naiveTokens, actualTokens);
  const saved = Math.max(0, naiveTokens - actualTokens);
  return `_meta: tokens_saved:${saved} naive_tokens:${naiveTokens} actual_tokens:${actualTokens} session_calls:${session.totalCalls} session_tokens_saved:${session.totalTokensSaved}`;
}

export function collectNaiveFiles(
  toolName: string,
  params: Record<string, unknown>,
  store: GraphStore,
): string[] {
  const files = new Set<string>();

  switch (toolName) {
    case "symbol_graph":
    case "symbol_card":
    case "symbol_contract": {
      const name = params.name as string | undefined;
      const file = params.file as string | undefined;
      if (!name) break;
      const nodes = store.findNodes(name, file);
      for (const node of nodes) {
        if (!node.file.startsWith("__")) files.add(node.file);
        const neighbors = store.getNeighbors(node.id);
        for (const nr of neighbors) {
          if (!nr.node.file.startsWith("__")) files.add(nr.node.file);
        }
      }
      break;
    }

    case "impact": {
      const symbols = params.symbols as string[] | undefined;
      if (!symbols) break;
      for (const sym of symbols) {
        const nodes = store.findNodes(sym);
        for (const node of nodes) {
          if (!node.file.startsWith("__")) files.add(node.file);
          const neighbors = store.getNeighbors(node.id, { direction: "in" });
          for (const nr of neighbors) {
            if (!nr.node.file.startsWith("__")) files.add(nr.node.file);
          }
        }
      }
      break;
    }

    case "trace": {
      const entry = params.entry as string | undefined;
      const file = params.file as string | undefined;
      if (!entry) break;
      const nodes = store.findNodes(entry, file);
      if (nodes.length === 1) {
        const node = nodes[0]!;
        if (!node.file.startsWith("__")) files.add(node.file);
        const seen = new Set<string>([node.id]);
        const stack = [node.id];
        while (stack.length > 0) {
          const id = stack.pop()!;
          const callees = store.getNeighbors(id, { direction: "out", kind: "calls" });
          for (const nr of callees) {
            if (!seen.has(nr.node.id)) {
              seen.add(nr.node.id);
              if (!nr.node.file.startsWith("__")) files.add(nr.node.file);
              stack.push(nr.node.id);
            }
          }
        }
      }
      break;
    }

    case "graph_query":
    case "graph_overview":
    case "dead_code": {
      const allFiles = store.listFiles();
      for (const f of allFiles) {
        if (!f.startsWith("__")) files.add(f);
      }
      break;
    }
  }

  return Array.from(files);
}

export function appendTokenMeta(
  toolName: string,
  params: Record<string, unknown>,
  toolOutput: string,
  store: GraphStore,
  projectRoot: string,
): string {
  const naiveFiles = collectNaiveFiles(toolName, params, store);
  const naiveTokens = estimateNaiveCost(naiveFiles, projectRoot);
  const actualTokens = Math.floor(toolOutput.length / 4);
  const metaLine = formatMetaLine(toolName, naiveTokens, actualTokens);
  return `${toolOutput}\n${metaLine}`;
}
