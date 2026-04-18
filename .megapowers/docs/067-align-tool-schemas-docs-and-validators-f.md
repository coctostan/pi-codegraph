# #067 Align tool schemas, docs, and validators for closed-value parameters

## Summary
This bugfix closes schema/docs/validator drift for closed-value tool parameters on the public `pi-codegraph` surface.

The change aligns four audited parameters so the registered TypeBox schema, parameter descriptions, README text, and runtime validation all advertise the same closed sets:
- `impact.changeType`
- `resolve_edge.kind`
- `delete_edge.kind`
- `dead_code.kind`

It also preserves the prior #066 clarification for `symbol_graph.include` and adds regression tests so future description or schema drift is caught immediately.

## Why this was needed
Before this fix, some closed-set parameters were documented with open-ended wording such as `...` or `etc.`, and README coverage was incomplete. That made invalid values look plausible to agents even though runtime validators only accepted a smaller fixed set.

This issue hardens the public contract so agents see the real allowed values at every layer:
- registration schema
- parameter descriptions
- README examples and prose
- runtime validator error paths
- regression tests

## API surface aligned

### Registered entry point
From the extension source:

```ts
export default function piCodegraph(pi: ExtensionAPI): void
```

`piCodegraph` continues to register the same 5 default public tools and the same dev-mode-only tools; this issue only tightens the wording and schema shape of audited parameters.

### Runtime write-tool signatures
From the shipped tool implementations:

```ts
export function resolveEdge(params: ResolveEdgeParams): string
export function deleteEdge(params: DeleteEdgeParams): string
```

These signatures are unchanged. The runtime validators remain in place and still reject invalid edge kinds with the existing explicit message format.

## What changed

### `src/index.ts`
The extension registration source of truth now enumerates the exact allowed values for each audited parameter:
- `ResolveEdgeParams.kind` is a `Type.Union(...)` over the 8 `VALID_EDGE_KINDS` literals exported by `src/tools/resolve-edge.ts`
- `DeleteEdgeParams.kind` is a `Type.Union(...)` over the 8 `VALID_EDGE_KINDS` literals exported by `src/tools/delete-edge.ts`
- `ImpactParams.changeType` explicitly lists `"signature_change"`, `"removal"`, `"behavior_change"`, and `"addition"`
- `DeadCodeParams.kind` remains `Type.Optional(Type.String(...))` but now enumerates the 6 allowed node kinds in its description instead of using open-ended wording
- `SymbolGraphParams.include` remains locked to `"neighborhood" | "contract" | "source"` with the explicit note that `"tests"` is not valid

### `src/tools/resolve-edge.ts`
The existing canonical edge-kind list is now exported for schema and test alignment:
- `VALID_EDGE_KINDS`
- `isValidEdgeKind(kind: string): kind is EdgeKind`

Behavior did not change: `resolveEdge` still validates `kind` at runtime and still returns:

```txt
Invalid edge kind "<kind>". Valid kinds: calls, imports, implements, extends, tested_by, co_changes_with, renders, routes_to
```

### `src/tools/delete-edge.ts`
`delete_edge` now exposes the same canonical alignment points as `resolve_edge`:
- `VALID_EDGE_KINDS`
- `isValidEdgeKind(kind: string): kind is EdgeKind`

As with `resolve_edge`, runtime behavior is unchanged; this makes the closed set available to registration and regression tests without changing the tool contract.

### `README.md`
The public docs now explicitly list the closed sets in each affected section:
- `resolve_edge` lists all 8 edge kinds
- `delete_edge` lists all 8 edge kinds
- `impact` lists all 4 `changeType` values
- `dead_code` lists all 6 `NodeKind` filter values
- `symbol_graph` still states that `"tests"` is not a valid include value

## Regression coverage added
New regression tests now lock the aligned contract:
- `test/closed-enum-schemas.test.ts`
  - exact schema literals and exact parameter-description strings for `impact`, `resolve_edge`, `delete_edge`, and `dead_code`
- `test/docs-closed-enum-drift.test.ts`
  - README section coverage for all audited closed sets
  - example validation for both single- and double-quoted `kind` values
- `test/closed-enum-no-open-suffix.test.ts`
  - rejects `...` and `etc.` in audited parameter descriptions
- `test/symbol-graph-include-lock.test.ts`
  - preserves the #066 `symbol_graph.include` wording and literal set
- `test/tool-descriptions-style-guard.test.ts`
  - preserves the default/dev-mode registration surface and prevents top-level tool descriptions from absorbing parameter enumerations

## Files changed
From the final diff:
- `README.md`
- `src/index.ts`
- `src/tools/resolve-edge.ts`
- `src/tools/delete-edge.ts`
- `test/closed-enum-schemas.test.ts`
- `test/docs-closed-enum-drift.test.ts`
- `test/closed-enum-no-open-suffix.test.ts`
- `test/symbol-graph-include-lock.test.ts`
- `test/tool-descriptions-style-guard.test.ts`

## Verification
The fix was validated with:
- focused audited suite: `33 pass, 0 fail`
- description compliance subset: `3 pass, 0 fail`
- full suite: `459 pass, 0 fail`

The original symptom no longer reproduces: the registered schemas, README sections, and invalid-kind runtime messages all advertise the same closed sets.
