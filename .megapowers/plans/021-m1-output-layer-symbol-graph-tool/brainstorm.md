# Brainstorm: Output Layer + symbol_graph Tool

## Approach

The output layer and `symbol_graph` tool are built as two cleanly separated components. The output layer (`src/output/anchoring.ts`) is shared infrastructure that handles two concerns: (1) anchoring graph nodes to current file content in `file:line:hash` format compatible with pi's edit tool, and (2) ranking/truncating neighbor results by edge confidence with omission counts. This layer will be reused by all future tools (`impact`, `trace`, `graph_query`).

The `symbol_graph` tool (`src/tools/symbol-graph.ts`) is the first consumer. It takes a symbol name (plus optional file for disambiguation), looks it up via a new `findNodes` store method, and returns the symbol's neighborhood as a plain text block with anchored entries organized into sections (callers, callees, imports). When multiple nodes match the name, it returns a disambiguation list instead of guessing. The tool delegates all anchoring and ranking to the output layer.

The store layer gets one small addition: `findNodes(name, file?)` on the `GraphStore` interface, implemented as a simple `SELECT` in the SQLite backend.

## Key Decisions

- **Plain text output format** — matches pi conventions (`LINE:HASH|content`), token-efficient, LLMs parse it naturally, anchors are directly copy-pasteable into edit operations
- **Disambiguation-first for ambiguous names** — if multiple nodes match, return a candidate list and require the agent to re-call with a file filter; no "best guess" heuristics
- **Live anchor computation at query time** — read the actual file and hash the line, compare file content hash against stored hash, mark nodes `[stale]` if mismatched; never cache anchors in the graph
- **Optional `limit` parameter (default 10)** — controls max results per neighbor category (callers, callees, imports); no token budgeting for M1, just a flat count per bucket
- **`findNodes(name, file?)` on GraphStore** — simple addition to the store interface; SQLite impl is a `WHERE name = ?` query with optional `AND file = ?`

## Components

### Store addition (`src/graph/store.ts` + `src/graph/sqlite.ts`)
- Add `findNodes(name: string, file?: string): GraphNode[]` to the `GraphStore` interface
- SQLite implementation: `SELECT * FROM nodes WHERE name = ? [AND file = ?]`

### Output layer (`src/output/anchoring.ts`)
- `computeAnchor(node: GraphNode, projectRoot: string)` — reads file, hashes line at `start_line`, compares file content hash against `node.content_hash`, returns `{ anchor: string, stale: boolean }`
- `rankNeighbors(neighbors: NeighborResult[], limit: number)` — sorts by `edge.provenance.confidence` descending, returns `{ kept: NeighborResult[], omitted: number }`
- `formatNeighborhood(symbol, callers, callees, imports, unresolved)` — produces the plain text output block with anchored entries and omission counts

### symbol_graph tool (`src/tools/symbol-graph.ts`)
- Input: `{ name: string, file?: string, limit?: number }`
- Flow: findNodes → disambiguate → getNeighbors → bucket by direction/kind → rank each bucket → anchor each node → format text
- Output cases: not found, disambiguation list, or full anchored neighborhood

## Testing Strategy

### Output layer tests (unit)
- `computeAnchor`: given a node and a real file on disk, returns correct `file:line:hash` format; given a file that changed since indexing, returns `stale: true`; given a missing file, handles gracefully
- `rankNeighbors`: given 15 neighbors with various confidences and limit 10, returns top 10 sorted by confidence and reports 5 omitted; given fewer than limit, returns all with 0 omitted
- `formatNeighborhood`: snapshot tests on the text output format — verify sections present, anchors formatted correctly, omission counts shown

### Store tests (unit)
- `findNodes`: returns matching nodes by name; filters by file when provided; returns empty array when no match

### symbol_graph tool tests (integration)
- Index a small fixture project, then call symbolGraph — verify correct neighborhood for a known function
- Ambiguous name (same function name in two files) — verify disambiguation list returned
- No match — verify "not found" message
- Limit parameter — verify truncation and omission count in output
- Stale file — modify a fixture file after indexing, verify `[stale]` marker appears
