# Verification Report — 020-m0-tree-sitter-indexer-incremental-hashi

## Test Suite Results

```
bun test v1.3.9 (cf6cdbbb)

 24 pass
 0 fail
 77 expect() calls
Ran 24 tests across 8 files. [187.00ms]
```

All 24 tests pass. However, a code inspection reveals that the test suite does **not** cover criterion 1 correctly (see below), meaning the tests passing does not imply all criteria are met.

---

## Per-Criterion Verification

### Criterion 1: function foo() {} → function node
**Evidence:**
```
bun -e "
const r = extractFile('src/a.ts', 'function foo() {}');
console.log(JSON.stringify(r.nodes));
"
// Output: []
```
`src/indexer/tree-sitter.ts` line 105 has the guard:
```ts
if (n.parent?.type !== "export_statement") return;
```
This causes `function_declaration` nodes to only be extracted when they are direct children of an `export_statement`. A bare `function foo() {}` is skipped — no function node is produced.

**Verdict: FAIL** — non-exported function declarations produce no function node.

---

### Criterion 2: const bar = () => {} → function node
**Evidence:**
```
extractFile('src/a.ts', 'const bar = () => {}')
// nodes: [{"id":"src/a.ts::bar:1","kind":"function","name":"bar",...}]
```
Arrow-function assignments go through the `variable_declarator` branch, which has no export guard.

**Verdict: PASS**

---

### Criterion 3: const baz = async () => {} → function node
**Evidence:**
```
extractFile('src/a.ts', 'const baz = async () => {}')
// nodes: [{"id":"src/a.ts::baz:1","kind":"function","name":"baz",...}]
```
**Verdict: PASS**

---

### Criterion 4: class MyClass {} → class node
**Evidence:**
```
extractFile('src/a.ts', 'class MyClass {}')
// nodes: [{"id":"src/a.ts::MyClass:1","kind":"class","name":"MyClass",...}]
```
**Verdict: PASS**

---

### Criterion 5: interface MyInterface {} → interface node
**Evidence:**
```
extractFile('src/a.ts', 'interface MyInterface {}')
// nodes: [{"id":"src/a.ts::MyInterface:1","kind":"interface","name":"MyInterface",...}]
```
**Verdict: PASS**

---

### Criterion 6: module node always returned with kind:"module", name=file, start_line:1
**Evidence:**
```
extractFile('src/a.ts', 'function foo() {}').module
// {"id":"src/a.ts::src/a.ts:1","kind":"module","name":"src/a.ts","file":"src/a.ts","start_line":1,...}
```
**Verdict: PASS**

---

### Criterion 7: node id = nodeId(file, name, startLine)
**Evidence:**
```
extractFile('src/a.ts', 'class MyClass {}').nodes[0].id
// "src/a.ts::MyClass:1"
nodeId('src/a.ts', 'MyClass', 1)
// "src/a.ts::MyClass:1"
```
Matches exactly.

**Verdict: PASS**

---

### Criterion 8: content_hash = SHA-256 hex of file content
**Evidence:**
```
const content = 'class MyClass {}';
const expectedHash = createHash('sha256').update(content).digest('hex');
extractFile('src/a.ts', content).nodes[0].content_hash === expectedHash
// true
```
**Verdict: PASS**

---

### Criterion 9: export function foo() {} same fields as non-exported
**Evidence:**
```
extractFile('src/a.ts', 'export function foo() {}').nodes[0]
// {"id":"src/a.ts::foo:1","kind":"function","name":"foo","file":"src/a.ts","start_line":1,"end_line":1,"content_hash":"..."}
// no 'exported' field present
```
Exported functions do produce a node with the correct shape (no export-status field). However, **criterion 9 depends on criterion 1 being true** — it asserts that both exported and non-exported produce the same shape. Since non-exported functions are not extracted at all (criterion 1 fails), the spirit of this criterion cannot be fully verified.

**Verdict: PARTIAL** — exported functions have the correct shape, but the non-exported form is not extracted.

---

### Criterion 10: import { foo } from './bar' → imports edge with target containing "foo"
**Evidence:**
```
extractFile('src/a.ts', "import { foo } from './bar';").edges
// [{source:"src/a.ts::src/a.ts:1", target:"__unresolved__::foo:0", kind:"imports"}]
target.includes("::foo:") → true
```
**Verdict: PASS**

---

### Criterion 11: import { foo as baz } → edge targets "foo", not "baz"
**Evidence:**
```
extractFile('src/a.ts', "import { foo as baz } from './bar';").edges
// [{target:"__unresolved__::foo:0"}]
includes("::baz:") → false, includes("::foo:") → true
```
**Verdict: PASS**

---

### Criterion 12: import Foo from './bar' → imports edge referencing "default"
**Evidence:**
```
extractFile('src/a.ts', "import Foo from './bar';").edges
// [{target:"__unresolved__::default:0"}]
includes("::default:") → true
```
**Verdict: PASS**

---

### Criterion 13: import edge provenance.source="tree-sitter", confidence=0.5
**Evidence:**
```
extractFile('src/a.ts', "import { foo } from './bar';").edges[0].provenance
// {source:"tree-sitter", confidence:0.5, evidence:"'./bar'", content_hash:"..."}
```
**Verdict: PASS**

---

### Criterion 14: import edge stores source path in provenance.evidence
**Evidence:**
```
.provenance.evidence = "'./bar'"
```
**Verdict: PASS**

---

### Criterion 15: foo() inside function body → calls edge from containing function
**Evidence:**
```
extractFile('src/calls.ts', "function a() {\n  foo();\n...").edges
// [{source:"src/calls.ts::a:1", target:"__unresolved__::foo:0", kind:"calls"}]
source === nodeId('src/calls.ts', 'a', 1) → true
```
Note: `a` itself is not in `result.nodes` (because it is non-exported and the walk visitor skips it), but the `visitCalls` pass correctly attributes the call edge to `a`'s nodeId. The edge source ID is correct.

**Verdict: PASS** (edge exists with correct source nodeId)

---

### Criterion 16: new MyClass() → calls edge targeting "MyClass"
**Evidence:**
```
calls.find(e => e.target.includes("::MyClass:")).target
// "__unresolved__::MyClass:0"
```
**Verdict: PASS**

---

### Criterion 17: obj.method() → no calls edge
**Evidence:**
```
calls.some(e => e.target.includes("::method:")) → false
```
**Verdict: PASS**

---

### Criterion 18: this.method() → no calls edge
**Evidence:** Same output as C17 — `method` does not appear in any call target.
**Verdict: PASS**

---

### Criterion 19: calls edge provenance.source="tree-sitter", confidence=0.5
**Evidence:**
```
calls[0].provenance → {source:"tree-sitter", confidence:0.5, evidence:"foo", content_hash:"..."}
```
**Verdict: PASS**

---

### Criterion 20: indexProject discovers all .ts files, excludes node_modules
**Evidence:**
```
indexProject(root, store) with src/a.ts, src/b.ts, node_modules/pkg/ignored.ts
// Result: {indexed:2, skipped:0, removed:0, errors:0}
// Only 2 files indexed — node_modules excluded
```
**Verdict: PASS**

---

### Criterion 21: first run extracts and stores, returns indexed count
**Evidence:**
```
// {indexed:2, skipped:0, removed:0, errors:0}
// DB: file_hashes has 2 rows, nodes ≥ 4, edges present
```
**Verdict: PASS**

---

### Criterion 22: re-run with no changes → indexed:0, skipped:N
**Evidence:**
```
indexProject(root, store) (second call, no changes)
// {indexed:0, skipped:2, removed:0, errors:0}
```
**Verdict: PASS**

---

### Criterion 23: changed file → delete old, re-extract new
**Evidence:**
```
After overwriting src/a.ts with 'export function a2() {}'
indexProject → {indexed:1, skipped:1, removed:0, errors:0}
SELECT name FROM nodes WHERE file='src/a.ts' AND kind='function'
// [{name:"a2"}]  — old node 'a' is gone
```
**Verdict: PASS**

---

### Criterion 24: deleted file → deleteFile called, removed count
**Evidence:**
```
After rmSync(src/b.ts):
indexProject → {indexed:0, skipped:1, removed:1, errors:0}
```
**Verdict: PASS**

---

### Criterion 25: setFileHash called for each newly indexed file
**Evidence:**
```
store.getFileHash('src/a.ts') !== null → true
```
**Verdict: PASS**

---

### Criterion 26: IndexResult shape {indexed, skipped, removed, errors}
**Evidence:**
```
Object.keys(r4).sort().join(',') === 'errors,indexed,removed,skipped' → true
```
**Verdict: PASS**

---

### Criterion 27: parse error → empty nodes/edges, no throw
**Evidence:**
```
extractFile('src/bad.ts', "function foo() {\n  return 1;")
// no throw; module.kind="module"; nodes=[]; edges=[]
```
**Verdict: PASS**

---

### Criterion 28: file read failure → pipeline continues, errors++
**Evidence:**
```
chmod 000 src/unreadable.ts
indexProject → {indexed:2, skipped:0, removed:0, errors:1}
indexed===2 && errors===1 → true
```
**Verdict: PASS**

---

## Overall Verdict

**FAIL** — 2 criteria fail:

### Failing Criteria

**Criterion 1** (FAIL): `function foo() {}` (non-exported function declaration) produces no function node.

**Root cause:** `src/indexer/tree-sitter.ts` line 105:
```ts
if (n.parent?.type !== "export_statement") return;
```
This guard restricts function extraction to children of `export_statement` nodes. Bare function declarations are silently skipped.

**Criterion 9** (PARTIAL/FAIL): The spec says exported and non-exported functions should have the same node shape. Exported functions have the correct shape. But non-exported functions are not extracted, so the comparison cannot be made.

### Test Coverage Gap

The existing test `"extractFile returns module node..."` uses `function foo() {}` (non-exported) and explicitly asserts `result.nodes` equals `[]`. This test was written to verify the module node, but it passes because the implementation (incorrectly) skips non-exported functions. The test inadvertently validates the wrong behavior.

### Fix Required

In `src/indexer/tree-sitter.ts`, **remove line 105**:
```ts
// DELETE THIS LINE:
if (n.parent?.type !== "export_statement") return;
```

And update the first test in `test/indexer-extract-file.test.ts` to either:
- Use an exported function (`export function foo() {}`) for the module-node test (keeping `nodes: []` by using a function that lacks symbol extraction for other reasons), or
- Assert that the function node IS present for `function foo() {}`.
