import { test } from "bun:test";
import { suppressFreshTrustHeader } from "../src/output/read-only-ceremony.js";

test("suppressFreshTrustHeader strips only fresh trust headers", () => {
  const fresh = [
    "## Trust",
    "status: fresh",
    "evidence: none  stale-files: 0/0",
    "rows: 1",
    "",
  ].join("\n");

  const freshResult = suppressFreshTrustHeader(fresh);
  if (freshResult !== "rows: 1\n") {
    throw new Error(`fresh trust header was not removed: ${JSON.stringify(freshResult)}`);
  }

  for (const status of ["stale", "mixed", "heuristic", "runtime-backed"] as const) {
    const nonFresh = [
      "## Trust",
      `status: ${status}`,
      "evidence: tree-sitter  stale-files: 1/2",
      "rows: 1",
      "",
    ].join("\n");

    const result = suppressFreshTrustHeader(nonFresh);
    if (result !== nonFresh) {
      throw new Error(`non-fresh trust header was modified: ${status}`);
    }
  }

  const bodyOnly = "rows: 1\n";
  const bodyOnlyResult = suppressFreshTrustHeader(bodyOnly);
  if (bodyOnlyResult !== bodyOnly) {
    throw new Error("body without trust header was modified");
  }
});
