---
id: 1
title: Render interface members in symbol_graph contracts
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/tools/symbol-contract.ts
  - test/repro-084-interface-handling.test.ts
files_to_create: []
---

### Task 1: Render interface members in `symbol_graph` contracts

**Files:**
- Modify: `src/tools/symbol-contract.ts`
- Test: `test/repro-084-interface-handling.test.ts`

**Step 1 — Write the failing test**
Replace the existing `repro #076` test in `test/repro-084-interface-handling.test.ts` with this copy-pasteable block so the repro covers both interface methods and interface fields from the original report:

```ts
test("repro #076: symbolGraph contract output for interfaces should list interface members", () => {
  const projectRoot = join(tmpdir(), `pi-cg-repro-076-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const storeFile = [
    "export interface GraphStatistics {",
    "  nodes: Record<string, number>;",
    "  edges: Record<string, Record<string, number>>;",
    "  files: { total: number; stale: number };",
    "}",
    "",
    "export interface GraphStore {",
    "  addNode(node: GraphNode): void;",
    "  getNode(id: string): GraphNode | null;",
    "}",
    "",
  ].join("\n");
  writeFileSync(join(projectRoot, "src", "store.ts"), storeFile);

  const store = new SqliteGraphStore();
  try {
    addIndexedFile(store, "src/store.ts", storeFile);

    const graphStoreOutput = symbolGraph({
      name: "GraphStore",
      file: "src/store.ts",
      include: ["contract"],
      store,
      projectRoot,
    });

    expect(graphStoreOutput).toContain("## Contract: GraphStore");
    expect(graphStoreOutput).toContain("### Methods");
    expect(graphStoreOutput).toContain("addNode(node: GraphNode): void");
    expect(graphStoreOutput).toContain("getNode(id: string): GraphNode | null");

    const graphStatisticsOutput = symbolGraph({
      name: "GraphStatistics",
      file: "src/store.ts",
      include: ["contract"],
      store,
      projectRoot,
    });

    expect(graphStatisticsOutput).toContain("## Contract: GraphStatistics");
    expect(graphStatisticsOutput).toContain("### Fields");
    expect(graphStatisticsOutput).toContain("nodes: Record<string, number>");
    expect(graphStatisticsOutput).toContain("files: { total: number; stale: number }");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/repro-084-interface-handling.test.ts -t 'repro #076'`
Expected: FAIL — `error: expect(received).toContain(expected)` with `Expected to contain: "### Methods"` and the received contract body still showing `### Takes` / `interface GraphStore`.

**Step 3 — Write minimal implementation**
In `src/tools/symbol-contract.ts`, add interface-member helpers and update `renderSymbolContractBody` so interface contracts render from the interface source span instead of feeding `interface Foo` into `parseSignatureParams`.

```ts
interface InterfaceContractSections {
  methods: string[];
  fields: string[];
}

function splitInterfaceMembers(body: string): string[] {
  const members: string[] = [];
  let current = "";
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let angleDepth = 0;

  for (const ch of body) {
    if (ch === "{") braceDepth++;
    else if (ch === "}") braceDepth = Math.max(0, braceDepth - 1);
    else if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === "[") bracketDepth++;
    else if (ch === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (ch === "<") angleDepth++;
    else if (ch === ">") angleDepth = Math.max(0, angleDepth - 1);

    if (
      ch === ";" &&
      braceDepth === 0 &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      angleDepth === 0
    ) {
      const member = current.trim();
      if (member) members.push(member.replace(/\s+/g, " ").trim());
      current = "";
      continue;
    }

    current += ch;
  }

  const trailing = current.trim();
  if (trailing) members.push(trailing.replace(/\s+/g, " ").trim());
  return members.filter(Boolean);
}

function extractInterfaceSectionsFromSource(
  fileContent: string,
  startLine: number,
  endLine: number,
): InterfaceContractSections {
  const snippet = fileContent.split(/\r?\n/).slice(startLine - 1, endLine).join("\n");
  const bodyStart = snippet.indexOf("{");
  const bodyEnd = snippet.lastIndexOf("}");
  if (bodyStart === -1 || bodyEnd === -1 || bodyEnd <= bodyStart) {
    return { methods: [], fields: [] };
  }

  const members = splitInterfaceMembers(snippet.slice(bodyStart + 1, bodyEnd));
  return {
    methods: members.filter((member) => member.includes("(")),
    fields: members.filter((member) => !member.includes("(")),
  };
}

function pushInterfaceContractSections(lines: string[], sections: InterfaceContractSections): void {
  if (sections.methods.length > 0) {
    lines.push("");
    lines.push("### Methods");
    for (const method of sections.methods) lines.push(`  ${method}`);
  }

  if (sections.fields.length > 0) {
    lines.push("");
    lines.push("### Fields");
    for (const field of sections.fields) lines.push(`  ${field}`);
  }
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

  if (node.kind === "interface" && fileContent && node.start_line && node.end_line) {
    const sections = extractInterfaceSectionsFromSource(fileContent, node.start_line, node.end_line);
    pushInterfaceContractSections(lines, sections);
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
Run: `bun test test/repro-084-interface-handling.test.ts -t 'repro #076'`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
