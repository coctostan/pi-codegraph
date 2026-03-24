# Feature: Add PTC metadata to read-only tools for code_execution exposure

## Summary
Added `ptc` metadata to pi-codegraph's 6 read-only tool registrations (`symbol_graph`, `impact`, `trace`, `graph_query`, `symbol_card`, `symbol_contract`) so they are discoverable and callable inside PTC's `code_execution` runtime. The 2 mutating tools (`resolve_edge`, `delete_edge`) remain direct-only.

## Why
PTC's `code_execution` runtime only exposes extension tools that explicitly opt in via `ptc` metadata. Without it, codegraph's read-only tools were invisible to programmatic tool calling inside `code_execution`, limiting agent workflows that combine codegraph queries with other programmatic operations.

## What Changed
- **`src/index.ts`** — Added `registerReadOnlyTool<TParams>()` wrapper function that attaches PTC metadata (`callable: true`, `enabled: true`, `policy: "read-only"`, `readOnly: true`, `pythonName`, `defaultExposure: "opt-in"`) to tool registration objects via runtime mutation. 6 read-only tool registrations changed from `pi.registerTool()` to `registerReadOnlyTool(pi, ...)`. Full type safety preserved via generic `ToolDefinition<TParams>` parameter.
- **`tests/ptc-metadata.test.ts`** — New test file with 8 tests verifying ptc metadata presence on read-only tools and absence on mutating tools.

## Design Decisions
- Used a wrapper function with `(tool as any).ptc = ptc` mutation rather than spreading `as any` into object literals, which would have poisoned TypeScript's generic inference for `execute` parameter types.
- `pythonName` is derived from `tool.name` automatically, eliminating name/pythonName mismatch risk.
