---
id: 2
title: "Add diagnostic empty-hits message to `impact()` — entry-point,
  interface, isolated (fixes #073)"
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/tools/impact.ts
files_to_create:
  - test/tool-impact-empty-diagnostic.test.ts
---

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
