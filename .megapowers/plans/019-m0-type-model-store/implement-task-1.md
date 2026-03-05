# Implement Task 1 — Type model: define unions/interfaces and nodeId helper

## Scope
Implemented Task 1 only (AC 1–10).

## RED
- Updated `test/graph-types.typecheck.ts` with the planned compile-time assertions.
- Ran:
  - `bun run check`
- Observed expected typecheck failure, including:
  - `Object literal may only specify known properties, and 'start_line' does not exist in type 'GraphNode'.`

## GREEN
- Replaced `src/graph/types.ts` with planned unions/interfaces/helper:
  - `NodeKind`, `EdgeKind`, `ProvenanceSource`
  - `Provenance`, `GraphNode`, `GraphEdge`
  - `nodeId(file, name, startLine)`
- Ran:
  - `bun run check` (pass)

## Full verification
- Ran:
  - `bun test && bun run check`
- Result:
  - `5 pass, 0 fail`
  - `tsc --noEmit` passed
