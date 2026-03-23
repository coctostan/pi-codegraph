---
id: 38
type: bugfix
status: done
created: 2026-03-22T21:43:16.119Z
priority: 1
---
# Tools fail with "attempt to write a readonly database" when invoked via pi extension harness
All 5 codegraph tools (`symbol_graph`, `resolve_edge`, `impact`, `trace`, `graph_query`) are completely non-functional when called through pi's extension runtime. Every call fails with `attempt to write a readonly database`.

The tools work perfectly when invoked directly via `bun` against the same `.codegraph/graph.db` file (verified with 108 passing tests). The SQLite file is writable at the OS level (`chmod 644`, successful `sqlite3` writes from shell).

**Root cause:** Every tool's `execute()` handler in `src/index.ts` calls `ensureIndexed()`, which runs the full indexing pipeline (`indexProject`), which writes to the DB (addNode, addEdge, setFileHash, deleteFile). The pi extension harness appears to impose a read-only constraint on the filesystem or database that prevents these writes.

**Fix should accomplish one of:**
- Make `ensureIndexed()` gracefully skip indexing when the DB is read-only (read-only degraded mode — serve stale data rather than crash)
- Identify and resolve the pi harness constraint that makes the DB read-only
- Separate the "ensure indexed" write path from the "query" read path so tools can serve results from an existing DB without requiring write access

This is blocking — the tools are production-quality but entirely unusable in their intended runtime.
