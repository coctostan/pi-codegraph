---
id: 3
title: Record the keep-branch regression checks for non-zero tools
status: approved
depends_on:
  - 2
no_test: true
files_to_modify:
  - .megapowers/plans/063-m10-phase-5-dead-code-cut-remove-zero-us/summary.md
files_to_create: []
---

### Task 3: Record the keep-branch regression checks for non-zero tools [no-test] [depends: 2]

**Covers:** AC4, AC7

**Justification:** when telemetry says a candidate stays on the surface, the implementation branch is verification-only. This task records and runs the existing regression suites that protect each kept tool's actual runtime guarantees.
**Files:**
- Modify: `.megapowers/plans/063-m10-phase-5-dead-code-cut-remove-zero-us/summary.md`

**Step 1 — Make the change**
Append a `## Keep-branch verification` section to `summary.md` with the exact command to run for each tool whose Task 2 decision is `keep`:

```md
## Keep-branch verification
- `resolve_edge` keep -> `bun test test/extension-wiring.test.ts test/extension-tool-descriptions.test.ts test/extension-auto-index.test.ts test/readonly-graceful-degradation.test.ts test/tool-resolve-edge.test.ts test/tool-resolve-edge-empty-evidence.test.ts test/tool-resolve-edge-self-ref.test.ts`
- `delete_edge` keep -> `bun test test/extension-wiring.test.ts test/extension-tool-descriptions.test.ts test/token-tracker-wiring-check.test.ts test/tool-delete-edge.test.ts`
- `graph_query` keep -> `bun test test/extension-devmode-tools.test.ts test/extension-graph-query.test.ts test/extension-graph-query-description.test.ts test/extension-readonly-trust-gating.test.ts test/readonly-graceful-degradation.test.ts test/tool-graph-query-*.test.ts`
- `graph_overview` keep -> `bun test test/extension-devmode-tools.test.ts test/tool-graph-overview-*.test.ts test/token-tracker-all-tools.test.ts test/token-tracker-naive-files.test.ts`
- `dead_code` keep -> `bun test test/extension-devmode-tools.test.ts test/tool-dead-code-*.test.ts test/token-tracker-all-tools.test.ts`
```

Then run only the commands for the tools marked `keep` in `test/phase5-decision-matrix.ts`, and add one bullet per kept tool confirming that the command passed unchanged.
**Step 2 — Verify**
Run: `bun test`
Expected: all tests pass, and `summary.md` contains one passed keep-branch command for every tool whose Task 2 decision is `keep`. The keep commands must include the direct tool suites listed above, not only extension wiring tests.
