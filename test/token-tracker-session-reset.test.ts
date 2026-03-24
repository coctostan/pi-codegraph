import { expect, test } from "bun:test";
import { trackCall, getSessionStats, resetSession } from "../src/tools/token-tracker.js";
import { resetStoreForTesting } from "../src/index.js";

test("resetStoreForTesting also resets token tracker session", () => {
  resetSession();
  trackCall("symbol_graph", 100, 20);
  trackCall("trace", 200, 30);

  const before = getSessionStats();
  expect(before.totalCalls).toBe(2);

  resetStoreForTesting();

  const after = getSessionStats();
  expect(after.totalCalls).toBe(0);
  expect(after.totalTokensSaved).toBe(0);
});
