---
id: 2
title: Store tree-sitter call-site coordinates in calls evidence
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/indexer/tree-sitter.ts
  - test/indexer-extract-file.test.ts
files_to_create: []
---

### Task 2: Store tree-sitter call-site coordinates in `calls` evidence
- Modify: `src/indexer/tree-sitter.ts`
- Modify: `test/indexer-extract-file.test.ts`

Append new tests that assert `calls` evidence uses `name:line:col` format, then update
both provenance blocks in `extractFile()` to record the callee identifier coordinates from
the tree-sitter AST node.

---

#### Step 1 — Test (RED)

Append to `test/indexer-extract-file.test.ts`:

```typescript
// ---------- Task 2 additions ----------

test("extractFile records call-site coordinates in calls evidence (bare call)", () => {
  const file = "src/a.ts";
  // line 1: function caller() {
  // line 2:   return foo();     <— 'foo' at col 10 (2 spaces + "return " = 9 chars, then 'f')
  // line 3: }
  const content = "function caller() {\n  return foo();\n}";
  const result = extractFile(file, content);

  const callEdges = result.edges.filter(
    (e) => e.kind === "calls" && !e.target.includes("__unresolved__")
      || (e.kind === "calls" && e.target.includes("__unresolved__")),
  );
  // There should be at least one calls edge for the 'foo' call
  const fooEdge = result.edges.find(
    (e) => e.kind === "calls" && e.provenance.evidence.startsWith("foo:"),
  );
  expect(fooEdge).toBeDefined();
  // Evidence must be "name:line:col" using 1-based positions from the AST.
  // 'foo' is the callee identifier: startPosition.row=1 (+1=2), startPosition.column=9 (+1=10)
  expect(fooEdge!.provenance.evidence).toBe("foo:2:10");
});

test("extractFile records constructor call-site coordinates in calls evidence (new expression)", () => {
  const file = "src/b.ts";
  // line 1: function make() {
  // line 2:   return new Bar();   <— 'Bar' at col 14 (2 spaces + "return new " = 13 chars, then 'B')
  // line 3: }
  const content = "function make() {\n  return new Bar();\n}";
  const result = extractFile(file, content);

  const barEdge = result.edges.find(
    (e) => e.kind === "calls" && e.provenance.evidence.startsWith("Bar:"),
  );
  expect(barEdge).toBeDefined();
  // 'Bar' constructor: startPosition.row=1 (+1=2), startPosition.column=13 (+1=14)
  expect(barEdge!.provenance.evidence).toBe("Bar:2:14");
});
```

---

#### Step 2 — Run (FAIL)

```
bun test test/indexer-extract-file.test.ts
```

Expected failure — current evidence stores only the callee name:
```
error: expect(received).toBe(expected)
Expected: "foo:2:10"
Received: "foo"
```

---

#### Step 3 — Implementation

In `src/indexer/tree-sitter.ts`, update the two provenance `evidence` strings inside
`visitCalls`. The helper function and both changed blocks are shown in full:

```typescript
// Helper — add directly above the visitCalls definition (before line 211 in the current file)
function callEvidence(node: SyntaxNode): string {
  return `${node.text}:${node.startPosition.row + 1}:${node.startPosition.column + 1}`;
}
```

Replace the bare-call provenance block (inside the `n.type === "call_expression"` branch):

```typescript
        if (callee?.type === "identifier") {
          pushEdge({
            source: nextFunctionId,
            target: unresolvedId(callee.text),
            kind: "calls",
            provenance: {
              source: "tree-sitter",
              confidence: 0.5,
              evidence: callEvidence(callee),     // was: callee.text
              content_hash: contentHash,
            },
            created_at: Date.now(),
          });
        }
```

Replace the constructor provenance block (inside the `n.type === "new_expression"` branch):

```typescript
        if (ctor?.type === "identifier") {
          pushEdge({
            source: nextFunctionId,
            target: unresolvedId(ctor.text),
            kind: "calls",
            provenance: {
              source: "tree-sitter",
              confidence: 0.5,
              evidence: callEvidence(ctor),       // was: ctor.text
              content_hash: contentHash,
            },
            created_at: Date.now(),
          });
        }
```

---

#### Step 4 — Run (PASS)

```
bun test test/indexer-extract-file.test.ts
```

Expected: all tests in the file pass.

---

#### Step 5 — Full suite

```
bun test
```

Expected: all tests pass (no regressions).
