# Reproduction: impact() returns empty output instead of diagnostics

## Steps to Reproduce

### Bug #042 — Non-existent symbol returns empty body
1. Create a `SqliteGraphStore` with at least one node
2. Call `impact({ symbols: ["nonExistentSymbol_ZZZ"], changeType: "behavior_change", store, projectRoot, maxDepth: 5 })`
3. Observe the output is just the trust header with an empty body

### Bug #043 — Addition change type returns empty body
1. Create a `SqliteGraphStore` with a node named "shared" and callers
2. Call `impact({ symbols: ["shared"], changeType: "addition", store, projectRoot, maxDepth: 5 })`
3. Observe the output is just the trust header with an empty body

## Expected Behavior

### Bug #042
Output should contain `Symbol "nonExistentSymbol_ZZZ" not found` in the body (consistent with how `symbol_graph` and `trace` handle not-found symbols).

### Bug #043
Output should contain a message explaining that addition impact analysis is not supported, e.g., `addition: impact analysis for additions is not yet supported`.

## Actual Behavior

### Bug #042
```
"## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\n"
```
Just a trust header, empty body. No indication the symbol wasn't found.

### Bug #043
```
"## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\n"
```
Just a trust header, empty body. No indication that addition is unsupported. An agent could conclude "zero impact" and miss consequences.

## Evidence

### Bug #042 — Code path in `src/tools/impact.ts:148`
```typescript
if (resolved.kind === "not_found") return prependTrustHeader("", { stats });  // ← discards resolved.text
```
`resolveUniqueSymbol` returns `{ kind: "not_found", text: 'Symbol "nonExistentSymbol_ZZZ" not found' }` but the text is ignored — empty string passed instead.

Contrast with `src/tools/trace.ts:105-106` which correctly uses `resolved.text`:
```typescript
if (resolved.kind === "not_found" || resolved.kind === "ambiguous") {
    return prependTrustHeader(resolved.text, { stats });
}
```

### Bug #043 — Code path in `src/tools/impact.ts:68,160`
```typescript
// Line 68:
if (changeType === "addition") return [];  // silently returns empty

// Line 160:
if (hits.length === 0) return prependTrustHeader("", { stats });  // empty body = "no impact"
```
Both `collectImpactDetails` (line 68) and `classify` (line 37) silently return empty/null for additions, and the rendering at line 160 treats empty results as success with no diagnostic.

## Environment
- Runtime: Bun v1.3.11
- Test framework: bun:test
- OS: macOS

## Failing Test

File: `test/tool-impact-empty-output.test.ts`

```typescript
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { impact } from "../src/tools/impact.js";

test("impact() returns diagnostic message for non-existent symbol (#042)", () => {
  const projectRoot = join(tmpdir(), `pi-cg-not-found-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "lib.ts"), "export function shared() { return 1; }\n");
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/lib.ts::shared:1", kind: "function", name: "shared", file: "src/lib.ts", start_line: 1, end_line: 1, content_hash: "h" });
    const out = impact({
      symbols: ["nonExistentSymbol_ZZZ"],
      changeType: "behavior_change",
      store,
      projectRoot,
      maxDepth: 5,
    });
    expect(out).toContain("## Trust");
    expect(out).toContain("not found");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("impact() returns diagnostic message for addition change type (#043)", () => {
  const projectRoot = join(tmpdir(), `pi-cg-addition-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "lib.ts"), "export function shared() { return 1; }\n");
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/lib.ts::shared:1", kind: "function", name: "shared", file: "src/lib.ts", start_line: 1, end_line: 1, content_hash: "h" });
    const out = impact({
      symbols: ["shared"],
      changeType: "addition",
      store,
      projectRoot,
      maxDepth: 5,
    });
    expect(out).toContain("## Trust");
    const bodyAfterTrust = out.split("\n").filter(line => !line.startsWith("##") && line.trim() !== "");
    const hasNonHeaderContent = bodyAfterTrust.some(line =>
      !line.startsWith("status:") && !line.startsWith("evidence:")
    );
    expect(hasNonHeaderContent).toBe(true);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

Both tests fail:
- Test 1: `expect(received).toContain(expected)` — Expected "not found", received only the trust header
- Test 2: `expect(received).toBe(expected)` — Expected `true` (non-header body content), received `false`

## Reproducibility

**Always** — both bugs reproduce 100% of the time.
