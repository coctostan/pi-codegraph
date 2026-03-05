# Feature: Tree-Sitter Indexer + Incremental Hashing (M0)

**Issue:** #020 (batch: #004, #005)
**Branch:** `feat/020-m0-tree-sitter-indexer-incremental-hashi`

---

## What Was Built

A tree-sitter-based TypeScript indexer paired with a content-hash-driven incremental index pipeline, both writing to and reading from the SQLite-backed `GraphStore` introduced in M0.

### `src/indexer/tree-sitter.ts` — `extractFile(file, content)`

Parses a single TypeScript file with tree-sitter and returns an `ExtractionResult`:

```ts
interface ExtractionResult {
  module: GraphNode;   // always present: kind="module", name=file, start_line=1
  nodes: GraphNode[];  // functions, classes, interfaces
  edges: GraphEdge[];  // imports + calls
}
```

**Node extraction (AST walk):**
| AST node type | GraphNode kind |
|---|---|
| `function_declaration` | `"function"` |
| `variable_declarator` with `arrow_function` value | `"function"` |
| `class_declaration` | `"class"` |
| `interface_declaration` | `"interface"` |
| file itself | `"module"` |

- Export modifiers are transparent (an `export function foo` is identical to `function foo`)
- Node IDs: `file::name:startLine` via `nodeId()`
- All nodes carry a `content_hash` = SHA-256 of the file's raw content

**Import edge extraction:**
- Named imports: `import { foo } from './bar'` → edge targeting `__unresolved__::foo:0`
- Aliased imports: `import { foo as baz }` → targets the *original* name `foo`
- Default imports: `import Foo from './bar'` → edge targeting `__unresolved__::default:0`
- Provenance: `source: "tree-sitter"`, `confidence: 0.5`, `evidence`: raw import path string

**Call edge extraction (second AST pass tracking containing function context):**
- Bare calls `foo()` → `calls` edge from enclosing function's node
- Constructor calls `new MyClass()` → `calls` edge targeting `MyClass`
- Method calls `obj.method()` / `this.method()` — excluded (callee is `member_expression`, not `identifier`)
- Provenance: `source: "tree-sitter"`, `confidence: 0.5`

**Error handling:**
- `tree.rootNode.hasError()` → returns `{ module, nodes: [], edges: [] }` rather than throwing
- Outer `try/catch` for parser init failures

---

### `src/indexer/pipeline.ts` — `indexProject(projectRoot, store)`

Walks all `.ts` files under `projectRoot` (excluding `node_modules`), then incrementally indexes using content hashes:

```ts
interface IndexResult {
  indexed: number;   // files freshly (re-)indexed
  skipped: number;   // files unchanged (hash match)
  removed: number;   // files deleted from disk, cleaned from store
  errors: number;    // files that threw during read or index
}
```

**Algorithm:**
1. Walk `.ts` files → build `Set<string>` of current relative POSIX paths
2. For each file:
   - Read content → SHA-256 hash
   - Compare with `store.getFileHash(rel)`:
     - **Match** → skip
     - **No stored hash** → fresh index
     - **Different hash** → `store.deleteFile(rel)` then re-index
   - Write nodes/edges, call `store.setFileHash(rel, hash)`
3. For each file in `store.listFiles()` not in current set → `store.deleteFile(oldFile)`, increment `removed`

**Cross-platform:** `toPosixPath()` normalises Windows `sep` before storing relative paths.

---

## Why It Was Built This Way

- **Tree-sitter** over regex: structural parsing handles real TypeScript syntax (nested exports, multi-line arrows) correctly without fragile patterns.
- **Two-pass AST walk** (node extraction then call extraction): cleaner separation of concerns. The call-edge pass tracks a "current function context" stack as it recurses, allowing correct source attribution.
- **Unresolved targets** (`__unresolved__::name:0`): call and import targets are name-based placeholders. Cross-file resolution is deferred to a later milestone — this keeps M0 scope tight.
- **Content hashing at the file level**: SHA-256 of raw file bytes. Hash mismatch triggers a full delete+re-extract for the file. Unchanged files cost only one `getFileHash` query.
- **`store.deleteFile` handles both directions** of edges (source OR target in the file), so re-indexing a changed file doesn't leave orphaned edges from other files pointing into stale nodes.

---

## Files Changed

| File | Change |
|------|--------|
| `package.json` | Added `tree-sitter ^0.25.0`, `tree-sitter-typescript ^0.23.2` dependencies |
| `src/graph/types.ts` | Added `NodeKind`, `EdgeKind`, `ProvenanceSource` enums; expanded `GraphNode`/`GraphEdge`/`Provenance`; added `nodeId()` |
| `src/graph/store.ts` | Full `GraphStore` interface with `listFiles`, `getFileHash`, `setFileHash`, `deleteFile`, `getNeighbors` |
| `src/graph/sqlite.ts` | Full `SqliteGraphStore` implementation: schema, upsert, transactional `deleteFile`, `listFiles` |
| `src/indexer/tree-sitter.ts` | `extractFile()` — AST walk + import/call edge extraction |
| `src/indexer/pipeline.ts` | `indexProject()` — incremental file walk with hash-based skip/re-index/remove |
| `test/indexer-extract-file.test.ts` | 7 tests covering all node/edge extraction criteria |
| `test/indexer-index-project.test.ts` | 3 tests: first-run indexing, deleted-file removal + error resilience, changed-file re-index |
| `test/graph-store.test.ts` | 11 store unit tests (upsert, neighbors, deleteFile, persistence) |
| `test/graph-store-list-files.test.ts` | listFiles round-trip test |

---

## Test Results

```
bun test v1.3.9 — 26 pass, 0 fail, 86 assertions across 8 files
```

All 28 acceptance criteria verified. See `verify.md` for per-criterion evidence.
