---
id: 79
type: bugfix
status: done
created: 2026-04-20T10:32:55.993Z
priority: 3
---
# trace: class entry points don't descend into methods — trace stops at the class node
## Problem

`trace("SqliteGraphStore")` returns a single-node trace:

```
src/graph/sqlite.ts:37:9c6d  SqliteGraphStore  class [leaf, untested]
```

A class is not a leaf in any useful sense — it has a constructor and multiple methods. An agent asking "what does SqliteGraphStore do?" via `trace` gets no useful execution path.

## Expected behaviour

When the entry symbol is a `class` node, `buildStaticTrace` (src/tools/trace.ts:38) should expand the trace to include:
1. The constructor (if present as a child node in the graph)
2. All public methods of the class as separate trace roots

OR — simpler path — when a class node has no inbound `calls` edges but has associated method nodes (same file, names matching `ClassName.methodName`), emit a note explaining what to query instead:

```
src/graph/sqlite.ts:37:9c6d  SqliteGraphStore  class
  → class entry: use symbol_graph to inspect methods, or trace a specific method (e.g. "SqliteGraphStore.addNode")
```

## Location

- `src/tools/trace.ts` — `buildStaticTrace` (line 38) — check if the starting node's `kind === "class"` and handle accordingly
- `src/graph/types.ts` — confirm the `GraphNode.kind` values include `"class"`

## Acceptance criteria

- `trace("SqliteGraphStore")` either expands into methods OR emits a helpful redirect message
- `trace("indexProject")` (non-class entry) is unaffected
- No infinite loops from self-referential class graphs
