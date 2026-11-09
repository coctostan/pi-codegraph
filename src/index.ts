import { Type, type TSchema } from "typebox";
import type { ExtensionAPI, ExtensionToolContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { accessSync, chmodSync, constants, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GraphStore } from "./graph/store.js";
import { SqliteGraphStore } from "./graph/sqlite.js";
import { indexProject } from "./indexer/pipeline.js";
import { resolveMissingCallers, resolveImplementations } from "./indexer/lsp-resolver.js";
import { TsServerClient, type ITsServerClient } from "./indexer/tsserver-client.js";
import { symbolGraphResult } from "./tools/symbol-graph.js";
import { impactResult } from "./tools/impact.js";
import { traceResult } from "./tools/trace.js";
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
    Type.Number({ description: "Maximum caller levels to follow; default 5." }),
  ),
  suppressTrustHeader: Type.Optional(
    Type.Boolean({ description: "Omit the Trust header." }),
  ),
});

const TraceParams = Type.Object({
  entry: Type.Optional(Type.String({ description: "Entry symbol, endpoint, or test case." })),
  file: Type.Optional(Type.String({ description: "Disambiguating file path." })),
  line: Type.Optional(
    Type.Number({ description: "With file: start at the innermost function holding this line, a method or callback included, instead of entry." }),
  ),
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
  /** Where the store works when codegraph can't write `.codegraph/graph.db`: a temp dir holding its copy, or `:memory:`. */
  workingCopy: string | null;
  client: ITsServerClient | null;
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
type TsServerClientFactory = (projectRoot: string) => ITsServerClient;
const newTsServerClient: TsServerClientFactory = (projectRoot) => new TsServerClient(projectRoot);
let tsServerClientFactory: TsServerClientFactory = newTsServerClient;
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

/** Feeds both the tools' tsserver and the index run's, so a test drives the tools without a real tsserver; `resetStoreForTesting` restores the real one. */
export function setTsServerClientFactoryForTesting(fn: TsServerClientFactory): void {
  tsServerClientFactory = fn;
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
  for (const s of states) closeStore(s);
}

export function resetStoreForTesting(): void {
  for (const s of projects.values()) {
    closeStore(s);
    void s.client?.shutdown().catch(() => {});
  }
  projects.clear();
  sharedStore = null;
  lastIndexError = null;
  indexProjectImpl = indexProject;
  tsServerClientFactory = newTsServerClient;
  resetSession();
  _resetSearchCache();
}

function getOrCreateProject(projectRoot: string): ProjectState {
  const existing = projects.get(projectRoot);
  if (existing) {
    sharedStore = existing.store;
    return existing;
  }
  const state: ProjectState = { ...openProjectStore(projectRoot), client: null, indexing: null, resolving: new Map() };
  projects.set(projectRoot, state);
  sharedStore = state.store;
  return state;
}

/**
 * Rule a project's store once, at open: `graph.db` in place when codegraph can write it and its directory; else a
 * temp copy of it, with any `-wal` and `-shm`, removed at shutdown; else, when even the copy fails, memory.
 */
function openProjectStore(projectRoot: string): Pick<ProjectState, "store" | "workingCopy"> {
  const dbDir = join(projectRoot, ".codegraph");
  const dbPath = join(dbDir, "graph.db");
  let writable = true;
  try {
    mkdirSync(dbDir, { recursive: true });
    accessSync(dbDir, constants.W_OK);
    if (existsSync(dbPath)) accessSync(dbPath, constants.W_OK);
  } catch {
    writable = false;
  }
  if (writable) return { store: new SqliteGraphStore(dbPath), workingCopy: null };
  let copyDir: string | null = null;
  try {
    copyDir = mkdtempSync(join(tmpdir(), "codegraph-"));
    for (const suffix of ["", "-wal", "-shm"]) {
      if (!existsSync(dbPath + suffix)) continue;
      const copy = join(copyDir, "graph.db" + suffix);
      copyFileSync(dbPath + suffix, copy);
      // The copy keeps the original's read-only mode.
      chmodSync(copy, 0o600);
    }
    return { store: new SqliteGraphStore(join(copyDir, "graph.db")), workingCopy: copyDir };
  } catch {
    if (copyDir) rmSync(copyDir, { recursive: true, force: true });
    return { store: new SqliteGraphStore(":memory:"), workingCopy: ":memory:" };
  }
}

/** Close a project's store and remove its temp copy, if it has one. */
function closeStore(state: ProjectState): void {
  try {
    state.store.close();
  } catch {
    // already closed
  }
  if (state.workingCopy && state.workingCopy !== ":memory:") rmSync(state.workingCopy, { recursive: true, force: true });
}

/** One tsserver per project, started lazily. It stops itself when idle and is closed on session shutdown. */
function getClient(projectRoot: string, state: ProjectState): ITsServerClient {
  state.client ??= tsServerClientFactory(projectRoot);
  return state.client;
}

function ensureIndexed(projectRoot: string, state: ProjectState): Promise<void> {
  if (state.indexing) return state.indexing;
  const run = (async () => {
    try {
      await indexProjectImpl(projectRoot, state.store, { lspClientFactory: tsServerClientFactory });
      lastIndexError = null;
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
  if (lastIndexError && afterHeaderStrip.trim().length > 0) lastIndexError = null;
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

/**
 * `isError` marks a failed lookup: a requested name that does not resolve to exactly one node, the rule every
 * tool renders by. The message and its match list stay in `content` and `structuredContent`.
 */
function toolResult(output: string, isError: boolean) {
  return {
    content: [{ type: "text" as const, text: output }],
    details: undefined,
    isError,
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
  if (state.workingCopy === ":memory:") lines.push("db: in memory, since codegraph can't write or copy .codegraph/graph.db");
  else if (state.workingCopy) lines.push(`db: a temp copy at ${join(state.workingCopy, "graph.db")}, since codegraph can't write .codegraph/graph.db`);
  const indexErrors = state.store.getFailedLookups().filter((f) => f.kind === "index");
  if (indexErrors.length > 0) lines.push(`index errors: ${indexErrors.map((f) => `${f.source} (${f.evidence})`).join(", ")}`);
  if (lastIndexError) lines.push(getIndexingFailedNoteForTesting().trimEnd());
  return { text: lines.join("\n"), level: lastIndexError || indexErrors.length > 0 ? "warning" : "info" };
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
    description: "Summarize a symbol: who calls it, which tests call it, what it calls, and key metadata.",
    promptSnippet: "Look up a TypeScript symbol: who calls it, which tests call it (test cases listed by file), what it calls, its contract and anchored source",
    promptGuidelines: [
      "Use symbol_graph to find who calls a symbol instead of chaining grep and read: it lists the test cases among its callers by file, and `include: [\"neighborhood\"]` adds implementors and importers.",
      "Asked which tests exercise or cover a symbol, or which to rerun after changing it, answer from symbol_graph's `Test callers (<n> in <m> files)`, the test files that call it directly, instead of grepping the tests.",
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
          // A failed resolve leaves the graph as indexed; answer from it.
        }
      }

      const { text, resolved } = symbolGraphResult({
        name: params.name,
        file: params.file,
        include: params.include as Array<"neighborhood" | "contract" | "source"> | undefined,
        nodes,
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
      return toolResult(output, !resolved);
    },
  });


  registerReadOnlyTool(pi, {
    name: "impact",
    label: "Impact",
    description: "Classify blast radius for changed symbols, then list the tests calling them directly before those reached through other callers.",
    promptSnippet: "List the callers a TypeScript symbol change reaches, directly or indirectly, each breaking or behavioral, then the tests calling it directly, before those reached through other callers",
    promptGuidelines: [
      "Run impact on the symbols you are about to change before editing a shared function, class, or interface.",
      "impact follows callers and implementors directly and indirectly up toward the entry points, `maxDepth` levels deep (default 5): a direct dependent of a `signature_change` or `removal` is breaking, every other dependent behavioral; the test files and cases come last, those calling a changed symbol directly in a `Tests reached directly` list, then the rest in a `Tests reached through other callers` list.",
      "Asked which tests exercise a changed symbol, answer from `Tests reached directly`, the tests that call it; `Tests reached through other callers` is the wider rerun set, not a list to prune by hand.",
    ],
    parameters: ImpactParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const { projectRoot, store } = await prepare(ctx, signal);
      const { text, resolved } = impactResult({
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
      return toolResult(output, !resolved);
    },
  });

  registerReadOnlyTool(pi, {
    name: "trace",
    label: "Trace",
    description: "Return the call tree below an entry point or the function holding a file line, or, when coverage has one, the functions a covering test's report covered.",
    promptSnippet: "Trace what runs from a TypeScript function, endpoint, test, or the handler or callback holding a `file` + `line`, as a call tree in call-site order, or list the functions a covering test's report covered",
    promptGuidelines: [
      "Use trace when asked what runs, or in what order, from a function, handler or callback onward, or between one point and another, instead of reading each callee by hand.",
      "Start trace at a function, endpoint or test case by `entry`, or at an object method or anonymous callback the index names no symbol for by `file` and `line`: it starts at the innermost function holding that line.",
      "trace prints each callee under its caller in call-site order, 3 calls deep: a repeat reads `(see above)`, an unresolved call is a `? name (unresolved, file:line)` line, and `N more omitted beyond depth 3` counts the rest, so trace a deeper callee to continue. When a coverage report covers the entry, it prints instead, under `mode: coverage`, a covering test and then every production function that test's report covered, by file and line, not call order; tests sharing one report get the same list.",
    ],
    parameters: TraceParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const { projectRoot, store } = await prepare(ctx, signal);
      const { text, resolved } = traceResult({ entry: params.entry, file: params.file, line: params.line, store, projectRoot });
      const output = finalizeReadOnlyOutput(
        "trace",
        { entry: params.entry, file: params.file, line: params.line },
        text,
        store,
        projectRoot,
        params.suppressTrustHeader === true,
      );
      return toolResult(output, !resolved);
    },
  });
}
