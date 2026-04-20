---
id: 8
title: "RC-D timestamp: indexingFailedNote emits age signal"
status: approved
depends_on:
  - 1
  - 7
no_test: false
files_to_modify:
  - src/index.ts
files_to_create:
  - test/indexing-failed-note-age.test.ts
---

Record a timestamp whenever `lastIndexError` is set, and have
`indexingFailedNote` include an age in seconds so agents can reason about
staleness. Output format:
`indexing-failed (${ageSeconds}s ago): ${lastIndexError.message}\n`.

**Files:**
- Modify: `src/index.ts`
- Create: `test/indexing-failed-note-age.test.ts`

**Step 1 — Write the failing test**

Create `test/indexing-failed-note-age.test.ts`:
```ts
import { expect, test, describe } from "bun:test";
describe("RC-D: indexingFailedNote includes an age", () => {
  test("helper renders 'indexing-failed (<N>s ago): <msg>' and preserves the prefix", async () => {
    const mod = await import("../src/index.js");
    mod.resetStoreForTesting();
    try {
      // Inject a synthetic error record at a known wall-clock time. The
      // helper-based assertion is deterministic: Task 7's clear-on-success
      // hook lives inside `finalizeReadOnlyOutput` and does not touch the
      // note helper directly, so we can exercise the formatter in isolation.
      mod.setLastIndexErrorForTesting(new Error("transient scan failure"), 1_000);

      // `now` is 4_500 ms, `setAt` is 1_000 ms — age is floor(3500/1000) = 3s.
      const note = mod.getIndexingFailedNoteForTesting(4_500);
      expect(note).toBe("indexing-failed (3s ago): transient scan failure\n");
      // Back-compat: existing assertions that only look for the prefix must
      // keep matching the new format.
      expect(note).toContain("indexing-failed");
    } finally {
      mod.setLastIndexErrorForTesting(null);
      mod.resetStoreForTesting();
    }
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/indexing-failed-note-age.test.ts`

Expected: FAIL — Task 7 already introduced `setLastIndexErrorForTesting(error)`
as a one-arg setter, so that call itself does not throw (the extra `1_000`
argument is silently ignored by the one-arg signature). The first failure
is the `getIndexingFailedNoteForTesting` call — that helper is new to this
task. Bun prints:
```
TypeError: mod.getIndexingFailedNoteForTesting is not a function
    at .../test/indexing-failed-note-age.test.ts
```
After scaffolding the getter but leaving the format unchanged, the
assertion changes to:
```
error: expect(received).toBe(expected)
Received: "indexing-failed: transient scan failure\n"
```
Either way, the test is red until both the extended setter and the new
getter land *and* `indexingFailedNote` delegates to the age-formatting helper.

**Step 3 — Write minimal implementation**

Edit `src/index.ts`. Replace the `lastIndexError` module variable with a
typed record that captures the time it was set. Update all three
assignment sites in `ensureIndexed` (`src/index.ts:105, 107, 110`) and
`indexingFailedNote` (`src/index.ts:115-118`).

Before (`src/index.ts:64`):
```ts
let lastIndexError: Error | null = null;
```
After:
```ts
interface IndexErrorRecord { error: Error; setAt: number }
let lastIndexError: IndexErrorRecord | null = null;
```

Update `getLastIndexErrorForTesting` at `src/index.ts:70-72` so its return
shape is stable (existing tests call `.message` on the result):

Before:
```ts
export function getLastIndexErrorForTesting(): Error | null {
  return lastIndexError;
}
```
After:
```ts
export function getLastIndexErrorForTesting(): Error | null {
  return lastIndexError ? lastIndexError.error : null;
}
```
**Extend** the test-only setter introduced in Task 7 to accept an optional
`setAt` timestamp (required by the new `IndexErrorRecord` shape), and **add** a
new `getIndexingFailedNoteForTesting` helper. Both live next to
`getLastIndexErrorForTesting` at `src/index.ts:70-72`. Task 7 shipped the
setter as `(error: Error | null) => void`; this task replaces that signature
with:

```ts
export function setLastIndexErrorForTesting(error: Error | null, setAt: number = Date.now()): void {
  lastIndexError = error ? { error, setAt } : null;
}

export function getIndexingFailedNoteForTesting(now: number = Date.now()): string {
  if (!lastIndexError) return "";
  const ageSeconds = Math.max(0, Math.floor((now - lastIndexError.setAt) / 1000));
  return `indexing-failed (${ageSeconds}s ago): ${lastIndexError.error.message}\n`;
}
```
Update `resetStoreForTesting` at `src/index.ts:77` — no structural change,
the `= null` assignment is still valid.

Update `ensureIndexed` at `src/index.ts:101-113`:

```ts
async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  try {
    const result = await indexProject(projectRoot, store);
    if (result.errors > 0 && !dbIsWritable(projectRoot)) {
      lastIndexError = { error: new Error("readonly database"), setAt: Date.now() };
    } else {
      lastIndexError = null;
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    lastIndexError = { error, setAt: Date.now() };
    // Indexing failed — degrade gracefully and serve stale graph data.
  }
}
```

Update `indexingFailedNote` at `src/index.ts:115-118` to delegate to the
shared helper so production code and the test helper use the exact same
format:

```ts
function indexingFailedNote(): string {
  return getIndexingFailedNoteForTesting();
}
```

Update `finalizeReadOnlyOutput` from Task 7. Task 7 placed the
transient-clear block **after** `indexingFailedNote()` was prepended (so
the current call's note carries the real message, while the next call
starts clean). Keep that location unchanged and dereference
`.error.message` on the new record shape:

```ts
function finalizeReadOnlyOutput(
  toolName: string,
  params: Record<string, unknown>,
  toolOutput: string,
  store: GraphStore,
  projectRoot: string,
): string {
  const withoutFreshHeader = suppressFreshTrustHeader(toolOutput);
  const withIndexingNote = indexingFailedNote() + withoutFreshHeader;
  if (
    lastIndexError &&
    lastIndexError.error.message !== "readonly database" &&
    withoutFreshHeader.trim().length > 0
  ) {
    lastIndexError = null;
  }

  return appendTokenMetaIfEnabled(toolName, params, withIndexingNote, store, projectRoot);
}
```

Do not move the clear-decision above `indexingFailedNote()` — that would
break Task 1's first-call assertion that the real captured message is
surfaced verbatim, and it would break Task 7's call-1 assertions that the
note is rendered on the first failing call.

**Step 4 — Run test, verify it passes**

Run: `bun test test/indexing-failed-note-age.test.ts`

Expected: PASS — `getIndexingFailedNoteForTesting(4_500)` returns
`"indexing-failed (3s ago): transient scan failure\n"` exactly, and the
same string contains the `indexing-failed` prefix.

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing. Specifically:
- `test/ensure-indexed-error-message.test.ts` (Task 1) still asserts
  `toContain("indexing-failed")` and `toContain("tsserver crashed")` — the
  new format keeps both substrings.
- `test/readonly-graceful-degradation.test.ts` asserts
  `toContain("indexing-failed")` — still passes; the new format starts
  with the same prefix.
- `test/last-index-error-clear-on-health.test.ts` (Task 7) calls
  `getLastIndexErrorForTesting()?.message` — still works because the
  getter returns the inner `Error`.
