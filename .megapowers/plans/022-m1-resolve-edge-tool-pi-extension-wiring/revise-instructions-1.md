## Task 1: resolveEdge returns error when source symbol not found

Step 2 expected failure is vague and currently incorrect.

- Current text: `TypeError: resolveEdge is not a function (or similar)`
- Actual deterministic failure with current stub (`export function resolveEdge(): void {}`) is an assertion failure because `result` is `undefined`.

Use this exact expectation in Step 2:

`Expected: FAIL — expect(received).toContain(expected) (received is undefined)`

Also remove `or similar` language from Step 2.

---

## Task 6: resolveEdge creates edge with agent provenance and confirmation

Task 7 is currently a no-op because Task 6 already implements created/updated detection. Split responsibilities so Task 7 has a real RED→GREEN cycle.

Update Task 6 scope to AC 7, AC 8, and the **created** confirmation path only.

In Step 3, remove the pre-check/action branch from Task 6:

```ts
// remove from Task 6
const existingNeighbors = store.getNeighbors(sourceNode.id, { direction: "out", kind });
const existed = existingNeighbors.some(
  (nr) => nr.edge.target === targetNode.id && nr.edge.provenance.source === "agent"
);
...
const action = existed ? "updated" : "created";
```

Replace with fixed created status in Task 6:

```ts
const action = "created";
```

This makes Task 7 meaningful and deterministic.

---

## Task 7: resolveEdge upserts same source→target→kind agent edge

This task is currently not TDD-complete (Step 2 says it may pass, Step 3 has no code changes).

### Required changes

1. Add `src/tools/resolve-edge.ts` to `files_to_modify` in frontmatter.
2. Step 2 must specify a deterministic failing output.
3. Step 3 must include concrete implementation code.

### Step 2 expected failure
After revising Task 6 as above, use:

`Expected: FAIL — second call still returns "created" instead of "updated"`

### Step 3 implementation (add update detection)

```ts
const existingNeighbors = store.getNeighbors(sourceNode.id, { direction: "out", kind });
const existed = existingNeighbors.some(
  (nr) => nr.edge.target === targetNode.id && nr.edge.provenance.source === "agent"
);

store.addEdge({
  source: sourceNode.id,
  target: targetNode.id,
  kind,
  provenance: {
    source: "agent",
    confidence: 0.7,
    evidence,
    content_hash: contentHash,
  },
  created_at: Date.now(),
});

const action = existed ? "updated" : "created";
```

---

## Task 8: deleteFile preserves agent edges while removing non-agent edges

Granularity is too broad (two separate tests in one task). Keep this task to one test + one implementation.

### Required changes

- Replace the two test blocks with a single test that asserts both AC11 and AC12 in one flow.
- Keep one run command in Step 2 (`bun test test/graph-store-delete-agent-edges.test.ts`) with a single expected failing message.

You can still assert both node/hash deletion and agent-edge preservation in one test, but remove the second standalone test function.

---

## Task 10: Pi extension registers symbol_graph tool with TypeBox schema

Task 10 currently implements AC14, AC15, AC16, AC17, AC18, and AC19 at once, which breaks dependency layering and makes Tasks 11–13 no-op.

### Required changes

Scope Task 10 to **AC14 only** (symbol_graph registration + schema shape). Do not register `resolve_edge` in Task 10.

In Step 3, only include:

- `pi.registerTool({ name: "symbol_graph", parameters: Type.Object(...) ... })`
- schema assertions needed by Task 10 test

Do **not** include full store lifecycle wiring in this task.

---

## Task 11: Pi extension registers resolve_edge tool with TypeBox schema

Task 11 currently has no implementation step.

### Required changes

- Step 2 must be deterministic (no "may already pass" wording).
- Step 3 must include full registration code for `resolve_edge`.

Use this Step 3 shape:

```ts
pi.registerTool({
  name: "resolve_edge",
  label: "Resolve Edge",
  description: "Create an edge in the symbol graph with evidence",
  parameters: Type.Object({
    source: Type.String(),
    target: Type.String(),
    kind: Type.String(),
    evidence: Type.String(),
    sourceFile: Type.Optional(Type.String()),
    targetFile: Type.Optional(Type.String()),
  }),
  async execute() {
    return { content: [{ type: "text", text: "not implemented" }], details: undefined };
  },
});
```

(Execution behavior is finalized in later tasks.)

---

## Task 12: Extension auto-indexes when store is empty and shares singleton store

Current Task 12 does not prove singleton identity, and Step 2 is not deterministic.

### Required test changes

1. Keep auto-index test, but keep failure expectation specific.
2. Add a singleton identity assertion by exposing a test hook.

Add to `src/index.ts` in Step 3:

```ts
let sharedStore: GraphStore | null = null;

export function getSharedStoreForTesting(): GraphStore | null {
  return sharedStore;
}

export function resetStoreForTesting(): void {
  if (sharedStore) sharedStore.close();
  sharedStore = null;
}
```

In test Step 1 (singleton case), assert identity across calls:

```ts
await sgExecute!(...);
const first = mod.getSharedStoreForTesting();
await reExecute!(...);
const second = mod.getSharedStoreForTesting();
expect(second).toBe(first);
```

### Required implementation change for AC17 correctness

Call `listFiles()` check at execution time before running each tool, not only once at store creation:

```ts
function ensureIndexed(projectRoot: string, store: GraphStore): void {
  if (store.listFiles().length === 0) {
    indexProject(projectRoot, store);
  }
}
```

Use `ensureIndexed(...)` inside both tool execute handlers.

---

## Task 13: Extension tool execute returns AgentToolResult with text content

Task 13 is currently a validation-only/no-op task (Step 2 says may pass; Step 3 has no code).

### Required changes

Make Task 13 a true RED→GREEN task by checking **exact** AgentToolResult shape for both tools and implementing any missing return-shape details.

Step 1 should assert:

```ts
expect(result).toEqual({
  content: [{ type: "text", text: expect.any(String) }],
  details: undefined,
});
```

Use this for both `symbol_graph` and `resolve_edge` execute results.

Step 2 must specify a deterministic failure (e.g., missing `details: undefined` or wrong `content` shape), and Step 3 must include concrete `src/index.ts` return object updates if needed.

If AC19 is fully implemented in earlier tasks after revision, then remove this task and fold its assertions into Tasks 10/11 with explicit notes in plan coverage.