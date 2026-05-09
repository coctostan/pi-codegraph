---
id: 8
title: Render impact anchors with separate file context
status: approved
depends_on:
  - 2
  - 3
  - 5
no_test: false
files_to_modify:
  - src/tools/impact.ts
  - test/tool-impact-output-signals.test.ts
  - test/extension-impact.test.ts
files_to_create: []
---

Covers AC 11 and part of AC 15.

**Files:**
- Modify: `src/tools/impact.ts`
- Modify: `test/tool-impact-output-signals.test.ts`
- Modify: `test/extension-impact.test.ts`

**Step 1 — Write the failing test**
Update `test/tool-impact-output-signals.test.ts` assertion to require file-separated anchors:

```ts
expect(out).toMatch(
  /src\/caller\.ts  2:[0-9a-f]{3}  caller  breaking  depth:1( \[stale\])?  \[fan-in:0, fan-out:1, roles:none, coverage:untested, co-change:0\.00, chain-confidence:0\.80\]/,
);
expect(out).not.toMatch(/src\/caller\.ts:2:[0-9a-f]{4}/);
```

Also update `test/extension-impact.test.ts` impact-output assertions in this task. Replace:

```ts
expect(out).toMatch(/src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1( \[stale\])?  \[fan-in:/);
expect(out).toMatch(/src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1( \[stale\])?  \[fan-in:.*\]\n/);
```

with:

```ts
expect(out).toMatch(/src\/caller\.ts  2:[0-9a-f]{3}  caller  breaking  depth:1( \[stale\])?  \[fan-in:/);
expect(out).toMatch(/src\/caller\.ts  2:[0-9a-f]{3}  caller  breaking  depth:1( \[stale\])?  \[fan-in:.*\]\n/);
expect(out).not.toMatch(/src\/caller\.ts:2:[0-9a-f]{4}/);
```

Keep the existing setup that builds `shared` and `caller` nodes and the `calls` edge.

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-impact-output-signals.test.ts`
Expected: FAIL — `expect(received).toMatch(expected)` because the impact row renders the bare anchor without adjacent file context, e.g. `2:<3hex>  caller  breaking ...`, instead of `src/caller.ts  2:<3hex>  caller  breaking ...`.

**Step 3 — Write minimal implementation**
In `src/tools/impact.ts`, import `formatAnchorLocation`:

```ts
import { computeAnchor, formatAnchorLocation } from "../output/anchoring.js";
```

Update the hit-row formatter:

```ts
const lines = hits.flatMap((hit) => {
  const node = params.store.getNode(hit.nodeId);
  if (!node) return [];
  const anchor = computeAnchor(node, params.projectRoot);
  const why = formatImpactWhy(hit.signals, hit.chainConfidence);
  return [
    `${formatAnchorLocation(anchor)}  ${hit.name}  ${hit.classification}  depth:${hit.depth}${anchor.stale ? " [stale]" : ""}  ${why}`,
  ];
});

Also update `test/extension-impact.test.ts` so extension-level impact tests no longer expect the old `file:line:4hex` impact row shape.
```

This preserves classification, depth, stale marker, and why-signal text while separating file path from the bare editable anchor.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-impact-output-signals.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: PASS — all tests passing.
