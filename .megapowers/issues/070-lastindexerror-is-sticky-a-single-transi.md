---
id: 70
type: bugfix
status: open
created: 2026-04-20T00:11:38.775Z
priority: 2
---
# lastIndexError is sticky: a single transient failure poisons every subsequent tool output
## Summary

`lastIndexError` in `src/index.ts:64` is module-level state. Once set, it's only cleared when a subsequent `ensureIndexed` call completes **without throwing and without `result.errors > 0 && !dbIsWritable()`** (`src/index.ts:101-113`).

```ts
async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  try {
    const result = await indexProject(projectRoot, store);
    if (result.errors > 0 && !dbIsWritable(projectRoot)) {
      lastIndexError = new Error("readonly database");
    } else {
      lastIndexError = null;
    }
  } catch (err) {
    lastIndexError = err instanceof Error ? err : new Error(String(err));
  }
}
```

## Problem

The cache has no TTL, no success-counter, and no way to distinguish "this error is still relevant" from "this was a transient first-run hiccup that resolved 30 seconds ago". The `finalizeReadOnlyOutput` → `indexingFailedNote` path then prepends the cached error to **every tool output** for the lifetime of the pi agent process.

Observed this session: a transient write race during first-run indexing set `lastIndexError`. Subsequent tool calls did succeed (DB stabilized, all 175 files indexed, all later stages became no-ops), but because each success still went through the same `ensureIndexed` and those runs somehow also tripped the error (likely via the unguarded writes in companion issue), the note rode along on every output. Only after the DB fully stabilized across parallel calls did it clear.

Related: because the cached error object is captured once, even if the underlying condition fully heals, the message stays identical — no temporal signal that it's stale.

## Proposed fix

Two complementary changes:

**1. Clear-on-successful-read.** If a tool actually returns data (non-empty node lookup), treat that as evidence the store is functional and clear `lastIndexError` proactively:

```ts
function finalizeReadOnlyOutput(..., hadResults: boolean) {
  if (hadResults && lastIndexError?.message !== "readonly database") {
    lastIndexError = null;
  }
  ...
}
```

(Don't clear on literal "readonly database" — that one is verified-persistent, not transient.)

**2. Attach a timestamp.** Store `{ error: Error; setAt: number }` instead of just `Error`. In `indexingFailedNote`, include age:

```ts
return `indexing-failed (${ageSeconds}s ago): ${last.error.message}\n`;
```

Agents can then decide whether a 0.2-second-old error is worth worrying about vs a 300-second-old one.

## Test

Extend `test/readonly-graceful-degradation.test.ts` with:
- Set `lastIndexError` via a forced failure
- Make the next `ensureIndexed` call succeed against a healthy store
- Assert the note is gone from the *second* tool invocation, not the third+

## Dependencies

Cleaner once companion issue (unguarded writes) lands — fewer spurious errors to clear in the first place.

## Impact

Low risk. Improves DX: transient errors should look transient, not permanent.
