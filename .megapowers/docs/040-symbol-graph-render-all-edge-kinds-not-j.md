# Feature: symbol_graph renders all edge kinds

## Summary
`symbol_graph` previously only rendered `calls` and `imports` edges, silently dropping 6 other edge kinds (`implements`, `extends`, `tested_by`, `co_changes_with`, `renders`, `routes_to`). This change generalizes the neighbor loop and output formatting so all 8 `EdgeKind` values render as labeled, direction-aware sections.

## What Changed

### `src/tools/symbol-graph.ts`
- Replaced hardcoded caller/callee/import buckets with a generic `Map<string, NeighborResult[]>` bucketing system keyed by section title
- Added `sectionTitle()` function mapping each `(edgeKind, direction)` pair to a human-readable heading (e.g., incoming `implements` → "Implemented By", outgoing → "Implements")
- Unknown/future edge kinds get a generic title derived from the kind string rather than being silently dropped
- Internal `__meta__` marker nodes are now filtered out (they leaked into output after generalization)
- Stale-check logic (`hasLocalExceptions`) now covers all rendered sections via `namedSections.some()`

### `src/output/anchoring.ts`
- New `NamedSection` interface: `{ title: string, section: NeighborSection }`
- `formatNeighborhood()` now accepts `sections: NamedSection[]` instead of 4 hardcoded positional parameters

### `src/index.ts`
- Removed `renderImplementationsSuffix()` bolt-on function and its call site — `implements` edges are now handled natively by `symbol-graph.ts`
- Removed unused `computeAnchor` import

## Direction-Aware Section Titles
| Edge Kind | Incoming | Outgoing |
|-----------|----------|----------|
| `calls` | Callers | Callees |
| `imports` | Imported By | Imports |
| `implements` | Implemented By | Implements |
| `extends` | Extended By | Extends |
| `tested_by` | Tested By | Tests |
| `co_changes_with` | Co-changes With | Co-changes With |
| `renders` | Rendered By | Renders |
| `routes_to` | Routed From | Routes To |

## Test Coverage
- 12 new tests across 3 new test files covering all edge kinds, directionality, section ordering, stale detection, output format stability, bolt-on absence, and unknown kind fallback
- 2 existing test files updated for new `formatNeighborhood` API
- 259 total tests, 0 failures
