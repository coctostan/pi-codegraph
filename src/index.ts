import { Type, type TSchema } from "typebox";
import type { ExtensionAPI, ExtensionToolContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
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
import { suppressFreshTrustHeader, stripTrustHeader } from "./output/read-only-ceremony.js";
import { ensureHashInit } from "./output/anchoring.js";

const SymbolGraphParams = Type.Object({
  name: Type.String({ description: "Symbol name." }),
  file: Type.Optional(Type.String({ description: "Disambiguating file path." })),
  include: Type.Optional(
    Type.Array(
      Type.Union([
        Type.Literal("neighborhood"),
        Type.Literal("contract"),
        Type.Literal("source"),
      ]),
      {
        description: "Extra sections to include.",
      },
    ),
  ),
  suppressTrustHeader: Type.Optional(
    Type.Boolean({ description: "Omit the Trust header." }),
  ),
});


const ImpactParams = Type.Object({
  symbols: Type.Array(Type.String({ description: "Changed symbol." }), {
    description: "Changed symbols.",
  }),
  changeType: Type.Union(
    [
      Type.Literal("signature_change"),
      Type.Literal("removal"),
      Type.Literal("behavior_change"),
      Type.Literal("addition"),
    ],
    { description: "Change kind." },
  ),
  maxDepth: Type.Optional(
    Type.Number({ description: "Maximum traversal depth." }),
  ),
  suppressTrustHeader: Type.Optional(
    Type.Boolean({ description: "Omit the Trust header." }),
  ),
});

const TraceParams = Type.Object({
  entry: Type.String({ description: "Entry symbol or endpoint." }),
  file: Type.Optional(Type.String({ description: "Disambiguating file path." })),
  suppressTrustHeader: Type.Optional(
    Type.Boolean({ description: "Omit the Trust header." }),
  ),
});

/**
 * Machine-readable result for programmatic callers (codemode scripts). The model still receives the
 * text; scripts get the same text plus every `file  LINE:HASH` anchor already parsed out of it.
 */
const ToolOutputSchema = Type.Object({
  text: Type.String({ description: "Full model-facing output." }),
  anchors: Type.Array(
    Type.Object({
      file: Type.String(),
      line: Type.Integer(),
      hash: Type.String({ description: "3-hex hashline hash, same algorithm as pi-hashline-readmap." }),
    }),
    { description: "Editable anchors found in the output, deduplicated." },
  ),
  indexingFailed: Type.Boolean({ description: "True when the output is prefixed by an indexing-failed note." }),
});

const CODEGRAPH_NAMESPACE = {
  name: "codegraph",
  description: "Symbol-level code graph for TypeScript: callers, callees, impact, and execution paths.",
  instructions:
    "Read-only tools backed by a SQLite graph in .codegraph/graph.db that auto-indexes the project. " +
    "Outputs carry `file  LINE:HASH` anchors that are editable with pi-hashline-readmap. " +
    "structuredContent is { text, anchors, indexingFailed }.",
};

interface ProjectState {
  store: GraphStore;
  client: TsServerClient | null;
  indexing: Promise<void> | null;
  /** In-flight LSP resolutions by node id, so concurrent calls for one symbol share the work. */
  resolving: Map<string, Promise<void>>;
}

/** One entry per project root; a session can move between roots, so nothing is keyed on the first cwd. */
const projects = new Map<string, ProjectState>();
let sharedStore: GraphStore | null = null;

interface IndexErrorRecord {
  error: Error;
  setAt: number;
}

let lastIndexError: IndexErrorRecord | null = null;
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

/** Close every store and tsserver. Idempotent: cancellation, reload and exit can all land here. */
async function closeAllProjects(): Promise<void> {
  const states = [...projects.values()];
  projects.clear();
  sharedStore = null;
  // Let an in-flight index finish briefly rather than closing the database underneath it.
  const inflight = states.map((s) => s.indexing).filter((p): p is Promise<void> => p !== null);
  if (inflight.length > 0) {
    await Promise.race([
      Promise.allSettled(inflight),
      new Promise<void>((resolve) => setTimeout(resolve, 3000).unref?.()),
    ]);
  }
  await Promise.allSettled(states.map((s) => s.client?.shutdown()));
  for (const s of states) {
    try {
      s.store.close();
    } catch {
      // already closed
    }
  }
}

export function resetStoreForTesting(): void {
  for (const s of projects.values()) {
    try {
      s.store.close();
    } catch {
      // already closed
    }
    void s.client?.shutdown().catch(() => {});
  }
  projects.clear();
  sharedStore = null;
  lastIndexError = null;
  indexProjectImpl = indexProject;
  resetSession();
  _resetSearchCache();
}

function getOrCreateProject(projectRoot: string): ProjectState {
  const existing = projects.get(projectRoot);
  if (existing) {
    sharedStore = existing.store;
    return existing;
  }
  const dbDir = join(projectRoot, ".codegraph");
  mkdirSync(dbDir, { recursive: true });
  const state: ProjectState = { store: new SqliteGraphStore(join(dbDir, "graph.db")), client: null, indexing: null, resolving: new Map() };
  projects.set(projectRoot, state);
  sharedStore = state.store;
  return state;
}

/** One tsserver per project, started lazily. It stops itself when idle and is closed on session shutdown. */
function getClient(projectRoot: string, state: ProjectState): TsServerClient {
  state.client ??= new TsServerClient(projectRoot);
  return state.client;
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

function ensureIndexed(projectRoot: string, state: ProjectState): Promise<void> {
  if (state.indexing) return state.indexing;
  const run = (async () => {
    try {
      const result = await indexProjectImpl(projectRoot, state.store);
      if (result.errors > 0 && !dbIsWritable(projectRoot)) {
        lastIndexError = { error: new Error("readonly database"), setAt: Date.now() };
      } else {
        lastIndexError = null;
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      lastIndexError = { error, setAt: Date.now() };
    } finally {
      state.indexing = null;
    }
  })();
  state.indexing = run;
  return run;
}

function abortReason(signal: AbortSignal): Error {
  const reason = signal.reason;
  return reason instanceof Error ? reason : new Error("codegraph: operation aborted");
}

/** Reject as soon as `signal` aborts. Shared work (indexing) keeps running for other callers. */
function raceAbort<T>(work: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return work;
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function setStatus(ctx: Pick<ExtensionToolContext, "hasUI" | "ui"> | undefined, text: string | undefined): void {
  try {
    if (ctx?.hasUI) ctx.ui.setStatus("codegraph", text);
  } catch {
    // status is cosmetic
  }
}

/** Resolve the project, index it if needed, and prepare hashing. Throws if `signal` aborts. */
async function prepare(ctx: ExtensionToolContext, signal: AbortSignal | undefined) {
  signal?.throwIfAborted();
  const projectRoot = ctx.cwd;
  const state = getOrCreateProject(projectRoot);
  setStatus(ctx, "codegraph: indexing…");
  try {
    await raceAbort(ensureIndexed(projectRoot, state), signal);
  } finally {
    setStatus(ctx, lastIndexError ? "codegraph: indexing failed" : undefined);
  }
  await ensureHashInit();
  return { projectRoot, state, store: state.store };
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
  suppressTrustHeader: boolean = false,
): string {
  const afterFreshStrip = suppressFreshTrustHeader(toolOutput);
  const afterHeaderStrip = suppressTrustHeader ? stripTrustHeader(afterFreshStrip) : afterFreshStrip;
  // suppressTrustHeader strips only the shared Trust block; indexingFailedNote()
  // and appendTokenMetaIfEnabled() still wrap the remaining body.
  const withIndexingNote = indexingFailedNote() + afterHeaderStrip;
  if (
    lastIndexError &&
    lastIndexError.error.message !== "readonly database" &&
    afterHeaderStrip.trim().length > 0
  ) {
    lastIndexError = null;
  }
  return appendTokenMetaIfEnabled(toolName, params, withIndexingNote, store, projectRoot);
}

const ANCHOR_LINE = /^[ \t]*(\S+)[ \t]{2}(\d+):([0-9a-f]{3})\b/;

/** Pull `file  LINE:HASH` locations out of rendered output so scripts do not have to re-parse text. */
export function extractAnchors(text: string): Array<{ file: string; line: number; hash: string }> {
  const seen = new Set<string>();
  const anchors: Array<{ file: string; line: number; hash: string }> = [];
  for (const raw of text.split("\n")) {
    const match = ANCHOR_LINE.exec(raw);
    if (!match) continue;
    const key = `${match[1]}\u0000${match[2]}:${match[3]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    anchors.push({ file: match[1]!, line: Number(match[2]), hash: match[3]! });
  }
  return anchors;
}

function toolResult(output: string) {
  return {
    content: [{ type: "text" as const, text: output }],
    details: undefined,
    structuredContent: {
      text: output,
      anchors: extractAnchors(output),
      indexingFailed: output.startsWith("indexing-failed"),
    },
  };
}

type ReadOnlyToolInput<TParams extends TSchema> = Pick<
  ToolDefinition<TParams>,
  "name" | "label" | "description" | "parameters" | "execute"
> & { promptSnippet: string; promptGuidelines: string[] };

function registerReadOnlyTool<TParams extends TSchema>(pi: ExtensionAPI, tool: ReadOnlyToolInput<TParams>): void {
  const definition: ToolDefinition<TParams> = {
    ...tool,
    namespace: CODEGRAPH_NAMESPACE,
    outputSchema: ToolOutputSchema,
    // Hints for permission extensions: reads the graph, never touches the project's files or the network.
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    // No executionMode override: calls may run in parallel. Store writes are synchronous, indexing is
    // deduplicated per project, the tsserver client queues requests, and LSP resolution is shared per symbol.
  };
  // Legacy metadata still consumed by pi-ptc-next.
  (definition as any).ptc = {
    callable: true,
    enabled: true,
    policy: "read-only" as const,
    readOnly: true,
    pythonName: tool.name,
  };
  pi.registerTool(definition);
}

function formatStatus(projectRoot: string, state: ProjectState | undefined): { text: string; level: "info" | "warning" } {
  if (!state) {
    return { text: `codegraph: ${projectRoot} is not indexed yet; it indexes on the first tool call.`, level: "info" };
  }
  const stats = state.store.getStatistics(projectRoot);
  const nodeTotal = Object.values(stats.nodes).reduce((a, b) => a + b, 0);
  const edgeTotal = Object.values(stats.edges).reduce(
    (a, byProvenance) => a + Object.values(byProvenance).reduce((x, y) => x + y, 0),
    0,
  );
  const lines = [
    `codegraph: ${projectRoot}`,
    `nodes: ${nodeTotal}  edges: ${edgeTotal}  files: ${stats.files.total} (${stats.files.stale} stale)`,
    state.indexing ? "indexing: in progress" : "indexing: idle",
  ];
  if (lastIndexError) lines.push(getIndexingFailedNoteForTesting().trimEnd());
  return { text: lines.join("\n"), level: lastIndexError ? "warning" : "info" };
}

export default function piCodegraph(pi: ExtensionAPI): void {
  // Older hosts and minimal test doubles may lack some registration methods; every one is optional.
  pi.on?.("session_start", () => {
    resetSession();
  });
  pi.on?.("session_shutdown", async () => {
    await closeAllProjects();
  });

  pi.registerCommand?.("codegraph", {
    description: "Show codegraph index status, or refresh the index (/codegraph [status|refresh])",
    handler: async (args, ctx) => {
      const sub = (args ?? "").trim().split(/\s+/)[0] || "status";
      if (sub !== "status" && sub !== "refresh") {
        ctx.ui.notify("Usage: /codegraph [status|refresh]", "warning");
        return;
      }
      if (sub === "refresh") {
        const state = getOrCreateProject(ctx.cwd);
        setStatus(ctx, "codegraph: indexing…");
        try {
          await ensureIndexed(ctx.cwd, state);
        } finally {
          setStatus(ctx, lastIndexError ? "codegraph: indexing failed" : undefined);
        }
      }
      const { text, level } = formatStatus(ctx.cwd, projects.get(ctx.cwd));
      ctx.ui.notify(text, level);
    },
  });

  registerReadOnlyTool(pi, {
    name: "symbol_graph",
    label: "Symbol Graph",
    description: "Summarize a symbol with relationships, tests, and key metadata.",
    promptSnippet: "Look up a TypeScript symbol: callers, callees, tests, contract, and anchored source",
    promptGuidelines: [
      "Use symbol_graph to find who calls or implements a symbol instead of chaining grep and read.",
      "symbol_graph anchors (`file  LINE:HASH`) are editable with the edit tool without re-reading the file.",
    ],
    parameters: SymbolGraphParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const { projectRoot, state, store } = await prepare(ctx, signal);
      const nodes = store.findNodes(params.name, params.file);
      if (nodes.length === 1) {
        const resolvedNode = nodes[0]!;
        try {
          let shared = state.resolving.get(resolvedNode.id);
          if (!shared) {
            const client = getClient(projectRoot, state);
            shared = (async () => {
              try {
                await resolveMissingCallers(resolvedNode, store, projectRoot, client);
                if (resolvedNode.kind === "interface") {
                  await resolveImplementations(resolvedNode, store, projectRoot, client);
                }
              } finally {
                state.resolving.delete(resolvedNode.id);
              }
            })();
            state.resolving.set(resolvedNode.id, shared);
          }
          await raceAbort(shared, signal);
        } catch (error) {
          // A cancelled call must surface as cancelled, not as a quietly degraded result.
          signal?.throwIfAborted();
          void error;
          // Resolver writes failed (likely readonly DB) — continue with existing graph data.
        }
      }

      const text = symbolGraph({
        name: params.name,
        file: params.file,
        include: params.include as Array<"neighborhood" | "contract" | "source"> | undefined,
        store,
        projectRoot,
      });
      const output = finalizeReadOnlyOutput(
        "symbol_graph",
        { name: params.name, file: params.file },
        text,
        store,
        projectRoot,
        params.suppressTrustHeader === true,
      );
      return toolResult(output);
    },
  });


  registerReadOnlyTool(pi, {
    name: "impact",
    label: "Impact",
    description: "Classify blast radius for changed symbols.",
    promptSnippet: "Classify what breaks when TypeScript symbols change (breaking / behavioral / safe dependents)",
    promptGuidelines: [
      "Run impact on the symbols you are about to change before editing a shared function, class, or interface.",
    ],
    parameters: ImpactParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const { projectRoot, store } = await prepare(ctx, signal);
      const text = impact({
        symbols: params.symbols,
        changeType: params.changeType,
        store,
        projectRoot,
        maxDepth: params.maxDepth,
      });
      const output = finalizeReadOnlyOutput(
        "impact",
        { symbols: params.symbols },
        text,
        store,
        projectRoot,
        params.suppressTrustHeader === true,
      );
      return toolResult(output);
    },
  });

  registerReadOnlyTool(pi, {
    name: "trace",
    label: "Trace",
    description: "Return an execution path from an entry point, coverage-backed when available.",
    promptSnippet: "Trace the ordered call path from a TypeScript entry point, endpoint, or test",
    promptGuidelines: ["Use trace to follow what an entry point executes instead of reading each callee by hand."],
    parameters: TraceParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const { projectRoot, store } = await prepare(ctx, signal);
      const text = trace({ entry: params.entry, file: params.file, store, projectRoot });
      const output = finalizeReadOnlyOutput(
        "trace",
        { entry: params.entry, file: params.file },
        text,
        store,
        projectRoot,
        params.suppressTrustHeader === true,
      );
      return toolResult(output);
    },
  });
}
