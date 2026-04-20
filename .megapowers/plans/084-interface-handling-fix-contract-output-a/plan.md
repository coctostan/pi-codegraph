# Plan

### Task 1: Render interface members in symbol_graph contracts

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

### Task 2: Persist interface members in extracted signatures [depends: 1]

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

### Task 3: Filter LSP implementation edges by declared implements clauses [depends: 1]

### Task 3: Filter LSP implementation edges by declared `implements` clauses [depends: 1]

**Files:**
- Modify: `src/indexer/lsp-resolver.ts`
- Modify: `test/tool-symbol-graph-lsp.test.ts`
- Test: `test/repro-084-interface-handling.test.ts`

**Step 1 — Write the failing test**
Keep the existing `repro #077` regression in `test/repro-084-interface-handling.test.ts` as the task’s failing test, and update the positive unit fixture in `test/tool-symbol-graph-lsp.test.ts` so the stricter resolver still has an explicit declaration to validate against.

`test/repro-084-interface-handling.test.ts` should keep this exact negative test block:

```ts
test("repro #077: resolveImplementations should not add an implements edge from a return-site match", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-repro-077-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const storeFile = [
    "export interface GraphStatistics {",
    "  nodes: Record<string, number>;",
    "  edges: Record<string, Record<string, number>>;",
    "  files: { total: number; stale: number };",
    "}",
    "",
    "export interface GraphStore {",
    "  getStatistics(): GraphStatistics;",
    "}",
    "",
  ].join("\n");
  const sqliteFile = [
    'import type { GraphStatistics, GraphStore } from "./store.js";',
    "",
    "export class SqliteGraphStore implements GraphStore {",
    "  getStatistics(): GraphStatistics {",
    "    const nodes = {};",
    "    const edges = {};",
    "    const total = 0;",
    "    const stale = 0;",
    "    return { nodes, edges, files: { total, stale } };",
    "  }",
    "}",
    "",
  ].join("\n");

  writeFileSync(join(projectRoot, "src", "store.ts"), storeFile);
  writeFileSync(join(projectRoot, "src", "sqlite.ts"), sqliteFile);

  const store = new SqliteGraphStore();
  try {
    addIndexedFile(store, "src/store.ts", storeFile);
    addIndexedFile(store, "src/sqlite.ts", sqliteFile);

    const graphStatistics = store.findNodes("GraphStatistics", "src/store.ts")[0]!;
    const sqliteGraphStore = store.findNodes("SqliteGraphStore", "src/sqlite.ts")[0]!;

    const client: ITsServerClient = {
      async implementations() {
        return [{ file: "src/sqlite.ts", line: 9, col: 12 }];
      },
      async definition() {
        return null;
      },
      async references() {
        return [];
      },
      async shutdown() {},
    };

    await resolveImplementations(graphStatistics, store, projectRoot, client);

    const implementsEdges = store
      .getEdgesBySource(sqliteGraphStore.id)
      .filter((edge) => edge.kind === "implements" && edge.target === graphStatistics.id && edge.provenance.source === "lsp");

    expect(implementsEdges).toHaveLength(0);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

Update the positive unit fixture in `test/tool-symbol-graph-lsp.test.ts` to this exact block so the stricter declaration check still has ground-truth signature data:

```ts
test("resolveImplementations persists implements edges and marker; second run skips implementations()", async () => {
  const store = new SqliteGraphStore();

  const iface = {
    id: nodeId("src/api.ts", "IWorker", 2),
    kind: "interface" as const,
    name: "IWorker",
    file: "src/api.ts",
    start_line: 2,
    end_line: 3,
    content_hash: "h-api",
  };
  const impl = {
    id: nodeId("src/impl.ts", "Worker", 1),
    kind: "class" as const,
    name: "Worker",
    file: "src/impl.ts",
    start_line: 1,
    end_line: 4,
    content_hash: "h-impl",
    signature: "class Worker implements IWorker",
  };
  store.addNode(iface);
  store.addNode(impl);

  let calls = 0;
  const client: ITsServerClient = {
    async implementations(): Promise<LspLocation[]> {
      calls++;
      return [{ file: "src/impl.ts", line: 1, col: 14 }];
    },
    async definition() {
      return null;
    },
    async references() {
      return [];
    },
    async shutdown() {},
  };

  await resolveImplementations(iface, store, "/project", client);
  await resolveImplementations(iface, store, "/project", client);

  const out = store
    .getEdgesBySource(impl.id)
    .filter((e) => e.kind === "implements" && e.target === iface.id && e.provenance.source === "lsp");
  expect(out).toHaveLength(1);
  expect(out[0]!.provenance.confidence).toBe(0.9);
  expect(calls).toBe(1);

  store.close();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/repro-084-interface-handling.test.ts test/tool-symbol-graph-lsp.test.ts -t 'repro #077|resolveImplementations persists implements edges and marker; second run skips implementations\(\)'`
Expected: FAIL — `error: expect(received).toHaveLength(expected)` with `Expected length: 0` and `Received length: 1` for the false `GraphStatistics` implements edge.

**Step 3 — Write minimal implementation**
In `src/indexer/lsp-resolver.ts`, teach the LSP-success path to validate the class declaration before persisting a class-level `implements` edge. Use the stored class signature when available, and only fall back to reading the file declaration when the signature is missing.

```ts
function signatureImplementsInterface(signature: string | undefined, interfaceName: string): boolean {
  if (!signature) return false;
  const rx = new RegExp(`\\bimplements\\b[^\\{]*\\b${escapeRegex(interfaceName)}\\b`);
  return rx.test(signature);
}

function classImplementsInterface(
  projectRoot: string,
  file: string,
  className: string,
  interfaceName: string,
  signature?: string,
): boolean {
  if (signature != null) {
    return signatureImplementsInterface(signature, interfaceName);
  }

  try {
    const content = readFileSync(join(projectRoot, file), "utf8");
    const rx = new RegExp(
      `\\bclass\\s+${escapeRegex(className)}\\b[^\\{]*\\bimplements\\b[^\\{]*\\b${escapeRegex(interfaceName)}\\b`,
      "m",
    );
    return rx.test(content);
  } catch {
    return false;
  }
}

export async function resolveImplementations(
  node: GraphNode,
  store: GraphStore,
  projectRoot: string,
  client: ITsServerClient,
): Promise<void> {
  if (hasMarker(store, "implementations", node)) return;

  const col = findSymbolColumn(projectRoot, node.file, node.start_line, node.name);
  const addFallbackImplementations = () => {
    for (const file of store.listFiles()) {
      for (const classNode of store.getNodesByFile(file).filter((n) => n.kind === "class")) {
        if (!classImplementsInterface(projectRoot, classNode.file, classNode.name, node.name, classNode.signature)) continue;
        const exists = store
          .getEdgesBySource(classNode.id)
          .some((e) => e.kind === "implements" && e.target === node.id);
        if (exists) continue;
        store.addEdge({
          source: classNode.id,
          target: node.id,
          kind: "implements",
          provenance: {
            source: "lsp",
            confidence: 0.9,
            evidence: `${classNode.file}:${classNode.start_line}:1`,
            content_hash: classNode.content_hash,
          },
          created_at: Date.now(),
        });
      }
    }
    setMarker(store, "implementations", node);
  };

  let impls;
  try {
    impls = await client.implementations(node.file, node.start_line, col);
  } catch {
    addFallbackImplementations();
    return;
  }

  if (!impls || impls.length === 0) {
    addFallbackImplementations();
    return;
  }

  for (const implLoc of impls) {
    const implNode = store
      .getNodesByFile(implLoc.file)
      .find((n) => n.kind === "class" && n.start_line <= implLoc.line && (n.end_line === null || n.end_line >= implLoc.line));

    if (!implNode) continue;
    if (!classImplementsInterface(projectRoot, implNode.file, implNode.name, node.name, implNode.signature)) continue;

    const exists = store.getEdgesBySource(implNode.id).some((e) => e.kind === "implements" && e.target === node.id);
    if (exists) continue;
    store.addEdge({
      source: implNode.id,
      target: node.id,
      kind: "implements",
      provenance: {
        source: "lsp",
        confidence: 0.9,
        evidence: `${implLoc.file}:${implLoc.line}:${implLoc.col}`,
        content_hash: implNode.content_hash,
      },
      created_at: Date.now(),
    });
  }

  setMarker(store, "implementations", node);
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/repro-084-interface-handling.test.ts test/tool-symbol-graph-lsp.test.ts -t 'repro #077|resolveImplementations persists implements edges and marker; second run skips implementations\(\)'`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
