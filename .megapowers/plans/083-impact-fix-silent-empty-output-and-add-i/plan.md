# Plan

### Task 1: Traverse inbound `implements` edges in `collectImpactDetails` (fixes #074)

Extend `collectImpactDetails` in `src/tools/impact.ts` so that inbound `implements` edges count as dependency evidence, producing the same breaking/behavioral classification the existing calls traversal does. This fixes all acceptance criteria of #074 and Fixed-When #1 / #2 / #7 of the diagnosis.

**Files:**
- Create: `test/tool-impact-implements-edges.test.ts`
- Modify: `src/tools/impact.ts`

**Step 1 — Write the failing test**

Current signatures, copied from source:

- `src/tools/impact.ts:66` — `export function collectImpactDetails(params: CollectImpactParams): ImpactDetail[]`
- `src/tools/impact.ts:121` — `export function collectImpact(params: CollectImpactParams): ImpactItem[]`
- `src/graph/store.ts:3-6` — `NeighborOptions { kind?: EdgeKind; direction?: "in"|"out"|"both" }`

Create `test/tool-impact-implements-edges.test.ts`:

```ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import type { GraphNode } from "../src/graph/types.js";
import { collectImpact } from "../src/tools/impact.js";

function addNode(store: SqliteGraphStore, node: GraphNode) {
  store.addNode(node);
}

function addEdge(
  store: SqliteGraphStore,
  source: string,
  target: string,
  kind: "calls" | "implements",
  confidence: number,
) {
  store.addEdge({
    source,
    target,
    kind,
    provenance: {
      source: kind === "implements" ? "lsp" : "tree-sitter",
      confidence,
      evidence: kind,
      content_hash: "h",
    },
    created_at: 1,
  });
}

test("collectImpact follows inbound `implements` edges: interface change reaches implementors and their callers", () => {
  const store = new SqliteGraphStore();
  try {
    addNode(store, { id: "src/iface.ts::Store:1", kind: "interface", name: "Store", file: "src/iface.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: true });
    addNode(store, { id: "src/impl.ts::MyStore:1", kind: "class", name: "MyStore", file: "src/impl.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: true });
    addNode(store, { id: "src/app.ts::useStore:1", kind: "function", name: "useStore", file: "src/app.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: false });

    // MyStore implements Store
    addEdge(store, "src/impl.ts::MyStore:1", "src/iface.ts::Store:1", "implements", 0.9);
    // useStore calls MyStore
    addEdge(store, "src/app.ts::useStore:1", "src/impl.ts::MyStore:1", "calls", 0.7);

    const sig = collectImpact({ symbols: ["Store"], changeType: "signature_change", store, maxDepth: 5 });
    expect(sig).toEqual([
      { nodeId: "src/impl.ts::MyStore:1", name: "MyStore", file: "src/impl.ts", depth: 1, classification: "breaking" },
      { nodeId: "src/app.ts::useStore:1", name: "useStore", file: "src/app.ts", depth: 2, classification: "behavioral" },
    ]);

    const removal = collectImpact({ symbols: ["Store"], changeType: "removal", store, maxDepth: 5 });
    expect(removal.map((h) => h.name)).toEqual(["MyStore", "useStore"]);
    expect(removal.find((h) => h.name === "MyStore")?.classification).toBe("breaking");

    const behavioral = collectImpact({ symbols: ["Store"], changeType: "behavior_change", store, maxDepth: 5 });
    expect(behavioral.map((h) => h.classification)).toEqual(["behavioral", "behavioral"]);
  } finally {
    store.close();
  }
});

test("collectImpact deduplicates a node that both `calls` and `implements` a changed seed (AC #074.5)", () => {
  const store = new SqliteGraphStore();
  try {
    addNode(store, { id: "src/iface.ts::Store:1", kind: "interface", name: "Store", file: "src/iface.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: true });
    // Dual: implements Store AND also calls Store directly (unusual but legal).
    addNode(store, { id: "src/dual.ts::Dual:1", kind: "class", name: "Dual", file: "src/dual.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: true });

    addEdge(store, "src/dual.ts::Dual:1", "src/iface.ts::Store:1", "implements", 0.9);
    addEdge(store, "src/dual.ts::Dual:1", "src/iface.ts::Store:1", "calls", 0.6);

    const hits = collectImpact({ symbols: ["Store"], changeType: "signature_change", store, maxDepth: 5 });
    // No duplicates for Dual.
    expect(hits.filter((h) => h.nodeId === "src/dual.ts::Dual:1")).toHaveLength(1);
    // It must be classified as the breaking dependent at depth 1.
    const dual = hits.find((h) => h.nodeId === "src/dual.ts::Dual:1")!;
    expect(dual.depth).toBe(1);
    expect(dual.classification).toBe("breaking");
  } finally {
    store.close();
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/tool-impact-implements-edges.test.ts`

Expected: FAIL — the first test fails with:

```
error: expect(received).toEqual(expected)
...
Received: []
```

(because `collectImpactDetails` hard-codes `kind: "calls"` at `src/tools/impact.ts:89` and never reads `implements` edges; output is an empty array.)

**Step 3 — Write minimal implementation**

Edit `src/tools/impact.ts`. Replace the single-kind neighbor fetch at line 89 inside `collectImpactDetails` with a merge of inbound `calls` and inbound `implements`. The existing `dedupeInboundByStrongestEdge` already collapses duplicates by `neighbor.node.id`, so concatenating the two lists handles the AC-5 dedup requirement without new code.

Find the block starting at line 85 (`while (queue.length > 0) {`) and change only the inbound fetch line. Target post-change body:

```ts
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;

    const inboundCalls = store.getNeighbors(current.id, { direction: "in", kind: "calls" });
    const inboundImplements = store.getNeighbors(current.id, { direction: "in", kind: "implements" });
    const inbound = dedupeInboundByStrongestEdge([...inboundCalls, ...inboundImplements]);

    for (const neighbor of inbound) {
      // ...existing body unchanged...
    }
  }
```

No other changes. Do not modify `classify`, `dedupeInboundByStrongestEdge`, or the queue/seen logic — implementors correctly classify as `breaking` at depth 1 because `classify("signature_change" | "removal", 1) === "breaking"` and depth-1 `implements` edges flow through the same `classification` assignment. Confidence carries via `neighbor.edge.provenance.confidence` (the `implements` edge's LSP confidence).

**Step 4 — Run test, verify it passes**

Run: `bun test test/tool-impact-implements-edges.test.ts`

Expected: PASS — both test cases.

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing. Pay particular attention to `test/tool-impact.test.ts`, `test/tool-impact-ranking.test.ts`, `test/tool-impact-output-signals.test.ts`, `test/tool-impact-performance.test.ts`, `test/extension-impact.test.ts`. These use function-seeds with no inbound `implements` edges, so the added query returns `[]` and the merged list equals the previous calls-only list — behavior is unchanged for them.

### Task 2: Add diagnostic empty-hits message to `impact()` — entry-point, interface, isolated (fixes #073) [depends: 1]

Replace the bare `return prependTrustHeader("", { stats })` at `src/tools/impact.ts:183` with a per-seed diagnostic that distinguishes entry-points (`fanIn === 0`), interfaces (`kind === "interface"`), and genuinely isolated symbols. Covers Fixed-When #3 and #4 of the diagnosis and all three acceptance criteria of issue #073.

This task runs after Task 1 because the interface branch must only fire when the implements-expanded traversal also produced no hits — otherwise an interface with implementors would incorrectly report "no dependents".

**Files:**
- Create: `test/tool-impact-empty-diagnostic.test.ts`
- Modify: `src/tools/impact.ts`

**Step 1 — Write the failing test**

Real `impact` signature pulled from source:

```
131:e1c|export function impact(params: {
132:66c|  symbols: string[];
133:18e|  changeType: ChangeType;
134:5ae|  store: GraphStore;
135:60c|  projectRoot: string;
136:af0|  maxDepth?: number;
137:a74|}): string
```

Create `test/tool-impact-empty-diagnostic.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { impact } from "../src/tools/impact.js";

function tmpProject(): string {
  const root = join(tmpdir(), `pi-cg-impact-diag-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(root, "src"), { recursive: true });
  return root;
}

test("impact() entry-point seed — fanIn 0, no callers — emits entry-point diagnostic", () => {
  const projectRoot = tmpProject();
  writeFileSync(join(projectRoot, "src", "entry.ts"), "export function entryPoint() { return 1; }\n");
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/entry.ts::entryPoint:1", kind: "function", name: "entryPoint", file: "src/entry.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: true });

    const out = impact({ symbols: ["entryPoint"], changeType: "signature_change", store, projectRoot, maxDepth: 5 });
    expect(out).toContain("## Trust");
    expect(out).toContain("No dependents found — 'entryPoint' is an entry point with no callers.");
    // Diagnostic must end with a trailing newline so downstream callers aren't glued to it.
    expect(out.endsWith("\n")).toBe(true);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("impact() interface seed without implementors — emits interface diagnostic", () => {
  const projectRoot = tmpProject();
  writeFileSync(join(projectRoot, "src", "iface.ts"), "export interface GraphStore { get(): number }\n");
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/iface.ts::GraphStore:1", kind: "interface", name: "GraphStore", file: "src/iface.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: true });

    const out = impact({ symbols: ["GraphStore"], changeType: "removal", store, projectRoot, maxDepth: 5 });
    expect(out).toContain("## Trust");
    expect(out).toContain("No call-edge dependents found for interface 'GraphStore'. Consider checking implementors via symbol_graph.");
    expect(out.endsWith("\n")).toBe(true);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("impact() genuinely isolated symbol (non-entry, non-interface, no inbound) falls back to isolated diagnostic", () => {
  const projectRoot = tmpProject();
  writeFileSync(join(projectRoot, "src", "util.ts"), "export function sha256Hex() { return ''; }\n");
  const store = new SqliteGraphStore();
  try {
    // Not exported → not an entry-point per signal roles; not an interface; no inbound edges.
    store.addNode({ id: "src/util.ts::sha256Hex:1", kind: "function", name: "sha256Hex", file: "src/util.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: false });

    const out = impact({ symbols: ["sha256Hex"], changeType: "removal", store, projectRoot, maxDepth: 5 });
    expect(out).toContain("## Trust");
    expect(out).toContain("No dependents found for 'sha256Hex' within depth 5.");
    expect(out.endsWith("\n")).toBe(true);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("impact() multiple seeds with mixed empty categories — one line per seed (stable order)", () => {
  const projectRoot = tmpProject();
  writeFileSync(join(projectRoot, "src", "entry.ts"), "export function entryPoint() { return 1; }\n");
  writeFileSync(join(projectRoot, "src", "iface.ts"), "export interface GraphStore { get(): number }\n");
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/entry.ts::entryPoint:1", kind: "function", name: "entryPoint", file: "src/entry.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: true });
    store.addNode({ id: "src/iface.ts::GraphStore:1", kind: "interface", name: "GraphStore", file: "src/iface.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: true });

    const out = impact({ symbols: ["entryPoint", "GraphStore"], changeType: "signature_change", store, projectRoot, maxDepth: 5 });
    const entryIdx = out.indexOf("'entryPoint' is an entry point");
    const ifaceIdx = out.indexOf("interface 'GraphStore'");
    expect(entryIdx).toBeGreaterThan(-1);
    expect(ifaceIdx).toBeGreaterThan(-1);
    // Stable: entryPoint was listed first → its diagnostic appears before GraphStore's.
    expect(entryIdx).toBeLessThan(ifaceIdx);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/tool-impact-empty-diagnostic.test.ts`

Expected: FAIL — the first test fails with:

```
error: expect(received).toContain(expected)

Expected to contain: "No dependents found — 'entryPoint' is an entry point with no callers."
Received: "## Trust\nstatus: fresh\nevidence: lsp,tree-sitter  stale-files: 0/0\n"
```

(The current `impact()` returns only the trust header when `hits.length === 0` — the body is `""`.)

**Step 3 — Write minimal implementation**

Modify `src/tools/impact.ts`. Replace the guard at line 183:

```ts
  if (hits.length === 0) return prependTrustHeader("", { stats });
```

with a helper + diagnostic branch that classifies each seed. Insert a module-level helper above `export function impact(...)`:

```ts
function buildEmptyImpactDiagnostic(
  symbols: string[],
  store: GraphStore,
  signalComputer: SignalComputer,
  maxDepth: number,
): string {
  const lines: string[] = [];
  for (const symbol of symbols) {
    const matches = store.findNodes(symbol);
    const node = matches.length === 1 ? matches[0]! : null;
    if (!node) {
      lines.push(`No dependents found for '${symbol}' within depth ${maxDepth}.`);
      continue;
    }
    const signals = signalComputer.compute(node.id, []);
    if (node.kind === "interface") {
      lines.push(
        `No call-edge dependents found for interface '${node.name}'. Consider checking implementors via symbol_graph.`,
      );
    } else if (signals.roles.includes("entry-point")) {
      lines.push(`No dependents found — '${node.name}' is an entry point with no callers.`);
    } else {
      lines.push(`No dependents found for '${node.name}' within depth ${maxDepth}.`);
    }
  }
  return `${lines.join("\n")}\n`;
}
```

Then replace line 183 with:

```ts
  if (hits.length === 0) {
    const body = buildEmptyImpactDiagnostic(params.symbols, params.store, signalComputer, params.maxDepth ?? 5);
    return prependTrustHeader(body, { stats });
  }
```

The `signalComputer` and `stats` are already in scope at that point (built at lines 138 and 174). `SignalComputer` is already imported from `../output/signals.js` at line 3. `GraphStore` is already imported at line 1. No new imports needed.

Note on ordering with Task 1: because Task 1 made `collectImpactDetails` also traverse `implements` edges, an interface *with* implementors now returns a non-empty `hits` array and this diagnostic branch is skipped — so the "interface" message only fires for interfaces that truly have no dependents, matching the diagnosis's Fixed-When #3.

The entry-point check uses `signals.roles.includes("entry-point")` rather than raw `fanIn === 0`, because the `entry-point` role (`src/output/signals.ts:144`) requires `isExported && kind !== "module" && fanIn === 0`. This prevents unexported utilities with no callers (e.g. the `sha256Hex` test case with `is_exported: false`) from being misreported as entry points — they fall through to the "genuinely isolated" fallback. Interfaces are caught by their `kind` before the role branch so they won't be misreported as entry points when they have no implementors.

**Step 4 — Run test, verify it passes**

Run: `bun test test/tool-impact-empty-diagnostic.test.ts`

Expected: PASS — all four test cases.

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing, including:
- `test/tool-impact-empty-output.test.ts` (the "not found" path is unchanged — it fires at line 165 before this new code runs; the "addition" path returns earlier at line 168-173).
- `test/tool-impact-performance.test.ts` (non-empty hits case, new diagnostic branch never reached).
- `test/tool-impact.test.ts`, `test/tool-impact-ranking.test.ts`, `test/tool-impact-output-signals.test.ts`, `test/tool-impact-trust-header.test.ts`, `test/extension-impact.test.ts` (all assert on positive hits; unaffected).

### Task 3: Align reproduction regression test with final diagnostic/traversal behavior [depends: 1, 2]

The reproduction test `test/tool-impact-083-repro.test.ts` was written during the reproduce phase with deliberately loose expectations (regex / `toContain`) so it would flip from RED to GREEN once either fix lands. This task verifies — and, if necessary, tightens — the regression test so it asserts the full post-fix contract per Fixed-When #5 of the diagnosis.

**Files:**
- Modify: `test/tool-impact-083-repro.test.ts`

**Step 1 — Write the failing test**

Open `test/tool-impact-083-repro.test.ts` and replace the bodies of the three existing tests with tighter assertions that lock in the contract. The full new file body (retain existing `setup()` helper at lines 8-41 unchanged):

```ts
test("BUG #073: impact on an entry-point symbol returns the entry-point diagnostic", () => {
  const { projectRoot, store } = setup();
  try {
    const out = impact({
      symbols: ["entryPoint"],
      changeType: "signature_change",
      store,
      projectRoot,
      maxDepth: 5,
    });
    expect(out).toContain("## Trust");
    expect(out).toContain("No dependents found — 'entryPoint' is an entry point with no callers.");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("BUG #073 + #074: impact on an interface with implementors returns the implementor chain (not the interface diagnostic)", () => {
  const { projectRoot, store } = setup();
  try {
    const out = impact({
      symbols: ["Store"],
      changeType: "removal",
      store,
      projectRoot,
      maxDepth: 5,
    });
    expect(out).toContain("## Trust");
    // With #074 fixed, Store → MyStore (implements) → useStore (calls) chain is found;
    // therefore the interface *diagnostic* must NOT fire.
    expect(out).not.toContain("No call-edge dependents found for interface");
    expect(out).toContain("MyStore");
    expect(out).toContain("useStore");
    expect(out).toContain("breaking");
    expect(out).toContain("behavioral");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("BUG #074: impact on an interface traverses implements edges via collectImpact", () => {
  const { projectRoot, store } = setup();
  try {
    const hits = collectImpact({
      symbols: ["Store"],
      changeType: "signature_change",
      store,
      maxDepth: 5,
    });
    expect(hits).toEqual([
      { nodeId: "src/iface.ts::MyStore:2", name: "MyStore", file: "src/iface.ts", depth: 1, classification: "breaking" },
      { nodeId: "src/iface.ts::useStore:3", name: "useStore", file: "src/iface.ts", depth: 2, classification: "behavioral" },
    ]);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

Also delete the `console.log("---...---")` instrumentation lines introduced during reproduce (they pollute test output).

**Step 2 — Run test, verify it fails**

Before Tasks 1 & 2 landed, all three assertions failed (reproduced during the reproduce phase — see `.megapowers/plans/.../reproduce.md`). If this task is executed *after* Tasks 1 and 2 are already implemented (the intended order), the old loose assertions will already pass; the tightened assertions above verify the exact contract.

Run: `bun test test/tool-impact-083-repro.test.ts`

Expected after tightening (before Tasks 1+2 implementation): FAIL — three assertion failures on the new `toContain` / `toEqual` strings.

Expected after Tasks 1+2 implementation: PASS.

**Step 3 — Write minimal implementation**

No production code changes in this task — the implementation delivered by Tasks 1 and 2 is what makes these assertions pass. The "minimal implementation" here is just the test-file update itself.

**Step 4 — Run test, verify it passes**

Run: `bun test test/tool-impact-083-repro.test.ts`

Expected: PASS — all three test cases.

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing. This task adds no new traversal logic; it only re-asserts the behavior that Tasks 1 and 2 established, so no other test suite should change.
