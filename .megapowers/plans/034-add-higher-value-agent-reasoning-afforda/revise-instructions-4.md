## Task 2: Persist `is_exported` in SQLite nodes

Step 2's expected failure message is inaccurate.

Current Step 1 runs this assertion first:
```ts
expect(store.getNode(node.id)).toEqual(node);
```
Before the implementation in Step 3, `src/graph/sqlite.ts` does **not** persist or hydrate `is_exported`, so the test will fail on the `toEqual(...)` assertion **before** it reaches the later `PRAGMA table_info(nodes)` check.

The current Step 2 text:
```md
Expected: FAIL — `Expected: true` / `Received: false`
```
points at the second assertion and does not match the first actual failure.

Update Step 2 so it describes the real first failure from the runner: the received node is missing `is_exported: true` when compared with `node`.

Use wording like:
```md
Expected: FAIL — the `expect(store.getNode(node.id)).toEqual(node)` assertion fails because the hydrated node omits `is_exported` (expected `is_exported: true`, received no `is_exported` field / `undefined`).
```

Do not change the test code or implementation for this task; only fix the Step 2 expected failure description so it matches the actual pre-implementation failure.
