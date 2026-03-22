import { expect, test } from "bun:test";
import {
  collectEvidenceSources,
  formatTrustHeader,
  prependTrustHeader,
  resolveTrustStatus,
} from "../src/output/trust.js";

test("trust header uses a compact shared contract without indexed-at timestamps", () => {
  const stats = {
    nodes: {},
    edges: {
      calls: { "tree-sitter": 2, lsp: 1 },
      tested_by: { coverage: 1 },
    },
    files: { total: 4, stale: 0 },
  };

  expect(collectEvidenceSources(stats)).toEqual(["coverage", "lsp", "tree-sitter"]);
  expect(resolveTrustStatus({ stats })).toBe("fresh");
  expect(resolveTrustStatus({ stats: { ...stats, files: { total: 4, stale: 1 } } })).toBe("stale");
  expect(resolveTrustStatus({ stats, hasLocalExceptions: true })).toBe("mixed");
  expect(resolveTrustStatus({ stats, mode: "heuristic" })).toBe("heuristic");
  expect(resolveTrustStatus({ stats, mode: "runtime-backed" })).toBe("runtime-backed");

  expect(formatTrustHeader({ stats })).toBe([
    "## Trust",
    "status: fresh",
    "evidence: coverage,lsp,tree-sitter  stale-files: 0/4",
  ].join("\n"));

  expect(prependTrustHeader("rows: 0\n", { stats })).toBe([
    "## Trust",
    "status: fresh",
    "evidence: coverage,lsp,tree-sitter  stale-files: 0/4",
    "rows: 0",
    "",
  ].join("\n"));

  expect(formatTrustHeader({ stats })).not.toContain("indexed-at");
  expect(formatTrustHeader({ stats })).not.toContain("recency");
});
