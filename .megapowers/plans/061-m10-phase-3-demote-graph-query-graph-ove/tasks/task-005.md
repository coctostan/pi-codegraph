---
id: 5
title: Append shared contract output from symbol_graph include
status: approved
depends_on:
  - 4
no_test: false
files_to_modify:
  - src/tools/symbol-contract.ts
  - src/tools/symbol-graph.ts
files_to_create:
  - test/tool-symbol-graph-contract-include.test.ts
---

### Task 5: Append shared contract output from symbol_graph include [depends: 4]

**Files:**
- Modify: `src/tools/symbol-contract.ts`
- Modify: `src/tools/symbol-graph.ts`
- Create: `test/tool-symbol-graph-contract-include.test.ts`

**Step 1 — Write the failing test**
Create `test/tool-symbol-graph-contract-include.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { suppressFreshTrustHeader } from "../src/output/read-only-ceremony.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";
import * as symbolContractTool from "../src/tools/symbol-contract.js";

function setupContractFixture(): { projectRoot: string; store: SqliteGraphStore; cleanup: () => void } {
  const projectRoot = join(tmpdir(), `pi-cg-sg-contract-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(join(projectRoot, "test"), { recursive: true });

  const srcContent = [
    "export function validate(input: string): boolean {",
    "  if (!input) return false;",
    "  if (input.length === 0) throw new Error(\"empty input\");",
    "  return true;",
    "}",
    "",
  ].join("\n");
  const testContent = [
    "test(\"returns true for valid input\", () => {",
    "  expect(validate(\"good\")).toBe(true);",
    "});",
    "",
  ].join("\n");
  writeFileSync(join(projectRoot, "src/validate.ts"), srcContent);
  writeFileSync(join(projectRoot, "test/validate.test.ts"), testContent);
  const store = new SqliteGraphStore();
  const srcHash = sha256Hex(srcContent);
  const testHash = sha256Hex(testContent);
  store.addNode({
    id: "src/validate.ts::validate:1",
    kind: "function",
    name: "validate",
    file: "src/validate.ts",
    start_line: 1,
    end_line: 4,
    content_hash: srcHash,
    is_exported: true,
    signature: "(input: string) => boolean",
  });
  store.addNode({
    id: "test/validate.test.ts::returns true for valid input:1",
    kind: "test",
    name: "returns true for valid input",
    file: "test/validate.test.ts",
    start_line: 1,
    end_line: 3,
    content_hash: testHash,
  });
  store.addEdge({
    source: "src/validate.ts::validate:1",
    target: "test/validate.test.ts::returns true for valid input:1",
    kind: "tested_by",
    provenance: { source: "coverage", confidence: 0.9, evidence: "covered", content_hash: srcHash },
    created_at: Date.now(),
  });
  return {
    projectRoot,
    store,
    cleanup: () => {
      store.close();
      rmSync(projectRoot, { recursive: true, force: true });
    },
  };
}

test("symbolGraph appends the standalone symbol_contract body when include contains contract", () => {
  const renderSymbolContractBody = (symbolContractTool as any).renderSymbolContractBody as
    | ((params: { name: string; file?: string; store: SqliteGraphStore; projectRoot: string }) => { body: string; hasLocalExceptions: boolean })
    | undefined;
  if (typeof renderSymbolContractBody !== "function") {
    throw new Error("renderSymbolContractBody is not exported from symbol-contract");
  }

  const { projectRoot, store, cleanup } = setupContractFixture();
  try {
    const base = symbolGraph({ name: "validate", store, projectRoot });
    const rendered = renderSymbolContractBody({ name: "validate", store, projectRoot });
    const standaloneBody = suppressFreshTrustHeader(
      symbolContractTool.symbolContract({ name: "validate", store, projectRoot }),
    );
    const withContract = symbolGraph({ name: "validate", include: ["contract"] as any, store, projectRoot });
    expect(standaloneBody).toBe(rendered.body);
    expect(withContract.startsWith(base)).toBe(true);
    expect(withContract.slice(base.length)).toBe(`\n${standaloneBody}`);
    expect((withContract.match(/## Trust/g) ?? []).length).toBe(1);
  } finally {
    cleanup();
  }
});

test("symbolGraph appends the standalone symbol_contract empty state when include contains contract for an unknown symbol", () => {
  const { projectRoot, store, cleanup } = setupContractFixture();
  try {
    const base = symbolGraph({ name: "doesNotExist", store, projectRoot });
    const standaloneBody = suppressFreshTrustHeader(
      symbolContractTool.symbolContract({ name: "doesNotExist", store, projectRoot }),
    );
    const withContract = symbolGraph({ name: "doesNotExist", include: ["contract"] as any, store, projectRoot });

    expect(withContract.startsWith(base)).toBe(true);
    expect(withContract.slice(base.length)).toBe(`\n\n${standaloneBody}`);
    expect((withContract.match(/## Trust/g) ?? []).length).toBe(1);
  } finally {
    cleanup();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-graph-contract-include.test.ts`
Expected: FAIL — `Error: renderSymbolContractBody is not exported from symbol-contract`

**Step 3 — Write minimal implementation**
In `src/tools/symbol-contract.ts`, add a shared renderer and keep `symbolContract()` as the trust-header wrapper by replacing the current `symbolContract` implementation with:

```ts
export interface RenderedSymbolContract {
  body: string;
  hasLocalExceptions: boolean;
}
export function renderSymbolContractBody(params: SymbolContractParams): RenderedSymbolContract {
  const { name, file, store, projectRoot } = params;
  const nodes = store.findNodes(name, file);

  if (nodes.length === 0) {
    return { body: `Symbol "${name}" not found`, hasLocalExceptions: false };
  }
  if (nodes.length > 1) {
    const lines: string[] = [`Multiple matches for "${name}":\n`];
    for (const node of nodes) {
      const anchor = computeAnchor(node, projectRoot);
      const staleMarker = anchor.stale ? " [stale]" : "";
      lines.push(`  ${anchor.anchor}  ${node.name} (${node.kind})  ${node.file}${staleMarker}`);
    }
    const body = `${lines.join("\n")}\n`;
    const hasLocalExceptions = lines.some((line) => line.includes("[stale]"));
    return { body, hasLocalExceptions };
  }
  const node = nodes[0]!;
  const anchor = computeAnchor(node, projectRoot);
  const lines: string[] = [];
  lines.push(`## Contract: ${node.name}`);
  lines.push(anchor.anchor);
  if (node.signature) {
    const { params: sigParams, returnType } = parseSignatureParams(node.signature);
    if (sigParams.length > 0) {
      lines.push("");
      lines.push("### Takes");
      for (const p of sigParams) {
        lines.push(`  ${p}`);
      }
    }
    if (returnType) {
      lines.push("");
      lines.push("### Returns");
      lines.push(`  ${returnType}`);
    }
  }

  const fullPath = join(projectRoot, node.file);
  if (existsSync(fullPath) && node.start_line && node.end_line) {
    try {
      const fileContent = readFileSync(fullPath, "utf-8");
      const throws = extractThrows(fileContent, node.start_line, node.end_line);
      if (throws.length > 0) {
        lines.push("");
        lines.push("### Throws / Error paths");
        for (const t of throws) {
          lines.push(`  - ${t}`);
        }
      }

      const guards = extractGuards(fileContent, node.start_line, node.end_line);
      if (guards.length > 0) {
        lines.push("");
        lines.push("### Guards / Preconditions");
        for (const g of guards) {
          lines.push(`  - ${g}`);
        }
      }
    } catch {
      // File unreadable — skip throws/guards
    }
  }

  const allNeighbors = store.getNeighbors(node.id);
  const testEdges = allNeighbors.filter(
    (nr) => nr.edge.kind === "tested_by" && nr.edge.source === node.id,
  );

  if (testEdges.length > 0) {
    const allBehaviors: Array<{ testName: string; assertions: string[] }> = [];

    for (const te of testEdges) {
      const testNode = te.node;
      const testPath = join(projectRoot, testNode.file);
      if (!existsSync(testPath)) continue;

      try {
        const testContent = readFileSync(testPath, "utf-8");
        const behaviors = extractTestAssertions(testContent);
        for (const b of behaviors) {
          if (b.testName === testNode.name) {
            allBehaviors.push(b);
          }
        }
      } catch {
        // Test file unreadable — skip
      }
    }

    if (allBehaviors.length > 0) {
      lines.push("");
      lines.push(`### Test-evidenced behaviors (from ${testEdges.length} tests)`);
      for (const b of allBehaviors) {
        lines.push(`  ✓ ${b.testName}`);
        for (const a of b.assertions) {
          lines.push(`    ${a}`);
        }
      }
    }
  }
  return {
    body: lines.join("\n") + "\n",
    hasLocalExceptions: anchor.stale,
  };
}
export function symbolContract(params: SymbolContractParams): string {
  const stats = params.store.getStatistics(params.projectRoot);
  const rendered = renderSymbolContractBody(params);
  return prependTrustHeader(rendered.body, { stats, hasLocalExceptions: rendered.hasLocalExceptions });
}
```

In `src/tools/symbol-graph.ts`, import the shared renderer and replace `symbolGraph()` with:

```ts
import { renderSymbolContractBody } from "./symbol-contract.js";
export function symbolGraph(params: SymbolGraphParams): string {
  const { name, file, include, limit = 10, store, projectRoot } = params;
  const stats = store.getStatistics(projectRoot);
  const nodes = store.findNodes(name, file);

  let body: string;
  let hasLocalExceptions = false;

  if (nodes.length === 0) {
    body = `Symbol "${name}" not found`;
  } else if (nodes.length > 1) {
    const lines: string[] = [`Multiple matches for "${name}":\n`];
    for (const node of nodes) {
      const anchor = computeAnchor(node, projectRoot);
      const staleMarker = anchor.stale ? " [stale]" : "";
      lines.push(`  ${anchor.anchor}  ${node.name} (${node.kind})  ${node.file}${staleMarker}`);
    }
    body = `${lines.join("\n")}\n`;
    hasLocalExceptions = lines.some((line) => line.includes("[stale]"));
  } else {
    const node = nodes[0]!;
    const symbolAnchor = computeAnchor(node, projectRoot);
    const signalComputer = createSignalComputer(store);
    const allNeighbors = store.getNeighbors(node.id);
    const computeSignals = (nodeId: string) => signalComputer.compute(nodeId);

    const buckets = new Map<string, NeighborResult[]>();
    const unresolvedResults: NeighborResult[] = [];

    for (const nr of allNeighbors) {
      if (nr.node.file.startsWith("__meta__")) {
        continue;
      }
      if (nr.node.file.startsWith("__unresolved__")) {
        unresolvedResults.push(nr);
        continue;
      }

      const direction = nr.edge.target === node.id ? "in" : "out";
      const title = sectionTitle(nr.edge.kind, direction);
      let bucket = buckets.get(title);
      if (!bucket) {
        bucket = [];
        buckets.set(title, bucket);
      }
      bucket.push(nr);
    }

    const sectionOrder = [
      "Callers", "Callees", "Imports", "Imported By",
      "Implemented By", "Implements",
      "Extended By", "Extends",
      "Tested By", "Tests",
      "Co-changes With",
      "Rendered By", "Renders",
      "Routed From", "Routes To",
    ];

    const namedSections: NamedSection[] = [];

    for (const title of sectionOrder) {
      const bucket = buckets.get(title);
      if (bucket && bucket.length > 0) {
        namedSections.push({
          title,
          section: buildSection(bucket, limit, projectRoot, store, computeSignals),
        });
        buckets.delete(title);
      }
    }

    for (const [title, bucket] of buckets) {
      if (bucket.length > 0) {
        namedSections.push({
          title,
          section: buildSection(bucket, limit, projectRoot, store, computeSignals),
        });
      }
    }

    if (unresolvedResults.length > 0) {
      namedSections.push({
        title: "Unresolved",
        section: buildSection(unresolvedResults, limit, projectRoot, store),
      });
    }

    body = formatNeighborhood(
      { name: node.name, kind: node.kind, anchor: symbolAnchor, signals: signalComputer.compute(node.id) },
      namedSections,
    );

    hasLocalExceptions =
      symbolAnchor.stale || namedSections.some((ns) => hasStaleItems(ns.section));
  }
if (include?.includes("contract")) {
    const rendered = renderSymbolContractBody({ name, file, store, projectRoot });
    body = `${body}${body.endsWith("\n") ? "\n" : "\n\n"}${rendered.body}`;
    hasLocalExceptions = hasLocalExceptions || rendered.hasLocalExceptions;
  }

  return prependTrustHeader(body, { stats, hasLocalExceptions });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-graph-contract-include.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
