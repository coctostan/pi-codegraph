---
id: 1
title: Add shared trust header formatter and status resolver
status: approved
depends_on: []
no_test: false
files_to_modify: []
files_to_create:
  - src/output/trust.ts
  - test/output-trust-header.test.ts
---

### Task 1: Add shared trust header formatter and status resolver

**Files:**
- Create: `src/output/trust.ts`
- Test: `test/output-trust-header.test.ts`

**Step 1 — Write the failing test**
```ts
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
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-trust-header.test.ts`
Expected: FAIL — `error: Cannot find module '../src/output/trust.js' from '/Users/maxwellnewman/pi/workspace/pi-codegraph/test/output-trust-header.test.ts'`

**Step 3 — Write minimal implementation**
```ts
import type { GraphStatistics } from "../graph/store.js";

export type TrustStatus = "fresh" | "stale" | "mixed" | "heuristic" | "runtime-backed";
export type TrustMode = "default" | "heuristic" | "runtime-backed";

export interface TrustHeaderContext {
  stats: GraphStatistics;
  mode?: TrustMode;
  hasLocalExceptions?: boolean;
}

export function collectEvidenceSources(stats: GraphStatistics): string[] {
  return Object.keys(stats.edges)
    .flatMap((kind) => Object.keys(stats.edges[kind] ?? {}))
    .filter((value, index, all) => all.indexOf(value) === index)
    .sort();
}

export function resolveTrustStatus(context: TrustHeaderContext): TrustStatus {
  const { stats, mode = "default", hasLocalExceptions = false } = context;
  const hasStaleFiles = stats.files.stale > 0;

  if (mode === "runtime-backed") {
    return hasStaleFiles || hasLocalExceptions ? "mixed" : "runtime-backed";
  }

  if (mode === "heuristic") {
    return hasStaleFiles || hasLocalExceptions ? "mixed" : "heuristic";
  }

  if (hasStaleFiles) return "stale";
  if (hasLocalExceptions) return "mixed";
  return "fresh";
}

export function formatTrustHeader(context: TrustHeaderContext): string {
  const status = resolveTrustStatus(context);
  const evidenceSources = collectEvidenceSources(context.stats);
  const evidence = evidenceSources.length > 0 ? evidenceSources.join(",") : "none";

  return [
    "## Trust",
    `status: ${status}`,
    `evidence: ${evidence}  stale-files: ${context.stats.files.stale}/${context.stats.files.total}`,
  ].join("\n");
}

export function prependTrustHeader(body: string, context: TrustHeaderContext): string {
  return `${formatTrustHeader(context)}\n${body}`;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-trust-header.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
