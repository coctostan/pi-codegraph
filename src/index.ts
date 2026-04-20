import { Type, type TSchema } from "@sinclair/typebox";
import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { accessSync, constants, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { GraphStore } from "./graph/store.js";
import { SqliteGraphStore } from "./graph/sqlite.js";
import { indexProject } from "./indexer/pipeline.js";
import { resolveMissingCallers, resolveImplementations } from "./indexer/lsp-resolver.js";
import { TsServerClient } from "./indexer/tsserver-client.js";
import { symbolGraph } from "./tools/symbol-graph.js";
import { impact } from "./tools/impact.js";
import { trace } from "./tools/trace.js";
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
    {
      description:
        'Kind of change. Allowed values: "signature_change", "removal", "behavior_change", "addition".',
    },
  ),
  maxDepth: Type.Optional(
    Type.Number({ description: "Maximum traversal depth (default 5)" }),
  ),
});

const TraceParams = Type.Object({
  entry: Type.String({ description: "Entry symbol or endpoint name" }),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
});


let sharedStore: GraphStore | null = null;
interface IndexErrorRecord {
  error: Error;
  setAt: number;
}

let lastIndexError: IndexErrorRecord | null = null;
let indexingInFlight: Promise<void> | null = null;
type IndexProjectFn = typeof indexProject;
let indexProjectImpl: IndexProjectFn = indexProject;
export function getSharedStoreForTesting(): GraphStore | null {
  return sharedStore;
}
export function getLastIndexErrorForTesting(): Error | null {
  return lastIndexError ? lastIndexError.error : null;
}

export function setLastIndexErrorForTesting(error: Error | null, setAt: number = Date.now()): void {
  lastIndexError = error ? { error, setAt } : null;
}

export function getIndexingFailedNoteForTesting(now: number = Date.now()): string {
  if (!lastIndexError) return "";
  const ageSeconds = Math.max(0, Math.floor((now - lastIndexError.setAt) / 1000));
  return `indexing-failed (${ageSeconds}s ago): ${lastIndexError.error.message}\n`;
}

export function setIndexProjectForTesting(fn: IndexProjectFn | null): void {
  indexProjectImpl = fn ?? indexProject;
}

export function resetStoreForTesting(): void {
  if (sharedStore) sharedStore.close();
  sharedStore = null;
  lastIndexError = null;
  indexingInFlight = null;
  indexProjectImpl = indexProject;
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
  if (indexingInFlight) return indexingInFlight;
  indexingInFlight = (async () => {
    try {
      const result = await indexProjectImpl(projectRoot, store);
      if (result.errors > 0 && !dbIsWritable(projectRoot)) {
        lastIndexError = { error: new Error("readonly database"), setAt: Date.now() };
      } else {
        lastIndexError = null;
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      lastIndexError = { error, setAt: Date.now() };
    } finally {
      indexingInFlight = null;
    }
  })();
  return indexingInFlight;
}

function indexingFailedNote(): string {
  return getIndexingFailedNoteForTesting();
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
  // Reaching this point means the tool's read path against the store
  // succeeded and produced output. Clear transient (non-readonly)
  // lastIndexError AFTER the note is built so THIS tool output still
  // carries the accurate error message (Task 1's contract), but the NEXT
  // tool call starts with a clean flag. The "readonly database" literal is
  // verified-persistent via ensureIndexed's `result.errors > 0 &&
  // !dbIsWritable(projectRoot)` branch and must stay set across tool calls.
  if (
    lastIndexError &&
    lastIndexError.error.message !== "readonly database" &&
    withoutFreshHeader.trim().length > 0
  ) {
    lastIndexError = null;
  }
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

}
