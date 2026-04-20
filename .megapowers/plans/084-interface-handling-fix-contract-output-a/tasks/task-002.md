---
id: 2
title: Persist interface members in extracted signatures
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/indexer/tree-sitter.ts
  - src/tools/symbol-contract.ts
  - test/signature-extract-interface.test.ts
files_to_create: []
---

### Task 2: Persist interface members in extracted signatures [depends: 1]

**Files:**
- Modify: `src/indexer/tree-sitter.ts`
- Modify: `src/tools/symbol-contract.ts`
- Test: `test/signature-extract-interface.test.ts`

**Step 1 — Write the failing test**
Replace `test/signature-extract-interface.test.ts` with a single focused regression that locks the stored interface signature format to header + members:

```ts
import { expect, test } from "bun:test";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile preserves interface header and members in signature", () => {
  const code = [
    "export interface Combined extends Foo, Bar {",
    "  find(name: string, file?: string): GraphNode[];",
    "  files: { total: number; stale: number };",
    "}",
  ].join("\n");

  const result = extractFile("src/a.ts", code);
  const ifaceNode = result.nodes.find((n) => n.name === "Combined");

  expect(ifaceNode).toBeDefined();
  expect(ifaceNode!.signature).toBe([
    "interface Combined extends Foo, Bar",
    "find(name: string, file?: string): GraphNode[]",
    "files: { total: number; stale: number }",
  ].join("\n"));
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/signature-extract-interface.test.ts -t 'extractFile preserves interface header and members in signature'`
Expected: FAIL — `error: expect(received).toBe(expected)` with the received value still equal to just `"interface Combined extends Foo, Bar"`.

**Step 3 — Write minimal implementation**
In `src/indexer/tree-sitter.ts`, serialize interface members into the stored signature, and in `src/tools/symbol-contract.ts`, prefer the stored multiline signature before falling back to the source parser from Task 1.

```ts
// src/indexer/tree-sitter.ts
function extractInterfaceMembers(node: SyntaxNode): string[] {
  const body = node.childForFieldName("body");
  if (!body) return [];

  return body.namedChildren
    .filter(
      (member: SyntaxNode) =>
        member.type === "method_signature" ||
        member.type === "property_signature" ||
        member.type === "index_signature" ||
        member.type === "call_signature",
    )
    .map((member: SyntaxNode) => member.text.replace(/;\s*$/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function extractInterfaceSignature(node: SyntaxNode, name: string): string {
  const extendsClause = node.namedChildren.find((c: SyntaxNode) => c.type === "extends_type_clause");
  const header = (() => {
    if (!extendsClause) return `interface ${name}`;
    const types = extendsClause.namedChildren
      .filter((c: SyntaxNode) => c.type === "type_identifier" || c.type === "generic_type")
      .map((c: SyntaxNode) => c.text);
    return types.length > 0 ? `interface ${name} extends ${types.join(", ")}` : `interface ${name}`;
  })();

  const members = extractInterfaceMembers(node);
  return members.length > 0 ? [header, ...members].join("\n") : header;
}
```

```ts
// src/tools/symbol-contract.ts
function extractInterfaceSectionsFromSignature(signature: string): InterfaceContractSections {
  const members = signature
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    methods: members.filter((member) => member.includes("(")),
    fields: members.filter((member) => !member.includes("(")),
  };
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

  const fullPath = join(projectRoot, node.file);
  let fileContent: string | null = null;
  if (existsSync(fullPath)) {
    try {
      fileContent = readFileSync(fullPath, "utf-8");
    } catch {
      fileContent = null;
    }
  }

  let interfaceSections: InterfaceContractSections | null = null;
  if (node.kind === "interface" && node.signature) {
    const fromSignature = extractInterfaceSectionsFromSignature(node.signature);
    if (fromSignature.methods.length > 0 || fromSignature.fields.length > 0) {
      interfaceSections = fromSignature;
    }
  }
  if (!interfaceSections && node.kind === "interface" && fileContent && node.start_line && node.end_line) {
    const fromSource = extractInterfaceSectionsFromSource(fileContent, node.start_line, node.end_line);
    if (fromSource.methods.length > 0 || fromSource.fields.length > 0) {
      interfaceSections = fromSource;
    }
  }

  if (interfaceSections) {
    pushInterfaceContractSections(lines, interfaceSections);
  } else if (node.signature) {
    const { params: sigParams, returnType } = parseSignatureParams(node.signature);
    if (sigParams.length > 0) {
      lines.push("");
      lines.push("### Takes");
      for (const p of sigParams) lines.push(`  ${p}`);
    }
    if (returnType) {
      lines.push("");
      lines.push("### Returns");
      lines.push(`  ${returnType}`);
    }
  }

  if (fileContent && node.start_line && node.end_line) {
    try {
      const throws = extractThrows(fileContent, node.start_line, node.end_line);
      if (throws.length > 0) {
        lines.push("");
        lines.push("### Throws / Error paths");
        for (const t of throws) lines.push(`  - ${t}`);
      }
      const guards = extractGuards(fileContent, node.start_line, node.end_line);
      if (guards.length > 0) {
        lines.push("");
        lines.push("### Guards / Preconditions");
        for (const g of guards) lines.push(`  - ${g}`);
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
          if (b.testName === testNode.name) allBehaviors.push(b);
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
        for (const a of b.assertions) lines.push(`    ${a}`);
      }
    }
  }

  return {
    body: lines.join("\n") + "\n",
    hasLocalExceptions: anchor.stale,
  };
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/signature-extract-interface.test.ts -t 'extractFile preserves interface header and members in signature'`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
