---
id: 10
title: Register graph_query in the pi extension
status: approved
depends_on:
  - 6
no_test: false
files_to_modify:
  - src/index.ts
files_to_create:
  - test/extension-graph-query.test.ts
---

### Task 10: Register graph_query in the pi extension [depends: 6]

**Covers AC:** 1, 2

**Files:**
- Modify: `src/index.ts`
- Test: `test/extension-graph-query.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("pi extension registers graph_query with query schema and auto-indexes on first call", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-ext-gq-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/hello.ts"), "export function hello() { return 'world'; }\n");

  try {
    const mod = await import("../src/index.js");
    if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();

    const registeredTools: Array<{ name: string; parameters: any; execute: Function }> = [];
    const mockPi = {
      registerTool(tool: { name: string; parameters: any; execute: Function }) {
        registeredTools.push(tool);
      },
      on() {},
    };

    mod.default(mockPi as any);

    const tool = registeredTools.find((candidate) => candidate.name === "graph_query");
    expect(tool).toBeDefined();
    expect(tool!.parameters.properties.query).toBeDefined();
    expect(tool!.parameters.required).toContain("query");

    const result = await tool!.execute(
      "call-1",
      { query: 'MATCH (a {name: "hello"}) RETURN a' },
      undefined,
      undefined,
      { cwd: projectRoot },
    );

    expect(existsSync(join(projectRoot, ".codegraph", "graph.db"))).toBe(true);
    expect(result.content[0]?.text ?? "").toContain("hello");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-graph-query.test.ts`
Expected: FAIL — `expect(received).toBeDefined()` for tool name `graph_query`

**Step 3 — Write minimal implementation**
`src/index.ts`
```ts
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { GraphStore } from "./graph/store.js";
import { SqliteGraphStore } from "./graph/sqlite.js";
import { indexProject } from "./indexer/pipeline.js";
import { resolveMissingCallers, resolveImplementations } from "./indexer/lsp-resolver.js";
import { TsServerClient } from "./indexer/tsserver-client.js";
import { computeAnchor } from "./output/anchoring.js";
import { impact } from "./tools/impact.js";
import { graphQuery } from "./tools/graph-query.js";
import { resolveEdge } from "./tools/resolve-edge.js";
import { symbolGraph } from "./tools/symbol-graph.js";
import { trace } from "./tools/trace.js";

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
  maxDepth: Type.Optional(Type.Number({ description: "Maximum traversal depth (default 5)" })),
});

const TraceParams = Type.Object({
  entry: Type.String({ description: "Entry symbol or endpoint name" }),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
});

const GraphQueryParams = Type.Object({
  query: Type.String({ description: "Cypher subset query to execute against the graph" }),
});

let sharedStore: GraphStore | null = null;

export function getSharedStoreForTesting(): GraphStore | null {
  return sharedStore;
}

export function resetStoreForTesting(): void {
  if (sharedStore) sharedStore.close();
  sharedStore = null;
}

function getOrCreateStore(projectRoot: string): GraphStore {
  if (sharedStore) return sharedStore;
  const dbDir = join(projectRoot, ".codegraph");
  mkdirSync(dbDir, { recursive: true });
  sharedStore = new SqliteGraphStore(join(dbDir, "graph.db"));
  return sharedStore;
}

async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  if (store.listFiles().length === 0) {
    await indexProject(projectRoot, store);
  }
}

function renderImplementationsSuffix(store: GraphStore, node: any, projectRoot: string): string {
  if (node.kind !== "interface") return "";
  const impl = store.getNeighbors(node.id, { direction: "in", kind: "implements" });
  if (impl.length === 0) return "";

  const lines = ["", "### Implementations"];
  for (const it of impl) {
    const anchor = computeAnchor(it.node, projectRoot);
    lines.push(`  ${anchor.anchor}  ${it.node.name}  implements  confidence:${it.edge.provenance.confidence}  ${it.edge.provenance.source}`);
  }
  return lines.join("\n") + "\n";
}

export default function piCodegraph(pi: ExtensionAPI): void {
  pi.registerTool({
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
        } finally {
          await client.shutdown().catch(() => {});
        }
      }

      let output = symbolGraph({ name: params.name, file: params.file, store, projectRoot });
      if (resolvedNode) output += renderImplementationsSuffix(store, resolvedNode, projectRoot);
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
      const output = resolveEdge({
        source: params.source,
        target: params.target,
        sourceFile: params.sourceFile,
        targetFile: params.targetFile,
        kind: params.kind,
        evidence: params.evidence,
        store,
        projectRoot,
      });
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });

  pi.registerTool({
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
      return { content: [{ type: "text", text }], details: undefined };
    },
  });

  pi.registerTool({
    name: "trace",
    label: "Trace",
    description: "Return one deterministic anchored execution path for a test, symbol, or endpoint",
    parameters: TraceParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      const text = trace({ entry: params.entry, file: params.file, store, projectRoot });
      return { content: [{ type: "text", text }], details: undefined };
    },
  });

  pi.registerTool({
    name: "graph_query",
    label: "Graph Query",
    description: "Execute a Cypher subset query against the graph",
    parameters: GraphQueryParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      const text = graphQuery({ query: params.query, store, projectRoot });
      return { content: [{ type: "text", text }], details: undefined };
    },
  });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-graph-query.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
