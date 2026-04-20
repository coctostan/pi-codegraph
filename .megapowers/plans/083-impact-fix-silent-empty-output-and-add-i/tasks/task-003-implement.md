# Implement Task 003 — Align reproduction regression test with final diagnostic/traversal behavior

## RED
- Tightened `test/tool-impact-083-repro.test.ts` to assert the final post-fix contract instead of loose reproduce-phase expectations.
- Removed temporary `console.log` instrumentation from the reproduction tests.
- Ran: `bun test test/tool-impact-083-repro.test.ts`
- Observed failure:
  - entry-point case expected the explicit entry-point diagnostic
  - received the generic isolated-symbol diagnostic instead because the reproduction fixture did not mark exported symbols with `is_exported`

## GREEN
- Kept the tightened assertions in `test/tool-impact-083-repro.test.ts`.
- Updated the shared `setup()` fixture in the same test file to set `is_exported: true` on the exported reproduction nodes so the test reflects the final signal/diagnostic behavior established by Tasks 1 and 2.
- Re-ran: `bun test test/tool-impact-083-repro.test.ts`
- Result: `3 pass, 0 fail`

## Regression check
- Ran: `bun test`
- Result: `385 pass, 0 fail`
