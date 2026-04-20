# Implement Task 001 — Traverse inbound `implements` edges in `collectImpactDetails`

## RED
- Added test: `test/tool-impact-implements-edges.test.ts`
- Ran: `bun test test/tool-impact-implements-edges.test.ts`
- Observed expected failure:
  - First test failed with `expect(received).toEqual(expected)`
  - Received: `[]`

## GREEN
- Updated `src/tools/impact.ts` to merge inbound `calls` and inbound `implements` neighbors before dedupe.
- Re-ran: `bun test test/tool-impact-implements-edges.test.ts`
- Result: `2 pass, 0 fail`

## Regression check
- Ran: `bun test`
- Result: `379 pass, 2 fail`
- Remaining failures are in `test/tool-impact-083-repro.test.ts` and match follow-on planned work:
  - entry-point diagnostic still missing (#073 / Task 2)
  - reproduction test expectations are not yet aligned with implements traversal (Task 3)
