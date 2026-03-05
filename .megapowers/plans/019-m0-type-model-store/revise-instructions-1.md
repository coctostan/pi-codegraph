## Task 1: Type model: NodeKind, EdgeKind, ProvenanceSource, GraphNode, GraphEdge, nodeId

This task fails TDD completeness and self-containment. It must use 5 explicit steps with concrete code and commands.

### Required fixes

1. **Step 1 must include full test code** in `test/graph-types.typecheck.ts` (not a description).
   - Include positive assignments for `GraphNode`, `GraphEdge`, and `Provenance` with all required fields.
   - Include negative compile assertions using `// @ts-expect-error` for invalid `NodeKind`, `EdgeKind`, and `ProvenanceSource`.
   - Include `nodeId('src/a.ts', 'foo', 10)` equality assertion.

2. **Step 2 must include exact command and expected failure text**.
   - Command: `bun run check`
   - Expected RED text must include at least one deterministic compile error, e.g.:
     - `Unused '@ts-expect-error' directive.` (from current broad `string` kinds)
     - `Object literal may only specify known properties, and 'start_line' does not exist in type 'GraphNode'.`

3. **Step 3 must include the full implementation code** for `src/graph/types.ts` (complete file content, not bullets).

4. **Step 4 must re-run the same command**:
   - Command: `bun run check`
   - Expected: PASS (exit code 0)

5. **Step 5 must run full suite**:
   - Command: `bun test && bun run check`
   - Expected: all passing

---

## Task 2: GraphStore interface: NeighborOptions, NeighborResult, all method signatures

This task is missing required files and full 5-step TDD detail.

### Required fixes

1. Add `test/graph-types.typecheck.ts` to `files_to_modify` (Step 1 says this file is edited, but metadata omits it).

2. **Step 1 must include full compile-time test code** that verifies `GraphStore` requires all 9 methods.
   - Use a concrete `const _store: GraphStore = { ... }` object in `test/graph-types.typecheck.ts`.
   - Add `// @ts-expect-error` with missing methods to force deterministic RED on current empty interface.

3. **Step 2 exact command + expected RED**:
   - Command: `bun run check`
   - Expected text should include `Unused '@ts-expect-error' directive.` (because empty interface currently accepts too much)

4. **Step 3 must include full implementation code** for `src/graph/store.ts`.
   - Must import `GraphNode`, `GraphEdge`, `EdgeKind` from `./types.js`
   - Must export `NeighborOptions`, `NeighborResult`, and `GraphStore` with exact signatures from spec AC 11–21

5. **Step 4/5 commands required**:
   - Step 4: `bun run check` → PASS
   - Step 5: `bun test && bun run check` → all passing

---

## Task 3: SqliteGraphStore: schema init, addNode/getNode, addEdge/getNeighbors, getNodesByFile

This task is too broad (granularity) and not executable as written.

### Required fixes

1. **Split this task into smaller tasks** so each task is one test + one implementation behavior.
   - Minimum split:
     - Task 3a: schema init + constructor default + `schema_version`
     - Task 3b: `addNode` / `getNode` (+ upsert + unknown null)
     - Task 3c: `addEdge` / `getNeighbors` (direction + kind filters + default both)
     - Task 3d: `getNodesByFile`

2. For each resulting task, enforce **5-step TDD** with:
   - Step 1: full test code
   - Step 2: exact command + expected RED message
   - Step 3: full implementation code snippet (actual SQL + TS, not bullet list)
   - Step 4: same command + PASS
   - Step 5: `bun test && bun run check`

3. **AC 23 coverage gap**: explicitly add a type-check step for `SqliteGraphStore implements GraphStore`.
   - `bun test` alone is insufficient for TS structural guarantees.
   - Add compile check in Step 5 or dedicated compile assertion in typecheck file.

4. Use actual Bun SQLite API in snippets:
   - `import { Database } from 'bun:sqlite'`
   - `db.query(...).run/get/all`
   - Do not reference `better-sqlite3` APIs.

---

## Task 4: SqliteGraphStore: deleteFile, setFileHash/getFileHash, close + persistence

This task is also too broad and not fully executable.

### Required fixes

1. **Split into smaller tasks** (one behavior per task):
   - Task 4a: `deleteFile` node + edge invalidation behavior
   - Task 4b: `getFileHash`/`setFileHash` behavior
   - Task 4c: `close()` + reopen persistence behavior

2. For each resulting task, provide **full 5-step TDD** with exact commands and expected outputs.

3. For persistence tests, include deterministic filesystem setup in test code:
   - Use a temp DB path (e.g., under `test/tmp/` with unique filename)
   - Ensure cleanup (`rmSync`) in `finally`
   - Verify data after close/reopen using a second `SqliteGraphStore` instance at same path

4. For `deleteFile`, Step 3 implementation must include the exact SQL transaction order:
   - delete edges touching nodes from file (source OR target)
   - delete nodes from file
   - delete file hash row

5. Step 5 must include both runtime and compile checks:
   - `bun test && bun run check`
