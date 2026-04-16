# Implement Task 003

Completed Task 3: Gate `_meta` on `CODEGRAPH_DEVMETA`.

## Changes
- Added `test/extension-readonly-devmeta.test.ts` to verify `_meta` is hidden by default, enabled when `CODEGRAPH_DEVMETA=1`, and re-hidden when toggled off again in the same process.
- Updated `src/tools/token-tracker.ts` with `devMetaEnabled(...)` and `appendTokenMetaIfEnabled(...)` so the env flag is evaluated per call.
- Updated `src/index.ts` so centralized read-only output finalization uses the gated `_meta` appender.

## TDD Log
- RED: `bun test test/extension-readonly-devmeta.test.ts` failed with `Error: read-only output rendered _meta without CODEGRAPH_DEVMETA`.
- GREEN: `bun test test/extension-readonly-devmeta.test.ts` passed.
- REGRESSION: `bun test && bun run check` passed.
