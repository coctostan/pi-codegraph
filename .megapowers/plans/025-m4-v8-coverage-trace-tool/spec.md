## Goal
Build Stage 4 V8 coverage ingestion and the `trace` tool as graph-native features of the existing indexing/query system so agents can retrieve a deterministic, anchored symbol-level execution path from a test, production symbol, or straightforward endpoint. Coverage-backed traces should be preferred when available, persisted during indexing for fast queries, and marked stale when the underlying source content has changed.

## Acceptance Criteria
1. Stage 4 indexing reads one or more V8 coverage JSON files from the configured coverage input location.

2. Stage 4 indexing ignores coverage entries whose URLs do not resolve to project-local `.ts` or `.tsx` source files.

3. Stage 4 indexing produces a deterministic normalized coverage record order for the same input files across repeated runs.

4. Stage 4 indexing skips malformed coverage entries without aborting the full indexing run.

5. Coverage mapping resolves a coverage range to an existing graph node only when the node is in the same project-local file and its line range overlaps the covered range.

6. Coverage mapping does not create any graph edge or stored trace step for a coverage range that cannot be resolved to an existing graph node.

7. When a covered production symbol and a covering test symbol are both resolved, indexing persists a `tested_by` edge from the production symbol to the test symbol.

8. A `tested_by` edge created from coverage is persisted with provenance source `coverage`.

9. For each resolved test symbol, indexing persists one deterministic ordered symbol sequence that can be used later as the backing trace for that test.

10. Re-running coverage indexing with unchanged source content and unchanged coverage input does not create duplicate `tested_by` edges for the same production/test symbol pair.

11. Persisted coverage-backed trace artifacts store enough source-content identity to determine whether they are stale after relevant files change.

12. When `trace` is called with a test symbol that has a stored coverage-backed trace, it returns that stored ordered symbol sequence.

13. When `trace` is called with a production symbol covered by more than one stored test trace, it returns exactly one trace chosen by a deterministic selection rule.

14. When `trace` is called with an endpoint that already resolves through existing route relationships to a covered symbol, it returns the same deterministic coverage-backed trace selection used for a production symbol.

15. When no coverage-backed trace can be resolved for the requested entry point, `trace` falls back to a deterministic static graph traversal result.

16. When a stored coverage-backed trace resolves but its stored source-content identity no longer matches current source content, `trace` still returns the trace and marks it as stale.

17. `trace` output includes hashline anchors for every returned symbol step that can be anchored to current file content.

18. If a returned trace step cannot be anchored because the current file content no longer matches the stored location, `trace` marks that step as stale or unresolved instead of failing the whole trace request.

19. `trace` returns one trace only for a request in v1 and does not return multiple candidate traces.

## Out of Scope
- Generating V8 coverage data by running tests
- Building a general execution-event database
- Supporting non-TypeScript project files
- Guessing cross-file symbol mappings from coverage
- Returning or ranking multiple trace candidates
- Profiler-accurate runtime chronology beyond the persisted deterministic symbol sequence
- Endpoint tracing that requires new route inference beyond already-existing route relationships
- UI workflows for browsing traces

## Open Questions
