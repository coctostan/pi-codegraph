import { Type, type TSchema } from "@sinclair/typebox";
import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { accessSync, constants, mkdirSync } from "node:fs";
import { join } from "node:path";
import { devModeEnabled } from "./config/dev-mode.js";
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
import { graphOverview } from "./tools/graph-overview.js";
import { deadCode } from "./tools/dead-code.js";
import { resetSearchCacheForTesting as _resetSearchCache } from "./tools/symbol-search.js";
import { appendTokenMetaIfEnabled, resetSession } from "./tools/token-tracker.js";
import { suppressFreshTrustHeader } from "./output/read-only-ceremony.js";

const SymbolGraphParams = Type.Object({
  name: Type.String({ description: "Symbol name to look up" }),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
  include: Type.Optional(
    Type.Array(
      Type.Union([
        Type.Literal("neighborhood"),
        Type.Literal("contract"),
        Type.Literal("source"),
      ]),
      {
        description:
          'Optional extra sections. Allowed values: "neighborhood", "contract", "source". "tests" is not a valid include value.',
      },
    ),
  ),
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


const GraphOverviewParams = Type.Object({});

const DeadCodeParams = Type.Object({
  name: Type.Optional(Type.String({ description: "Symbol name to check (omit for sweep mode)" })),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
  kind: Type.Optional(Type.String({ description: "Filter by node kind (function, class, interface, etc.)" })),
  glob: Type.Optional(Type.String({ description: "Filter by file glob pattern (e.g. src/tools/*)" })),
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

function dbIsWritable(projectRoot: string): boolean {
  const dbDir = join(projectRoot, ".codegraph");
  try {
    accessSync(join(dbDir, "graph.db"), constants.W_OK);
    accessSync(dbDir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  try {
    const result = await indexProject(projectRoot, store);
    if (result.errors > 0 && !dbIsWritable(projectRoot)) {
      lastIndexError = new Error("readonly database");
    } else {
      lastIndexError = null;
    }
  } catch (err) {
    lastIndexError = err instanceof Error ? err : new Error(String(err));
    // Indexing failed (likely readonly DB) — degrade gracefully and serve stale graph data.
  }
}

function indexingFailedNote(): string {
  if (!lastIndexError) return "";
  return "indexing-failed: graph may be stale (readonly database)\n";
}

function finalizeReadOnlyOutput(
  toolName: string,
  params: Record<string, unknown>,
  toolOutput: string,
  store: GraphStore,
  projectRoot: string,
): string {
  const withoutFreshHeader = suppressFreshTrustHeader(toolOutput);
  const withIndexingNote = indexingFailedNote() + withoutFreshHeader;
  return appendTokenMetaIfEnabled(toolName, params, withIndexingNote, store, projectRoot);
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
  const devMode = devModeEnabled();
  registerReadOnlyTool(pi, {
    name: "symbol_graph",
    label: "Symbol Graph",
    description: "Return a compact symbol summary with relationships, test signals, and key metadata.\nWhen to use: You need structural context for a named symbol.",
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

      const text = symbolGraph({
        name: params.name,
        file: params.file,
        include: params.include as Array<"neighborhood" | "contract" | "source"> | undefined,
        store,
        projectRoot,
      });
      const output = finalizeReadOnlyOutput("symbol_graph", { name: params.name, file: params.file }, text, store, projectRoot);
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });

  pi.registerTool({
    name: "resolve_edge",
    label: "Resolve Edge",
    description: "Create an evidence-backed edge in the symbol graph.\nWhen to use: The graph is missing a relationship you can justify from code or docs.",
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
    description: "Delete an agent-created edge from the symbol graph.\nWhen to use: An agent-added relationship is incorrect or obsolete.",
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
    description: "Return the classified blast radius for a set of changed symbols.\nWhen to use: You are planning or reviewing a change to existing code.",
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
      const output = finalizeReadOnlyOutput("impact", { symbols: params.symbols }, text, store, projectRoot);
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });

  registerReadOnlyTool(pi, {
    name: "trace",
    label: "Trace",
    description:
      "Return the execution path starting from an entry point. Coverage-backed when available.\nWhen to use: You need to understand what actually runs.",
    parameters: TraceParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      const text = trace({ entry: params.entry, file: params.file, store, projectRoot });
      const output = finalizeReadOnlyOutput("trace", { entry: params.entry, file: params.file }, text, store, projectRoot);
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });

  if (devMode) {
    registerReadOnlyTool(pi, {
      name: "graph_query",
      label: "Graph Query",
      description:
        "Run a Cypher subset query against the graph.\nWhen to use: You need an ad hoc graph slice that is easier to express as a query.",
      parameters: GraphQueryParams,
      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        const projectRoot = ctx.cwd;
        const store = getOrCreateStore(projectRoot);
        await ensureIndexed(projectRoot, store);
        const text = graphQuery({ query: params.query, store, projectRoot });
        const output = finalizeReadOnlyOutput("graph_query", {}, text, store, projectRoot);
        return { content: [{ type: "text", text: output }], details: undefined };
      },
    });
  }


  if (devMode) {
    registerReadOnlyTool(pi, {
      name: "graph_overview",
      label: "Graph Overview",
      description: "Return a high-level overview of the indexed codebase.\nWhen to use: You need hotspots, distributions, and suggested starting points.",
      parameters: GraphOverviewParams,
      async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
        const projectRoot = ctx.cwd;
        const store = getOrCreateStore(projectRoot);
        await ensureIndexed(projectRoot, store);
        const text = graphOverview({ store, projectRoot });
        const output = finalizeReadOnlyOutput("graph_overview", {}, text, store, projectRoot);
        return { content: [{ type: "text", text: output }], details: undefined };
      },
    });
  }

  if (devMode) {
    registerReadOnlyTool(pi, {
      name: "dead_code",
      label: "Dead Code",
      description: "Find unreferenced exported symbols or check whether a symbol is still referenced.\nWhen to use: You are looking for cleanup candidates.",
      parameters: DeadCodeParams,
      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        const projectRoot = ctx.cwd;
        const store = getOrCreateStore(projectRoot);
        await ensureIndexed(projectRoot, store);
        const text = deadCode({ name: params.name, file: params.file, kind: params.kind, glob: params.glob, store, projectRoot });
        const output = finalizeReadOnlyOutput("dead_code", { name: params.name }, text, store, projectRoot);
        return { content: [{ type: "text", text: output }], details: undefined };
      },
    });
  }

}
