# pi-codegraph — Architecture

## System Overview

```
┌──────────────────────────────────────────────────────────┐
│                      pi extension                         │
│                                                           │
│  Tools: symbol_graph | trace | impact | graph_query |     │
│         resolve_edge                                      │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                  Output Layer                        │  │
│  │        Hashline-anchored results on every node       │  │
│  └──────────────────────┬──────────────────────────────┘  │
│                         │                                  │
│  ┌──────────────────────▼──────────────────────────────┐  │
│  │                  Query Engine                        │  │
│  │     Cypher queries against the graph store           │  │
│  │     Result ranking / truncation for token budget     │  │
│  └──────────────────────┬──────────────────────────────┘  │
│                         │                                  │
│  ┌──────────────────────▼──────────────────────────────┐  │
│  │                  Graph Store                         │  │
│  │              KuzuDB or SQLite+CTE                    │  │
│  │                                                      │  │
│  │  Nodes: Function | Class | Interface | Module |      │  │
│  │         Endpoint | Test                              │  │
│  │                                                      │  │
│  │  Edges: calls | imports | implements | extends |     │  │
│  │         type_depends | tested_by | co_changes_with   │  │
│  │                                                      │  │
│  │  Every edge: { source, confidence, evidence, hash }  │  │
│  └──────────────────────┬──────────────────────────────┘  │
│                         │                                  │
│  ┌──────────────────────▼──────────────────────────────┐  │
│  │               Indexing Pipeline                      │  │
│  │                                                      │  │
│  │  ┌───────────┐ ┌─────────┐ ┌──────────────────────┐ │  │
│  │  │Layer 1    │ │Layer 2  │ │Layer 3               │ │  │
│  │  │tree-sitter│ │LSP      │ │Framework rules       │ │  │
│  │  │+ imports  │ │resolve  │ │(ast-grep patterns)   │ │  │
│  │  └───────────┘ └─────────┘ └──────────────────────┘ │  │
│  │  ┌───────────┐ ┌─────────────────────────────────┐  │  │
│  │  │Layer 4    │ │Layer 5                           │  │  │
│  │  │Test       │ │Co-change                         │  │  │
│  │  │coverage   │ │(git log)                         │  │  │
│  │  └───────────┘ └─────────────────────────────────┘  │  │
│  │  ┌───────────────────────────────────────────────┐  │  │
│  │  │Agent-resolved edges (via resolve_edge tool)   │  │  │
│  │  └───────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Indexing Pipeline

Indexing happens in stages. Each stage is independent and can run incrementally.

### Stage 1: Structure Extraction (tree-sitter)

Parse every source file with tree-sitter. Extract:
- Function declarations (name, params, return type, line range)
- Class declarations (name, methods, properties, line range)
- Interface/type declarations
- Import/export statements
- Direct function calls (caller → callee by name)

This produces the node set and a first pass of edges (imports, direct calls by name).

**Input:** Source files  
**Output:** Nodes + `tree-sitter` edges  
**Speed:** Fast. Seconds for a medium project.

### Stage 2: Semantic Resolution (LSP)

For each unresolved reference from Stage 1, query the language server:
- Go-to-definition: resolve which symbol a call actually targets
- Find-references: discover callers that tree-sitter's name matching missed
- Type resolution: understand interface implementations, generic instantiations

This upgrades `tree-sitter` edges to `lsp` edges (higher confidence) and discovers new edges that name-matching alone couldn't find.

**Input:** Unresolved references from Stage 1  
**Output:** Upgraded edges + new `lsp` edges  
**Speed:** Slower. Requires language server startup. Run lazily or as background process.

### Stage 3: Framework Rules (ast-grep)

Run ast-grep patterns defined in rule files against the codebase. Each pattern match produces a graph edge.

Example rules:
```yaml
- name: express-route
  pattern: "app.$METHOD($PATH, $$$HANDLERS)"
  lang: typescript
  produces:
    edge_type: route
    from_capture: HANDLERS
    to_template: "endpoint:{METHOD}:{PATH}"

- name: react-render
  pattern: "<$COMPONENT $$$PROPS />"
  lang: tsx
  produces:
    edge_type: renders
    from_context: enclosing_function
    to_capture: COMPONENT
```

**Input:** Rule files + source files  
**Output:** `framework-rule` edges  
**Speed:** Fast. ast-grep is already in the stack.

### Stage 4: Test Coverage

When tests are run with coverage instrumentation, collect V8 coverage data and map executed functions back to graph nodes.

```
NODE_V8_COVERAGE=./coverage npm test
```

Parse the coverage JSON. For each test file:
- Identify which test case triggered which functions
- Create `tested_by` edges from functions to tests
- Create `co_executes` edges between functions that run in the same test
- For tests associated with endpoints/routes, build trace paths

**Input:** V8 coverage JSON + test file structure  
**Output:** `test-coverage` edges + trace paths  
**Speed:** Depends on test suite. Runs when tests run, not at index time.

### Stage 5: Co-Change Analysis (git)

Analyze git history for correlated changes.

```
git log --format="%H" --since="6 months" | while read hash; do
  git diff-tree --no-commit-id --name-only -r $hash
done
```

Build co-change frequency matrix at the symbol level (using file-level as a proxy, refined by symbol line ranges within changed files). Symbols that change together in >60% of commits where either changes get a `co_changes_with` edge.

**Input:** Git log  
**Output:** `co-change` edges (low confidence)  
**Speed:** Seconds. One-time scan, incremental updates.

### Incremental Updates

On subsequent runs, only re-index what changed:

1. `git diff` since last index → changed files
2. Re-run Stage 1 for changed files → update nodes and edges
3. For each updated node, invalidate edges whose `valid_until` hash no longer matches
4. Re-run Stage 2 lazily for newly unresolved references
5. Re-run Stage 3 for changed files
6. Stage 4 updates next time tests run
7. Stage 5 updates from new commits

Content hashes on every node determine staleness. If a file hasn't changed, its nodes and edges are still valid.

## Graph Store

### Option A: SQLite + Recursive CTEs

**Pros:**
- Zero dependencies. SQLite is everywhere.
- Recursive CTEs handle multi-hop traversals (2-3 hops covers 90% of queries)
- Simple schema: `nodes` table, `edges` table, indexed appropriately
- Easy to inspect, debug, backup

**Cons:**
- Complex graph patterns (variable-length paths with filters) get awkward in SQL
- No native Cypher — `graph_query` would need a Cypher-to-SQL translator or accept raw SQL

**Schema sketch:**
```sql
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,          -- "src/auth.ts::validateToken"
  kind TEXT NOT NULL,            -- function, class, interface, module, endpoint, test
  name TEXT NOT NULL,
  file TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  content_hash TEXT NOT NULL     -- for staleness detection
);

CREATE TABLE edges (
  id INTEGER PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES nodes(id),
  to_id TEXT NOT NULL REFERENCES nodes(id),
  edge_type TEXT NOT NULL,       -- calls, imports, implements, etc.
  source TEXT NOT NULL,          -- lsp, tree-sitter, test-coverage, etc.
  confidence REAL NOT NULL,
  evidence TEXT,                 -- for agent-resolved edges
  content_hash TEXT,             -- hash of source files at time of creation
  created_at TEXT NOT NULL
);

CREATE INDEX idx_edges_from ON edges(from_id);
CREATE INDEX idx_edges_to ON edges(to_id);
CREATE INDEX idx_edges_type ON edges(edge_type);
CREATE INDEX idx_nodes_file ON nodes(file);
CREATE INDEX idx_nodes_name ON nodes(name);
```

### Option B: KuzuDB (embedded graph database)

**Pros:**
- Native Cypher support — `graph_query` passes through directly
- Purpose-built for graph traversal, faster for complex patterns
- Embedded, no server — same local-first philosophy
- Handles variable-length path queries naturally

**Cons:**
- Additional native dependency
- Less portable than SQLite
- Smaller ecosystem, less tooling for inspection/debugging

### Decision

**Start with SQLite.** It's simpler, dependency-free, and sufficient for the v1 query patterns (1-3 hop traversals, symbol neighborhood lookups). If `graph_query` needs complex pattern matching that SQLite can't handle elegantly, migrate to KuzuDB. The graph model is the same either way — only the query engine changes.

## Output Layer

Every tool response passes through the output layer before returning. It does two things:

### 1. Hashline Anchoring

For every node in a result, read the current file content and produce the hashline anchor for the node's line range. This means results are always fresh — if a file changed since indexing, the anchors reflect the current state (and stale edges are flagged).

### 2. Token Budget Management

Large neighborhoods (symbol with 40+ callers) can't dump everything into context. The output layer ranks and truncates:

- **Ranking factors:** Edge confidence, recency of change, test coverage, call frequency
- **Default behavior:** Return top N results per category (callers, callees, etc.) with a count of omitted results
- **Override:** `limit` parameter on all tools for explicit control

## File Layout

```
pi-codegraph/
├── src/
│   ├── index.ts                 # pi extension entry point
│   ├── tools/
│   │   ├── symbol-graph.ts      # symbol_graph tool
│   │   ├── trace.ts             # trace tool
│   │   ├── impact.ts            # impact tool
│   │   ├── graph-query.ts       # graph_query tool
│   │   └── resolve-edge.ts      # resolve_edge tool
│   ├── indexer/
│   │   ├── pipeline.ts          # orchestrates indexing stages
│   │   ├── tree-sitter.ts       # Stage 1: structure extraction
│   │   ├── lsp.ts               # Stage 2: semantic resolution
│   │   ├── framework-rules.ts   # Stage 3: ast-grep pattern matching
│   │   ├── test-coverage.ts     # Stage 4: V8 coverage → edges
│   │   └── co-change.ts         # Stage 5: git history analysis
│   ├── graph/
│   │   ├── store.ts             # graph store abstraction
│   │   ├── sqlite.ts            # SQLite implementation
│   │   ├── queries.ts           # common graph queries
│   │   └── types.ts             # node, edge, provenance types
│   ├── output/
│   │   ├── anchoring.ts         # hashline anchor generation
│   │   └── ranking.ts           # result ranking and truncation
│   └── rules/
│       ├── express.yaml         # Express framework rules
│       ├── react.yaml           # React framework rules
│       └── nestjs.yaml          # NestJS framework rules
├── test/
├── VISION.md
├── PRD.md
├── ARCHITECTURE.md
└── ROADMAP.md
```

## Dependencies

- **tree-sitter** + **tree-sitter-typescript** — AST parsing (already used by hashline-readmap)
- **typescript** (tsserver) — LSP for Stage 2. Spawned as child process, not a library dep.
- **better-sqlite3** (or bun:sqlite) — Graph store
- **ast-grep** — Framework rule matching (CLI, already in the stack)

No embedding models. No vector stores. No external servers.
