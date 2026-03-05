# pi-codegraph — Product Requirements

## Overview

pi-codegraph is a code intelligence engine that builds a symbol-level graph of a codebase and exposes it through agent-optimized tools. It is a pi extension providing 5 tools: `graph_query`, `symbol_graph`, `impact`, `trace`, and `resolve_edge`.

## Tools

### `symbol_graph`

The primary exploration tool. Given a symbol, return its full relationship neighborhood.

**Input:**
- `symbol` — Symbol name (e.g., `"validateToken"`) or anchored reference (`"src/auth.ts:22"`)
- `depth` — How many hops (default: 1)
- `direction` — `callers`, `callees`, `both` (default: `both`)

**Output:**
```
symbol: validateToken (function)
  src/auth.ts:20:a3f → src/auth.ts:35:b7c

callers [3]:
  src/middleware/auth.ts:14:c2d|  validateToken(req.headers.token)  [source: lsp]
  src/routes/login.ts:28:e4f|  const valid = validateToken(jwt)  [source: tree-sitter]
  src/routes/refresh.ts:15:g6h|  validateToken(refreshToken)  [source: test-coverage]

callees [2]:
  src/services/token.ts:42:i8j|  JwtTokenService.verify(token)  [source: agent-resolved]
  src/utils/crypto.ts:10:k0l|  decodeBase64(token.split('.')[1])  [source: lsp]

unresolved [0]
```

Every line is hashline-anchored. Every edge shows its provenance source.

### `trace`

Given an entry point, return the full execution path.

**Input:**
- `entry` — Function name, endpoint string (e.g., `"POST /api/login"`), or test name
- `max_depth` — Maximum call depth (default: 20)

**Output:**
```
trace: POST /api/login [source: test-coverage, test: "login returns JWT"]

1. src/routes/login.ts:25:a1b|  async function loginHandler(req, res)
2.   src/services/auth.ts:40:c3d|  validateCredentials(email, password)
3.     src/repo/user.ts:18:e5f|  UserRepo.findByEmail(email)
4.       src/db/pool.ts:55:g7h|  db.query("SELECT * FROM users WHERE email = $1", [email])
5.     src/utils/crypto.ts:30:i9j|  compareHash(password, user.passwordHash)
6.   src/services/token.ts:10:k1l|  JwtTokenService.sign({ userId: user.id })
7.     src/utils/crypto.ts:5:m3n|  encodeBase64(JSON.stringify(payload))
```

Ordered. Indented by call depth. Every hop anchored. If the trace was derived from test coverage, the test name is shown. If from static analysis, forks at interface boundaries are shown as branches.

### `impact`

Given a set of changes, return what breaks and what shifts.

**Input:**
- `symbols` — List of changed symbols (or `files` for file-level)
- `change_type` — `"signature_change"`, `"behavior_change"`, `"removal"`, `"addition"`

**Output:**
```
impact: validateToken [signature_change]

breaking [2]:
  src/middleware/auth.ts:14:c2d|  validateToken(req.headers.token)  [direct caller, arity mismatch]
  src/routes/login.ts:28:e4f|  const valid = validateToken(jwt)  [direct caller, arity mismatch]

behavioral [1]:
  src/routes/refresh.ts:15:g6h|  validateToken(refreshToken)  [direct caller, return type changed]

test_coverage:
  affected_tests: 4
  uncovered_callers: 0

safe [12 transitive dependents not shown — all indirect, no signature dependency]
```

Classified by risk. Anchored. Test coverage included.

### `graph_query`

Freeform graph traversal for power use cases.

**Input:**
- `query` — Cypher query or shorthand
- `limit` — Max results (default: 20)

**Examples:**
```
graph_query("functions calling db.query() that are reachable from route handlers")
graph_query("MATCH (f:Function)-[:CALLS*1..3]->(d:Function {name: 'db.query'}) RETURN f")
```

**Output:** Hashline-anchored nodes matching the query, with the edges that connect them.

Whether this accepts natural language shorthands or strict Cypher (or both) is a design decision for implementation. Cypher-only for v1 is fine.

### `resolve_edge`

Agent teaches the graph.

**Input:**
- `from` — Source symbol
- `to` — Target symbol  
- `edge_type` — `"calls"`, `"implements"`, `"delegates_to"`, etc.
- `evidence` — Anchored reference to where the agent found proof (e.g., `"src/container.ts:14:b7f — DI binding"`)

**Output:**
```
resolved: validateToken --[calls]--> JwtTokenService.verify
  evidence: DI binding at src/container.ts:14:b7f
  previous: UNRESOLVED (2 candidates)
  persisted: true
```

Cached permanently until the evidence file changes (detected by content hash or git diff).

## Graph Model

### Nodes
- **Function** — named functions, arrow functions, methods
- **Class** — class declarations
- **Interface** — interface/type declarations
- **Module** — file-level container
- **Endpoint** — HTTP routes, event handlers (derived from framework rules)
- **Test** — test cases (derived from test file structure)

### Edges
- `calls` — function A calls function B
- `imports` — module A imports from module B
- `implements` — class implements interface
- `extends` — class extends class
- `type_depends` — function/class uses type from another module
- `tested_by` — function is executed during test (from coverage)
- `co_changes_with` — symbols that frequently change together (from git)

### Edge Provenance
Every edge carries:
- `source` — how it was discovered (`lsp`, `tree-sitter`, `test-coverage`, `framework-rule`, `agent-resolved`, `co-change`)
- `confidence` — relative trust level
- `created_at` — when the edge was added
- `evidence` — for agent-resolved edges, the anchored reference to proof
- `valid_until` — content hash of source files; edge is stale when hash changes

## Non-Requirements (v1)

- No web UI
- No embedding/vector search
- No natural language query parsing (Cypher only for `graph_query`)
- No multi-language in v1 (TypeScript only)
- No MCP server (pi extension only; MCP adapter is a future concern)
- No real-time file watching (re-index on demand or via git diff)
