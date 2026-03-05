# Verification Report — 020-m0-tree-sitter-indexer-incremental-hashi

## Test Suite Results

```
bun test v1.3.9 (cf6cdbbb)

 25 pass
 0 fail
 79 expect() calls
Ran 25 tests across 8 files. [61.00ms]
```

**Per-file breakdown (from JUnit report):**

| File | Tests | Assertions | Failures |
|------|-------|-----------|---------|
| `test/indexer-extract-file.test.ts` | 7 | 21 | 0 |
| `test/indexer-index-project.test.ts` | 2 | 6 | 0 |
| `test/graph-store.test.ts` | 11 | 43 | 0 |
| `test/graph-store-list-files.test.ts` | 1 | 2 | 0 |
| `test/indexer-placeholders.test.ts` | 1 | 2 | 0 |
| `test/tool-placeholders.test.ts` | 1 | 2 | 0 |
| `test/output-anchoring.test.ts` | 1 | 2 | 0 |
| `test/smoke.test.ts` | 1 | 1 | 0 |

---

## Per-Criterion Verification

### Criterion 1: `function foo() {}` → `kind: "function"`, `name: "foo"`, correct `file`, `start_line`, `end_line`
**Evidence:** Test `"extractFile extracts non-exported function declarations (criterion 1)"` (`test/indexer-extract-file.test.ts:28`) asserts:
```ts
expect(result.nodes[0]).toEqual({
  id: nodeId(file, "foo", 1),
  kind: "function", name: "foo", file,
  start_line: 1, end_line: 1,
  content_hash: expectedHash,
});
```
Test passes (7/7 in that file, 0 failures).
**Verdict:** **PASS**

---

### Criterion 2: `const bar = () => {}` → `kind: "function"`, `name: "bar"`, correct lines
**Evidence:** Test `"extractFile extracts function declarations and arrow function assignments"` (`test/indexer-extract-file.test.ts:46`) checks `bar` at `start_line: 5, end_line: 5` with `kind: "function"`. Passes.
Code: `variable_declarator` with `arrow_function` value → `addNode(…, "function", nameNode.text, …)` at `src/indexer/tree-sitter.ts:199-215`.
**Verdict:** **PASS**

---

### Criterion 3: `const baz = async () => {}` → `kind: "function"`, `name: "baz"`
**Evidence:** Same test as Criterion 2, checks `baz` at `start_line: 6, end_line: 8`. `async () => {}` is still `arrow_function` node type in tree-sitter. Passes.
**Verdict:** **PASS**

---

### Criterion 4: `class MyClass {}` → `kind: "class"`, `name: "MyClass"`
**Evidence:** Test `"extractFile extracts class and interface declarations"` (`test/indexer-extract-file.test.ts:95`) asserts `kind: "class", name: "MyClass", start_line: 1, end_line: 1`. Passes.
Code: `class_declaration` branch at `src/indexer/tree-sitter.ts:119-132`.
**Verdict:** **PASS**

---

### Criterion 5: `interface MyInterface {}` → `kind: "interface"`, `name: "MyInterface"`
**Evidence:** Same test as Criterion 4 — checks `kind: "interface", name: "MyInterface", start_line: 3, end_line: 3`. Passes.
Code: `interface_declaration` branch at `src/indexer/tree-sitter.ts:134-147`.
**Verdict:** **PASS**

---

### Criterion 6: `extractFile` always returns module node with `kind: "module"`, `name: file`, `start_line: 1`
**Evidence:** Test `"extractFile returns module node with stable id and SHA-256 content hash"` (`test/indexer-extract-file.test.ts:7`) asserts:
```ts
expect(result.module).toEqual({
  id: nodeId(file, file, 1), kind: "module", name: file, file,
  start_line: 1, end_line: 1, content_hash: expectedHash,
});
```
Module node is unconditionally constructed at `src/indexer/tree-sitter.ts:70-78` on every call. Passes.
**Verdict:** **PASS**

---

### Criterion 7: Each node has `id` matching format `file::name:startLine`
**Evidence:** `nodeId(file, name, startLine)` at `src/graph/types.ts:52-54` returns `` `${file}::${name}:${startLine}` ``. Every test assertion uses `nodeId(...)` to verify IDs. Example: `id: nodeId(file, "foo", 1)` verified in test at line 36.
**Verdict:** **PASS**

---

### Criterion 8: Each node has `content_hash` = SHA-256 hex digest of file content
**Evidence:** All node assertions in `test/indexer-extract-file.test.ts` include:
```ts
const expectedHash = createHash("sha256").update(content).digest("hex");
// ...
content_hash: expectedHash,
```
Implementation: `sha256Hex()` at `src/indexer/tree-sitter.ts:15-17` using Node's `createHash("sha256")`. All 7 extract-file tests pass.
**Verdict:** **PASS**

---

### Criterion 9: `export function foo() {}` → same fields as non-exported
**Evidence:** Test `"extractFile extracts function declarations and arrow function assignments"` uses `export function foo()` as input and asserts it has the same structure as a plain function declaration (`kind: "function"`, `name: "foo"`, same id/lines). Export modifier is transparent in tree-sitter — the `function_declaration` node is nested inside `export_statement`; the walker visits both. Test passes.
**Verdict:** **PASS**

---

### Criterion 10: `import { foo } from './bar'` → `imports` edge, source = module node, target contains `"foo"`
**Evidence:** Test `"extractFile extracts import edges for named, aliased, and default imports"` (`test/indexer-extract-file.test.ts:125`) checks:
```ts
const fooEdge = imports.find((e) => e.target.includes("::foo:"));
expect(fooEdge).toBeDefined();
```
Implementation: `unresolvedId("foo")` = `"__unresolved__::foo:0"` which contains `"::foo:"`. `source: moduleNode.id`. Test passes.
**Verdict:** **PASS**

---

### Criterion 11: `import { foo as baz } from './bar'` → targets original name `"foo"`, not alias `"baz"`
**Evidence:** Same test checks:
```ts
const bazEdge = imports.find((e) => e.target.includes("::baz:"));
expect(bazEdge).toBeUndefined();
```
Code reads `spec.childForFieldName("name")` — in tree-sitter's `import_specifier`, the `name` field is always the original exported name, not the local alias. Test passes.
**Verdict:** **PASS**

---

### Criterion 12: `import Foo from './bar'` → `imports` edge targeting `"default"`
**Evidence:** Same test checks:
```ts
const defaultEdge = imports.find((e) => e.target.includes("::default:"));
expect(defaultEdge).toBeDefined();
```
Implementation: detects `identifier` child of `import_clause` (default import) → creates `unresolvedId("default")` = `"__unresolved__::default:0"`. Test passes.
**Verdict:** **PASS**

---

### Criterion 13: Import edges have `provenance.source: "tree-sitter"`, `confidence: 0.5`
**Evidence:** Same test asserts `fooEdge` matches:
```ts
provenance: { source: "tree-sitter", confidence: 0.5, evidence: expect.stringContaining("./bar"), content_hash: expectedHash }
```
Test passes.
**Verdict:** **PASS**

---

### Criterion 14: Import edges store source path in `provenance.evidence`
**Evidence:** Same test: `evidence: expect.stringContaining("./bar")`. Implementation: `evidence = sourceNode.text` (the string literal from the import statement, e.g. `'./bar'`). Test passes.
**Verdict:** **PASS**

---

### Criterion 15: `foo()` inside function → `calls` edge from containing function to target with `"foo"`
**Evidence:** Test `"extractFile extracts calls edges for bare calls + constructors, ignoring method calls"` (`test/indexer-extract-file.test.ts:158`) checks:
```ts
const fooCall = calls.find((e) => e.target.includes("::foo:"));
expect(fooCall).toBeDefined();
expect(fooCall).toMatchObject({ source: nodeId(file, "a", 1), kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5 } });
```
Test passes.
**Verdict:** **PASS**

---

### Criterion 16: `new MyClass()` → `calls` edge targeting `"MyClass"`
**Evidence:** Same test:
```ts
const ctorCall = calls.find((e) => e.target.includes("::MyClass:"));
expect(ctorCall).toBeDefined();
```
Implementation: `new_expression` handling at `src/indexer/tree-sitter.ts:254-270` — gets `constructor` field, checks `ctor.type === "identifier"`. Test passes.
**Verdict:** **PASS**

---

### Criterion 17: `obj.method()` → no `calls` edge
**Evidence:** Same test (input has `obj.method()` at line 3):
```ts
expect(calls.some((e) => e.target.includes("::method:"))).toBe(false);
```
Implementation: only emits `calls` when `callee.type === "identifier"` (bare call), not `member_expression`. Test passes.
**Verdict:** **PASS**

---

### Criterion 18: `this.method()` → no `calls` edge
**Evidence:** Same test (input has `this.method()` at line 4). Same assertion as Criterion 17 — `calls.some(e => e.target.includes("::method:"))` is false. Test passes.
**Verdict:** **PASS**

---

### Criterion 19: Call edges have `provenance.source: "tree-sitter"`, `confidence: 0.5`
**Evidence:** Same test verifies `fooCall.provenance: { source: "tree-sitter", confidence: 0.5, content_hash: expectedHash }`. Test passes.
**Verdict:** **PASS**

---

### Criterion 20: `indexProject` discovers all `.ts` files, excludes `node_modules`
**Evidence:** Test `"indexProject indexes .ts files under root, excludes node_modules, and persists nodes/edges + file hashes"` (`test/indexer-index-project.test.ts:15`) creates:
- `src/a.ts`, `src/b.ts` (should be indexed)
- `node_modules/pkg/ignored.ts` (should be excluded)

Result: `indexed: 2` and `file_hashes` contains only `src/a.ts` and `src/b.ts` — `ignored.ts` absent.
Implementation: `walkTsFiles()` skips any directory named `"node_modules"` at `src/indexer/pipeline.ts:23`. Test passes.
**Verdict:** **PASS**

---

### Criterion 21: First run: extract/store all files, return `indexed` count
**Evidence:** Same test: `expect(result).toEqual({ indexed: 2, skipped: 0, removed: 0, errors: 0 })`. DB shows correct `file_hashes` rows and edges (`calls`, `imports`) are stored. Test passes.
**Verdict:** **PASS**

---

### Criterion 22: Re-run with no file changes → `indexed: 0, skipped: N`
**Evidence:** Second pipeline test (`test/indexer-index-project.test.ts:66`). After first run (which successfully indexes `a.ts` and `b.ts`), `b.ts` is deleted and a second `indexProject` call returns `{ indexed: 0, skipped: 1, removed: 1, errors: 1 }` — `a.ts` is skipped (hash unchanged). This verifies the skip behavior; a pure all-files-unchanged scenario isn't tested in isolation but the code path is exercised (`if (existing === hash) { skipped++; continue; }`).
**Verdict:** **PASS** (behavior verified via the second run showing `skipped: 1` for the unchanged file)

---

### Criterion 23: Changed file between runs → delete old nodes/edges, re-extract, store new
**Evidence:** No dedicated test exercises a content-change-then-re-index scenario directly. However, code inspection at `src/indexer/pipeline.ts:56-72` clearly implements this:
```ts
if (existing === hash) { skipped++; continue; }
if (existing !== null) { store.deleteFile(rel); }  // ← delete old
// re-extract and store new...
store.setFileHash(rel, hash);
indexed++;
```
The `store.deleteFile()` method is verified to remove nodes and edges in `test/graph-store.test.ts` ("deleteFile removes file nodes and all touching edges, preserves unrelated data"). The skip path (`existing === hash`) is verified by Criterion 22.
**Verdict:** **PASS** (code-inspection + adjacent-behavior verified; no dedicated end-to-end test for the changed-file path)

---

### Criterion 24: Deleted file between runs → `deleteFile` called, removed from store
**Evidence:** Second pipeline test removes `b.ts` between runs and checks `removed: 1`. After the second run:
```ts
const fileRows = db.query("SELECT file FROM file_hashes").all();
expect(fileRows.map(r => r.file)).toEqual(["src/a.ts"]);
```
`b.ts` is gone from file_hashes. Test passes.
**Verdict:** **PASS**

---

### Criterion 25: `setFileHash` called for each newly indexed file
**Evidence:** First pipeline test asserts the `file_hashes` table contains `{ file: "src/a.ts", hash: sha256Hex(aContent) }` and `{ file: "src/b.ts", hash: sha256Hex(bContent) }`. Implementation calls `store.setFileHash(rel, hash)` at `src/indexer/pipeline.ts:68`. Test passes.
**Verdict:** **PASS**

---

### Criterion 26: `IndexResult` with `{ indexed, skipped, removed, errors }` counts
**Evidence:** First test: `expect(result).toEqual({ indexed: 2, skipped: 0, removed: 0, errors: 0 })`. Second test first call: `{ indexed: 2, skipped: 0, removed: 0, errors: 1 }`. Second call: `{ indexed: 0, skipped: 1, removed: 1, errors: 1 }`. Interface declared at `src/indexer/pipeline.ts:7-12`. All pass.
**Verdict:** **PASS**

---

### Criterion 27: Tree-sitter parse failure → empty nodes/edges, no throw
**Evidence:** Test `"extractFile returns empty nodes/edges (but no throw) when the parse has errors"` (`test/indexer-extract-file.test.ts:192`) uses `"function foo() {\n  return 1;"` (missing `}`) and asserts:
```ts
expect(result.module.kind).toBe("module");
expect(result.nodes).toEqual([]);
expect(result.edges).toEqual([]);
```
Implementation checks `tree.rootNode.hasError()` and returns early at `src/indexer/tree-sitter.ts:99-101`. Test passes.
**Verdict:** **PASS**

---

### Criterion 28: Single file failure in `indexProject` → continue, increment errors
**Evidence:** Second pipeline test makes `unreadable.ts` unreadable via `chmod 000`, causing `readFileSync` to throw. First run result: `{ indexed: 2, skipped: 0, removed: 0, errors: 1 }` — 2 files successfully indexed, 1 error, processing continued. Implementation: try/catch at `src/indexer/pipeline.ts:52-73`. Test passes.
**Verdict:** **PASS**

---

## Overall Verdict

**PASS**

All 28 acceptance criteria are met. The full test suite runs 25 tests with 0 failures and 79 assertions. Key evidence:

- **7 extractFile tests** cover all node extraction cases (function, class, interface, module, arrow functions, export-transparency), all import edge cases (named, aliased, default, provenance), all call edge cases (bare calls, constructors, method-call exclusion), and parse-error resilience.
- **2 indexProject tests** cover file discovery (with node_modules exclusion), first-run indexing with result counts, skip-on-unchanged behavior, deleted-file removal, unreadable-file error handling, and file hash persistence.
- **1 minor gap (Criterion 23):** No test directly exercises the "file content changes between runs" path end-to-end. The code logic is clearly correct and the adjacent behaviors (skip unchanged, delete on new index) are both tested; the gap does not warrant a phase-back.
