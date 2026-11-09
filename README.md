<p align="center">
  <img src="./assets/banner.png" alt="pi-codegraph — a code graph for coding agents" width="100%" />
</p>

# pi-codegraph

[![npm version](https://img.shields.io/npm/v/pi-codegraph.svg)](https://www.npmjs.com/package/pi-codegraph)
[![CI](https://github.com/coctostan/pi-codegraph/actions/workflows/ci.yml/badge.svg)](https://github.com/coctostan/pi-codegraph/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A symbol-level code intelligence engine for coding agents. Builds a graph of every function, class, type, and interface in a TypeScript codebase and exposes it through 3 public tools, with 1 internal helper for deeper graph work.

## Why pi-codegraph?

Coding agents waste tool calls fishing for context. They grep for a function name, read the file, grep for its callers, read those files, and hope they found everything. pi-codegraph replaces that pattern with a structured graph that answers questions directly:

- **"What calls this function?"** → `symbol_graph` returns a compact symbol card by default; add `include: ["neighborhood"]` for the full relationship neighborhood
- **"Which tests exercise this? Which do I rerun after changing it?"** → `symbol_graph`'s `Test callers` lists the test files that call it; `impact` lists them as `Tests reached directly`, before the tests that reach it through other callers
- **"What breaks if I change this?"** → `impact` traces downstream dependents by change type
- **"What does this function promise?"** → `symbol_graph` with `include: ["contract"]` appends behavioral contract details from code and tests
- **"What runs from here, in what order?"** → `trace` returns an anchored call tree in call-site order, from a named function or from the `file` and `line` of a handler or callback with no name
- **"Show me the source"** → `symbol_graph` with `include: ["source"]` appends anchored source for the resolved symbol

Editable anchor locations are rendered as two adjacent fields: the file path as context, then a bare `LINE:HASH` token, for example `src/a.ts  10:abc`. The `LINE:HASH` token uses the same exact-line xxhash algorithm as pi-hashline-readmap (only a trailing CR is ignored; whitespace is significant).

The graph can point an agent to the right file and line, but pi-hashline-readmap's read-before-edit/file-anchoring gate still applies. Codegraph does not provide true edit-without-prior-read anchoring.

## Key Features

- **3 public tools by default** — `symbol_graph`, `impact`, `trace`
- **1 internal helper** — `symbol_search` remains exported for internal callers but is not registered on the public extension surface
- **Multi-layer indexing** — tree-sitter AST, LSP (tsserver), ast-grep framework rules, V8 test coverage, git co-change analysis
- **Provenance on every edge** — each relationship carries its source, confidence, and evidence
- **Incremental by default** — only re-indexes files that changed (content-hash based)
- **Type signature extraction** — captures parameter types, return types, generics, and heritage clauses
- **Behavioral contracts** — mines throw statements, guard patterns, and test assertions to surface what a symbol guarantees
- **Trust and freshness transparency** — non-fresh results render a Trust header, while provenance labels and signal badges stay inline on every call

## Installation

pi-codegraph is a [pi](https://github.com/earendil-works/pi) extension (tested against pi 1.4.0). It requires:

- [Bun](https://bun.sh) (latest)
- Node.js >= 22.19 (pi's minimum; also used for tsserver LSP)
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

`tree-sitter` and `tree-sitter-typescript` are native modules that ship prebuilt binaries for macOS, Linux and Windows on arm64 and x64, so install needs no compiler there. On any other platform they compile on install via `node-gyp`; if that fails, you likely need a working C/C++ toolchain:

- **macOS:** `xcode-select --install`
- **Linux:** `sudo apt-get install build-essential python3` (or your distro's equivalent)
- **Windows:** install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload, plus a recent Python

After installing the toolchain, re-run `bun install` (or `npm install`).

## Pi integration

- **Tool metadata:** all three tools declare `annotations` (read-only, idempotent, closed-world), a `codegraph` namespace, and `promptSnippet`/`promptGuidelines` for the system prompt. They are safe to call in parallel: indexing is deduplicated per project, the shared tsserver queues requests, and LSP resolution is shared per symbol.
- **Structured output:** results include `structuredContent` `{ text, anchors, indexingFailed }` (declared as `outputSchema`), so codemode scripts receive parsed `{ file, line, hash }` anchors. The model still receives the text.
- **Cancellation:** aborting a tool call stops waiting for indexing and LSP resolution immediately.
- **Lifecycle:** stores and tsserver processes are per project root and are closed on `session_shutdown`. The status bar shows `codegraph: indexing…` while indexing.
- **`/codegraph [status|refresh]`:** shows node/edge/file counts and the last indexing error, or re-runs incremental indexing.

## Tools

### Public

#### `symbol_graph`
Summarize a symbol: who calls it, which tests call it, what it calls, and key metadata.
By default, `symbol_graph({ name: "validateToken" })` already includes test signals in the compact card.
Allowed include values: `"neighborhood"`, `"contract"`, `"source"`. `"tests"` is not a valid include value.
The card lists up to 5 callers, then the test cases calling the symbol by file (`Test callers (<n> in <m> files)`), callees and imports; `"neighborhood"` adds implementors, importers and every other edge kind.
```
symbol_graph({ name: "validateToken" })
symbol_graph({ name: "validateToken", file: "src/auth.ts" })
symbol_graph({ name: "validateToken", include: ["neighborhood"] })
symbol_graph({ name: "validateToken", include: ["contract"] })
symbol_graph({ name: "validateToken", include: ["source"] })
symbol_graph({ name: "validateToken", include: ["neighborhood", "contract", "source"] })
```
#### `impact`
Classify blast radius for changed symbols, then list the tests calling them directly before those reached through other callers.
It follows callers and implementors directly and indirectly up toward the entry points, `maxDepth` levels deep (default 5). Each row is `<file>  <LINE:HASH>  <name>  <class>  depth:<n>`, by depth then file: a direct dependent of a `signature_change` or `removal` is `breaking`, every other dependent `behavioral`. The test files and test cases reached follow: those calling a changed symbol directly in a `Tests reached directly (<c> cases in <f> files):` list, then the rest in a `Tests reached through other callers (<c> cases in <f> files):` list, each file once per list.
Allowed `changeType` values: `"signature_change"`, `"removal"`, `"behavior_change"`, `"addition"`; `"addition"` returns a note, no dependents.
```
impact({ symbols: ["validateToken"], changeType: "signature_change" })
impact({ symbols: ["validateToken"], changeType: "removal" })
impact({ symbols: ["validateToken"], changeType: "behavior_change", maxDepth: 2 })
```

#### `trace`
Return the call tree below an entry point or the function holding a file line, or, when coverage has one, the functions a covering test's report covered.
The static tree prints each callee under its caller in call-site order, 3 calls deep: a repeat reads `<name> (see above)`, an unresolved call is a `? <name> (unresolved, <file>:<line>)` line, and `N more omitted beyond depth 3` counts the rest. When a coverage report covers the entry, `trace` prints instead, under `mode: coverage`, a covering test and then every production function that test's report covered, by file and line, not call order; tests sharing one report get the same list. The entry is a function, endpoint or test case, or, by `file` and `line`, the innermost function holding that line: an object method or anonymous callback the graph holds no node for starts a tree of its own calls, its line naming the enclosing function, as `execute (in setup)`.
```
trace({ entry: "loginHandler" })
trace({ file: "src/routes.ts", line: 42 })
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
| 4. Coverage | V8 test coverage | `tested_by` edges, each test's covered functions |
| 5. Git | Commit history | Co-change correlations between symbols |

Indexing is incremental — files are tracked by content hash, and only changed files are re-processed.

### Graph Store

The graph is stored in SQLite (`.codegraph/graph.db`) with two tables:

- **nodes** — symbols with name, kind, file, line range, content hash, export status, and type signature
- **edges** — relationships with source, target, kind, provenance, confidence, evidence, and content hash

### Output Format

Every tool result is structured for agent consumption:

- **Hashline-compatible anchor locations** rendered as file context plus a bare editable `LINE:HASH` token on every symbol reference
- **Conditional Trust headers** on non-fresh results to show graph freshness and confidence when it matters
- **Provenance labels** on every edge (`[source: lsp]`, `[source: tree-sitter]`)
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
Before renaming or restructuring, `impact` with `changeType: "signature_change"` reveals every caller that would break. `trace` shows the call tree below the changed code.

### Understanding Unfamiliar Code
`symbol_graph({ name })` gives the compact default lookup surface. Add `include: ["neighborhood"]` for the full relationship neighborhood or `include: ["source"]` for the anchored source snippet.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system design, including the indexing pipeline, query engine, and output layer.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for completed milestones (M0–M10) and future plans.

## License

MIT — see [LICENSE](LICENSE).
