---
id: 67
type: feature
status: done
created: 2026-04-18T19:46:05.027Z
sources: [66]
priority: 3
---
# Align tool schemas, docs, and validators for closed-value parameters
## Goal
Clean up the broader tool-surface contract drift pattern exposed by #066 so agent-facing schemas, descriptions, docs, and runtime validators stay aligned for enum-like parameters.

## Why
Issue #066 fixed one concrete mismatch on `symbol_graph.include`, but the same class of problem still exists elsewhere:
- `impact.changeType` is a closed enum in the schema, but its parameter description is generic and README coverage is incomplete.
- `resolve_edge.kind` and `delete_edge.kind` are validated against a closed runtime set of edge kinds, but the registered schema still accepts any string.

This leaves agents under-informed about valid values and pushes discovery of the real contract to failure-time instead of registration/docs-time.

## Scope
Audit all currently registered tools for parameters that are effectively closed sets, then align the public contract across:
- TypeBox schema shape
- parameter descriptions
- top-level tool descriptions where relevant
- README / public docs examples
- regression tests that prevent drift

At minimum, cover:
1. `impact.changeType`
2. `resolve_edge.kind`
3. `delete_edge.kind`
4. any other registered tool parameter found during the audit with the same mismatch pattern

## Expected outcome
- Closed-value parameters explicitly enumerate valid values in schema/docs.
- Where runtime already enforces a closed set, the registered schema matches it.
- Public docs no longer rely on agents inferring valid literals from sparse examples.
- Regression tests lock the contract so drift like #066 does not silently reappear.

## Non-goals
- No changes to graph/indexing behavior.
- No new tool capabilities.
- No semantic expansion of valid values beyond what runtime already supports unless separately justified.

## Verification ideas
- Add or extend exact-surface tests for parameter descriptions and allowed literals.
- Add targeted README/docs drift tests for enumerated parameters.
- Reproduce invalid-value cases and confirm failures are now consistent with the published contract.
