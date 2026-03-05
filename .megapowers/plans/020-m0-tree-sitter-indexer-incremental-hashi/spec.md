# Spec: Tree-Sitter Indexer + Incremental Hashing

## Goal

Build a tree-sitter-based TypeScript indexer that parses `.ts` files to extract symbol nodes (functions, classes, interfaces, modules) and relationship edges (imports, calls), writing them to the existing graph store with `tree-sitter` provenance. Wrap this in an incremental index pipeline that uses content hashing to skip unchanged files, re-extracts changed files, and cleans up deleted files.

## Acceptance Criteria

**Node Extraction**

1. Given a file containing `function foo() {}`, `extractFile` returns a node with `kind: "function"`, `name: "foo"`, correct `file`, `start_line`, and `end_line`.
2. Given a file containing `const bar = () => {}`, `extractFile` returns a node with `kind: "function"`, `name: "bar"`, correct `start_line` and `end_line`.
3. Given a file containing `const baz = async () => {}`, `extractFile` returns a node with `kind: "function"`, `name: "baz"`.
4. Given a file containing `class MyClass {}`, `extractFile` returns a node with `kind: "class"`, `name: "MyClass"`.
5. Given a file containing `interface MyInterface {}`, `extractFile` returns a node with `kind: "interface"`, `name: "MyInterface"`.
6. `extractFile` always returns a module node with `kind: "module"` and `name` set to the file path, with `start_line: 1`.
7. Each returned node has an `id` matching the format `file::name:startLine` (via `nodeId()`).
8. Each returned node has a `content_hash` field set to the SHA-256 hex digest of the file content.
9. Given `export function foo() {}`, the extracted node has the same fields as a non-exported function (export status is not distinguished in this milestone).

**Import Edge Extraction**

10. Given `import { foo } from './bar'`, `extractFile` returns an `imports` edge from the module node to a target ID containing `"foo"`.
11. Given `import { foo as baz } from './bar'`, `extractFile` returns an `imports` edge targeting the original name `"foo"`, not the alias `"baz"`.
12. Given `import Foo from './bar'`, `extractFile` returns an `imports` edge with target referencing `"default"` or the bound name from the source module.
13. Each import edge has `provenance.source: "tree-sitter"` and `provenance.confidence: 0.5`.
14. Each import edge stores the import source path (e.g. `'./bar'`) in `provenance.evidence`.

**Call Edge Extraction**

15. Given `foo()` inside a function body, `extractFile` returns a `calls` edge from the containing function's node to a target matching the name `"foo"`.
16. Given `new MyClass()`, `extractFile` returns a `calls` edge targeting `"MyClass"`.
17. Given `obj.method()`, `extractFile` does NOT return a `calls` edge (method calls are out of scope).
18. Given `this.method()`, `extractFile` does NOT return a `calls` edge.
19. Each call edge has `provenance.source: "tree-sitter"` and `provenance.confidence: 0.5`.

**Incremental Pipeline**

20. `indexProject` discovers all `.ts` files under the project root (excluding `node_modules`).
21. On first run, `indexProject` extracts and stores nodes/edges for every discovered file and returns stats including `indexed` count.
22. On re-run with no file changes, `indexProject` skips all files and returns `indexed: 0, skipped: N`.
23. When a file's content changes between runs, `indexProject` deletes its old nodes/edges, re-extracts, and stores the new ones.
24. When a file is deleted between runs, `indexProject` calls `deleteFile` to remove its nodes/edges from the store.
25. `indexProject` updates the stored content hash (via `setFileHash`) for each newly indexed file.
26. `indexProject` returns an `IndexResult` with counts: `{ indexed: number, skipped: number, removed: number, errors: number }`.

**Error Handling**

27. If tree-sitter fails to parse a file (e.g. binary file or severe syntax error), `extractFile` returns empty nodes/edges arrays rather than throwing.
28. If a single file fails during `indexProject`, the pipeline continues processing remaining files and increments the `errors` count.

## Out of Scope

- Method calls (`obj.foo()`, `this.bar()`) — deferred to M2 LSP integration
- Class methods as separate nodes — deferred to M2
- Namespace imports (`import * as x from`) — deferred to M5
- Re-exports (`export { x } from`) — deferred to M5
- Side-effect imports (`import './foo'`) — no symbol binding, nothing to edge
- Type aliases, enums, exported variable declarations — future milestone
- `.tsx` file support — TypeScript-only for now
- Cross-file edge resolution (matching import targets to actual node IDs in other files) — the extractor produces name-based targets; resolution is a pipeline concern

## Open Questions

*None.*
