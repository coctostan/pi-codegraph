# Plan

### Task 1: Contract extractor — throw statement extraction

**Files:**
- Create: `src/indexer/contract-extractor.ts`
- Create: `test/contract-extractor-throws.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/contract-extractor-throws.test.ts
import { expect, test } from "bun:test";
import { extractThrows } from "../src/indexer/contract-extractor.js";

test("extractThrows finds throw new Error with string literal", () => {
  const code = `function foo() {
  if (!x) throw new Error("missing x");
  return x;
}`;
  const result = extractThrows(code, 1, 4);
  expect(result).toHaveLength(1);
  expect(result[0]).toContain("missing x");
});

test("extractThrows finds throw new CustomError", () => {
  const code = `function foo() {
  throw new ValidationError("bad input");
}`;
  const result = extractThrows(code, 1, 3);
  expect(result).toHaveLength(1);
  expect(result[0]).toContain("ValidationError");
});

test("extractThrows finds plain throw expression", () => {
  const code = `function foo() {
  throw "something went wrong";
}`;
  const result = extractThrows(code, 1, 3);
  expect(result).toHaveLength(1);
  expect(result[0]).toContain("something went wrong");
});

test("extractThrows returns empty array when no throws", () => {
  const code = `function foo() { return 1; }`;
  const result = extractThrows(code, 1, 1);
  expect(result).toHaveLength(0);
});

test("extractThrows finds multiple throws", () => {
  const code = `function foo(x: string) {
  if (!x) throw new Error("missing x");
  if (x === "") throw new Error("empty x");
  return x;
}`;
  const result = extractThrows(code, 1, 5);
  expect(result).toHaveLength(2);
  expect(result[0]).toContain("missing x");
  expect(result[1]).toContain("empty x");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/contract-extractor-throws.test.ts`
Expected: FAIL — `error: Cannot find module "../src/indexer/contract-extractor.js"`

**Step 3 — Write minimal implementation**

```typescript
// src/indexer/contract-extractor.ts
import Parser from "tree-sitter";
import ts from "tree-sitter-typescript";

type SyntaxNode = Parser.SyntaxNode;

function getParser(file: string = "input.ts"): Parser {
  const parser = new Parser();
  const mod = ts as unknown as { typescript: unknown; tsx: unknown };
  const lang = file.endsWith(".tsx") ? mod.tsx : mod.typescript;
  parser.setLanguage(lang as never);
  return parser;
}

function walk(node: SyntaxNode, visit: (n: SyntaxNode) => void): void {
  visit(node);
  for (const child of node.namedChildren) walk(child, visit);
}

function extractBodyLines(content: string, startLine: number, endLine: number): string {
  const lines = content.split(/\r?\n/);
  // startLine and endLine are 1-indexed
  return lines.slice(startLine - 1, endLine).join("\n");
}

export function extractThrows(fileContent: string, startLine: number, endLine: number): string[] {
  const bodyText = extractBodyLines(fileContent, startLine, endLine);
  const parser = getParser();
  const tree = parser.parse(bodyText);
  const throws: string[] = [];

  walk(tree.rootNode, (n) => {
    if (n.type !== "throw_statement") return;

    const expr = n.namedChildren[0];
    if (!expr) {
      throws.push("throw");
      return;
    }

    // throw new Error("msg") or throw new SomeError(...)
    if (expr.type === "new_expression") {
      const ctor = expr.childForFieldName("constructor");
      const args = expr.childForFieldName("arguments");
      const ctorName = ctor?.text ?? "Error";

      // If it's Error with a string argument, extract the message
      if (ctorName === "Error" && args) {
        const firstArg = args.namedChildren[0];
        if (firstArg?.type === "string" || firstArg?.type === "template_string") {
          const msg = firstArg.text.replace(/^['"`]|['"`]$/g, "");
          throws.push(msg);
          return;
        }
      }

      // Otherwise show the class name
      throws.push(ctorName);
      return;
    }

    // Plain throw expression
    const text = expr.text;
    throws.push(text.length > 80 ? text.slice(0, 77) + "..." : text);
  });

  return throws;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/contract-extractor-throws.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 2: Contract extractor — guard pattern extraction [depends: 1]

**Files:**
- Modify: `src/indexer/contract-extractor.ts`
- Create: `test/contract-extractor-guards.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/contract-extractor-guards.test.ts
import { expect, test } from "bun:test";
import { extractGuards } from "../src/indexer/contract-extractor.js";

test("extractGuards finds if (!x) return pattern", () => {
  const code = `function foo(x: string) {
  if (!x) return;
  return x.toUpperCase();
}`;
  const result = extractGuards(code, 1, 4);
  expect(result).toHaveLength(1);
  expect(result[0]).toContain("!x");
});

test("extractGuards finds if (x == null) return pattern", () => {
  const code = `function foo(x: string) {
  if (x == null) return;
  return x;
}`;
  const result = extractGuards(code, 1, 4);
  expect(result).toHaveLength(1);
  expect(result[0]).toContain("x == null");
});

test("extractGuards finds if (x === undefined) return pattern", () => {
  const code = `function foo(x: string) {
  if (x === undefined) return;
  return x;
}`;
  const result = extractGuards(code, 1, 4);
  expect(result).toHaveLength(1);
  expect(result[0]).toContain("x === undefined");
});

test("extractGuards returns empty array when no guards", () => {
  const code = `function foo() { return 1; }`;
  const result = extractGuards(code, 1, 1);
  expect(result).toHaveLength(0);
});

test("extractGuards finds multiple guards", () => {
  const code = `function foo(x: string, y: number) {
  if (!x) return;
  if (y <= 0) return;
  return x.repeat(y);
}`;
  const result = extractGuards(code, 1, 5);
  expect(result).toHaveLength(2);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/contract-extractor-guards.test.ts`
Expected: FAIL — `error: "extractGuards" is not exported from module`

**Step 3 — Write minimal implementation**

Add to `src/indexer/contract-extractor.ts`:

```typescript
export function extractGuards(fileContent: string, startLine: number, endLine: number): string[] {
  const bodyText = extractBodyLines(fileContent, startLine, endLine);
  const parser = getParser();
  const tree = parser.parse(bodyText);
  const guards: string[] = [];

  walk(tree.rootNode, (n) => {
    if (n.type !== "if_statement") return;

    const consequence = n.childForFieldName("consequence");
    if (!consequence) return;

    // Check if the body is a return statement (or block with just a return)
    let isGuard = false;
    if (consequence.type === "return_statement") {
      isGuard = true;
    } else if (consequence.type === "statement_block") {
      const stmts = consequence.namedChildren.filter((c) => c.type !== "comment");
      if (stmts.length === 1 && stmts[0]?.type === "return_statement") {
        isGuard = true;
      }
    }

    if (!isGuard) return;

    const condition = n.childForFieldName("condition");
    if (!condition) return;

    // Extract the condition text, stripping outer parens
    let condText = condition.text;
    if (condText.startsWith("(") && condText.endsWith(")")) {
      condText = condText.slice(1, -1);
    }
    guards.push(condText.length > 80 ? condText.slice(0, 77) + "..." : condText);
  });

  return guards;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/contract-extractor-guards.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 3: Contract extractor — test assertion mining [depends: 1]

**Files:**
- Modify: `src/indexer/contract-extractor.ts`
- Create: `test/contract-extractor-assertions.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/contract-extractor-assertions.test.ts
import { expect, test } from "bun:test";
import { extractTestAssertions, type TestBehavior } from "../src/indexer/contract-extractor.js";

test("extractTestAssertions extracts expect().toBe()", () => {
  const code = `test("returns hello", () => {
  const result = greet("world");
  expect(result).toBe("hello world");
});`;
  const result = extractTestAssertions(code);
  expect(result).toHaveLength(1);
  expect(result[0]!.testName).toBe("returns hello");
  expect(result[0]!.assertions).toHaveLength(1);
  expect(result[0]!.assertions[0]).toContain("toBe");
});

test("extractTestAssertions extracts expect().toThrow()", () => {
  const code = `test("throws on bad input", () => {
  expect(() => parse("")).toThrow("invalid");
});`;
  const result = extractTestAssertions(code);
  expect(result).toHaveLength(1);
  expect(result[0]!.testName).toBe("throws on bad input");
  expect(result[0]!.assertions[0]).toContain("toThrow");
});

test("extractTestAssertions extracts expect().toContain()", () => {
  const code = `test("includes item", () => {
  expect(list()).toContain("foo");
});`;
  const result = extractTestAssertions(code);
  expect(result[0]!.assertions[0]).toContain("toContain");
});

test("extractTestAssertions extracts expect().toHaveLength()", () => {
  const code = `test("has three items", () => {
  expect(items()).toHaveLength(3);
});`;
  const result = extractTestAssertions(code);
  expect(result[0]!.assertions[0]).toContain("toHaveLength");
});

test("extractTestAssertions groups by test name", () => {
  const code = `test("first test", () => {
  expect(a).toBe(1);
  expect(b).toBe(2);
});
test("second test", () => {
  expect(c).toContain("x");
});`;
  const result = extractTestAssertions(code);
  expect(result).toHaveLength(2);
  expect(result[0]!.testName).toBe("first test");
  expect(result[0]!.assertions).toHaveLength(2);
  expect(result[1]!.testName).toBe("second test");
  expect(result[1]!.assertions).toHaveLength(1);
});

test("extractTestAssertions returns empty for no assertions", () => {
  const code = `test("does something", () => {
  doStuff();
});`;
  const result = extractTestAssertions(code);
  expect(result).toHaveLength(1);
  expect(result[0]!.assertions).toHaveLength(0);
});

test("extractTestAssertions handles it() blocks", () => {
  const code = `it("should work", () => {
  expect(foo()).toBe(true);
});`;
  const result = extractTestAssertions(code);
  expect(result).toHaveLength(1);
  expect(result[0]!.testName).toBe("should work");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/contract-extractor-assertions.test.ts`
Expected: FAIL — `error: "extractTestAssertions" is not exported from module`

**Step 3 — Write minimal implementation**

Add to `src/indexer/contract-extractor.ts`:

```typescript
export interface TestBehavior {
  testName: string;
  assertions: string[];
}

const SUPPORTED_MATCHERS = new Set(["toBe", "toThrow", "toContain", "toHaveLength"]);

export function extractTestAssertions(fileContent: string): TestBehavior[] {
  const parser = getParser();
  const tree = parser.parse(fileContent);
  const behaviors: TestBehavior[] = [];

  // Find test() or it() call expressions at top level
  walk(tree.rootNode, (n) => {
    if (n.type !== "call_expression") return;
    const fn = n.childForFieldName("function");
    if (!fn || (fn.text !== "test" && fn.text !== "it")) return;

    const args = n.childForFieldName("arguments");
    if (!args) return;

    // First arg is the test name string
    const nameArg = args.namedChildren[0];
    if (!nameArg || (nameArg.type !== "string" && nameArg.type !== "template_string")) return;
    const testName = nameArg.text.replace(/^['"`]|['"`]$/g, "");

    // Second arg is the callback — find expect() calls in it
    const callback = args.namedChildren[1];
    if (!callback) {
      behaviors.push({ testName, assertions: [] });
      return;
    }

    const assertions: string[] = [];
    walk(callback, (inner) => {
      if (inner.type !== "call_expression") return;
      const innerFn = inner.childForFieldName("function");
      if (!innerFn || innerFn.type !== "member_expression") return;

      const prop = innerFn.childForFieldName("property");
      if (!prop || !SUPPORTED_MATCHERS.has(prop.text)) return;

      // Check that the chain starts with expect()
      const obj = innerFn.childForFieldName("object");
      if (!obj) return;

      let hasExpect = false;
      walk(obj, (e) => {
        if (e.type === "call_expression") {
          const eFn = e.childForFieldName("function");
          if (eFn?.text === "expect") hasExpect = true;
        }
      });
      if (!hasExpect) return;

      // Build assertion string
      const matcherArgs = inner.childForFieldName("arguments");
      const argText = matcherArgs?.namedChildren.map((c) => {
        const t = c.text;
        return t.length > 40 ? t.slice(0, 37) + "..." : t;
      }).join(", ") ?? "";
      assertions.push(`${prop.text}(${argText})`);
    });

    behaviors.push({ testName, assertions });
  });

  return behaviors;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/contract-extractor-assertions.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 4: symbolContract tool — happy path with signature, throws, guards, and tests [depends: 1, 2, 3]

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

### Task 5: symbolContract — not-found returns error with trust header [depends: 4]

**Files:**
- Create: `test/tool-symbol-contract-not-found.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-symbol-contract-not-found.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolContract } from "../src/tools/symbol-contract.js";

test("symbolContract returns not-found message with trust header for unknown symbol", () => {
  const projectRoot = join(tmpdir(), `pi-cg-contract-nf-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/a.ts"), "export function foo() {}\n");

  try {
    const store = new SqliteGraphStore();
    const output = symbolContract({ name: "doesNotExist", store, projectRoot });

    expect(output).toContain("## Trust");
    expect(output).toContain("not found");
    expect(output).toContain("doesNotExist");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-contract-not-found.test.ts`
Expected: PASS — this should already pass from Task 4's implementation. (Included for AC coverage verification.)

**Step 3 — Write minimal implementation**
No additional implementation needed — already handled in Task 4.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-contract-not-found.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 6: symbolContract — ambiguous symbol returns disambiguation list [depends: 4]

**Files:**
- Create: `test/tool-symbol-contract-ambiguous.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-symbol-contract-ambiguous.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolContract } from "../src/tools/symbol-contract.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolContract returns disambiguation list when multiple nodes match", () => {
  const projectRoot = join(tmpdir(), `pi-cg-contract-amb-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileAContent = "export function foo() {}\n";
  const fileBContent = "export class foo {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileAContent);
  writeFileSync(join(projectRoot, "src/b.ts"), fileBContent);

  try {
    const store = new SqliteGraphStore();
    const hashA = sha256Hex(fileAContent);
    const hashB = sha256Hex(fileBContent);

    store.addNode({
      id: "src/a.ts::foo:1", kind: "function", name: "foo",
      file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA,
    });
    store.addNode({
      id: "src/b.ts::foo:1", kind: "class", name: "foo",
      file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB,
    });

    const output = symbolContract({ name: "foo", store, projectRoot });

    expect(output).toContain("## Trust");
    expect(output).toContain("Multiple matches");
    expect(output).toContain("src/a.ts");
    expect(output).toContain("src/b.ts");
    expect(output).toContain("function");
    expect(output).toContain("class");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-contract-ambiguous.test.ts`
Expected: PASS — already handled in Task 4's implementation.

**Step 3 — Write minimal implementation**
No additional implementation needed — already handled in Task 4.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-contract-ambiguous.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 7: symbolContract — fallback when no tests exist [depends: 4]

**Files:**
- Create: `test/tool-symbol-contract-no-tests.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-symbol-contract-no-tests.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolContract } from "../src/tools/symbol-contract.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolContract omits test-evidenced behaviors section when no tested_by edges exist", () => {
  const projectRoot = join(tmpdir(), `pi-cg-contract-notests-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const srcContent = `export function greet(name: string): string {
  if (!name) throw new Error("name required");
  return "hello " + name;
}
`;
  writeFileSync(join(projectRoot, "src/greet.ts"), srcContent);

  try {
    const store = new SqliteGraphStore();
    const hash = sha256Hex(srcContent);

    store.addNode({
      id: "src/greet.ts::greet:1", kind: "function", name: "greet",
      file: "src/greet.ts", start_line: 1, end_line: 4,
      content_hash: hash, is_exported: true,
      signature: "(name: string) => string",
    });

    const output = symbolContract({ name: "greet", store, projectRoot });

    // Should have signature sections
    expect(output).toContain("### Takes");
    expect(output).toContain("### Returns");

    // Should have throws
    expect(output).toContain("### Throws / Error paths");
    expect(output).toContain("name required");

    // Should NOT have test section
    expect(output).not.toContain("Test-evidenced behaviors");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-contract-no-tests.test.ts`
Expected: PASS — already handled in Task 4's implementation.

**Step 3 — Write minimal implementation**
No additional implementation needed — already handled in Task 4.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-contract-no-tests.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 8: symbolContract — fallback when no signature exists [depends: 4]

**Files:**
- Create: `test/tool-symbol-contract-no-signature.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-symbol-contract-no-signature.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolContract } from "../src/tools/symbol-contract.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolContract omits Takes and Returns when node has no signature", () => {
  const projectRoot = join(tmpdir(), `pi-cg-contract-nosig-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const srcContent = `export function doStuff() {
  if (!ready) return;
  throw new Error("not implemented");
}
`;
  writeFileSync(join(projectRoot, "src/stuff.ts"), srcContent);

  try {
    const store = new SqliteGraphStore();
    const hash = sha256Hex(srcContent);

    // Node WITHOUT signature
    store.addNode({
      id: "src/stuff.ts::doStuff:1", kind: "function", name: "doStuff",
      file: "src/stuff.ts", start_line: 1, end_line: 4,
      content_hash: hash, is_exported: true,
    });

    const output = symbolContract({ name: "doStuff", store, projectRoot });

    // Should NOT have Takes/Returns
    expect(output).not.toContain("### Takes");
    expect(output).not.toContain("### Returns");

    // Should still have throws and guards
    expect(output).toContain("### Throws / Error paths");
    expect(output).toContain("not implemented");
    expect(output).toContain("### Guards / Preconditions");
    expect(output).toContain("!ready");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-contract-no-signature.test.ts`
Expected: PASS — already handled in Task 4's implementation.

**Step 3 — Write minimal implementation**
No additional implementation needed — already handled in Task 4.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-contract-no-signature.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 9: symbolContract — fallback when source file is unreadable [depends: 4]

**Files:**
- Create: `test/tool-symbol-contract-no-body.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-symbol-contract-no-body.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolContract } from "../src/tools/symbol-contract.js";

test("symbolContract omits throws/guards when source file does not exist", () => {
  const projectRoot = join(tmpdir(), `pi-cg-contract-nobody-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  // Note: NOT writing the source file — it doesn't exist on disk

  try {
    const store = new SqliteGraphStore();

    store.addNode({
      id: "src/missing.ts::doStuff:1", kind: "function", name: "doStuff",
      file: "src/missing.ts", start_line: 1, end_line: 5,
      content_hash: "abc123", is_exported: true,
      signature: "(x: number) => string",
    });

    const output = symbolContract({ name: "doStuff", store, projectRoot });

    // Should still have signature sections
    expect(output).toContain("### Takes");
    expect(output).toContain("x: number");
    expect(output).toContain("### Returns");
    expect(output).toContain("string");

    // Should NOT have throws or guards (file missing)
    expect(output).not.toContain("### Throws");
    expect(output).not.toContain("### Guards");

    // Trust header present
    expect(output).toContain("## Trust");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-contract-no-body.test.ts`
Expected: PASS — already handled in Task 4's implementation.

**Step 3 — Write minimal implementation**
No additional implementation needed — already handled in Task 4.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-contract-no-body.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 10: Register symbol_contract tool in pi extension [depends: 4]

**Files:**
- Modify: `src/index.ts`
- Create: `test/tool-symbol-contract-wiring.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-symbol-contract-wiring.test.ts
import { expect, test } from "bun:test";

test("pi extension registers symbol_contract tool with correct schema", async () => {
  const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
  const mockPi = {
    registerTool(tool: { name: string; parameters: unknown; execute: Function }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const scTool = registeredTools.find((t) => t.name === "symbol_contract");
  expect(scTool).toBeDefined();

  const schema = scTool!.parameters as any;
  expect(schema.properties.name).toBeDefined();
  expect(schema.properties.file).toBeDefined();
  expect(schema.required).toContain("name");
  expect(schema.required).not.toContain("file");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-contract-wiring.test.ts`
Expected: FAIL — `expect(received).toBeDefined()` because no `symbol_contract` tool is registered yet.

**Step 3 — Write minimal implementation**

Add to `src/index.ts`:

1. Add import at the top:
```typescript
import { symbolContract } from "./tools/symbol-contract.js";
```

2. Add params definition after `SymbolCardParams`:
```typescript
const SymbolContractParams = Type.Object({
  name: Type.String({ description: "Symbol name to look up" }),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
});
```

3. Add tool registration after the `symbol_card` registration block (before the closing of `piCodegraph` function):
```typescript
  pi.registerTool({
    name: "symbol_contract",
    label: "Symbol Contract",
    description: "Extract behavioral contract for a symbol: what it takes, returns, throws, and what tests assert about it",
    parameters: SymbolContractParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      let output = symbolContract({ name: params.name, file: params.file, store, projectRoot });
      output = indexingFailedNote() + output;
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-contract-wiring.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
