# Brainstorm: Tree-Sitter Indexer + Incremental Hashing

## Approach

The indexer is built as two layers. The **file extractor** (`extractFile`) is a pure function that takes a file path and its content string, parses it with tree-sitter, and returns arrays of `GraphNode` and `GraphEdge` objects. It has no I/O and no store access, making it trivially testable with inline TypeScript strings. The **index pipeline** (`indexProject`) is the orchestrator that walks a project directory, computes content hashes (SHA-256 via Bun's native crypto), checks the graph store for changes, calls the file extractor for changed files, writes results to the store, and cleans up deleted files.

Tree-sitter with `tree-sitter-typescript` (native Node.js bindings) parses each `.ts` file. The extractor walks the AST to find: function declarations, arrow function const assignments, class declarations, interface declarations, and a module node per file. It extracts three edge types: `imports` edges from named/default/aliased import statements, `calls` edges from bare function calls and `new ClassName()` constructor calls (name-matched, not type-resolved), and implicit `contains` relationships via the `file` field on each node. Method calls (`obj.foo()`) are deferred to LSP in M2. Namespace imports, re-exports, and side-effect imports are deferred to M5.

Incremental indexing leverages the primitives already in `GraphStore`: `getFileHash`/`setFileHash` for tracking, `deleteFile` for clearing stale data. On each run, the pipeline computes the hash of every discovered `.ts` file, compares against stored hashes, skips unchanged files, re-extracts changed files (delete-then-insert), and removes data for deleted files. The store's `deleteFile` is already transactional.

## Key Decisions

- **Native `tree-sitter` + `tree-sitter-typescript`** — synchronous API, well-tested, fine for CLI tool
- **Minimal node set** — function declarations, arrow function assignments, classes, interfaces, modules. No methods, enums, type aliases, or exported variables yet.
- **Bare calls + constructor calls only** — method calls deferred to LSP (M2) to avoid false positives
- **Named + default imports only** — namespace imports and re-exports deferred to M5
- **Pure extractor + orchestrator split** — extractor is a pure function (testable with strings), pipeline handles I/O and store
- **SHA-256 content hashing** — using Bun's native `Bun.CryptoHasher` for speed
- **Delete-then-insert on file change** — simpler than diffing old vs new nodes; `deleteFile` already handles cascading cleanup

## Components

1. **`src/indexer/tree-sitter.ts`** — `extractFile(filePath: string, content: string): ExtractionResult` — pure function returning `{ nodes: GraphNode[], edges: GraphEdge[] }`
2. **`src/indexer/pipeline.ts`** — `indexProject(projectRoot: string, store: GraphStore): IndexResult` — orchestrator that walks files, handles incremental logic, calls extractor, writes to store. Returns stats (files indexed, skipped, removed).
3. **Dependencies** — `tree-sitter` and `tree-sitter-typescript` added to `package.json`

## Testing Strategy

- **Unit tests for extractor** — feed inline TypeScript strings, assert exact nodes and edges returned. One test per construct: function declarations, arrow functions, classes, interfaces, module node, named imports, default imports, aliased imports, bare calls, constructor calls. Also negative cases: method calls should NOT produce edges.
- **Integration tests for pipeline** — create temp directories with `.ts` files, run pipeline against a real `SqliteGraphStore`, verify nodes/edges in the store. Test incremental: change a file, re-run, verify only that file was re-indexed. Test deletion: remove a file, re-run, verify its nodes/edges are gone.
- **Edge cases** — empty files, files with parse errors (should skip gracefully, not crash), files with no extractable symbols.
