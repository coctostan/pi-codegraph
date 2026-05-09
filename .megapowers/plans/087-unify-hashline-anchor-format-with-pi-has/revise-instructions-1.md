## Task 1: Add pi-hashline-compatible line hash helper

Do not claim AC 16 in this task unless it tests a codegraph-emitted editable anchor token. The current golden-vector test only exercises `computeLineHash(...)`, not an emitted `LINE:HASH` anchor from codegraph output. Either remove `AC 16` from this task's `Covers` line and cover it in Task 2, or add the emitted-anchor compatibility test after Task 2.

Also fix Step 5. Since Task 1 only adds `computeLineHash`/`ensureHashInit` and does not switch callers yet, the full suite should still pass immediately:

```md
Run: `bun test`
Expected: PASS — all tests passing.
```

Do not leave Step 5 saying downstream tasks are required before the suite can pass.

## Task 2: Switch computeAnchor to bare editable anchors

AC 8 is incomplete. The implementation handles missing files and line ranges, but it does not handle "otherwise unavailable line content" because `readFileSync(fullPath, "utf-8")` can still throw for unreadable paths/directories. Wrap the read/hash/line extraction path and return a stale non-editable anchor instead of throwing:

```ts
export function computeAnchor(node: GraphNode, projectRoot: string): AnchorResult {
  const fullPath = join(projectRoot, node.file);

  if (!existsSync(fullPath)) {
    return { file: node.file, anchor: `${node.start_line}:?`, stale: true };
  }

  let fileContent: string;
  try {
    fileContent = readFileSync(fullPath, "utf-8");
  } catch {
    return { file: node.file, anchor: `${node.start_line}:?`, stale: true };
  }

  const currentHash = sha256Hex(fileContent);
  const stale = currentHash !== node.content_hash;
  const lines = fileContent.split("\n");
  const lineIndex = node.start_line - 1;

  if (lineIndex < 0 || lineIndex >= lines.length) {
    return { file: node.file, anchor: `${node.start_line}:?`, stale: true };
  }

  const lineHash = computeLineHash(node.start_line, lines[lineIndex]!);
  return { file: node.file, anchor: `${node.start_line}:${lineHash}`, stale };
}
```

Add tests for all AC 8 cases, not just missing file:

```ts
expect(computeAnchor({ ...node, start_line: 99 }, projectRoot).anchor).toBe("99:?");
expect(computeAnchor({ ...node, file: "src" }, projectRoot).anchor).toBe("1:?"); // directory/unreadable as file
```

Cover AC 16 here with a compatibility test using the emitted `computeAnchor(...).anchor` token. Do not import pi-hashline-readmap internals. Parse the emitted token using the public expected shape and recompute the expected hash from the corresponding file line:

```ts
const result = computeAnchor(node, projectRoot);
const match = result.anchor.match(/^(\d+):([0-9a-f]{3})$/);
expect(match).not.toBeNull();
const lineNumber = Number(match![1]);
const emittedHash = match![2];
const line = fileContent.split("\n")[lineNumber - 1]!;
expect(emittedHash).toBe(computeLineHash(lineNumber, line));
```

Fix Step 5 to require `bun test` passing after this task, or explicitly include all affected fixture/type updates needed so it actually passes.

## New task after Task 3: Initialize direct unit tests and update stale assertions

Adding `computeLineHash` with a required `ensureHashInit()` means direct unit tests that call `computeAnchor`, `symbolGraph`, `impact`, `trace`, `symbolCard`, `renderLegacyNeighborhoodBody`, or `readSourceSnippet` will throw unless they initialize hashing. The current plan initializes public extension executors only; it does not make the direct test suite pass.

Add a small follow-up task after Task 3 that updates direct tests to initialize hashing before calling these APIs. Use this exact import in each affected test file:

```ts
import { ensureHashInit } from "../src/output/anchoring.js";
```

Then make tests async and call:

```ts
await ensureHashInit();
```

At minimum, cover the files found by the current repo search for direct calls, including these high-impact files:

```text
test/tool-symbol-graph-legacy-neighborhood.test.ts
test/tool-symbol-graph-default-card.test.ts
test/tool-symbol-graph-source-include.test.ts
test/tool-symbol-graph-all-edge-kinds.test.ts
test/tool-impact-*.test.ts
test/tool-trace-*.test.ts
test/tool-symbol-card-*.test.ts
test/read-source-snippet.test.ts
test/extension-impact.test.ts
```

The task Step 5 must be:

```md
Run: `bun test`
Expected: PASS — all tests passing.
```

## Task 5: Render symbol-resolution candidates with separate file context

AC 10 is incomplete. `src/tools/symbol-graph.ts` has its own ambiguity renderer in `renderLegacyNeighborhoodBody(...)` and is not updated by `src/tools/symbol-resolution.ts`. Current code:

```ts
lines.push(`  ${anchor.anchor}  ${node.name} (${node.kind})  ${node.file}${staleMarker}`);
```

Add `src/tools/symbol-graph.ts` to this task and import `formatAnchorLocation` from `../output/anchoring.js`:

```ts
import {
  computeAnchor,
  rankNeighbors,
  formatNeighborhood,
  formatAnchorLocation,
  type AnchoredNeighbor,
  type NeighborSection,
  type NamedSection,
} from "../output/anchoring.js";
```

Replace the legacy ambiguity row with:

```ts
lines.push(`  ${formatAnchorLocation(anchor)}  ${node.name} (${node.kind})${staleMarker}`);
```

Add a regression test for `symbolGraph({ name: "foo", include: ["neighborhood"], store, projectRoot })` with two matching `foo` nodes. Assert the ambiguity output contains:

```ts
expect(output).toContain("src/a.ts  1:c27  foo (function)");
expect(output).not.toContain("src/a.ts:1:");
```

Task 5 Step 5 must run `bun test`, not only the two ambiguous tests, and must expect all passing.

## Task 6: Render symbol card anchors with separate file context

The tests exercise `symbolCard(...)`, but public `symbol_graph` default/card output uses `renderSymbolCardBody(...)` through `symbolGraph(...)`, not `symbolCard(...)`. Add a test that calls the real public path:

```ts
import { symbolGraph } from "../src/tools/symbol-graph.js";

const output = symbolGraph({ name: "foo", store, projectRoot });
expect(output).toContain("## foo (function)");
expect(output).toContain("src/foo.ts  1:c27");
expect(output).not.toContain("src/foo.ts:1:");
```

Keep the implementation instruction to replace all direct `anchor.anchor` render sites in `src/tools/symbol-card.ts` and `src/tools/symbol-contract.ts` with `formatAnchorLocation(...)`, including `renderSymbolCardBody`, `renderSymbolSourceSection` ambiguity rows, `symbolCard`, covering test rows, and contract rows.

Task 6 Step 5 must be `bun test` expected all passing.

## Task 8: Render trace anchors with separate file context

AC 12 includes both trace steps and file-scoped miss candidates. The current test covers static trace steps only. Add a file-scoped miss regression test for `formatFileScopedMiss(...)` via the public `trace(...)` function:

```ts
const output = trace({ entry: "foo", file: "src/missing.ts", store, projectRoot });
expect(output).toContain('Symbol "foo" was not found in src/missing.ts');
expect(output).toContain("src/a.ts  1:c27  foo (function)");
expect(output).not.toContain("src/a.ts:1:");
```

Keep the implementation change:

```ts
lines.push(`  ${formatAnchorLocation(anchor)}  ${node.name} (${node.kind})${staleMarker}`);
```

for `formatFileScopedMiss(...)`, and use `formatAnchorLocation(anchor)` in both stored and live trace step renderers.

Task 8 Step 5 must be `bun test` expected all passing.

## Task 9: Render source snippets with compatible line hashes

AC 14 says `readSourceSnippet` preserves guard behavior for invalid requested ranges. The existing test file has missing-file and `end_line: null` guards, but no explicit invalid-range regression. Add tests for at least:

```ts
expect(readSourceSnippet({ ...node, start_line: 0, end_line: 1 }, projectRoot)).toBeNull();
expect(readSourceSnippet({ ...node, start_line: 2, end_line: 99 }, projectRoot)).toBeNull();
expect(readSourceSnippet({ ...node, start_line: 3, end_line: 2 }, projectRoot)).toBeNull();
```

Because `readSourceSnippet` will call `computeLineHash`, update all existing tests in `test/read-source-snippet.test.ts` that call it on a valid file to initialize hashing first:

```ts
import { ensureHashInit } from "../src/output/anchoring.js";

await ensureHashInit();
```

Task 9 Step 5 must run `bun test` and expect all passing.

## Task 10: Update anchor-format documentation

AC 20 is incomplete. Root `VISION.md` still says:

```md
Every node in every response carries `file:line:hash`. The agent can edit any result immediately. No translation layer between "understanding" and "acting."
```

Add `VISION.md` to `files_to_modify` and replace that claim with wording consistent with README/ARCHITECTURE: file path is separate context, the editable token is bare `LINE:HASH`, and edit-before-file-anchoring is still out of scope.

Also make the verification step include a doc grep over root docs, for example:

```md
Verify no root docs still claim `file:line:hash` as the editable anchor format or claim edit-without-read without the read-before-edit gate caveat.
```

Keep `AGENTS.md` in scope because it currently documents `file:line:hash` as the output format.
