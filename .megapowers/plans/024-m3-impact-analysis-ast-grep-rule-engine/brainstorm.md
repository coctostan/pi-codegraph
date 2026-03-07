# Brainstorm: M3 — `impact` tool + ast-grep rule engine

## Approach

The `impact` tool performs a BFS traversal of inbound `calls` edges starting from the changed symbols. The caller provides `changeType` (one of `signature_change`, `removal`, `behavior_change`, `addition`) — no signature introspection, the agent already knows what kind of change happened. Depth-1 callers of a `signature_change` or `removal` are classified `breaking`; depth > 1 become `behavioral`. `behavior_change` makes all depths `behavioral`. `addition` short-circuits entirely (nothing calls a new symbol yet). Every result in the output carries its actual hop depth, a visited set prevents cycles, and `maxDepth` (default 5) bounds the traversal.

The ast-grep Stage 3 indexer slots into the existing pipeline after tree-sitter. Rules are loaded from two sources: bundled YAMLs at `src/rules/express.yaml` and `src/rules/react.yaml`, plus user-defined rules from `.codegraph/rules/*.yaml` at the project root. Incrementality follows the same hash-based pattern as tree-sitter: determine which files changed, delete their existing `ast-grep` edges, then invoke `sg run` with an explicit file list per rule pattern. The rule schema supports two edge sources — a named capture variable (`from_capture: HANDLER`) or the enclosing function resolved by position lookup in the graph store (`from_context: enclosing_function`) — and two edge targets — another capture variable (`to_capture: COMPONENT`) or a synthetic endpoint node constructed from a template string (`to_template: "endpoint:{METHOD}:{path}"`). Endpoint nodes get IDs like `endpoint:GET:/api/users`, consistent with what M4's `trace` tool will query.

The subprocess boundary is one thin function: `runScan(pattern, lang, files): Promise<SgMatch[]>`. Everything else — rule loading, match processing, graph writes — is pure TypeScript, easy to test without spawning a real process.

## Key Decisions

- **Caller-specified changeType**: No signature storage needed in M3. The agent provides the change type.
- **Depth shown per result**: `behavioral depth:4` and `behavioral depth:2` are meaningfully different signals. Costs nothing to expose.
- **`addition` short-circuits**: No traversal — a new symbol has no callers yet. Safe by definition.
- **subprocess `sg run`**: Zero new native deps. Thin `runScan()` boundary is straightforward to mock in tests.
- **Per-file incremental for ast-grep**: Delete `ast-grep` edges for changed files, pass only changed files to `sg run`. Consistent with tree-sitter's hash-based approach.
- **`from_context: enclosing_function` via graph store**: Match position → query for a function node in that file whose `line_start ≤ match_line ≤ line_end`. No special ast-grep support required.
- **Endpoint node ID**: `endpoint:{METHOD}:{path}` (e.g. `endpoint:GET:/api/users`). Human-readable, unique, directly consumable by M4 trace.
- **User rules**: `.codegraph/rules/*.yaml` at project root — conventional, discoverable.

## Classification Matrix

| `changeType`       | depth = 1   | depth > 1   |
|--------------------|-------------|-------------|
| `signature_change` | breaking    | behavioral  |
| `removal`          | breaking    | behavioral  |
| `behavior_change`  | behavioral  | behavioral  |
| `addition`         | *(no traversal — short-circuit, return empty)* | — |

## Components

- `src/tools/impact.ts` — new `impact` tool (BFS + classification + anchored output)
- `src/indexer/ast-grep.ts` — new Stage 3 indexer (rule loading, `runScan`, match → graph ops)
- `src/rules/express.yaml` — bundled Express route patterns
- `src/rules/react.yaml` — bundled React render patterns
- `src/indexer/pipeline.ts` — add Stage 3 invocation after tree-sitter
- `src/graph/types.ts` — add `"ast-grep"` as edge source, `"endpoint"` as node kind, `"routes_to"` / `"renders"` as edge kinds if not already present

## Rule Schema

```yaml
# bundled example: express.yaml
- name: express-route
  pattern: "$APP.$METHOD($PATH, $$$HANDLERS)"
  lang: typescript
  produces:
    edge_kind: routes_to
    from_capture: HANDLERS        # each matched handler gets an edge
    to_template: "endpoint:{METHOD}:{PATH}"
    confidence: 0.9

# bundled example: react.yaml
- name: react-render-self-closing
  pattern: "<$COMPONENT $$$PROPS />"
  lang: tsx
  produces:
    edge_kind: renders
    from_context: enclosing_function   # resolved via graph store by line position
    to_capture: COMPONENT
    confidence: 0.8
```

## Testing Strategy

**`impact` tool:**
- Unit-test BFS traversal with a mock store — no SQLite needed, just an in-memory adjacency map
- Test classification matrix: each `changeType` × each depth combination
- Test cycle detection: A → B → C → A doesn't hang
- Test `addition` returns empty result immediately
- Test `maxDepth` bounds the traversal

**ast-grep indexer:**
- Unit-test rule loading: valid YAML, missing fields, unknown fields, user rules merged with bundled
- Unit-test match processing with fixture JSON (the `SgMatch[]` shape `sg` produces) — no subprocess needed
- Unit-test enclosing function lookup: given a line number, returns the right graph node
- Integration test: real `sg` binary + fixture `.ts` file with an Express route → correct endpoint node + `routes_to` edge in store
- Integration test: real `sg` binary + fixture `.tsx` file with a React render → correct `renders` edge in store

**Incremental correctness:**
- Test that re-running on an unchanged file doesn't duplicate edges
- Test that modifying a file deletes old ast-grep edges and re-creates correct ones
