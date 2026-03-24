---
id: 4
title: symbolContract tool — happy path with signature, throws, guards, and tests
status: approved
depends_on:
  - 1
  - 2
  - 3
no_test: false
files_to_modify: []
files_to_create:
  - src/tools/symbol-contract.ts
  - test/tool-symbol-contract-happy.test.ts
---

**Files:**
- Create: `src/tools/symbol-contract.ts`
- Create: `test/tool-symbol-contract-happy.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-symbol-contract-happy.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolContract } from "../src/tools/symbol-contract.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolContract renders full contract with takes, returns, throws, guards, and test behaviors", () => {
  const projectRoot = join(tmpdir(), `pi-cg-contract-happy-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(join(projectRoot, "test"), { recursive: true });

  const srcContent = `export function validate(input: string): boolean {
  if (!input) return false;
  if (input.length === 0) throw new Error("empty input");
  if (input === "bad") throw new ValidationError("invalid");
  return true;
}
`;
  const testContent = `test("returns true for valid input", () => {
  expect(validate("good")).toBe(true);
});
test("throws on empty", () => {
  expect(() => validate("")).toThrow("empty input");
});
`;
  writeFileSync(join(projectRoot, "src/validate.ts"), srcContent);
  writeFileSync(join(projectRoot, "test/validate.test.ts"), testContent);

  try {
    const store = new SqliteGraphStore();
    const hash = sha256Hex(srcContent);
    const testHash = sha256Hex(testContent);

    store.addNode({
      id: "src/validate.ts::validate:1",
      kind: "function",
      name: "validate",
      file: "src/validate.ts",
      start_line: 1,
      end_line: 6,
      content_hash: hash,
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
    store.addNode({
      id: "test/validate.test.ts::throws on empty:4",
      kind: "test",
      name: "throws on empty",
      file: "test/validate.test.ts",
      start_line: 4,
      end_line: 6,
      content_hash: testHash,
    });

    // tested_by edges
    store.addEdge({
      source: "src/validate.ts::validate:1",
      target: "test/validate.test.ts::returns true for valid input:1",
      kind: "tested_by",
      provenance: { source: "coverage", confidence: 0.9, evidence: "covered", content_hash: hash },
      created_at: Date.now(),
    });
    store.addEdge({
      source: "src/validate.ts::validate:1",
      target: "test/validate.test.ts::throws on empty:4",
      kind: "tested_by",
      provenance: { source: "coverage", confidence: 0.9, evidence: "covered", content_hash: hash },
      created_at: Date.now(),
    });

    const output = symbolContract({ name: "validate", store, projectRoot });

    // Trust header
    expect(output).toContain("## Trust");

    // Header + anchor
    expect(output).toContain("## Contract: validate");
    expect(output).toContain("src/validate.ts:1:");

    // Takes
    expect(output).toContain("### Takes");
    expect(output).toContain("input: string");

    // Returns
    expect(output).toContain("### Returns");
    expect(output).toContain("boolean");

    // Throws
    expect(output).toContain("### Throws / Error paths");
    expect(output).toContain("empty input");
    expect(output).toContain("ValidationError");

    // Guards
    expect(output).toContain("### Guards / Preconditions");
    expect(output).toContain("!input");

    // Test-evidenced behaviors
    expect(output).toContain("### Test-evidenced behaviors");
    expect(output).toContain("returns true for valid input");
    expect(output).toContain("toBe");
    expect(output).toContain("throws on empty");
    expect(output).toContain("toThrow");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-contract-happy.test.ts`
Expected: FAIL — `error: Cannot find module "../src/tools/symbol-contract.js"`

**Step 3 — Write minimal implementation**

```typescript
// src/tools/symbol-contract.ts
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { GraphStore } from "../graph/store.js";
import { computeAnchor } from "../output/anchoring.js";
import { prependTrustHeader } from "../output/trust.js";
import { extractThrows, extractGuards, extractTestAssertions } from "../indexer/contract-extractor.js";

export interface SymbolContractParams {
  name: string;
  file?: string;
  store: GraphStore;
  projectRoot: string;
}

function parseSignatureParams(signature: string): { params: string[]; returnType: string | null } {
  // Signature format: "(param1: Type1, param2: Type2) => ReturnType"
  // or with type params: "<T>(param: T) => T"
  let s = signature;

  // Strip leading type params
  if (s.startsWith("<")) {
    const closeIdx = s.indexOf(">");
    if (closeIdx >= 0) s = s.slice(closeIdx + 1);
  }

  const arrowIdx = s.indexOf(" => ");
  const returnType = arrowIdx >= 0 ? s.slice(arrowIdx + 4).trim() : null;
  const paramsPart = arrowIdx >= 0 ? s.slice(0, arrowIdx).trim() : s.trim();

  // Strip parens
  const inner = paramsPart.startsWith("(") && paramsPart.endsWith(")")
    ? paramsPart.slice(1, -1).trim()
    : paramsPart;

  if (!inner) return { params: [], returnType };

  // Split params respecting nested generics
  const params: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of inner) {
    if (ch === "<" || ch === "(") depth++;
    else if (ch === ">" || ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      params.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) params.push(current.trim());

  return { params, returnType };
}

export function symbolContract(params: SymbolContractParams): string {
  const { name, file, store, projectRoot } = params;
  const stats = store.getStatistics(projectRoot);
  const nodes = store.findNodes(name, file);

  if (nodes.length === 0) {
    return prependTrustHeader(`Symbol "${name}" not found`, { stats });
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
    return prependTrustHeader(body, { stats, hasLocalExceptions });
  }

  const node = nodes[0]!;
  const anchor = computeAnchor(node, projectRoot);
  const lines: string[] = [];

  // Header
  lines.push(`## Contract: ${node.name}`);
  lines.push(anchor.anchor);

  // Takes / Returns from signature
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

  // Throws and Guards from function body
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

  // Test-evidenced behaviors
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
        // Find behaviors matching this test node's name
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

  const body = lines.join("\n") + "\n";
  return prependTrustHeader(body, { stats, hasLocalExceptions: anchor.stale });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-contract-happy.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
