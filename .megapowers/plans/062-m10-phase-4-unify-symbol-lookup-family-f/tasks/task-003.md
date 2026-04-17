---
id: 3
title: Make symbol_graph default to compact card
status: approved
depends_on:
  - 1
  - 2
no_test: false
files_to_modify:
  - src/tools/symbol-graph.ts
  - test/tool-symbol-graph-include-schema.test.ts
  - test/tool-symbol-graph.test.ts
  - test/tool-symbol-graph-signals.test.ts
  - test/tool-symbol-graph-trust-header.test.ts
  - test/tool-symbol-graph-no-bolt-on.test.ts
  - test/tool-symbol-graph-unknown-edge-kind.test.ts
  - test/tool-symbol-graph-stale-agent.test.ts
  - test/tool-symbol-graph-all-edge-kinds.test.ts
  - test/tool-symbol-graph-lsp.test.ts
  - test/repro-039-self-referential-dedup.test.ts
  - test/readonly-graceful-degradation.test.ts
files_to_create:
  - test/tool-symbol-graph-default-card.test.ts
---

### Task 3: Make symbol_graph default to compact card [depends: 1, 2]

Covers AC 3, AC 4, AC 5, AC 6, AC 7, AC 12, AC 13, AC 17, AC 18, AC 22.

**Scope note (responds to review):**
- This task switches **base selection only**. The contract-append block in `src/tools/symbol-graph.ts` already exists and stays intact — Task 3 does not introduce or modify contract-append behavior.
- Coverage for AC 12 / AC 13 remains in the existing `test/tool-symbol-graph-contract-include.test.ts` assertions that require the appended contract section to start after the active base and to match `renderSymbolContractBody(...).body`.
- Direct `symbolGraph(...)` call sites and the three registered-tool `exec!` call sites in `test/tool-symbol-graph-lsp.test.ts` that still assert legacy neighborhood sections are migrated to `include: ["neighborhood"]` in this task so the full suite stays green after the default-base flip.
**Files:**
- Modify: `src/tools/symbol-graph.ts`
- Modify: `test/tool-symbol-graph-include-schema.test.ts`
- Create: `test/tool-symbol-graph-default-card.test.ts`
- Modify: `test/tool-symbol-graph.test.ts`
- Modify: `test/tool-symbol-graph-signals.test.ts`
- Modify: `test/tool-symbol-graph-trust-header.test.ts`
- Modify: `test/tool-symbol-graph-no-bolt-on.test.ts`
- Modify: `test/tool-symbol-graph-unknown-edge-kind.test.ts`
- Modify: `test/tool-symbol-graph-stale-agent.test.ts`
- Modify: `test/tool-symbol-graph-all-edge-kinds.test.ts`
- Modify: `test/tool-symbol-graph-lsp.test.ts`
- Modify: `test/repro-039-self-referential-dedup.test.ts`
- Modify: `test/readonly-graceful-degradation.test.ts`
**Step 1 — Write the failing test**
Create `test/tool-symbol-graph-default-card.test.ts`:
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";

test("symbolGraph defaults to a compact card and include:[] matches omitted include", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sg-card-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(join(projectRoot, "test"), { recursive: true });

  const fileAContent = "import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n";
  const fileBContent = "export function bar() {\n  return 1;\n}\n";
  const testContent = "test('foo works', () => {});\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileAContent);
  writeFileSync(join(projectRoot, "src/b.ts"), fileBContent);
  writeFileSync(join(projectRoot, "test/foo.test.ts"), testContent);
  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileAContent);
    const hashB = sha256Hex(fileBContent);
    const hashTest = sha256Hex(testContent);

    store.addNode({ id: "src/a.ts::foo:3", kind: "function", name: "foo", file: "src/a.ts", start_line: 3, end_line: 5, content_hash: hashA, is_exported: true, signature: "() => void" });
    store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: hashB, is_exported: true, signature: "() => number" });
    store.addNode({ id: "test/foo.test.ts::foo works:1", kind: "test", name: "foo works", file: "test/foo.test.ts", start_line: 1, end_line: 1, content_hash: hashTest });
    store.addEdge({
      source: "src/a.ts::foo:3",
      target: "src/b.ts::bar:1",
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "direct call", content_hash: hashA },
      created_at: Date.now(),
    });
    store.addEdge({
      source: "src/a.ts::foo:3",
      target: "test/foo.test.ts::foo works:1",
      kind: "tested_by",
      provenance: { source: "coverage", confidence: 0.9, evidence: "covered", content_hash: hashA },
      created_at: Date.now(),
    });
    const withoutInclude = symbolGraph({ name: "foo", store, projectRoot });
    const withEmptyInclude = symbolGraph({ name: "foo", include: [] as any, store, projectRoot });

    expect(withoutInclude).toBe(withEmptyInclude);
    expect(withoutInclude).toContain("## foo (function)");
    expect(withoutInclude).toContain("### Signature");
    expect(withoutInclude).toContain("### Covering Tests");
    expect(withoutInclude).toContain("### Key Relationships");
    expect(withoutInclude).toContain("### Signals");
    expect(withoutInclude).not.toContain("### Exported");
    expect(withoutInclude).not.toContain("### Contract");
    expect(withoutInclude).not.toContain("### Source");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
test("symbolGraph keeps not-found and ambiguous handling explicit in the default card base", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sg-card-empty-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/a.ts"), "export function foo() {}\n");
  writeFileSync(join(projectRoot, "src/b.ts"), "export class foo {}\n");
  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex("export function foo() {}\n");
    const hashB = sha256Hex("export class foo {}\n");
    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA });
    store.addNode({ id: "src/b.ts::foo:1", kind: "class", name: "foo", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB });

    expect(symbolGraph({ name: "doesNotExist", store, projectRoot })).toContain('Symbol "doesNotExist" not found');
    const ambiguous = symbolGraph({ name: "foo", store, projectRoot });
    expect(ambiguous).toContain('Multiple matches for "foo"');
    expect(ambiguous).toContain("src/a.ts");
    expect(ambiguous).toContain("src/b.ts");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

Also update the existing neighborhood-oriented tests listed above so each direct `symbolGraph(...)` call that expects the old sectioned graph explicitly requests it with `include: ["neighborhood"] as any`. For example, in `test/tool-symbol-graph.test.ts` replace:

```ts
const output = symbolGraph({ name: "foo", store, projectRoot });
```

with:

```ts
const output = symbolGraph({ name: "foo", include: ["neighborhood"] as any, store, projectRoot });
```

Make the same explicit-legacy change everywhere those files assert `### Callers`, `### Callees`, omitted-neighbor counts, trust-header neighborhood rows, or edge-kind sections.

In `test/tool-symbol-graph-lsp.test.ts`, update the three registered-tool execute calls that still assert legacy neighborhood sections so they explicitly request the legacy base:

```ts
const result = await exec!(
  "tc1",
  { name: "shared", file: "src/api.ts", include: ["neighborhood"] },
  undefined,
  undefined,
  { cwd: projectRoot },
);
```

```ts
const result = await exec!(
  "tc-intf",
  { name: "IWorker", file: "src/api.ts", include: ["neighborhood"] },
  undefined,
  undefined,
  { cwd: projectRoot },
);
```

```ts
const result2 = await exec!(
  "tc-a2",
  { name: "IWorker", file: "src/api.ts", include: ["neighborhood"] },
  undefined,
  undefined,
  { cwd: projectRoot },
);
```

In `test/tool-symbol-graph-include-schema.test.ts`, keep the schema checks unchanged in this task, but replace the old exact-string assertion block with explicit compact-card assertions:

```ts
const withoutInclude = symbolGraph({ name: "foo", store, projectRoot });
expect(withoutInclude).toContain("## foo (function)");
expect(withoutInclude).toContain("### Signature");
expect(withoutInclude).toContain("### Signals");

const withEmptyInclude = symbolGraph({ name: "foo", include: [] as any, store, projectRoot });
expect(withEmptyInclude).toBe(withoutInclude);
```
**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-graph-default-card.test.ts`
Expected: FAIL — `expect(received).toContain(expected)` for `"### Signature"` — the default `symbolGraph()` output currently emits the legacy neighborhood view (`### Callees`, `### Callers`, etc.) rather than the compact card.
**Step 3 — Write minimal implementation**
In `src/tools/symbol-graph.ts`, switch the base output selection so omitted `include` and `include: []` use the shared compact card renderer from Task 1, while `include` containing `"neighborhood"` uses the legacy renderer from Task 2. Keep the existing contract-append block at `src/tools/symbol-graph.ts:191-195` exactly as-is:

```ts
import { renderSymbolCardBody } from "./symbol-card.js";
import { renderSymbolContractBody } from "./symbol-contract.js";


export interface SymbolGraphParams {
  name: string;
  file?: string;
  include?: Array<"neighborhood" | "contract" | "source">;
  limit?: number;
  store: GraphStore;
  projectRoot: string;
}
export function symbolGraph(params: SymbolGraphParams): string {
  const { include } = params;
  const stats = params.store.getStatistics(params.projectRoot);


  const useNeighborhoodBase = (include ?? []).includes("neighborhood");
  const base = useNeighborhoodBase
    ? renderLegacyNeighborhoodBody(params)
    : renderSymbolCardBody({
        name: params.name,
        file: params.file,
        store: params.store,
        projectRoot: params.projectRoot,
      });
  let body = base.body;
  let hasLocalExceptions = base.hasLocalExceptions;
  // Existing contract-append block — leave untouched.
  if ((include ?? []).includes("contract")) {
    const rendered = renderSymbolContractBody({
      name: params.name,
      file: params.file,
      store: params.store,
      projectRoot: params.projectRoot,
    });
    body = `${body}${body.endsWith("\n") ? "\n" : "\n\n"}${rendered.body}`;
    hasLocalExceptions = hasLocalExceptions || rendered.hasLocalExceptions;
  }
  return prependTrustHeader(body, { stats, hasLocalExceptions });
}
```

This task does **not** introduce new contract behavior. It only flips the base from neighborhood to compact card when `"neighborhood"` is absent from `include`, while keeping the existing contract-append tests green.

Do not broaden the schema checks in `test/tool-symbol-graph-include-schema.test.ts` yet; Task 4 owns that change.
**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-graph-default-card.test.ts`
Expected: PASS
**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
