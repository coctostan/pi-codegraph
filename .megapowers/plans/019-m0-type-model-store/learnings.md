# Learnings: 019-m0-type-model-store

- **`@ts-expect-error` is the right tool for negative type tests.** Placing `@ts-expect-error` before an intentionally invalid assignment means `tsc` will *fail* if the type is ever widened (because the directive becomes unused). This gives compile-time regression protection that a runtime test can never provide — it's worth the pattern's unusual look.

- **Naming the provenance column `provenance_source` (not `provenance`) matters.** The spec says `Provenance` is a structured object, but storing it as a JSON blob in SQLite would make it opaque to future queries. Flattening to `provenance_source`, `confidence`, `evidence`, `content_hash` columns keeps every field filterable; this makes the M3 "filter by provenance source" requirement a simple `WHERE` clause rather than a JSON extraction.

- **The edge PRIMARY KEY `(source, target, kind, provenance_source)` encodes a semantic decision.** Allowing the same A→B call edge to exist once per provenance source means tree-sitter and LSP can both record it independently without conflicts. A narrower PK `(source, target, kind)` would force a "last write wins" merge policy, losing the provenance diversity the model was designed to carry.

- **`deleteFile` must cascade to *both* sides of an edge.** It's obvious that edges *sourced* in the deleted file should go. Less obvious: edges *targeting* the deleted file from other files should also go, because the target node no longer exists and the edge would become a dangling reference. The `OR target IN (SELECT id FROM nodes WHERE file = ?)` clause in the DELETE is easy to forget and hard to test without a multi-file scenario — the test deliberately sets up that exact scenario.

- **Row-mapping duplication accumulates quietly.** `getNode`, `getNodesByFile`, and `fetchNeighborRows` each independently extract the same seven `GraphNode` fields from a DB row. For M0 this is tolerable, but when the next field is added to `GraphNode`, all three sites must be updated in sync. A private `rowToNode()` helper should be extracted as soon as the first new field is added — not before, to avoid YAGNI.

- **`bun:sqlite`'s `db.transaction()` API exists and should be preferred.** The `deleteFile` method uses manual `BEGIN`/`COMMIT`/`ROLLBACK` via `db.exec()`, which works but is more verbose and doesn't protect against nested-transaction misuse the way `db.transaction()` does. Future transactional methods should adopt `db.transaction()` as the default pattern.

- **Compile-time type files (`.typecheck.ts`) should be separate from runtime test files.** `graph-types.typecheck.ts` is included in `tsc --noEmit` for compile-time checks but is NOT picked up by `bun test` (which only runs `*.test.ts`/`*.spec.ts`). This separation means the file can contain `@ts-expect-error` patterns and top-level side-effect assertions (the `nodeId` equality check) without polluting the test runner's output or count.
