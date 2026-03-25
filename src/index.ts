import { Type, type TSchema } from "@sinclair/typebox";
import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { GraphStore } from "./graph/store.js";
import { SqliteGraphStore } from "./graph/sqlite.js";
import { indexProject } from "./indexer/pipeline.js";
import { resolveMissingCallers, resolveImplementations } from "./indexer/lsp-resolver.js";
import { TsServerClient } from "./indexer/tsserver-client.js";
import { resolveEdge } from "./tools/resolve-edge.js";
import { deleteEdge } from "./tools/delete-edge.js";
import { symbolGraph } from "./tools/symbol-graph.js";
import { impact } from "./tools/impact.js";
import { trace } from "./tools/trace.js";
import { graphQuery } from "./tools/graph-query.js";
import { symbolCard } from "./tools/symbol-card.js";
import { symbolContract } from "./tools/symbol-contract.js";
import { graphOverview } from "./tools/graph-overview.js";
import { deadCode } from "./tools/dead-code.js";
import { symbolSearch, resetSearchCacheForTesting as _resetSearchCache } from "./tools/symbol-search.js";
import { appendTokenMeta, resetSession } from "./tools/token-tracker.js";

const SymbolGraphParams = Type.Object({
  name: Type.String({ description: "Symbol name to look up" }),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
});

const ResolveEdgeParams = Type.Object({
  source: Type.String({ description: "Source symbol name" }),
  target: Type.String({ description: "Target symbol name" }),
  kind: Type.String({ description: "Edge kind (calls, imports, implements, extends, ...)" }),
  evidence: Type.String({ description: "Free-text evidence explaining why this edge exists" }),
  sourceFile: Type.Optional(Type.String({ description: "Source file path to disambiguate" })),
  targetFile: Type.Optional(Type.String({ description: "Target file path to disambiguate" })),
});

const ImpactParams = Type.Object({
  symbols: Type.Array(Type.String({ description: "Changed symbol name" }), {
    description: "One or more symbol names that changed",
  }),
  changeType: Type.Union(
    [
      Type.Literal("signature_change"),
      Type.Literal("removal"),
      Type.Literal("behavior_change"),
      Type.Literal("addition"),
    ],
    { description: "Kind of change" },
  ),
  maxDepth: Type.Optional(
    Type.Number({ description: "Maximum traversal depth (default 5)" }),
  ),
});

const TraceParams = Type.Object({
  entry: Type.String({ description: "Entry symbol or endpoint name" }),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
});

const GraphQueryParams = Type.Object({
  query: Type.String({ description: "Cypher subset query to execute against the graph" }),
});

const DeleteEdgeParams = Type.Object({
  source: Type.String({ description: "Source symbol name" }),
  target: Type.String({ description: "Target symbol name" }),
  kind: Type.String({ description: "Edge kind (calls, imports, implements, extends, ...)" }),
  sourceFile: Type.Optional(Type.String({ description: "Source file path to disambiguate" })),
  targetFile: Type.Optional(Type.String({ description: "Target file path to disambiguate" })),
});

const SymbolCardParams = Type.Object({
  name: Type.String({ description: "Symbol name to look up" }),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
});

const SymbolContractParams = Type.Object({
  name: Type.String({ description: "Symbol name to look up" }),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
});

const GraphOverviewParams = Type.Object({});

const DeadCodeParams = Type.Object({
  name: Type.Optional(Type.String({ description: "Symbol name to check (omit for sweep mode)" })),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
  kind: Type.Optional(Type.String({ description: "Filter by node kind (function, class, interface, etc.)" })),
  glob: Type.Optional(Type.String({ description: "Filter by file glob pattern (e.g. src/tools/*)" })),
});

const SymbolSearchParams = Type.Object({
  query: Type.String({ description: "Search query (free text, supports partial names)" }),
  kind: Type.Optional(Type.String({ description: "Filter by symbol kind (function, class, interface, etc.)" })),
  file: Type.Optional(Type.String({ description: "Filter by file glob pattern (e.g. src/tools/*)" })),
  limit: Type.Optional(Type.Number({ description: "Maximum results to return (default: 20)" })),
});

let sharedStore: GraphStore | null = null;
let lastIndexError: Error | null = null;

export function getSharedStoreForTesting(): GraphStore | null {
  return sharedStore;
}

export function getLastIndexErrorForTesting(): Error | null {
  return lastIndexError;
}

export function resetStoreForTesting(): void {
  if (sharedStore) sharedStore.close();
  sharedStore = null;
  lastIndexError = null;
  resetSession();
  _resetSearchCache();
}

function getOrCreateStore(projectRoot: string): GraphStore {
  if (sharedStore) return sharedStore;
  const dbDir = join(projectRoot, ".codegraph");
  mkdirSync(dbDir, { recursive: true });
  sharedStore = new SqliteGraphStore(join(dbDir, "graph.db"));
  return sharedStore;
}

async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  try {
    await indexProject(projectRoot, store);
    lastIndexError = null;
  } catch (err) {
    lastIndexError = err instanceof Error ? err : new Error(String(err));
    // Indexing failed (likely readonly DB) — degrade gracefully and serve stale graph data.
  }
}

function indexingFailedNote(): string {
  if (!lastIndexError) return "";
  return "indexing-failed: graph may be stale (readonly database)\n";
}

function registerReadOnlyTool<TParams extends TSchema>(pi: ExtensionAPI, tool: ToolDefinition<TParams>): void {
  const ptc = {
    callable: true,
    enabled: true,
    policy: "read-only" as const,
    readOnly: true,
    pythonName: tool.name,
  };
  (tool as any).ptc = ptc;
  pi.registerTool(tool);
}
export default function piCodegraph(pi: ExtensionAPI): void {
  registerReadOnlyTool(pi, {
    name: "symbol_graph",
    label: "Symbol Graph",
    description: "Look up a symbol and return its anchored neighborhood",
    parameters: SymbolGraphParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      let resolvedNode: any | null = null;
      const nodes = store.findNodes(params.name, params.file);
      if (nodes.length === 1) {
        resolvedNode = nodes[0]!;
        const client = new TsServerClient(projectRoot);
        try {
          await resolveMissingCallers(resolvedNode, store, projectRoot, client);
          if (resolvedNode.kind === "interface") {
            await resolveImplementations(resolvedNode, store, projectRoot, client);
          }
        } catch {
          // Resolver writes failed (likely readonly DB) — continue with existing graph data.
        } finally {
          await client.shutdown().catch(() => {});
        }
      }

      let output = symbolGraph({ name: params.name, file: params.file, store, projectRoot });
      output = indexingFailedNote() + output;
      output = appendTokenMeta("symbol_graph", { name: params.name, file: params.file }, output, store, projectRoot);
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });

  pi.registerTool({
    name: "resolve_edge",
    label: "Resolve Edge",
    description: "Create an edge in the symbol graph with evidence",
    parameters: ResolveEdgeParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      let output: string;
      try {
        output = resolveEdge({
          source: params.source,
          target: params.target,
          sourceFile: params.sourceFile,
          targetFile: params.targetFile,
          kind: params.kind,
          evidence: params.evidence,
          store,
          projectRoot,
        });
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        if (msg.includes("readonly")) {
          output = "Cannot write edge: database is readonly. Re-index the project to enable writes.";
        } else {
          throw err;
        }
      }
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });

  pi.registerTool({
    name: "delete_edge",
    label: "Delete Edge",
    description: "Delete an agent-created edge from the symbol graph",
    parameters: DeleteEdgeParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      let output: string;
      try {
        output = deleteEdge({
          source: params.source,
          target: params.target,
          sourceFile: params.sourceFile,
          targetFile: params.targetFile,
          kind: params.kind,
          store,
          projectRoot,
        });
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        if (msg.includes("readonly")) {
          output = "Cannot delete edge: database is readonly. Re-index the project to enable writes.";
        } else {
          throw err;
        }
      }
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });

  registerReadOnlyTool(pi, {
    name: "impact",
    label: "Impact",
    description: "Given changed symbols, return downstream dependents classified by change type",
    parameters: ImpactParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      const text = impact({
        symbols: params.symbols,
        changeType: params.changeType,
        store,
        projectRoot,
        maxDepth: params.maxDepth,
      });
      let output = indexingFailedNote() + text;
      output = appendTokenMeta("impact", { symbols: params.symbols }, output, store, projectRoot);
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });

  registerReadOnlyTool(pi, {
    name: "trace",
    label: "Trace",
    description:
      "Return one deterministic anchored execution path for a test, symbol, or endpoint. Results may be coverage-backed or static heuristics. Use trace to follow all reachable branches, symbol_graph to inspect neighborhoods, and impact to inspect downstream dependents.",
    parameters: TraceParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      const text = trace({ entry: params.entry, file: params.file, store, projectRoot });
      let output = indexingFailedNote() + text;
      output = appendTokenMeta("trace", { entry: params.entry, file: params.file }, output, store, projectRoot);
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });

  registerReadOnlyTool(pi, {
    name: "graph_query",
    label: "Graph Query",
    description: [
      "Execute a Cypher subset query against the graph.",
      "Examples:",
      'MATCH (a {name: "hello"}) RETURN a',
      'MATCH (a {name: "foo"})-[r:calls]->(b) RETURN a, r, b LIMIT 5',
      'MATCH (n) WHERE n.name = "GraphStore" RETURN n.name',
      'MATCH (n) WHERE n.name CONTAINS "Graph" RETURN n.name',
      'MATCH (n {kind: "function"}) RETURN n LIMIT 10',
    ].join("\n"),
    parameters: GraphQueryParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      const text = graphQuery({ query: params.query, store, projectRoot });
      let output = indexingFailedNote() + text;
      output = appendTokenMeta("graph_query", {}, output, store, projectRoot);
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });

  registerReadOnlyTool(pi, {
    name: "symbol_card",
    label: "Symbol Card",
    description: "Return a compact symbol summary: definition, signature, tests, relationships, and signals",
    parameters: SymbolCardParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      let output = symbolCard({ name: params.name, file: params.file, store, projectRoot });
      output = indexingFailedNote() + output;
      output = appendTokenMeta("symbol_card", { name: params.name, file: params.file }, output, store, projectRoot);
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });

  registerReadOnlyTool(pi, {
    name: "symbol_contract",
    label: "Symbol Contract",
    description: "Extract behavioral contract for a symbol: what it takes, returns, throws, and what tests assert about it",
    parameters: SymbolContractParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      let output = symbolContract({ name: params.name, file: params.file, store, projectRoot });
      output = indexingFailedNote() + output;
      output = appendTokenMeta("symbol_contract", { name: params.name, file: params.file }, output, store, projectRoot);
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });

  registerReadOnlyTool(pi, {
    name: "graph_overview",
    label: "Graph Overview",
    description: "Return a high-level overview of the indexed codebase: symbol distribution, hub symbols, most-imported files, and suggested queries",
    parameters: GraphOverviewParams,
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      let output = graphOverview({ store, projectRoot });
      output = indexingFailedNote() + output;
      output = appendTokenMeta("graph_overview", {}, output, store, projectRoot);
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });

  registerReadOnlyTool(pi, {
    name: "dead_code",
    label: "Dead Code",
    description: "Find unreferenced symbols. With name: check if a symbol has references. Without name: find all exported symbols with zero inbound edges.",
    parameters: DeadCodeParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      let output = deadCode({ name: params.name, file: params.file, kind: params.kind, glob: params.glob, store, projectRoot });
      output = indexingFailedNote() + output;
      output = appendTokenMeta("dead_code", { name: params.name }, output, store, projectRoot);
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });

  registerReadOnlyTool(pi, {
    name: "symbol_search",
    label: "Symbol Search",
    description: "Search symbols by approximate name using BM25 ranked scoring. Tokenizes camelCase/snake_case queries and scores against symbol name, signature, and file path.",
    parameters: SymbolSearchParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      let output = symbolSearch({
        query: params.query,
        kind: params.kind as any,
        file: params.file,
        limit: params.limit,
        store,
        projectRoot,
      });
      output = indexingFailedNote() + output;
      output = appendTokenMeta("symbol_search", { query: params.query }, output, store, projectRoot);
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });
}
