---
id: 28
type: bugfix
status: open
created: 2026-03-07T21:18:22.584Z
sources: [24]
priority: 1
---
# CI fix: sg empty-stdout breaks indexProject in environments without matches
In CI, `sg run --json` outputs an empty string (not `[]`) when there are no pattern matches. `runScan()` in `src/indexer/ast-grep.ts` passes this directly to `JSON.parse("")`, which throws `"Invalid sg JSON output: JSON Parse error: Unexpected EOF"`. This error propagates through `runAstGrepIndexStage` → `indexProject`, causing 11 pre-existing tests to fail that never exercised Stage 3 directly.

Fix: add `if (!stdout.trim()) return [];` in `runScan` after receiving stdout from the subprocess, before the `JSON.parse` call.
