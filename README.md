<p align="center">
  <img src="./assets/banner.png" alt="pi-codegraph — a code graph for coding agents" width="100%" />
</p>

# pi-codegraph

[![npm version](https://img.shields.io/npm/v/pi-codegraph.svg)](https://www.npmjs.com/package/pi-codegraph)
[![CI](https://github.com/coctostan/pi-codegraph/actions/workflows/ci.yml/badge.svg)](https://github.com/coctostan/pi-codegraph/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A symbol-level code intelligence engine for coding agents. Builds a graph of every function, class, type, and interface in a TypeScript codebase and exposes it through 3 public tools by default, with 0 dev-mode-only tools and 1 internal helper for deeper graph work.

## Why pi-codegraph?

Coding agents waste tool calls fishing for context. They grep for a function name, read the file, grep for its callers, read those files, and hope they found everything. pi-codegraph replaces that pattern with a structured graph that answers questions directly:

- **"What calls this function?"** → `symbol_graph` returns a compact symbol card by default; add `include: ["neighborhood"]` for the full relationship neighborhood
- **"What breaks if I change this?"** → `impact` traces downstream dependents by change type
- **"What does this function promise?"** → `symbol_graph` with `include: ["contract"]` appends behavioral contract details from code and tests
- **"Show me the execution path"** → `trace` returns an ordered, anchored call chain
- **"Show me the source"** → `symbol_graph` with `include: ["source"]` appends anchored source for the resolved symbol

Every result is hashline-anchored (`file:line:hash`) — the agent can edit any symbol it finds without re-reading the file.

## Key Features

- **3 public tools by default** — `symbol_graph`, `impact`, `trace`
- **0 dev-mode tools** — Phase 5 removed the zero-usage dev-only tools; there are no additional tools to register behind `CODEGRAPH_DEVMODE=1` today
- **1 internal helper** — `symbol_search` remains exported for internal callers but is not registered on the public extension surface
- **Multi-layer indexing** — tree-sitter AST, LSP (tsserver), ast-grep framework rules, V8 test coverage, git co-change analysis
- **Provenance on every edge** — each relationship carries its source, confidence, and evidence
- **Incremental by default** — only re-indexes files that changed (content-hash based)
- **Type signature extraction** — captures parameter types, return types, generics, and heritage clauses
- **Behavioral contracts** — mines throw statements, guard patterns, and test assertions to surface what a symbol guarantees
- **Trust and freshness transparency** — non-fresh results render a Trust header, while provenance labels and signal badges stay inline on every call

## Installation

pi-codegraph is a [pi](https://github.com/nicholasgasior/pi-coding-agent) extension. It requires:

- [Bun](https://bun.sh) (latest)
- Node.js >= 22 (for tsserver LSP)
- A TypeScript project to analyze

### Install from npm (recommended)

```bash
bun add pi-codegraph
# or
npm install pi-codegraph
```

Then register it as a pi extension in your pi configuration:

```json
{
  "pi": {
    "extensions": ["pi-codegraph"]
  }
}
```

Once registered, the 3 default public tools are available to the agent automatically. `symbol_search` remains internal-only. The graph database (`.codegraph/graph.db`) is created in the project root on first use.

### Install from source (for development)

```bash
git clone https://github.com/coctostan/pi-codegraph.git
cd pi-codegraph
bun install
```

Then point your pi config at the local checkout:

```json
{
  "pi": {
    "extensions": ["./path/to/pi-codegraph/src/index.ts"]
  }
}
```

### Troubleshooting native dependencies

`tree-sitter` and `tree-sitter-typescript` ship as native modules and compile on install via `node-gyp`. If install fails, you likely need a working C/C++ toolchain:

- **macOS:** `xcode-select --install`
- **Linux:** `sudo apt-get install build-essential python3` (or your distro's equivalent)
- **Windows:** install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload, plus a recent Python

After installing the toolchain, re-run `bun install` (or `npm install`).

## Tools

### Public

#### `symbol_graph`
Return a compact symbol summary with relationships, test signals, and key metadata.
By default, `symbol_graph({ name: "validateToken" })` already includes test signals in the compact card.
Allowed include values: `"neighborhood"`, `"contract"`, `"source"`. `"tests"` is not a valid include value.
```
symbol_graph({ name: "validateToken" })
symbol_graph({ name: "validateToken", file: "src/auth.ts" })
symbol_graph({ name: "validateToken", include: ["neighborhood"] })
symbol_graph({ name: "validateToken", include: ["contract"] })
symbol_graph({ name: "validateToken", include: ["source"] })
symbol_graph({ name: "validateToken", include: ["neighborhood", "contract", "source"] })
```
#### `impact`
Return the classified blast radius for a set of changed symbols.
Allowed `changeType` values: `"signature_change"`, `"removal"`, `"behavior_change"`, `"addition"`.
```
impact({ symbols: ["validateToken"], changeType: "signature_change" })
impact({ symbols: ["validateToken"], changeType: "removal" })
impact({ symbols: ["validateToken"], changeType: "behavior_change" })
impact({ symbols: ["validateToken"], changeType: "addition" })
```

#### `trace`
Return the execution path starting from an entry point. Coverage-backed when available.
```
trace({ entry: "loginHandler" })
```

### Internal

#### `symbol_search`
Find symbols by approximate name match.
`symbol_search` remains exported for internal callers but is not registered on the public extension surface.

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

Indexing is incremental — files are tracked by content hash, and only changed files are re-processed.

### Graph Store

The graph is stored in SQLite (`.codegraph/graph.db`) with two tables:

- **nodes** — symbols with name, kind, file, line range, content hash, export status, and type signature
- **edges** — relationships with source, target, kind, provenance, confidence, evidence, and content hash

### Output Format

Every tool result is structured for agent consumption:

- **Hashline anchors** (`file:line:hash`) on every symbol reference
- **Conditional Trust headers** on non-fresh results to show graph freshness and confidence when it matters
- **Provenance labels** on every edge (`[source: lsp]`, `[source: tree-sitter]`, `[source: agent]`)
- **Signal badges** (`[hub]`, `[tested]`, `[bottleneck]`) for quick assessment

## Project Structure

```
src/
  index.ts                  # pi extension entry — registers 3 public tools by default
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
    impact.ts               # impact tool
    trace.ts                # trace tool
    symbol-card.ts          # shared compact/source renderers used by symbol_graph
    symbol-contract.ts      # shared contract renderer used by symbol_graph
    symbol-search.ts        # symbol_search helper (internal only)
    symbol-resolution.ts    # Shared disambiguation logic
    token-tracker.ts        # Optional dev-only token meta footer
  output/
    anchoring.ts            # Hashline anchor computation
    trust.ts                # Trust header generation
    signals.ts              # Hub/tested/bottleneck signal computation
test/
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
An agent reviewing a PR can call `impact` to see exactly which downstream symbols are affected by a change, then `symbol_graph({ name, include: ["contract"] })` to verify that behavioral guarantees are preserved.

### Test Planning
`symbol_graph({ name })` gives the compact summary of signature, tests, relationships, and signals. `symbol_graph({ name, include: ["contract"] })` surfaces what those tests actually assert so an agent can identify untested error paths and generate targeted tests.

### Safe Refactoring
Before renaming or restructuring, `impact` with `changeType: "signature_change"` reveals every caller that would break. `trace` shows execution paths through the changed code.

### Understanding Unfamiliar Code
`symbol_graph({ name })` gives the compact default lookup surface. Add `include: ["neighborhood"]` for the full relationship neighborhood or `include: ["source"]` for the anchored source snippet.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system design, including the indexing pipeline, query engine, and output layer.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for completed milestones (M0–M8) and future plans.

## License

MIT — see [LICENSE](LICENSE).
