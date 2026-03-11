# Reproduction: Stale persisted graph not refreshed on tool invocation

## Steps to Reproduce
1. Build an index for a TypeScript project (creates `.codegraph/graph.db` with file hashes and symbol nodes)
2. Modify a source file (e.g., prepend 3 comment lines to `src/graph/store.ts`, shifting all line numbers by 3)
3. Invoke any tool (e.g., `symbol_graph(name: "GraphStore", file: "src/graph/store.ts")`) — the tool calls `ensureIndexed()` internally
4. Observe that results contain stale line numbers marked `[stale]` instead of refreshed current anchors

## Expected Behavior
On tool invocation, `ensureIndexed()` should detect that tracked files have changed (via SHA-256 content hashes) and re-index them before returning results. The `indexProject()` function already has incremental change detection built in — it just needs to be called.

## Actual Behavior
`ensureIndexed()` guards on `store.listFiles().length === 0`, meaning it only indexes an **empty** database. Once a `.codegraph/graph.db` exists with any indexed files, subsequent changes are never picked up — tools return stale anchors with `[stale]` markers indefinitely.

**Pre-fix code** (commit `45765877`):
```typescript
async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  if (store.listFiles().length === 0) {
    await indexProject(projectRoot, store);
  }
}
```

**Fix** (commit `2b4c5693`):
```typescript
async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  await indexProject(projectRoot, store);
}
```

## Evidence

Ran a script that: (1) indexes, (2) modifies a file, (3) queries without re-indexing, (4) re-indexes then queries:

```
=== INITIAL (correct) ===
Anchor: src/graph/store.ts:30

store.listFiles().length = 22 (> 0 => old code skips)

=== STALE (old bug, no re-index) ===
Anchor: src/graph/store.ts:30
Contains [stale]: true

=== REFRESHED (after re-index) ===
Anchor: src/graph/store.ts:33
Contains [stale]: false

=== SUMMARY ===
Initial: src/graph/store.ts:30
Stale (no re-index): src/graph/store.ts:30 [stale]=true
Fixed (re-indexed): src/graph/store.ts:33 [stale]=false
```

After prepending 3 lines, `GraphStore` moved from line 30 → 33. Without re-indexing, the old anchor (line 30) is returned with a `[stale]` marker. After re-indexing, the correct anchor (line 33) is returned with no stale marker.

## Environment
- macOS arm64, Bun v1.3.9
- pi-codegraph on branch `fix/029-auto-refresh-stale-persisted-graph-on-to`
- Bug present at commit `45765877` (M5 feat), fixed at `2b4c5693`

## Failing Test
Already exists: `test/extension-stale-db-refresh.test.ts`

The test:
1. Copies `src/` to a tmpdir, indexes via the extension's `symbol_graph` tool
2. Prepends 3 lines to `src/graph/store.ts` to shift line numbers
3. Resets the store singleton, re-registers tools, calls `symbol_graph` again
4. Asserts the result contains `src/graph/store.ts:33:` (shifted) and does NOT contain `[stale]`

```
bun test test/extension-stale-db-refresh.test.ts
# 1 pass, 0 fail, 1.77s
```

This test passes with the fix applied (current code).

## Reproducibility
Always — 100% reproducible whenever a `.codegraph/graph.db` exists and source files have changed since the last index.

## Root Cause (brief)
The `store.listFiles().length === 0` guard in `ensureIndexed()` was intended as an optimization to skip indexing on an already-indexed project, but it prevents the incremental hash-based change detection in `indexProject()` from ever running on an existing database.
