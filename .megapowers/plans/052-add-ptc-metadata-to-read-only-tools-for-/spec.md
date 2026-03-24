# Spec: Add PTC metadata to read-only tools for code_execution exposure

## Goal
Add `ptc` metadata to pi-codegraph's 6 read-only tool registrations so they are discoverable and callable inside PTC's `code_execution` runtime. Mutating tools remain direct-only.

## Acceptance Criteria

1. Each of `symbol_graph`, `impact`, `trace`, `graph_query`, `symbol_card`, `symbol_contract` has a `ptc` property on its registration object containing `{ callable: true, enabled: true, policy: "read-only", readOnly: true, pythonName: "<tool_name>", defaultExposure: "opt-in" }`.
2. `resolve_edge` and `delete_edge` registration objects do NOT have a `ptc` property.
3. A reusable helper (function or constant factory) generates the `ptc` metadata — the literal is not duplicated per tool.
4. TypeScript compilation passes without errors (type assertions used to work around `ToolDefinition` not declaring `ptc`).
5. `bun test` passes with no regressions — all existing tests remain green.
6. Tool behavior is unchanged — parameters, descriptions, execution logic, and output format are identical before and after.

## Out of Scope
- Exposing `resolve_edge` / `delete_edge` as PTC-callable mutating tools (D1).
- Registration-level test asserting `ptc` presence/absence (O1 — nice-to-have, not required).

## Open Questions
None.

## Requirement Traceability
- `R1` → AC 1
- `R2` → AC 2
- `R3` → AC 3
- `R4` → AC 4
- `R5` → AC 6
- `R6` → AC 5
- `R7` → AC 4
- `O1` → Out of Scope
- `D1` → Out of Scope
- `C1` → AC 4
- `C2` → AC 1 (confirms runtime preservation)
- `C3` → AC 1, AC 2 (single file scope)
