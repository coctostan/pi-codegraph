# Spec: M0 Type Model + Store

## Goal

Build the foundational type model and storage layer for pi-codegraph by replacing the placeholder stubs in `src/graph/types.ts`, `src/graph/store.ts`, and `src/graph/sqlite.ts` with a complete TypeScript type model (node/edge/provenance types) and a working SQLite-backed graph store. Every subsequent M0 component (indexers, tools) depends on these two pieces.

---

## Acceptance Criteria

**Type model**

1. `NodeKind` is a string-literal union: `'function' | 'class' | 'interface' | 'module' | 'endpoint' | 'test'`
2. `EdgeKind` is a string-literal union: `'calls' | 'imports' | 'implements' | 'extends' | 'tested_by' | 'co_changes_with' | 'renders' | 'routes_to'`
3. `ProvenanceSource` is a string-literal union: `'tree-sitter' | 'lsp' | 'ast-grep' | 'coverage' | 'git' | 'agent'`
4. `GraphNode` has fields: `id: string`, `kind: NodeKind`, `name: string`, `file: string`, `start_line: number`, `end_line: number | null`, `content_hash: string`
5. `Provenance` has fields: `source: ProvenanceSource`, `confidence: number`, `evidence: string`, `content_hash: string`
6. `GraphEdge` has fields: `source: string`, `target: string`, `kind: EdgeKind`, `provenance: Provenance`, `created_at: number`
7. `nodeId(file, name, startLine)` returns a string of the form `"<file>::<name>:<startLine>"` (e.g. `"src/auth.ts::validateToken:42"`)
8. Assigning a string literal not in `NodeKind` to a `GraphNode.kind` field is a TypeScript compile error
9. Assigning a string literal not in `EdgeKind` to a `GraphEdge.kind` field is a TypeScript compile error
10. Assigning a string literal not in `ProvenanceSource` to `Provenance.source` is a TypeScript compile error

**GraphStore interface**

11. `GraphStore` declares method `addNode(node: GraphNode): void`
12. `GraphStore` declares method `addEdge(edge: GraphEdge): void`
13. `GraphStore` declares method `getNode(id: string): GraphNode | null`
14. `GraphStore` declares method `getNeighbors(nodeId: string, options?: NeighborOptions): NeighborResult[]`
15. `GraphStore` declares method `getNodesByFile(file: string): GraphNode[]`
16. `GraphStore` declares method `deleteFile(file: string): void`
17. `GraphStore` declares method `getFileHash(file: string): string | null`
18. `GraphStore` declares method `setFileHash(file: string, hash: string): void`
19. `GraphStore` declares method `close(): void`
20. `NeighborOptions` has optional fields `kind?: EdgeKind` and `direction?: 'in' | 'out' | 'both'`
21. `NeighborResult` has fields `node: GraphNode` and `edge: GraphEdge`

**SqliteGraphStore — basic operations**

22. `SqliteGraphStore` constructor accepts an optional `dbPath: string` parameter; omitting it defaults to `':memory:'`
23. `SqliteGraphStore` implements `GraphStore` (TypeScript structural check passes)
24. `addNode` followed by `getNode` with the same id returns a node equal to the one inserted
25. Calling `addNode` twice with the same `id` overwrites the first entry (upsert semantics); `getNode` returns the second value
26. `getNode` with an id that was never inserted returns `null`
27. `addEdge` followed by `getNeighbors(sourceId)` returns a result containing the target node and the edge
28. `getNeighbors(targetId, { direction: 'in' })` returns the source node and edge for an inbound edge
29. `getNeighbors(nodeId, { direction: 'out' })` does not return inbound edges for that node
30. `getNeighbors(nodeId, { kind: 'imports' })` only returns neighbors connected by `'imports'` edges; edges of other kinds are excluded
31. `getNeighbors` with `direction: 'both'` (the default) returns both inbound and outbound neighbors
32. `getNodesByFile('src/a.ts')` returns all nodes whose `file` field equals `'src/a.ts'`
33. `getNodesByFile` returns an empty array when no nodes exist for that file

**SqliteGraphStore — file invalidation**

34. After `deleteFile('src/a.ts')`, `getNodesByFile('src/a.ts')` returns an empty array
35. After `deleteFile('src/a.ts')`, an edge whose `source` was a node in `src/a.ts` is no longer returned by `getNeighbors`
36. After `deleteFile('src/a.ts')`, an edge whose `target` was a node in `src/a.ts` is no longer returned by `getNeighbors` (cross-file incoming edges are also deleted)
37. Nodes in a different file are unaffected by `deleteFile('src/a.ts')`
38. An edge between two nodes in different files, where neither file is `src/a.ts`, is unaffected by `deleteFile('src/a.ts')`

**SqliteGraphStore — file hashes**

39. `getFileHash('src/a.ts')` returns `null` before any hash has been set for that file
40. After `setFileHash('src/a.ts', 'abc123')`, `getFileHash('src/a.ts')` returns `'abc123'`
41. Calling `setFileHash` a second time for the same file overwrites the previous hash

**SqliteGraphStore — persistence**

42. Data inserted before `close()` is readable after opening a new `SqliteGraphStore` pointed at the same file path

**SqliteGraphStore — schema**

43. The SQLite database contains a `schema_version` table; after initialization it contains exactly one row with `version = 1`

---

## Out of Scope

- Raw SQL passthrough / `query(sql)` method — deferred to M5
- Neighbor traversal beyond depth 1 (multi-hop graph walks)
- Any indexer, tree-sitter parsing, or file-watching logic
- LSP integration, coverage, or git-layer provenance population
- Schema migrations beyond version 1 (initial schema is the only migration in M0)
- Performance optimization or benchmarking

---

## Open Questions

*(none)*
