# pi-codegraph

[![CI](https://github.com/coctostan/pi-codegraph/actions/workflows/ci.yml/badge.svg)](https://github.com/coctostan/pi-codegraph/actions/workflows/ci.yml)

A symbol-level code intelligence engine for coding agents. Builds a graph of every function, class, type, and interface in a TypeScript codebase and exposes it through 8 agent-optimized tools — so an agent can understand cross-file relationships in one call instead of grep→read chains.

## Why pi-codegraph?

Coding agents waste tool calls fishing for context. They grep for a function name, read the file, grep for its callers, read those files, and hope they found everything. pi-codegraph replaces that pattern with a structured graph that answers questions directly:

- **"What calls this function?"** → `symbol_graph` returns the full neighborhood with hashline anchors
- **"What breaks if I change this?"** → `impact` traces downstream dependents by change type
- **"What does this function promise?"** → `symbol_contract` extracts types, error paths, and test-evidenced behaviors
- **"Show me the execution path"** → `trace` returns an ordered, anchored call chain
- **"Give me the quick summary"** → `symbol_card` returns a compact fact sheet in one call

Every result is hashline-anchored (`file:line:hash`) — the agent can edit any symbol it finds without re-reading the file.

## Key Features

- **8 agent tools** — `symbol_graph`, `trace`, `impact`, `graph_query`, `resolve_edge`, `delete_edge`, `symbol_card`, `symbol_contract`
- **Multi-layer indexing** — tree-sitter AST, LSP (tsserver), ast-grep framework rules, V8 test coverage, git co-change analysis
- **Provenance on every edge** — each relationship carries its source, confidence, and evidence
- **Agent-teachable graph** — agents create and delete edges with evidence when static analysis can't see the connection
- **Incremental by default** — only re-indexes files that changed (content-hash based)
- **Type signature extraction** — captures parameter types, return types, generics, and heritage clauses
- **Behavioral contracts** — mines throw statements, guard patterns, and test assertions to surface what a symbol guarantees
- **Trust and freshness transparency** — every tool result includes a trust header showing graph age and confidence

## Installation

pi-codegraph is a [pi](https://github.com/nicholasgasior/pi-coding-agent) extension. It requires:

- [Bun](https://bun.sh) (latest)
- Node.js >= 22 (for tsserver LSP)
- A TypeScript project to analyze

### Install as a pi extension

1. Clone the repository:

```bash
git clone https://github.com/coctostan/pi-codegraph.git
cd pi-codegraph
```

2. Install dependencies:

```bash
bun install
```

3. Register as a pi extension by adding to your pi configuration:

```json
{
  "pi": {
    "extensions": ["./path/to/pi-codegraph/src/index.ts"]
  }
}
```

Once registered, the 8 tools are available to the agent automatically. The graph database (`.codegraph/graph.db`) is created in the project root on first use.

## Tools

### `symbol_graph`

Look up a symbol and return its anchored relationship neighborhood — callers, callees, imports, and more.

```
symbol_graph({ name: "validateToken" })
symbol_graph({ name: "validateToken", file: "src/auth.ts" })
```

### `symbol_card`

Compact summary of a symbol: definition, type signature, covering tests, key relationships, and signals — all in one call.

```
symbol_card({ name: "deleteEdge" })
```

### `symbol_contract`

Behavioral contract extraction: what a symbol takes, returns, throws, and what tests assert about it.

```
symbol_contract({ name: "deleteEdge" })
```

### `impact`

Given changed symbols, return downstream dependents classified by change type (signature change, removal, behavior change, addition).

```
impact({ symbols: ["validateToken"], changeType: "signature_change" })
```

### `trace`

Return one deterministic anchored execution path from an entry point. Uses test coverage data when available, falls back to static analysis.

```
trace({ entry: "loginHandler" })
```

### `graph_query`

Freeform Cypher subset queries against the graph for power-user exploration.

```
graph_query({ query: 'MATCH (n {kind: "function"}) RETURN n LIMIT 10' })
graph_query({ query: 'MATCH (a {name: "foo"})-[r:calls]->(b) RETURN a, r, b' })
```

### `resolve_edge`

Create an edge in the graph with evidence — the agent teaches the graph what static analysis can't see (DI wiring, factory patterns, runtime routing).

```
resolve_edge({
  source: "AuthController",
  target: "TokenService",
  kind: "calls",
  evidence: "Injected via NestJS @Inject decorator in constructor"
})
```

### `delete_edge`

Remove an agent-created edge that turned out to be incorrect.

```
delete_edge({ source: "AuthController", target: "TokenService", kind: "calls" })
```

## How It Works

### Indexing Pipeline

The graph is built in layers, each adding different kinds of relationships:

| Layer | Source | What it captures |
|-------|--------|-----------------|
| 1. tree-sitter | AST parsing | Symbols, calls, imports, type signatures |
| 2. LSP | tsserver | Resolved references, interface implementations |
| 3. ast-grep | Pattern rules | Framework-specific edges (Express routes, React renders) |
| 4. Coverage | V8 test coverage | `tested_by` edges, execution traces |
| 5. Git | Commit history | Co-change correlations between symbols |
| 6. Agent | `resolve_edge` | Human/agent-authored edges with evidence |

Indexing is incremental — files are tracked by content hash, and only changed files are re-processed.

### Graph Store

The graph is stored in SQLite (`.codegraph/graph.db`) with two tables:

- **nodes** — symbols with name, kind, file, line range, content hash, export status, and type signature
- **edges** — relationships with source, target, kind, provenance, confidence, evidence, and content hash

### Output Format

Every tool result is structured for agent consumption:

- **Hashline anchors** (`file:line:hash`) on every symbol reference
- **Trust headers** showing graph freshness and confidence
- **Provenance labels** on every edge (`[source: lsp]`, `[source: tree-sitter]`, `[source: agent]`)
- **Signal badges** (`[hub]`, `[tested]`, `[bottleneck]`) for quick assessment

## Project Structure

```
src/
  index.ts                  # pi extension entry — registers all 8 tools
  graph/
    types.ts                # GraphNode, GraphEdge, provenance types
    store.ts                # GraphStore interface
    sqlite.ts               # SQLite implementation
  indexer/
    tree-sitter.ts          # Stage 1: AST symbol extraction
    lsp.ts                  # Stage 2: tsserver enrichment
    lsp-resolver.ts         # On-demand LSP resolution
    tsserver-client.ts      # tsserver lifecycle management
    ast-grep.ts             # Stage 3: framework pattern rules
    coverage.ts             # Stage 4: V8 test coverage
    git.ts                  # Stage 5: git co-change analysis
    contract-extractor.ts   # On-demand contract extraction
    pipeline.ts             # Orchestrates all indexing stages
  tools/
    symbol-graph.ts         # symbol_graph tool
    symbol-card.ts          # symbol_card tool
    symbol-contract.ts      # symbol_contract tool
    impact.ts               # impact tool
    trace.ts                # trace tool
    graph-query.ts          # graph_query tool
    graph-query-parser.ts   # Cypher subset parser
    graph-query-compiler.ts # Query → SQL compiler
    graph-query-render.ts   # Query result renderer
    resolve-edge.ts         # resolve_edge tool
    delete-edge.ts          # delete_edge tool
    symbol-resolution.ts    # Shared disambiguation logic
  output/
    anchoring.ts            # Hashline anchor computation
    trust.ts                # Trust header generation
    signals.ts              # Hub/tested/bottleneck signal computation
test/                       # 334 tests across 148 files
```

## Development

### Prerequisites

- [Bun](https://bun.sh) (latest)
- Node.js >= 22

### Run tests

```bash
bun test
```

### Type-check

```bash
bun run check
```

### CI

GitHub Actions runs type-checking and the full test suite on every push and PR to `main`. See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Use Cases

### Code Review
An agent reviewing a PR can call `impact` to see exactly which downstream symbols are affected by a change, then `symbol_contract` to verify that behavioral guarantees are preserved.

### Test Planning
`symbol_card` shows which tests cover a symbol. `symbol_contract` surfaces what those tests actually assert. An agent can identify untested error paths and generate targeted tests.

### Safe Refactoring
Before renaming or restructuring, `impact` with `changeType: "signature_change"` reveals every caller that would break. `trace` shows execution paths through the changed code.

### Understanding Unfamiliar Code
`symbol_graph` gives the full relationship neighborhood. `symbol_card` gives the quick summary. `graph_query` enables exploratory questions like "find all functions that call anything in the auth module."

### Agent-Driven Knowledge Building
When static analysis misses a connection (dependency injection, factory patterns, runtime wiring), the agent uses `resolve_edge` to teach the graph. These edges persist and improve future queries for all tools.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system design, including the indexing pipeline, query engine, and output layer.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for completed milestones (M0–M8) and future plans.

## License

MIT — see [LICENSE](LICENSE).