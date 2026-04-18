# Revision Instructions — Iteration 2

The iteration-1 revision addressed the scope issue correctly: Tasks 2 and 3 no longer introduce `src/graph/edge-kinds.ts`, `export` is added in-place to each tool file, and `src/index.ts` imports via aliases `RESOLVE_EDGE_KINDS` / `DELETE_EDGE_KINDS`. Good.

However, the edit introduced a **copy-paste bug in Task 3's Step 1 test code** that would break implementation if pasted literally. One tiny fix is required.

---

## Task 3: Step 1 test code is missing the `const expectedDescription =` declaration line

The current Step 1 code block (task-003.md lines 26–42) reads:

```ts
test("delete_edge.kind schema is a union of VALID_EDGE_KINDS with enumerating description", async () => {
  const tools = await registered();
  const del = tools.find((t) => t.name === "delete_edge");
  if (!del) throw new Error("delete_edge tool not registered");
  const kind = del.parameters?.properties?.kind;
  if (!kind) throw new Error("delete_edge.kind schema missing");
    'Edge kind. Allowed values: "calls", "imports", "implements", "extends", "tested_by", "co_changes_with", "renders", "routes_to".';
  if (kind.description !== expectedDescription) {
    ...
```

Note line 7 of the code block: the string literal `'Edge kind. Allowed values: ...'` is dangling with no `const expectedDescription =` preceding it. Pasting this produces a TypeScript syntax/unused-expression error (`expectedDescription is not defined` or similar), not the expected `delete_edge.kind description mismatch: ...` failure — which makes Step 2's expected-failure line wrong in practice.

### Fix

Replace the Step 1 code block body so the `const expectedDescription =` line is restored. The final code block should read exactly:

```ts
test("delete_edge.kind schema is a union of VALID_EDGE_KINDS with enumerating description", async () => {
  const tools = await registered();
  const del = tools.find((t) => t.name === "delete_edge");
  if (!del) throw new Error("delete_edge tool not registered");
  const kind = del.parameters?.properties?.kind;
  if (!kind) throw new Error("delete_edge.kind schema missing");

  const expectedDescription =
    'Edge kind. Allowed values: "calls", "imports", "implements", "extends", "tested_by", "co_changes_with", "renders", "routes_to".';
  if (kind.description !== expectedDescription) {
    throw new Error(`delete_edge.kind description mismatch: ${kind.description}`);
  }

  const literals: unknown[] = Array.isArray(kind.anyOf) ? kind.anyOf.map((x: any) => x.const) : [];
  if (JSON.stringify(literals) !== JSON.stringify(VALID_EDGE_KINDS)) {
    throw new Error(`delete_edge.kind literals do not match VALID_EDGE_KINDS: ${JSON.stringify(literals)}`);
  }
});
```

(Same shape as the Task 2 block, just the symbol name changed from `resolve` to `del` and the tool name from `"resolve_edge"` to `"delete_edge"`.)

### Implementation note

Use `edit` with `replace_lines` between the `` ```ts `` anchor at line 26 and the closing `` ``` `` anchor at line 42 to replace the whole code block at once, so no stray blank-line collapsing happens. Verify with `bash awk 'NR>=26 && NR<=44 { printf "%d:%s\\n", NR, $0 }' .megapowers/plans/067-align-tool-schemas-docs-and-validators-f/tasks/task-003.md` after the edit that `const expectedDescription =` is present and followed on the next line by the string literal.

### Nothing else changes

- The frontmatter, dependencies (`depends_on: [2]`), files_to_modify (`src/index.ts`, `src/tools/delete-edge.ts`, `test/closed-enum-schemas.test.ts`), and AC coverage (AC 4, AC 5, AC 14) are all correct.
- Step 2's expected failure (`delete_edge.kind description mismatch: Edge kind (calls, imports, implements, extends, ...)`) stays accurate once the `const expectedDescription =` line is restored.
- Steps 3, 4, 5 are fine as written.

---

## Tasks 1, 2, 4, 5, 6, 7, 8, 9, 10, 11

All good — no changes required. In particular, Task 2's Step 1 code block has the same minor "no blank line between `import` and `test(`" cosmetic, but the code is still syntactically valid and copy-pasteable (an import statement followed immediately by a `test(...)` call is valid TypeScript). Leave Task 2 as is unless you want to re-insert the blank line for readability.
