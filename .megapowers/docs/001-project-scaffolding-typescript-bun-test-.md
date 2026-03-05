# Feature: Project Scaffolding — pi-codegraph

**Issue:** 001-project-scaffolding-typescript-bun-test-  
**Milestone:** M0

---

## What Was Built

The initial project scaffold for **pi-codegraph**, a pi extension that will expose a symbol-level dependency graph of TypeScript codebases to coding agents. This issue creates the directory structure, config files, stub modules, and working test runner that all subsequent milestones build on. No business logic was introduced.

---

## Directory Layout

```
pi-codegraph/
├── package.json               # pi extension manifest, bun scripts
├── tsconfig.json              # strict ESNext, bundler moduleResolution, bun types
├── src/
│   ├── index.ts               # pi extension entrypoint (default export, ExtensionAPI typed)
│   ├── graph/
│   │   ├── types.ts           # GraphNode, GraphEdge, Provenance placeholder interfaces
│   │   ├── store.ts           # GraphStore interface (empty, no methods yet)
│   │   └── sqlite.ts          # SqliteGraphStore class implementing GraphStore
│   ├── indexer/
│   │   ├── pipeline.ts        # IndexPipeline placeholder function
│   │   └── tree-sitter.ts     # treeSitterIndex placeholder function
│   ├── tools/
│   │   ├── symbol-graph.ts    # symbolGraph placeholder function
│   │   └── resolve-edge.ts    # resolveEdge placeholder function
│   ├── output/
│   │   └── anchoring.ts       # anchorResults placeholder function
│   └── rules/
│       └── .gitkeep           # directory tracked by git, reserved for framework rule YAMLs
└── test/
    ├── smoke.test.ts               # imports src/index.ts, asserts default is a function
    ├── graph-types.typecheck.ts    # compile-time assignments for all 3 graph types
    ├── graph-store.test.ts         # runtime import + instanceof check for GraphStore/SqliteGraphStore
    ├── indexer-placeholders.test.ts # typeof checks for IndexPipeline, treeSitterIndex
    ├── tool-placeholders.test.ts   # typeof checks for symbolGraph, resolveEdge
    └── output-anchoring.test.ts    # typeof anchorResults + existsSync("src/rules")
```

---

## Why This Structure

- **`src/graph/`** — graph store abstraction split into interface (`store.ts`), concrete impl (`sqlite.ts`), and shared types (`types.ts`). This allows the SQLite implementation to be swapped without touching consumers.
- **`SqliteGraphStore implements GraphStore`** — wiring the class to the interface at scaffold time means future method additions to `GraphStore` immediately surface as type errors in the implementation.
- **`src/rules/`** — reserved for bundled framework rule YAMLs (ast-grep patterns for Express, React, etc.) used by the M3 pipeline layer.
- **`test/*.typecheck.ts` convention** — compile-time type assertions live in `.typecheck.ts` files picked up by `tsc --noEmit` but not executed by `bun test`. Runtime module-load checks live in `.test.ts` files. This separates type-level from runtime verification.
- **`moduleResolution: "bundler"`** — correct Bun-idiomatic setting; avoids CJS shim overhead and keeps `import` specifiers honest.

---

## Verification Summary

- `bun test`: **5 pass, 0 fail** across 5 test files
- `bun run check` (`tsc --noEmit`): **exit 0**, zero type errors
- All 16 acceptance criteria passed in the verify phase

---

## Out of Scope (deferred to later milestones)

- Graph store logic (nodes/edges tables, SQL schema) — M0
- tree-sitter / ast-grep indexing — M0
- LSP integration — M2
- pi tool registration (`pi.tools` in package.json) — M1
- Test fixtures and utilities beyond smoke test
