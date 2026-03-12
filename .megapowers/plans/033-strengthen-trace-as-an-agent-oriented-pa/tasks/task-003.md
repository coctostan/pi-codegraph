---
id: 3
title: Route coverage headers through the shared mode formatter
status: approved
depends_on:
  - 1
no_test: true
files_to_modify:
  - src/tools/trace.ts
files_to_create: []
---

### Task 3: Route coverage headers through the shared mode formatter [depends: 1] [no-test]

**Covers:** AC1, AC4

**Justification:** Pure refactor. `trace` already emits `mode: coverage` and `mode: coverage [stale]`; this task only routes the coverage branch through the shared formatter introduced in Task 1 so coverage and static headers cannot drift apart. Existing tests already cover the observable behavior.
**Files:**
- Modify: `src/tools/trace.ts`
**Step 1 — Make the change**
In `src/tools/trace.ts`, update the coverage-backed return site to use the shared `formatModeHeader()` helper introduced in Task 1:

```ts
  if (coverageTraceId) {
    const coverage = params.store.getTestTrace(coverageTraceId);
    if (coverage) {
      const rendered = coverage.steps.sort((a, b) => a.ordinal - b.ordinal).map((step) => formatStoredTraceLine(params.store, step.nodeId, step.contentHash, params.projectRoot));
      const traceStale = rendered.some((item) => item.stale);
      return `${[formatModeHeader("coverage", traceStale), ...rendered.map((item) => item.line)].join("\n")}\n`;
    }
  }
```

Do not change any step-line formatting.

**Step 2 — Verify**
Run: `bun test test/tool-trace-coverage.test.ts test/tool-trace-stale.test.ts`
Expected: PASS
