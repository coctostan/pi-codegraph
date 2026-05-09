---
id: 9
title: Render trace anchors with separate file context
status: approved
depends_on:
  - 2
  - 3
  - 5
no_test: false
files_to_modify:
  - src/tools/trace.ts
  - test/tool-trace-static-fallback.test.ts
  - test/tool-trace-coverage.test.ts
  - test/tool-trace-signals.test.ts
  - test/tool-trace-stale.test.ts
  - test/tool-trace-static-mode-header.test.ts
  - test/tool-trace-trust-heuristic.test.ts
files_to_create: []
---

Covers AC 12 and part of AC 15.

**Files:**
- Modify: `src/tools/trace.ts`
- Modify: `test/tool-trace-static-fallback.test.ts`
- Modify: `test/tool-trace-coverage.test.ts`
- Modify: `test/tool-trace-signals.test.ts`
- Modify: `test/tool-trace-stale.test.ts`
- Modify: `test/tool-trace-static-mode-header.test.ts`
- Modify: `test/tool-trace-trust-heuristic.test.ts`

**Step 1 — Write the failing test**
Update `test/tool-trace-static-fallback.test.ts` with these assertions in the existing static fallback test and add the file-scoped miss test:

```ts
expect(output).toMatch(/src\/app\.ts  1:[0-9a-f]{3}  entry  function/);
expect(output).toMatch(/src\/app\.ts  2:[0-9a-f]{3}  first  function/);
expect(output).toMatch(/src\/app\.ts  3:[0-9a-f]{3}  second  function/);
expect(output).not.toMatch(/src\/app\.ts:1:[0-9a-f]{4}/);
```

Add:

```ts
test("trace file-scoped miss candidates render file-separated editable anchors", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-miss-anchor-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const content = "export function foo() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), content);

  const store = new SqliteGraphStore();
  try {
    store.addNode({
      id: "src/a.ts::foo:1",
      kind: "function",
      name: "foo",
      file: "src/a.ts",
      start_line: 1,
      end_line: 1,
      content_hash: createHash("sha256").update(content).digest("hex"),
    });

    const output = trace({ entry: "foo", file: "src/missing.ts", store, projectRoot });

    expect(output).toContain('Symbol "foo" was not found in src/missing.ts');
    expect(output).toContain("src/a.ts  1:c27  foo (function)");
    expect(output).not.toContain("src/a.ts:1:");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

Update existing trace output tests in this task as well. Replace old assertions such as:

```ts
expect(direct).toContain("src/app.test.ts:1:");
expect(lines[2]).toContain("src/app.ts:1:");
expect(lines.some((line) => /src\/app\.ts:1:[0-9a-f]{4}  prod  function/.test(line))).toBe(true);
```

with file-separated 3-hex assertions:

```ts
expect(direct).toMatch(/src\/app\.test\.ts  1:[0-9a-f]{3}/);
expect(lines[2]).toMatch(/src\/app\.ts  1:[0-9a-f]{3}/);
expect(lines.some((line) => /src\/app\.ts  1:[0-9a-f]{3}  prod  function/.test(line))).toBe(true);
expect(direct).not.toMatch(/src\/app\.ts:1:[0-9a-f]{4}/);
```

Add `import { createHash } from "node:crypto";` if the file does not already have it.

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-trace-static-fallback.test.ts`
Expected: FAIL — `expect(received).toMatch(expected)` for `/src\/app\.ts  1:[0-9a-f]{3}  entry  function/` because the trace line renders `1:<3hex>  entry  function ...` without the adjacent `src/app.ts` file context.

**Step 3 — Write minimal implementation**
In `src/tools/trace.ts`, import `formatAnchorLocation`:

```ts
import { computeAnchor, formatAnchorLocation } from "../output/anchoring.js";
```

Update stored and live trace row rendering:

```ts
return {
  line: `${formatAnchorLocation(anchor)}  ${node.name}  ${node.kind}${stale ? " [stale]" : ""} ${tags}`,
  stale,
};
```

```ts
return {
  line: `${formatAnchorLocation(anchor)}  ${node.name}  ${node.kind}${anchor.stale ? " [stale]" : ""} ${tags}`,
  stale: anchor.stale,
};
```

Update file-scoped miss candidates:

```ts
Also update the existing old-shape assertions in `test/tool-trace-coverage.test.ts`, `test/tool-trace-signals.test.ts`, `test/tool-trace-stale.test.ts`, `test/tool-trace-static-mode-header.test.ts`, and `test/tool-trace-trust-heuristic.test.ts` before running the full suite.

lines.push(`  ${formatAnchorLocation(anchor)}  ${node.name} (${node.kind})${staleMarker}`);
```

This preserves mode headers, names, kinds, role tags, and stale markers while separating file path from the bare editable anchor.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-trace-static-fallback.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: PASS — all tests passing.
