# pi-codegraph — Product Requirements

## Overview

pi-codegraph is a code intelligence engine that builds a symbol-level graph of a codebase and exposes it through agent-optimized tools. It is a pi extension providing 3 read-only tools: `symbol_graph`, `impact` and `trace`. A new capability extends one of the three before it earns a tool of its own ([decision 0001](space/decisions/0001-three-tool-public-surface.md)).

The sample outputs below show each tool's shape, not its exact rendering; README.md shows the current anchor format (`path  LINE:HASH`). A lookup that resolves to no symbol, or to several, returns `isError: true` with the message and suggestions.

## Tools

### `symbol_graph`

The primary exploration tool. Given a symbol, return its compact card (signature, tests, key relationships, signals), with more on request.

**Input:**
- `name` — Symbol name (e.g., `"validateToken"`)
- `file` — Optional disambiguating file path
- `include` — Optional sections to append: `"neighborhood"` (full callers/callees/unresolved), `"contract"`, `"source"`

**Output:**
```
symbol: validateToken (function)
  src/auth.ts:20:a3f → src/auth.ts:35:b7c

callers [3]:
  src/middleware/auth.ts:14:c2d|  validateToken(req.headers.token)  [source: lsp]
  src/routes/login.ts:28:e4f|  const valid = validateToken(jwt)  [source: tree-sitter]
  src/routes/refresh.ts:15:g6h|  validateToken(refreshToken)  [source: coverage]

callees [2]:
  src/services/token.ts:42:i8j|  JwtTokenService.verify(token)  [source: lsp]
  src/utils/crypto.ts:10:k0l|  decodeBase64(token.split('.')[1])  [source: lsp]

unresolved [0]
```

Every line is hashline-anchored. Every edge shows its provenance source.

### `trace`

Given an entry point, return the full execution path.

**Input:**
- `entry` — Function name, endpoint string (e.g., `"POST /api/login"`), or test name
- `file` — Optional disambiguating file path

**Output:**
```
trace: POST /api/login [source: coverage, test: "login returns JWT"]

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
- `symbols` — List of changed symbol names
- `changeType` — `"signature_change"`, `"behavior_change"`, `"removal"`, `"addition"`
- `maxDepth` — Optional maximum traversal depth

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
- `source` — how it was discovered (`tree-sitter`, `lsp`, `ast-grep`, `coverage`, `git`)
- `confidence` — relative trust level
- `evidence` — where the relationship was found
- `created_at` — when the edge was added
- `content_hash` — content hash of the source file; the edge is stale when the hash changes

## Non-Requirements (v1)

- No web UI
- No embedding/vector search
- No natural language query parsing
- No multi-language in v1 (TypeScript only)
- No MCP server (pi extension only; MCP adapter is a future concern)
- No real-time file watching (re-index on demand or via git diff)
