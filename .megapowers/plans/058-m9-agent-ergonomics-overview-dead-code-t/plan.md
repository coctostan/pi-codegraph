# Plan

### Task 1: graph_overview: node kind distribution and file stats

### Task 1: graph_overview: node kind distribution and file stats

**Files:**
- Create: `src/tools/graph-overview.ts`
- Create: `test/tool-graph-overview-stats.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-graph-overview-stats.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { graphOverview } from "../src/tools/graph-overview.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("graphOverview includes node kind distribution and file stats", () => {
  const projectRoot = join(tmpdir(), `pi-cg-overview-stats-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "export function foo() {}\n";
  const fileB = "export class Bar {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  writeFileSync(join(projectRoot, "src/b.ts"), fileB);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    const hashB = sha256Hex(fileB);
    store.setFileHash("src/a.ts", hashA);
    store.setFileHash("src/b.ts", hashB);

    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/b.ts::Bar:1", kind: "class", name: "Bar", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB, is_exported: true });

    const output = graphOverview({ store, projectRoot });

    // Trust header
    expect(output).toContain("## Trust");

    // Symbols section with counts
    expect(output).toContain("## Symbols");
    expect(output).toContain("function: 1");
    expect(output).toContain("class: 1");

    // Files section
    expect(output).toContain("## Files");
    expect(output).toContain("total: 2");
    expect(output).toContain("stale: 0");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("graphOverview returns empty graph message when no nodes exist", () => {
  const projectRoot = join(tmpdir(), `pi-cg-overview-empty-${Date.now()}`);
  mkdirSync(projectRoot, { recursive: true });

  const store = new SqliteGraphStore();
  try {
    const output = graphOverview({ store, projectRoot });
    expect(output).toContain("## Trust");
    expect(output).toContain("empty");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-overview-stats.test.ts`
Expected: FAIL — `error: Cannot find module "../src/tools/graph-overview.js"`

**Step 3 — Write minimal implementation**

```typescript
// src/tools/graph-overview.ts
import type { GraphStore } from "../graph/store.js";
import { prependTrustHeader } from "../output/trust.js";

export interface GraphOverviewParams {
  store: GraphStore;
  projectRoot: string;
}

export function graphOverview(params: GraphOverviewParams): string {
  const { store, projectRoot } = params;
  const stats = store.getStatistics(projectRoot);

  // Check for empty graph
  const totalNodes = Object.values(stats.nodes).reduce((sum, n) => sum + n, 0);
  if (totalNodes === 0) {
    return prependTrustHeader("Graph is empty — index a project first.", { stats });
  }

  const lines: string[] = [];

  // Symbols section
  lines.push("## Symbols");
  const kindOrder = ["function", "class", "interface", "module", "endpoint", "test"];
  for (const kind of kindOrder) {
    if (stats.nodes[kind]) {
      lines.push(`${kind}: ${stats.nodes[kind]}`);
    }
  }
  // Any kinds not in the canonical order
  for (const [kind, count] of Object.entries(stats.nodes)) {
    if (!kindOrder.includes(kind)) {
      lines.push(`${kind}: ${count}`);
    }
  }

  // Files section
  lines.push("");
  lines.push("## Files");
  lines.push(`total: ${stats.files.total}  stale: ${stats.files.stale}`);

  const body = lines.join("\n") + "\n";
  return prependTrustHeader(body, { stats });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-overview-stats.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 2: graph_overview: hub symbols (top 10 by degree) [depends: 1]

### Task 2: graph_overview: hub symbols (top 10 by degree) [depends: 1]

**Files:**
- Modify: `src/tools/graph-overview.ts`
- Create: `test/tool-graph-overview-hubs.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-graph-overview-hubs.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { graphOverview } from "../src/tools/graph-overview.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("graphOverview includes hub symbols sorted by degree", () => {
  const projectRoot = join(tmpdir(), `pi-cg-overview-hubs-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "export function hub() {}\n";
  const fileB = "export function leaf1() {}\n";
  const fileC = "export function leaf2() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  writeFileSync(join(projectRoot, "src/b.ts"), fileB);
  writeFileSync(join(projectRoot, "src/c.ts"), fileC);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    const hashB = sha256Hex(fileB);
    const hashC = sha256Hex(fileC);
    store.setFileHash("src/a.ts", hashA);
    store.setFileHash("src/b.ts", hashB);
    store.setFileHash("src/c.ts", hashC);

    store.addNode({ id: "src/a.ts::hub:1", kind: "function", name: "hub", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/b.ts::leaf1:1", kind: "function", name: "leaf1", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB, is_exported: true });
    store.addNode({ id: "src/c.ts::leaf2:1", kind: "function", name: "leaf2", file: "src/c.ts", start_line: 1, end_line: 1, content_hash: hashC, is_exported: true });

    // hub calls both leaves — degree 2
    store.addEdge({ source: "src/a.ts::hub:1", target: "src/b.ts::leaf1:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: hashA }, created_at: Date.now() });
    store.addEdge({ source: "src/a.ts::hub:1", target: "src/c.ts::leaf2:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: hashA }, created_at: Date.now() });

    const output = graphOverview({ store, projectRoot });

    expect(output).toContain("## Hub Symbols");
    expect(output).toContain("hub");
    expect(output).toContain("function");
    expect(output).toContain("src/a.ts");
    // hub has degree 2, leaves have degree 1 each
    // hub should appear first
    const hubIdx = output.indexOf("hub");
    const leaf1Idx = output.indexOf("leaf1");
    expect(hubIdx).toBeLessThan(leaf1Idx);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-overview-hubs.test.ts`
Expected: FAIL — `expect(received).toContain(expected) — Expected string "..." to contain "## Hub Symbols"`

**Step 3 — Write minimal implementation**

Add to `src/tools/graph-overview.ts` — after the Files section, before the final `return`:

```typescript
// src/tools/graph-overview.ts
import type { GraphStore } from "../graph/store.js";
import { prependTrustHeader } from "../output/trust.js";

export interface GraphOverviewParams {
  store: GraphStore;
  projectRoot: string;
}

export function graphOverview(params: GraphOverviewParams): string {
  const { store, projectRoot } = params;
  const stats = store.getStatistics(projectRoot);

  const totalNodes = Object.values(stats.nodes).reduce((sum, n) => sum + n, 0);
  if (totalNodes === 0) {
    return prependTrustHeader("Graph is empty — index a project first.", { stats });
  }

  const lines: string[] = [];

  // Symbols section
  lines.push("## Symbols");
  const kindOrder = ["function", "class", "interface", "module", "endpoint", "test"];
  for (const kind of kindOrder) {
    if (stats.nodes[kind]) {
      lines.push(`${kind}: ${stats.nodes[kind]}`);
    }
  }
  for (const [kind, count] of Object.entries(stats.nodes)) {
    if (!kindOrder.includes(kind)) {
      lines.push(`${kind}: ${count}`);
    }
  }

  // Files section
  lines.push("");
  lines.push("## Files");
  lines.push(`total: ${stats.files.total}  stale: ${stats.files.stale}`);

  // Hub symbols section
  const hubRows = store.queryRows<{ id: string; name: string; kind: string; file: string; degree: number }>(
    `SELECT n.id, n.name, n.kind, n.file,
       (SELECT COUNT(*) FROM edges WHERE source = n.id OR target = n.id) as degree
     FROM nodes n
     WHERE NOT n.file LIKE '__meta__%' AND NOT n.file LIKE '__unresolved__%'
     ORDER BY degree DESC
     LIMIT 10`
  );
  if (hubRows.length > 0) {
    lines.push("");
    lines.push("## Hub Symbols");
    for (const row of hubRows) {
      lines.push(`${row.name}  ${row.kind}  ${row.file}  degree:${row.degree}`);
    }
  }

  const body = lines.join("\n") + "\n";
  return prependTrustHeader(body, { stats });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-overview-hubs.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 3: graph_overview: most-imported files [depends: 2]

### Task 3: graph_overview: most-imported files [depends: 2]

**Files:**
- Modify: `src/tools/graph-overview.ts`
- Create: `test/tool-graph-overview-imports.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-graph-overview-imports.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { graphOverview } from "../src/tools/graph-overview.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("graphOverview includes most-imported files sorted by import count", () => {
  const projectRoot = join(tmpdir(), `pi-cg-overview-imports-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileShared = "export function shared() {}\n";
  const fileCaller1 = "import { shared } from './shared';\nexport function c1() { shared(); }\n";
  const fileCaller2 = "import { shared } from './shared';\nexport function c2() { shared(); }\n";
  writeFileSync(join(projectRoot, "src/shared.ts"), fileShared);
  writeFileSync(join(projectRoot, "src/c1.ts"), fileCaller1);
  writeFileSync(join(projectRoot, "src/c2.ts"), fileCaller2);

  const store = new SqliteGraphStore();
  try {
    const hashS = sha256Hex(fileShared);
    const hash1 = sha256Hex(fileCaller1);
    const hash2 = sha256Hex(fileCaller2);
    store.setFileHash("src/shared.ts", hashS);
    store.setFileHash("src/c1.ts", hash1);
    store.setFileHash("src/c2.ts", hash2);

    store.addNode({ id: "src/shared.ts::shared:1", kind: "function", name: "shared", file: "src/shared.ts", start_line: 1, end_line: 1, content_hash: hashS, is_exported: true });
    store.addNode({ id: "src/c1.ts::c1:2", kind: "function", name: "c1", file: "src/c1.ts", start_line: 2, end_line: 2, content_hash: hash1, is_exported: true });
    store.addNode({ id: "src/c2.ts::c2:2", kind: "function", name: "c2", file: "src/c2.ts", start_line: 2, end_line: 2, content_hash: hash2, is_exported: true });

    // Both callers import from shared
    store.addEdge({ source: "src/c1.ts::c1:2", target: "src/shared.ts::shared:1", kind: "imports", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "import", content_hash: hash1 }, created_at: Date.now() });
    store.addEdge({ source: "src/c2.ts::c2:2", target: "src/shared.ts::shared:1", kind: "imports", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "import", content_hash: hash2 }, created_at: Date.now() });

    const output = graphOverview({ store, projectRoot });

    expect(output).toContain("## Most-Imported Files");
    expect(output).toContain("src/shared.ts");
    // shared.ts has 2 inbound imports
    expect(output).toMatch(/src\/shared\.ts.*2/);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-overview-imports.test.ts`
Expected: FAIL — `expect(received).toContain(expected) — Expected string "..." to contain "## Most-Imported Files"`

**Step 3 — Write minimal implementation**

Add the most-imported files section to `graphOverview` in `src/tools/graph-overview.ts`, after the Hub Symbols section:

```typescript
  // Most-imported files section
  const importRows = store.queryRows<{ file: string; import_count: number }>(
    `SELECT n.file, COUNT(*) as import_count
     FROM edges e
     JOIN nodes n ON e.target = n.id
     WHERE e.kind = 'imports'
       AND NOT n.file LIKE '__meta__%'
       AND NOT n.file LIKE '__unresolved__%'
     GROUP BY n.file
     ORDER BY import_count DESC
     LIMIT 10`
  );
  if (importRows.length > 0) {
    lines.push("");
    lines.push("## Most-Imported Files");
    for (const row of importRows) {
      lines.push(`${row.file}  imports:${row.import_count}`);
    }
  }
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-overview-imports.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 4: graph_overview: suggested queries conditional on edge kinds [depends: 3]

### Task 4: graph_overview: suggested queries conditional on edge kinds [depends: 3]

**Files:**
- Modify: `src/tools/graph-overview.ts`
- Create: `test/tool-graph-overview-queries.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-graph-overview-queries.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { graphOverview } from "../src/tools/graph-overview.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("graphOverview suggests queries only for edge kinds present in the graph", () => {
  const projectRoot = join(tmpdir(), `pi-cg-overview-queries-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "export function foo() {}\n";
  const fileB = "export function bar() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  writeFileSync(join(projectRoot, "src/b.ts"), fileB);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    const hashB = sha256Hex(fileB);
    store.setFileHash("src/a.ts", hashA);
    store.setFileHash("src/b.ts", hashB);

    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB, is_exported: true });

    // Only 'calls' edges — no routes_to, no tested_by, etc.
    store.addEdge({ source: "src/a.ts::foo:1", target: "src/b.ts::bar:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: hashA }, created_at: Date.now() });

    const output = graphOverview({ store, projectRoot });

    expect(output).toContain("## Suggested Queries");
    // Should include a calls-related query
    expect(output).toContain("calls");
    // Should NOT include routes_to queries since no route edges exist
    expect(output).not.toContain("routes_to");
    // Should NOT include tested_by queries since no test edges exist
    expect(output).not.toContain("tested_by");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("graphOverview suggests route queries when routes_to edges exist", () => {
  const projectRoot = join(tmpdir(), `pi-cg-overview-routes-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "export function handler() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    store.setFileHash("src/a.ts", hashA);

    store.addNode({ id: "src/a.ts::handler:1", kind: "function", name: "handler", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    store.addNode({ id: "__meta__::GET /api:1", kind: "endpoint", name: "GET /api", file: "__meta__", start_line: 1, end_line: 1, content_hash: "x" });

    store.addEdge({ source: "src/a.ts::handler:1", target: "__meta__::GET /api:1", kind: "routes_to", provenance: { source: "ast-grep", confidence: 0.8, evidence: "route", content_hash: hashA }, created_at: Date.now() });

    const output = graphOverview({ store, projectRoot });

    expect(output).toContain("## Suggested Queries");
    expect(output).toContain("routes_to");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-overview-queries.test.ts`
Expected: FAIL — `expect(received).toContain(expected) — Expected string "..." to contain "## Suggested Queries"`

**Step 3 — Write minimal implementation**

Add suggested queries section to `graphOverview` in `src/tools/graph-overview.ts`, after the Most-Imported Files section:

```typescript
  // Suggested Queries section
  const presentEdgeKinds = new Set(Object.keys(stats.edges));
  const recipes: string[] = [];

  // Always-present recipes (if any nodes exist)
  recipes.push('MATCH (n {kind: "function"}) RETURN n LIMIT 10');

  if (presentEdgeKinds.has("calls")) {
    recipes.push('MATCH (a)-[r:calls]->(b) RETURN a.name, b.name LIMIT 10');
  }
  if (presentEdgeKinds.has("imports")) {
    recipes.push('MATCH (a)-[r:imports]->(b) RETURN a.name, b.name LIMIT 10');
  }
  if (presentEdgeKinds.has("tested_by")) {
    recipes.push('MATCH (a)-[r:tested_by]->(t) RETURN a.name, t.name LIMIT 10');
  }
  if (presentEdgeKinds.has("implements")) {
    recipes.push('MATCH (a)-[r:implements]->(b) RETURN a.name, b.name LIMIT 10');
  }
  if (presentEdgeKinds.has("routes_to")) {
    recipes.push('MATCH (a)-[r:routes_to]->(b) RETURN a.name, b.name LIMIT 10');
  }
  if (presentEdgeKinds.has("renders")) {
    recipes.push('MATCH (a)-[r:renders]->(b) RETURN a.name, b.name LIMIT 10');
  }
  if (presentEdgeKinds.has("co_changes_with")) {
    recipes.push('MATCH (a)-[r:co_changes_with]->(b) RETURN a.name, b.name LIMIT 10');
  }

  if (recipes.length > 0) {
    lines.push("");
    lines.push("## Suggested Queries");
    for (const recipe of recipes) {
      lines.push(recipe);
    }
  }
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-overview-queries.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 5: graph_overview: register tool in pi extension [depends: 4]

### Task 5: graph_overview: register tool in pi extension [depends: 4]

**Files:**
- Modify: `src/index.ts`
- Create: `test/tool-graph-overview-wiring.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-graph-overview-wiring.test.ts
import { expect, test } from "bun:test";

test("pi extension registers graph_overview tool with no required parameters", async () => {
  const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
  const mockPi = {
    registerTool(tool: { name: string; parameters: unknown; execute: Function }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const tool = registeredTools.find((t) => t.name === "graph_overview");
  expect(tool).toBeDefined();

  const schema = tool!.parameters as any;
  // No required params
  expect(schema.required ?? []).toEqual([]);

  // Should have ptc with read-only policy
  expect((tool as any).ptc?.readOnly).toBe(true);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-overview-wiring.test.ts`
Expected: FAIL — `expect(received).toBeDefined() — Expected undefined to be defined`

**Step 3 — Write minimal implementation**

Add to `src/index.ts`:

1. Add import at top:
```typescript
import { graphOverview } from "./tools/graph-overview.js";
```

2. Add params schema after existing schemas:
```typescript
const GraphOverviewParams = Type.Object({});
```

3. Register the tool inside `piCodegraph()`, after the `symbol_contract` registration:
```typescript
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
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-overview-wiring.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 6: dead_code: single symbol mode — referenced symbol

### Task 6: dead_code: single symbol mode — referenced symbol

**Files:**
- Create: `src/tools/dead-code.ts`
- Create: `test/tool-dead-code-single-referenced.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-dead-code-single-referenced.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { deadCode } from "../src/tools/dead-code.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("deadCode single symbol mode reports referenced symbol with reference list", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-ref-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "export function target() {}\n";
  const fileB = "import { target } from './a';\nexport function caller() { target(); }\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  writeFileSync(join(projectRoot, "src/b.ts"), fileB);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    const hashB = sha256Hex(fileB);
    store.setFileHash("src/a.ts", hashA);
    store.setFileHash("src/b.ts", hashB);

    store.addNode({ id: "src/a.ts::target:1", kind: "function", name: "target", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/b.ts::caller:2", kind: "function", name: "caller", file: "src/b.ts", start_line: 2, end_line: 2, content_hash: hashB, is_exported: true });

    store.addEdge({ source: "src/b.ts::caller:2", target: "src/a.ts::target:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: hashB }, created_at: Date.now() });
    store.addEdge({ source: "src/b.ts::caller:2", target: "src/a.ts::target:1", kind: "imports", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "import", content_hash: hashB }, created_at: Date.now() });

    const output = deadCode({ name: "target", store, projectRoot });

    expect(output).toContain("## Trust");
    expect(output).toContain("referenced: yes");
    expect(output).toContain("references: 2");
    expect(output).toContain("caller");
    expect(output).toContain("calls");
    expect(output).toContain("imports");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-dead-code-single-referenced.test.ts`
Expected: FAIL — `error: Cannot find module "../src/tools/dead-code.js"`

**Step 3 — Write minimal implementation**

```typescript
// src/tools/dead-code.ts
import type { GraphStore } from "../graph/store.js";
import type { NodeKind } from "../graph/types.js";
import { prependTrustHeader } from "../output/trust.js";
import { resolveUniqueSymbol } from "./symbol-resolution.js";

export interface DeadCodeParams {
  name?: string;
  file?: string;
  kind?: string;
  glob?: string;
  store: GraphStore;
  projectRoot: string;
}

export function deadCode(params: DeadCodeParams): string {
  const { name, file, store, projectRoot } = params;
  const stats = store.getStatistics(projectRoot);

  if (name) {
    return singleSymbolMode({ name, file, store, projectRoot, stats });
  }

  return prependTrustHeader("sweep mode not yet implemented", { stats });
}

function singleSymbolMode(params: {
  name: string;
  file?: string;
  store: GraphStore;
  projectRoot: string;
  stats: ReturnType<GraphStore["getStatistics"]>;
}): string {
  const { name, file, store, projectRoot, stats } = params;

  const resolved = resolveUniqueSymbol({
    name,
    file,
    store,
    projectRoot,
    notFoundLabel: "Symbol",
  });

  if (resolved.kind === "not_found") {
    return prependTrustHeader(resolved.text, { stats });
  }
  if (resolved.kind === "ambiguous") {
    return prependTrustHeader(resolved.text, { stats });
  }

  const node = resolved.node;
  const inbound = store.getNeighbors(node.id, { direction: "in" })
    .filter((nr) => !nr.node.file.startsWith("__meta__") && !nr.node.file.startsWith("__unresolved__"));

  const lines: string[] = [];
  lines.push(`## ${node.name} (${node.kind})`);
  lines.push(`file: ${node.file}`);
  lines.push(`referenced: ${inbound.length > 0 ? "yes" : "no"}`);
  lines.push(`references: ${inbound.length}`);

  if (inbound.length > 0) {
    lines.push("");
    for (const nr of inbound) {
      lines.push(`  ${nr.node.name}  ${nr.node.kind}  ${nr.node.file}  ${nr.edge.kind}`);
    }
  }

  return prependTrustHeader(lines.join("\n") + "\n", { stats });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-dead-code-single-referenced.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 7: dead_code: single symbol mode — unreferenced and not-found/ambiguous [depends: 6]

### Task 7: dead_code: single symbol mode — unreferenced and not-found/ambiguous [depends: 6]

**Files:**
- Create: `test/tool-dead-code-single-unreferenced.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-dead-code-single-unreferenced.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { deadCode } from "../src/tools/dead-code.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("deadCode single symbol reports unreferenced when no inbound edges", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-unref-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "export function lonely() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    store.setFileHash("src/a.ts", hashA);
    store.addNode({ id: "src/a.ts::lonely:1", kind: "function", name: "lonely", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });

    const output = deadCode({ name: "lonely", store, projectRoot });

    expect(output).toContain("referenced: no");
    expect(output).toContain("references: 0");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("deadCode single symbol returns not-found for unknown symbol", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-notfound-${Date.now()}`);
  mkdirSync(projectRoot, { recursive: true });

  const store = new SqliteGraphStore();
  try {
    const output = deadCode({ name: "nonexistent", store, projectRoot });
    expect(output).toContain("not found");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("deadCode single symbol returns disambiguation list for ambiguous symbol", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-ambig-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "export function dup() {}\n";
  const fileB = "export function dup() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  writeFileSync(join(projectRoot, "src/b.ts"), fileB);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    const hashB = sha256Hex(fileB);
    store.setFileHash("src/a.ts", hashA);
    store.setFileHash("src/b.ts", hashB);
    store.addNode({ id: "src/a.ts::dup:1", kind: "function", name: "dup", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/b.ts::dup:1", kind: "function", name: "dup", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB, is_exported: true });

    const output = deadCode({ name: "dup", store, projectRoot });
    expect(output).toContain("Multiple matches");
    expect(output).toContain("src/a.ts");
    expect(output).toContain("src/b.ts");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-dead-code-single-unreferenced.test.ts`
Expected: PASS — all three assertions are already satisfied by the Task 6 implementation.

Actually, this should pass immediately since the logic already handles these cases. Let me verify the assertions are correct against the implementation.

The `resolveUniqueSymbol` function already returns `not_found` and `ambiguous` cases, and the `inbound.length === 0` case already produces `referenced: no` and `references: 0`.

**Step 3 — No additional implementation needed**

The Task 6 implementation already handles unreferenced symbols (zero inbound edges → `referenced: no`, `references: 0`) and delegates to `resolveUniqueSymbol` for not-found and ambiguous cases.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-dead-code-single-unreferenced.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 8: dead_code: sweep mode — exported symbols with zero inbound edges [depends: 6]

### Task 8: dead_code: sweep mode — exported symbols with zero inbound edges [depends: 6]

**Files:**
- Modify: `src/tools/dead-code.ts`
- Create: `test/tool-dead-code-sweep.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-dead-code-sweep.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { deadCode } from "../src/tools/dead-code.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("deadCode sweep mode finds exported symbols with zero inbound edges", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-sweep-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "export function used() {}\n";
  const fileB = "export function unused() {}\n";
  const fileC = "import { used } from './a';\nexport function caller() { used(); }\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  writeFileSync(join(projectRoot, "src/b.ts"), fileB);
  writeFileSync(join(projectRoot, "src/c.ts"), fileC);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    const hashB = sha256Hex(fileB);
    const hashC = sha256Hex(fileC);
    store.setFileHash("src/a.ts", hashA);
    store.setFileHash("src/b.ts", hashB);
    store.setFileHash("src/c.ts", hashC);

    store.addNode({ id: "src/a.ts::used:1", kind: "function", name: "used", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/b.ts::unused:1", kind: "function", name: "unused", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB, is_exported: true });
    store.addNode({ id: "src/c.ts::caller:2", kind: "function", name: "caller", file: "src/c.ts", start_line: 2, end_line: 2, content_hash: hashC, is_exported: true });

    // caller calls used — used has inbound edge
    store.addEdge({ source: "src/c.ts::caller:2", target: "src/a.ts::used:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: hashC }, created_at: Date.now() });

    const output = deadCode({ store, projectRoot });

    expect(output).toContain("## Trust");
    // unused and caller have zero inbound edges, used has one
    expect(output).toContain("unused");
    expect(output).toContain("caller");
    expect(output).not.toContain("used  function  src/a.ts"); // used has references
    // Non-exported symbols should not appear
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("deadCode sweep mode excludes non-exported symbols", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-sweep-noexport-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "function internal() {}\nexport function exported() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    store.setFileHash("src/a.ts", hashA);

    store.addNode({ id: "src/a.ts::internal:1", kind: "function", name: "internal", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: false });
    store.addNode({ id: "src/a.ts::exported:2", kind: "function", name: "exported", file: "src/a.ts", start_line: 2, end_line: 2, content_hash: hashA, is_exported: true });

    const output = deadCode({ store, projectRoot });

    // Only exported should appear
    expect(output).toContain("exported");
    expect(output).not.toContain("internal");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("deadCode sweep mode sorts by file then name", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-sweep-sort-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "export function zeta() {}\nexport function alpha() {}\n";
  const fileB = "export function beta() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  writeFileSync(join(projectRoot, "src/b.ts"), fileB);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    const hashB = sha256Hex(fileB);
    store.setFileHash("src/a.ts", hashA);
    store.setFileHash("src/b.ts", hashB);

    store.addNode({ id: "src/a.ts::zeta:1", kind: "function", name: "zeta", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/a.ts::alpha:2", kind: "function", name: "alpha", file: "src/a.ts", start_line: 2, end_line: 2, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/b.ts::beta:1", kind: "function", name: "beta", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB, is_exported: true });

    const output = deadCode({ store, projectRoot });

    // src/a.ts comes before src/b.ts; within a.ts, alpha before zeta
    const alphaIdx = output.indexOf("alpha");
    const zetaIdx = output.indexOf("zeta");
    const betaIdx = output.indexOf("beta");
    expect(alphaIdx).toBeLessThan(zetaIdx);
    expect(zetaIdx).toBeLessThan(betaIdx);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-dead-code-sweep.test.ts`
Expected: FAIL — `expect(received).toContain(expected) — Expected string "...sweep mode not yet implemented..." to contain "unused"`

**Step 3 — Write minimal implementation**

Replace the sweep mode placeholder in `src/tools/dead-code.ts`:

```typescript
// In deadCode function, replace the sweep mode fallback:
export function deadCode(params: DeadCodeParams): string {
  const { name, file, kind, glob, store, projectRoot } = params;
  const stats = store.getStatistics(projectRoot);

  if (name) {
    return singleSymbolMode({ name, file, store, projectRoot, stats });
  }

  return sweepMode({ kind, glob, store, projectRoot, stats });
}

function sweepMode(params: {
  kind?: string;
  glob?: string;
  store: GraphStore;
  projectRoot: string;
  stats: ReturnType<GraphStore["getStatistics"]>;
}): string {
  const { kind, glob, store, projectRoot, stats } = params;

  // Find all exported nodes with zero inbound edges
  let sql = `
    SELECT n.id, n.name, n.kind, n.file
    FROM nodes n
    WHERE n.is_exported = 1
      AND NOT n.file LIKE '__meta__%'
      AND NOT n.file LIKE '__unresolved__%'
      AND NOT EXISTS (
        SELECT 1 FROM edges e
        WHERE e.target = n.id
          AND e.source NOT LIKE '__meta__%'
          AND e.source NOT LIKE '__unresolved__%'
      )
  `;

  const sqlParams: unknown[] = [];

  if (kind) {
    sql += " AND n.kind = ?";
    sqlParams.push(kind);
  }

  if (glob) {
    // Convert simple glob to SQL LIKE: src/tools/* -> src/tools/%
    const likePattern = glob.replace(/\*/g, "%");
    sql += " AND n.file LIKE ?";
    sqlParams.push(likePattern);
  }

  sql += " ORDER BY n.file ASC, n.name ASC";

  const rows = store.queryRows<{ id: string; name: string; kind: string; file: string }>(sql, sqlParams);

  if (rows.length === 0) {
    return prependTrustHeader("No unreferenced exported symbols found.\n", { stats });
  }

  const lines: string[] = [];
  lines.push(`## Unreferenced Exported Symbols (${rows.length})`);
  lines.push("");
  for (const row of rows) {
    lines.push(`${row.name}  ${row.kind}  ${row.file}`);
  }

  return prependTrustHeader(lines.join("\n") + "\n", { stats });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-dead-code-sweep.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 9: dead_code: sweep mode filtering by kind and glob [depends: 8]

### Task 9: dead_code: sweep mode filtering by kind and glob [depends: 8]

**Files:**
- Create: `test/tool-dead-code-sweep-filters.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-dead-code-sweep-filters.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { deadCode } from "../src/tools/dead-code.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("deadCode sweep mode filters by kind", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-filter-kind-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "export function foo() {}\n";
  const fileB = "export class Bar {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  writeFileSync(join(projectRoot, "src/b.ts"), fileB);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    const hashB = sha256Hex(fileB);
    store.setFileHash("src/a.ts", hashA);
    store.setFileHash("src/b.ts", hashB);

    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/b.ts::Bar:1", kind: "class", name: "Bar", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB, is_exported: true });

    // Filter by kind=function — only foo should appear
    const output = deadCode({ kind: "function", store, projectRoot });
    expect(output).toContain("foo");
    expect(output).not.toContain("Bar");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("deadCode sweep mode filters by glob", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-filter-glob-${Date.now()}`);
  mkdirSync(join(projectRoot, "src/tools"), { recursive: true });
  mkdirSync(join(projectRoot, "src/graph"), { recursive: true });

  const fileA = "export function toolFn() {}\n";
  const fileB = "export function graphFn() {}\n";
  writeFileSync(join(projectRoot, "src/tools/a.ts"), fileA);
  writeFileSync(join(projectRoot, "src/graph/b.ts"), fileB);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    const hashB = sha256Hex(fileB);
    store.setFileHash("src/tools/a.ts", hashA);
    store.setFileHash("src/graph/b.ts", hashB);

    store.addNode({ id: "src/tools/a.ts::toolFn:1", kind: "function", name: "toolFn", file: "src/tools/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/graph/b.ts::graphFn:1", kind: "function", name: "graphFn", file: "src/graph/b.ts", start_line: 1, end_line: 1, content_hash: hashB, is_exported: true });

    // Filter by glob=src/tools/* — only toolFn should appear
    const output = deadCode({ glob: "src/tools/*", store, projectRoot });
    expect(output).toContain("toolFn");
    expect(output).not.toContain("graphFn");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("deadCode sweep mode returns empty message when no matches", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-filter-empty-${Date.now()}`);
  mkdirSync(projectRoot, { recursive: true });

  const store = new SqliteGraphStore();
  try {
    const output = deadCode({ store, projectRoot });
    expect(output).toContain("No unreferenced exported symbols found");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-dead-code-sweep-filters.test.ts`
Expected: PASS — the filtering logic was already implemented in Task 8.

**Step 3 — No additional implementation needed**

The kind and glob filtering was already built into the sweep mode SQL in Task 8. This task validates those code paths.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-dead-code-sweep-filters.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 10: dead_code: register tool in pi extension [depends: 8]

### Task 10: dead_code: register tool in pi extension [depends: 8]

**Files:**
- Modify: `src/index.ts`
- Create: `test/tool-dead-code-wiring.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-dead-code-wiring.test.ts
import { expect, test } from "bun:test";

test("pi extension registers dead_code tool with correct schema", async () => {
  const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
  const mockPi = {
    registerTool(tool: { name: string; parameters: unknown; execute: Function }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const tool = registeredTools.find((t) => t.name === "dead_code");
  expect(tool).toBeDefined();

  const schema = tool!.parameters as any;
  // All params are optional
  expect(schema.required ?? []).toEqual([]);
  // Has name, file, kind, glob params
  expect(schema.properties.name).toBeDefined();
  expect(schema.properties.file).toBeDefined();
  expect(schema.properties.kind).toBeDefined();
  expect(schema.properties.glob).toBeDefined();

  // Should have ptc with read-only policy
  expect((tool as any).ptc?.readOnly).toBe(true);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-dead-code-wiring.test.ts`
Expected: FAIL — `expect(received).toBeDefined() — Expected undefined to be defined`

**Step 3 — Write minimal implementation**

Add to `src/index.ts`:

1. Add import at top:
```typescript
import { deadCode } from "./tools/dead-code.js";
```

2. Add params schema after existing schemas:
```typescript
const DeadCodeParams = Type.Object({
  name: Type.Optional(Type.String({ description: "Symbol name to check (omit for sweep mode)" })),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
  kind: Type.Optional(Type.String({ description: "Filter by node kind (function, class, interface, etc.)" })),
  glob: Type.Optional(Type.String({ description: "Filter by file glob pattern (e.g. src/tools/*)" })),
});
```

3. Register the tool inside `piCodegraph()`:
```typescript
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
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-dead-code-wiring.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 11: token-tracker: estimateNaiveCost and session accumulation

### Task 11: token-tracker: estimateNaiveCost and session accumulation

**Files:**
- Create: `src/tools/token-tracker.ts`
- Create: `test/token-tracker.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/token-tracker.test.ts
import { expect, test, beforeEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  estimateNaiveCost,
  trackCall,
  getSessionStats,
  resetSession,
  formatMetaLine,
} from "../src/tools/token-tracker.js";

beforeEach(() => {
  resetSession();
});

test("estimateNaiveCost sums file sizes and divides by 4", () => {
  const projectRoot = join(tmpdir(), `pi-cg-token-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  // 40 chars -> 10 tokens
  writeFileSync(join(projectRoot, "src/a.ts"), "a".repeat(40));
  // 80 chars -> 20 tokens
  writeFileSync(join(projectRoot, "src/b.ts"), "b".repeat(80));

  try {
    const cost = estimateNaiveCost(["src/a.ts", "src/b.ts"], projectRoot);
    expect(cost).toBe(30); // (40 + 80) / 4
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("estimateNaiveCost ignores missing files", () => {
  const projectRoot = join(tmpdir(), `pi-cg-token-missing-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/a.ts"), "a".repeat(40));

  try {
    const cost = estimateNaiveCost(["src/a.ts", "src/nonexistent.ts"], projectRoot);
    expect(cost).toBe(10); // only a.ts counts
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("trackCall accumulates session stats", () => {
  trackCall("symbol_graph", 100, 20);
  trackCall("trace", 200, 30);

  const stats = getSessionStats();
  expect(stats.totalCalls).toBe(2);
  expect(stats.totalTokensSaved).toBe(250); // (100-20) + (200-30)
});

test("resetSession clears accumulated stats", () => {
  trackCall("symbol_graph", 100, 20);
  resetSession();

  const stats = getSessionStats();
  expect(stats.totalCalls).toBe(0);
  expect(stats.totalTokensSaved).toBe(0);
});

test("formatMetaLine includes per-call and session stats", () => {
  trackCall("symbol_graph", 100, 20);
  const line = formatMetaLine("trace", 200, 30);
  // After formatMetaLine, trackCall for "trace" should have been called internally
  expect(line).toContain("tokens_saved:170");
  expect(line).toContain("naive_tokens:200");
  expect(line).toContain("actual_tokens:30");
  expect(line).toContain("session_calls:2");
  expect(line).toContain("session_tokens_saved:250");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/token-tracker.test.ts`
Expected: FAIL — `error: Cannot find module "../src/tools/token-tracker.js"`

**Step 3 — Write minimal implementation**

```typescript
// src/tools/token-tracker.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

interface SessionStats {
  totalCalls: number;
  totalTokensSaved: number;
}

let session: SessionStats = { totalCalls: 0, totalTokensSaved: 0 };

export function estimateNaiveCost(files: string[], projectRoot: string): number {
  let totalBytes = 0;
  for (const file of files) {
    try {
      const content = readFileSync(join(projectRoot, file), "utf8");
      totalBytes += content.length;
    } catch {
      // File missing or unreadable — skip
    }
  }
  return Math.floor(totalBytes / 4);
}

export function trackCall(toolName: string, naiveTokens: number, actualTokens: number): void {
  session.totalCalls += 1;
  session.totalTokensSaved += Math.max(0, naiveTokens - actualTokens);
}

export function getSessionStats(): SessionStats {
  return { ...session };
}

export function resetSession(): void {
  session = { totalCalls: 0, totalTokensSaved: 0 };
}

export function formatMetaLine(toolName: string, naiveTokens: number, actualTokens: number): string {
  trackCall(toolName, naiveTokens, actualTokens);
  const saved = Math.max(0, naiveTokens - actualTokens);
  return `_meta: tokens_saved:${saved} naive_tokens:${naiveTokens} actual_tokens:${actualTokens} session_calls:${session.totalCalls} session_tokens_saved:${session.totalTokensSaved}`;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/token-tracker.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 12: token-tracker: collectNaiveFiles helpers for each tool [depends: 11]

### Task 12: token-tracker: collectNaiveFiles helpers for each tool [depends: 11]

**Files:**
- Modify: `src/tools/token-tracker.ts`
- Create: `test/token-tracker-naive-files.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/token-tracker-naive-files.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { collectNaiveFiles } from "../src/tools/token-tracker.js";

test("collectNaiveFiles for symbol_graph returns target + neighbor files", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h1", is_exported: true });
    store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h2", is_exported: true });
    store.addEdge({ source: "src/a.ts::foo:1", target: "src/b.ts::bar:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: "h1" }, created_at: Date.now() });

    const files = collectNaiveFiles("symbol_graph", { name: "foo" }, store);
    expect(files.sort()).toEqual(["src/a.ts", "src/b.ts"]);
  } finally {
    store.close();
  }
});

test("collectNaiveFiles for impact returns downstream files", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h1", is_exported: true });
    store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h2", is_exported: true });
    store.addEdge({ source: "src/b.ts::bar:1", target: "src/a.ts::foo:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: "h2" }, created_at: Date.now() });

    // bar calls foo, so changing foo impacts bar
    const files = collectNaiveFiles("impact", { symbols: ["foo"] }, store);
    expect(files).toContain("src/a.ts");
    expect(files).toContain("src/b.ts");
  } finally {
    store.close();
  }
});

test("collectNaiveFiles for graph_overview returns all indexed files", () => {
  const store = new SqliteGraphStore();
  try {
    store.setFileHash("src/a.ts", "h1");
    store.setFileHash("src/b.ts", "h2");

    const files = collectNaiveFiles("graph_overview", {}, store);
    expect(files.sort()).toEqual(["src/a.ts", "src/b.ts"]);
  } finally {
    store.close();
  }
});

test("collectNaiveFiles for trace returns traced path files", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/a.ts::entry:1", kind: "function", name: "entry", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h1", is_exported: true });
    store.addNode({ id: "src/b.ts::callee:1", kind: "function", name: "callee", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h2", is_exported: true });
    store.addEdge({ source: "src/a.ts::entry:1", target: "src/b.ts::callee:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: "h1" }, created_at: Date.now() });

    const files = collectNaiveFiles("trace", { entry: "entry" }, store);
    expect(files).toContain("src/a.ts");
    expect(files).toContain("src/b.ts");
  } finally {
    store.close();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/token-tracker-naive-files.test.ts`
Expected: FAIL — `error: "collectNaiveFiles" is not exported from "../src/tools/token-tracker.js"`

**Step 3 — Write minimal implementation**

Add to `src/tools/token-tracker.ts`:

```typescript
import type { GraphStore } from "../graph/store.js";

// ... existing code ...

export function collectNaiveFiles(
  toolName: string,
  params: Record<string, unknown>,
  store: GraphStore,
): string[] {
  const files = new Set<string>();

  switch (toolName) {
    case "symbol_graph":
    case "symbol_card":
    case "symbol_contract": {
      const name = params.name as string | undefined;
      const file = params.file as string | undefined;
      if (!name) break;
      const nodes = store.findNodes(name, file);
      for (const node of nodes) {
        if (!node.file.startsWith("__")) files.add(node.file);
        const neighbors = store.getNeighbors(node.id);
        for (const nr of neighbors) {
          if (!nr.node.file.startsWith("__")) files.add(nr.node.file);
        }
      }
      break;
    }

    case "impact": {
      const symbols = params.symbols as string[] | undefined;
      if (!symbols) break;
      for (const sym of symbols) {
        const nodes = store.findNodes(sym);
        for (const node of nodes) {
          if (!node.file.startsWith("__")) files.add(node.file);
          // Collect downstream callers (1 hop for estimation)
          const neighbors = store.getNeighbors(node.id, { direction: "in" });
          for (const nr of neighbors) {
            if (!nr.node.file.startsWith("__")) files.add(nr.node.file);
          }
        }
      }
      break;
    }

    case "trace": {
      const entry = params.entry as string | undefined;
      const file = params.file as string | undefined;
      if (!entry) break;
      const nodes = store.findNodes(entry, file);
      if (nodes.length === 1) {
        const node = nodes[0]!;
        if (!node.file.startsWith("__")) files.add(node.file);
        // Walk call graph outward for estimation
        const seen = new Set<string>([node.id]);
        const stack = [node.id];
        while (stack.length > 0) {
          const id = stack.pop()!;
          const callees = store.getNeighbors(id, { direction: "out", kind: "calls" });
          for (const nr of callees) {
            if (!seen.has(nr.node.id)) {
              seen.add(nr.node.id);
              if (!nr.node.file.startsWith("__")) files.add(nr.node.file);
              stack.push(nr.node.id);
            }
          }
        }
      }
      break;
    }

    case "graph_query": {
      // For graph_query, estimate = all indexed files (we can't predict what the query matches)
      const allFiles = store.listFiles();
      for (const f of allFiles) {
        if (!f.startsWith("__")) files.add(f);
      }
      break;
    }

    case "graph_overview":
    case "dead_code": {
      const allFiles = store.listFiles();
      for (const f of allFiles) {
        if (!f.startsWith("__")) files.add(f);
      }
      break;
    }
  }

  return Array.from(files);
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/token-tracker-naive-files.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 13: token-tracker: integrate _meta line into symbol_graph tool [depends: 12, 5]

### Task 13: token-tracker: integrate _meta line into symbol_graph tool [depends: 12, 5]

**Files:**
- Modify: `src/index.ts`
- Create: `test/token-tracker-symbol-graph-integration.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/token-tracker-symbol-graph-integration.test.ts
import { expect, test, beforeEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { resetSession } from "../src/tools/token-tracker.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";
import { appendTokenMeta } from "../src/tools/token-tracker.js";

beforeEach(() => {
  resetSession();
});

test("appendTokenMeta appends _meta line with token stats to tool output", () => {
  const projectRoot = join(tmpdir(), `pi-cg-meta-sg-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "export function foo() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    store.setFileHash("src/a.ts", hashA);
    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });

    const text = symbolGraph({ name: "foo", store, projectRoot });
    const output = appendTokenMeta("symbol_graph", { name: "foo" }, text, store, projectRoot);

    expect(output).toContain("_meta:");
    expect(output).toContain("tokens_saved:");
    expect(output).toContain("naive_tokens:");
    expect(output).toContain("actual_tokens:");
    expect(output).toContain("session_calls:1");
    expect(output).toContain("session_tokens_saved:");
    // The _meta line should be at the end
    const lines = output.trim().split("\n");
    expect(lines[lines.length - 1]).toMatch(/^_meta:/);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/token-tracker-symbol-graph-integration.test.ts`
Expected: FAIL — `error: "appendTokenMeta" is not exported from "../src/tools/token-tracker.js"`

**Step 3 — Write minimal implementation**

Add `appendTokenMeta` to `src/tools/token-tracker.ts`:

```typescript
export function appendTokenMeta(
  toolName: string,
  params: Record<string, unknown>,
  toolOutput: string,
  store: GraphStore,
  projectRoot: string,
): string {
  const naiveFiles = collectNaiveFiles(toolName, params, store);
  const naiveTokens = estimateNaiveCost(naiveFiles, projectRoot);
  const actualTokens = Math.floor(toolOutput.length / 4);
  const metaLine = formatMetaLine(toolName, naiveTokens, actualTokens);
  return `${toolOutput}\n${metaLine}`;
}
```

Then update `src/index.ts` — modify the `symbol_graph` execute handler to use `appendTokenMeta`:

Add import:
```typescript
import { appendTokenMeta, resetSession } from "./tools/token-tracker.js";
```

Update `resetStoreForTesting`:
```typescript
export function resetStoreForTesting(): void {
  if (sharedStore) sharedStore.close();
  sharedStore = null;
  lastIndexError = null;
  resetSession();
}
```

Update `symbol_graph` execute wrapper:
```typescript
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
        } finally {
          await client.shutdown().catch(() => {});
        }
      }

      let output = symbolGraph({ name: params.name, file: params.file, store, projectRoot });
      output = indexingFailedNote() + output;
      output = appendTokenMeta("symbol_graph", { name: params.name, file: params.file }, output, store, projectRoot);
      return { content: [{ type: "text", text: output }], details: undefined };
    },
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/token-tracker-symbol-graph-integration.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 14: token-tracker: integrate _meta into remaining 7 read-only tools [depends: 13, 10]

### Task 14: token-tracker: integrate _meta into remaining 7 read-only tools [depends: 13, 10]

**Files:**
- Modify: `src/index.ts`
- Create: `test/token-tracker-all-tools.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/token-tracker-all-tools.test.ts
import { expect, test, beforeEach } from "bun:test";
import { resetSession } from "../src/tools/token-tracker.js";

beforeEach(() => {
  resetSession();
});

test("pi extension appends _meta line to all read-only tools except resolve_edge and delete_edge", async () => {
  const registeredTools: Array<{ name: string; parameters: unknown; execute: Function; ptc?: any }> = [];
  const mockPi = {
    registerTool(tool: any) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph, resetStoreForTesting } = await import("../src/index.js");
  resetStoreForTesting();
  piCodegraph(mockPi as any);

  // These tools should have _meta tracking
  const trackedTools = [
    "symbol_graph", "symbol_card", "symbol_contract",
    "trace", "impact", "graph_query",
    "graph_overview", "dead_code",
  ];

  // These tools should NOT have _meta tracking
  const untrackedTools = ["resolve_edge", "delete_edge"];

  for (const name of trackedTools) {
    const tool = registeredTools.find((t) => t.name === name);
    expect(tool).toBeDefined();
  }

  for (const name of untrackedTools) {
    const tool = registeredTools.find((t) => t.name === name);
    expect(tool).toBeDefined();
  }

  // Verify all expected tools are registered
  expect(registeredTools.length).toBeGreaterThanOrEqual(trackedTools.length + untrackedTools.length);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/token-tracker-all-tools.test.ts`
Expected: FAIL — if any tool isn't registered. Actually, this test validates the wiring exists. The real test is that _meta appears in output. Let me adjust:

Actually, the real value here is applying `appendTokenMeta` to the remaining tools. The test above confirms all tools are registered. A more targeted test:

```typescript
// test/token-tracker-all-tools.test.ts
import { expect, test, beforeEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { resetSession, appendTokenMeta } from "../src/tools/token-tracker.js";
import { impact } from "../src/tools/impact.js";
import { trace } from "../src/tools/trace.js";
import { graphQuery } from "../src/tools/graph-query.js";
import { graphOverview } from "../src/tools/graph-overview.js";
import { deadCode } from "../src/tools/dead-code.js";
import { symbolCard } from "../src/tools/symbol-card.js";
import { symbolContract } from "../src/tools/symbol-contract.js";

beforeEach(() => {
  resetSession();
});

function makeTestEnv() {
  const projectRoot = join(tmpdir(), `pi-cg-meta-all-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const fileA = "export function foo() { return 1; }\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  const store = new SqliteGraphStore();
  const hashA = sha256Hex(fileA);
  store.setFileHash("src/a.ts", hashA);
  store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
  return { projectRoot, store, hashA, cleanup: () => { store.close(); rmSync(projectRoot, { recursive: true, force: true }); } };
}

test("appendTokenMeta works with impact tool output", () => {
  const { projectRoot, store, cleanup } = makeTestEnv();
  try {
    const text = impact({ symbols: ["foo"], changeType: "behavior_change", store, projectRoot });
    const output = appendTokenMeta("impact", { symbols: ["foo"] }, text, store, projectRoot);
    expect(output).toContain("_meta:");
    expect(output).toContain("session_calls:1");
  } finally { cleanup(); }
});

test("appendTokenMeta works with trace tool output", () => {
  const { projectRoot, store, cleanup } = makeTestEnv();
  try {
    const text = trace({ entry: "foo", store, projectRoot });
    const output = appendTokenMeta("trace", { entry: "foo" }, text, store, projectRoot);
    expect(output).toContain("_meta:");
  } finally { cleanup(); }
});

test("appendTokenMeta works with graph_query tool output", () => {
  const { projectRoot, store, cleanup } = makeTestEnv();
  try {
    const text = graphQuery({ query: 'MATCH (n) RETURN n LIMIT 1', store, projectRoot });
    const output = appendTokenMeta("graph_query", {}, text, store, projectRoot);
    expect(output).toContain("_meta:");
  } finally { cleanup(); }
});

test("appendTokenMeta works with graph_overview tool output", () => {
  const { projectRoot, store, cleanup } = makeTestEnv();
  try {
    const text = graphOverview({ store, projectRoot });
    const output = appendTokenMeta("graph_overview", {}, text, store, projectRoot);
    expect(output).toContain("_meta:");
  } finally { cleanup(); }
});

test("appendTokenMeta works with dead_code tool output", () => {
  const { projectRoot, store, cleanup } = makeTestEnv();
  try {
    const text = deadCode({ store, projectRoot });
    const output = appendTokenMeta("dead_code", {}, text, store, projectRoot);
    expect(output).toContain("_meta:");
  } finally { cleanup(); }
});

test("appendTokenMeta works with symbol_card tool output", () => {
  const { projectRoot, store, cleanup } = makeTestEnv();
  try {
    const text = symbolCard({ name: "foo", store, projectRoot });
    const output = appendTokenMeta("symbol_card", { name: "foo" }, text, store, projectRoot);
    expect(output).toContain("_meta:");
  } finally { cleanup(); }
});

test("appendTokenMeta works with symbol_contract tool output", () => {
  const { projectRoot, store, cleanup } = makeTestEnv();
  try {
    const text = symbolContract({ name: "foo", store, projectRoot });
    const output = appendTokenMeta("symbol_contract", { name: "foo" }, text, store, projectRoot);
    expect(output).toContain("_meta:");
  } finally { cleanup(); }
});

test("session accumulates across multiple tool calls", () => {
  const { projectRoot, store, cleanup } = makeTestEnv();
  try {
    const text1 = graphOverview({ store, projectRoot });
    const out1 = appendTokenMeta("graph_overview", {}, text1, store, projectRoot);
    expect(out1).toContain("session_calls:1");

    const text2 = deadCode({ store, projectRoot });
    const out2 = appendTokenMeta("dead_code", {}, text2, store, projectRoot);
    expect(out2).toContain("session_calls:2");
  } finally { cleanup(); }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/token-tracker-all-tools.test.ts`
Expected: PASS — `appendTokenMeta` already works. The failing part would be if `index.ts` wiring is missing, but that's tested by the integration test. This task's test validates that all tool outputs compose correctly with `appendTokenMeta`.

Actually, since `appendTokenMeta` is already implemented in Task 13, these tests should pass. The real work here is wiring the remaining tools in `index.ts`.

**Step 3 — Write minimal implementation**

Update each remaining read-only tool's execute handler in `src/index.ts` to append token meta. For each tool, add `output = appendTokenMeta(...)` before the return:

For `symbol_card`:
```typescript
      let output = symbolCard({ name: params.name, file: params.file, store, projectRoot });
      output = indexingFailedNote() + output;
      output = appendTokenMeta("symbol_card", { name: params.name, file: params.file }, output, store, projectRoot);
```

For `symbol_contract`:
```typescript
      let output = symbolContract({ name: params.name, file: params.file, store, projectRoot });
      output = indexingFailedNote() + output;
      output = appendTokenMeta("symbol_contract", { name: params.name, file: params.file }, output, store, projectRoot);
```

For `impact`:
```typescript
      const text = impact({ symbols: params.symbols, changeType: params.changeType, store, projectRoot, maxDepth: params.maxDepth });
      let output = indexingFailedNote() + text;
      output = appendTokenMeta("impact", { symbols: params.symbols }, output, store, projectRoot);
      return { content: [{ type: "text", text: output }], details: undefined };
```

For `trace`:
```typescript
      const text = trace({ entry: params.entry, file: params.file, store, projectRoot });
      let output = indexingFailedNote() + text;
      output = appendTokenMeta("trace", { entry: params.entry, file: params.file }, output, store, projectRoot);
      return { content: [{ type: "text", text: output }], details: undefined };
```

For `graph_query`:
```typescript
      const text = graphQuery({ query: params.query, store, projectRoot });
      let output = indexingFailedNote() + text;
      output = appendTokenMeta("graph_query", {}, output, store, projectRoot);
      return { content: [{ type: "text", text: output }], details: undefined };
```

For `graph_overview`:
```typescript
      let output = graphOverview({ store, projectRoot });
      output = indexingFailedNote() + output;
      output = appendTokenMeta("graph_overview", {}, output, store, projectRoot);
```

For `dead_code`:
```typescript
      let output = deadCode({ name: params.name, file: params.file, kind: params.kind, glob: params.glob, store, projectRoot });
      output = indexingFailedNote() + output;
      output = appendTokenMeta("dead_code", { name: params.name }, output, store, projectRoot);
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/token-tracker-all-tools.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 15: token-tracker: session reset on resetStoreForTesting [depends: 13]

### Task 15: token-tracker: session reset on resetStoreForTesting [depends: 13]

**Files:**
- Create: `test/token-tracker-session-reset.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/token-tracker-session-reset.test.ts
import { expect, test } from "bun:test";
import { trackCall, getSessionStats } from "../src/tools/token-tracker.js";
import { resetStoreForTesting } from "../src/index.js";

test("resetStoreForTesting also resets token tracker session", () => {
  // Accumulate some stats
  trackCall("symbol_graph", 100, 20);
  trackCall("trace", 200, 30);

  const before = getSessionStats();
  expect(before.totalCalls).toBe(2);

  // Reset via the existing test hook
  resetStoreForTesting();

  const after = getSessionStats();
  expect(after.totalCalls).toBe(0);
  expect(after.totalTokensSaved).toBe(0);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/token-tracker-session-reset.test.ts`
Expected: PASS — the `resetSession()` call was already added to `resetStoreForTesting` in Task 13. This test confirms that wiring.

**Step 3 — No additional implementation needed**

The `resetSession()` call in `resetStoreForTesting()` was already added in Task 13.

**Step 4 — Run test, verify it passes**
Run: `bun test test/token-tracker-session-reset.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
