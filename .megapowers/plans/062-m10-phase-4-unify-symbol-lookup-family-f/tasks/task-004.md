---
id: 4
title: Validate include values and preserve legacy neighborhood output
status: approved
depends_on:
  - 2
  - 3
no_test: false
files_to_modify:
  - src/index.ts
  - src/tools/symbol-graph.ts
  - test/tool-symbol-graph-include-schema.test.ts
files_to_create:
  - test/tool-symbol-graph-legacy-neighborhood.test.ts
---

### Task 4: Validate include values and preserve legacy neighborhood output [depends: 2, 3]

Covers AC 8, AC 9, AC 10, AC 11, AC 22.

**Scope note (responds to review):**
- This task is the schema-widening follow-up to Task 3. It broadens the registered-tool `include` schema/cast and keeps `include: ["neighborhood"]` byte-identical to the legacy standalone `symbolGraph()` body.
- This task also updates the existing `test/tool-symbol-graph-include-schema.test.ts` file so its schema assertions match the widened `"neighborhood" | "contract" | "source"` runtime surface.
**Files:**
- Modify: `src/index.ts`
- Modify: `src/tools/symbol-graph.ts`
- Modify: `test/tool-symbol-graph-include-schema.test.ts`
- Create: `test/tool-symbol-graph-legacy-neighborhood.test.ts`
**Step 1 — Write the failing test**
Create `test/tool-symbol-graph-legacy-neighborhood.test.ts`:
```ts
import { expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { suppressFreshTrustHeader } from "../src/output/read-only-ceremony.js";
import { renderLegacyNeighborhoodBody, symbolGraph } from "../src/tools/symbol-graph.js";


test("symbol_graph schema accepts only neighborhood, contract, and source includes", () => {
  const tools: ToolDefinition<any>[] = [];
  const mockPi: ExtensionAPI = {
    registerTool(tool: ToolDefinition<any>) {
      tools.push(tool);
    },
  } as any;


  resetStoreForTesting();
  piCodegraph(mockPi);


  const tool = tools.find((candidate) => candidate.name === "symbol_graph");
  if (!tool) throw new Error("symbol_graph was not registered");


  const schema = tool.parameters as any;
  expect(Value.Check(schema, { name: "foo", include: ["neighborhood"] })).toBe(true);
  expect(Value.Check(schema, { name: "foo", include: ["contract"] })).toBe(true);
  expect(Value.Check(schema, { name: "foo", include: ["source"] })).toBe(true);
  expect(Value.Check(schema, { name: "foo", include: ["signals"] })).toBe(false);
  expect(Value.Check(schema, { name: "foo", include: ["wat"] })).toBe(false);
});
test("include:['neighborhood'] returns the byte-identical legacy body and stays the active base when combined", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sg-legacy-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/a.ts"), "import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n");
  writeFileSync(join(projectRoot, "src/b.ts"), "export function bar() {\n  return 1;\n}\n");


  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex("import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n");
    const hashB = sha256Hex("export function bar() {\n  return 1;\n}\n");


    store.addNode({ id: "src/a.ts::foo:3", kind: "function", name: "foo", file: "src/a.ts", start_line: 3, end_line: 5, content_hash: hashA, is_exported: true, signature: "() => void" });
    store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: hashB, is_exported: true, signature: "() => number" });
    store.addEdge({
      source: "src/a.ts::foo:3",
      target: "src/b.ts::bar:1",
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "direct call", content_hash: hashA },
      created_at: Date.now(),
    });
    const expected = renderLegacyNeighborhoodBody({ name: "foo", store, projectRoot }).body;
    const neighborhood = suppressFreshTrustHeader(symbolGraph({ name: "foo", include: ["neighborhood"] as any, store, projectRoot }));
    const combined = suppressFreshTrustHeader(symbolGraph({ name: "foo", include: ["neighborhood", "contract"] as any, store, projectRoot }));


    expect(neighborhood).toBe(expected);
    expect(combined.startsWith(expected)).toBe(true);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```
**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-graph-legacy-neighborhood.test.ts`
Expected: FAIL — Bun assertion failure `expect(received).toBe(expected)` reported against the schema checks. Specifically, with the current schema at `src/index.ts:25-34` that accepts only `Type.Literal("contract")`, `Value.Check(schema, { name: "foo", include: ["neighborhood"] })` returns `false` (so `expect(false).toBe(true)` fails) and `Value.Check(schema, { name: "foo", include: ["source"] })` likewise returns `false`.
**Step 3 — Write minimal implementation**
In `src/index.ts`, replace the `SymbolGraphParams` include schema at `src/index.ts:25-34` with the broadened union:

```ts
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
      { description: "Optional extra sections to append to the response" },
    ),
  ),
});
```

Also update the registered-tool execute path so the `include` cast matches the new runtime surface. At `src/index.ts:212`, replace:

```ts
include: params.include as Array<"contract"> | undefined,
```

with:

```ts
include: params.include as Array<"neighborhood" | "contract" | "source"> | undefined,
```

In `src/tools/symbol-graph.ts`, keep `renderLegacyNeighborhoodBody()` unchanged and ensure `symbolGraph()` only switches to that base when `include` contains `"neighborhood"` (this is already the shape introduced in Task 3).
Then update the existing schema assertions in `test/tool-symbol-graph-include-schema.test.ts` so they match the widened include surface. Replace the old negative check for `include: ["neighborhood"]` with concrete positive/negative checks such as:

```ts
if (!Value.Check(schema, { name: "foo", include: ["neighborhood"] })) {
  throw new Error('symbol_graph schema rejected include=["neighborhood"]');
}
if (!Value.Check(schema, { name: "foo", include: ["contract"] })) {
  throw new Error('symbol_graph schema rejected include=["contract"]');
}
if (!Value.Check(schema, { name: "foo", include: ["source"] })) {
  throw new Error('symbol_graph schema rejected include=["source"]');
}
if (Value.Check(schema, { name: "foo", include: ["signals"] })) {
  throw new Error('symbol_graph schema accepted include=["signals"]');
}
```

Keep the compact-card default-output assertions introduced in Task 3, but make sure the schema checks in this existing file now align with the broadened runtime schema.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-graph-legacy-neighborhood.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
