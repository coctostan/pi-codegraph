## [Unreleased]

### Added
- Project scaffold: `package.json`, `tsconfig.json`, pi extension entrypoint, placeholder modules for graph store, indexer, tools, and output layer, plus working `bun test` and `tsc --noEmit` pipeline (#001)
- M0 type model: `NodeKind`, `EdgeKind`, `ProvenanceSource` string-literal unions; `GraphNode`, `GraphEdge`, `Provenance` interfaces; `nodeId()` helper — invalid assignments are TypeScript compile errors (#019, closes #003)
- M0 graph store: `GraphStore` interface (addNode, addEdge, getNode, getNeighbors, getNodesByFile, deleteFile, getFileHash, setFileHash, close) and `SqliteGraphStore` implementation backed by `bun:sqlite` with full schema, upsert semantics, transactional `deleteFile`, and schema versioning (#019, closes #002)
- M0 tree-sitter indexer: `extractFile()` parses `.ts` files via tree-sitter to extract function/class/interface/module nodes and `imports`/`calls` edges with tree-sitter provenance; `indexProject()` provides incremental indexing with SHA-256 content hashing (skip unchanged, re-index changed, remove deleted files) (#020, closes #004 #005)
