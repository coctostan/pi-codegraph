# Brainstorm: Project Scaffolding

## Approach

Set up pi-codegraph as a pi extension package with bun as runtime. The directory structure follows ARCHITECTURE.md exactly. This is pure scaffolding — no business logic, just the skeleton that subsequent issues build on.

The package uses the pi extension convention: `pi.extensions` in package.json pointing to `src/index.ts`, which exports a default function receiving `ExtensionAPI`. Dependencies are minimal for M0: `@sinclair/typebox` for tool parameter schemas (pi convention), and `bun:sqlite` for the graph store (zero-dep, built into bun).

## Key Decisions

- **bun:test** over vitest — zero deps, built-in, jest-compatible API, sufficient for our needs
- **bun:sqlite** over better-sqlite3 — built into bun, no native compilation, same sync API
- **Flat src/ layout per ARCHITECTURE.md** — tools/, indexer/, graph/, output/, rules/
- **Stub files only** — each file exports an empty function or type placeholder, no real implementation
- **TypeScript strict mode** — catch issues early
- **@sinclair/typebox** — pi's convention for tool parameter schemas

## Components

- `package.json` — name, scripts (test, build, check), pi extension config, deps
- `tsconfig.json` — strict, ESM, bun types
- `src/index.ts` — pi extension entry point (stub)
- `src/graph/types.ts` — empty type exports (Node, Edge, Provenance)
- `src/graph/store.ts` — empty store interface
- `src/graph/sqlite.ts` — empty SQLite impl
- `src/indexer/pipeline.ts` — empty pipeline orchestrator
- `src/indexer/tree-sitter.ts` — empty Stage 1
- `src/tools/` — empty tool stubs (symbol-graph, resolve-edge)
- `src/output/anchoring.ts` — empty output layer
- `test/` — one smoke test proving bun:test works

## Testing Strategy

- Smoke test: `bun test` runs and passes with a trivial assertion
- Import test: `src/index.ts` can be imported without error
- Future issues will add real tests per TDD — this issue just proves the test runner works
