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
