# Spec: Project Scaffolding

## Goal

Scaffold pi-codegraph as a bun-based TypeScript project structured as a pi extension. No business logic — just the directory layout, config files, stub modules, and a working test runner that subsequent issues build on.

## Acceptance Criteria

1. `package.json` exists with `name: "pi-codegraph"`, `type: "module"`, and `pi.extensions` pointing to `"./src/index.ts"`
2. `package.json` has scripts: `test` (`bun test`), `build`, and `check` (`tsc --noEmit`)
3. `tsconfig.json` enables `strict: true`, targets ESM, and includes bun types
4. `src/index.ts` exports a default function that accepts `ExtensionAPI` and returns void
5. `src/graph/types.ts` exists and exports placeholder types: `GraphNode`, `GraphEdge`, `Provenance`
6. `src/graph/store.ts` exists and exports a `GraphStore` interface with no methods yet
7. `src/graph/sqlite.ts` exists and exports an empty `SqliteGraphStore` class
8. `src/indexer/pipeline.ts` exists and exports a placeholder `IndexPipeline` function
9. `src/indexer/tree-sitter.ts` exists and exports a placeholder `treeSitterIndex` function
10. `src/tools/symbol-graph.ts` exists and exports a placeholder function
11. `src/tools/resolve-edge.ts` exists and exports a placeholder function
12. `src/output/anchoring.ts` exists and exports a placeholder function
13. `src/rules/` directory exists (empty, or with a `.gitkeep`)
14. `bun test` runs and passes with at least one smoke test
15. `bun run check` (tsc --noEmit) passes with zero errors
16. All stub modules in `src/` can be imported without runtime errors

## Out of Scope

- Any real implementation (graph store logic, indexer logic, tool logic)
- Installing or configuring tree-sitter / ast-grep dependencies
- pi extension registration of tools (just the entry point stub)
- Test fixtures or test utilities beyond the smoke test

## Open Questions

None.
