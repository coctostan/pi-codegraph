# Learnings — 025-m4-v8-coverage-trace-tool

- **V8 coverage JSON is messy** — entries can have non-file URLs, missing fields, non-array `functions`, and invalid JSON. Defensive double try/catch with `continue` is the right pattern for ingesting untrusted coverage data without aborting the whole pipeline.

- **`created_at` semantics matter** — Using a line number as `created_at` instead of `Date.now()` was a subtle bug caught in code review. When a field has an implicit contract across the codebase (timestamps = milliseconds), even "harmless" misuse creates confusion. Worth checking consistency on every new edge creation.

- **File content caching pays off early** — V8 coverage reports list many functions per file. Without caching, the parser would re-read the same source file once per function entry. A simple `Map<string, string>` eliminates redundant I/O with zero complexity cost.

- **Staleness via content hash is simple and effective** — Storing the content hash at trace-creation time and comparing against the current node hash on read gives accurate stale detection without re-reading files or maintaining a separate invalidation system.

- **Deterministic selection rules prevent flaky output** — Alphabetical sorting by node ID for test selection, multi-key sort for coverage records, and sorted `routes_to` handler traversal all ensure the same input always produces the same trace. This is critical for agent consumers who may cache or diff results.

- **Test/production heuristic is a known v1 limitation** — Classifying nodes as test vs production by filename suffix (`.test.ts`, `.spec.ts`) works for typical projects but misclassifies production helpers defined in test files. Worth revisiting if real-world coverage data exposes issues.
