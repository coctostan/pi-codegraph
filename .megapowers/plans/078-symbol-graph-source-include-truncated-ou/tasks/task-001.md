---
id: 1
title: Lock the failing repro test as the RED contract for the new
  truncation-hint format
status: approved
depends_on: []
no_test: false
files_to_modify:
  - test/repro-078-source-truncation-hint.test.ts
files_to_create: []
---

**Files:**
- Modify (already exists from reproduce phase): `test/repro-078-source-truncation-hint.test.ts`

The reproduce phase already authored `test/repro-078-source-truncation-hint.test.ts`. This task adopts it as the canonical RED test for the new contract — no rewrite needed; just confirm it exists with the four loose assertions the spec requires (file path present, `offset: 51`, `limit: 50`, `read(`) and that it currently fails against `src/output/source.ts` HEAD.

**Step 1 — Write the failing test**

The test was lifted from `readSourceSnippet`'s current signature in `src/output/source.ts:21–25`:

```ts
export function readSourceSnippet(
  node: GraphNode,
  projectRoot: string,
  maxLines?: number,
): SourceSnippetResult | null
```

Confirm the file matches this canonical content. If it has drifted (e.g. been edited during diagnose), restore it verbatim:

```ts
// Reproduction for issue #078 — symbol_graph source include: truncated
// output gives no token count or continuation path.
//
// Acceptance: when readSourceSnippet truncates the body, the trailing
// notice must include a read() hint pointing at the first omitted line
// (file path + offset + limit) so the agent can fetch the rest in one
// follow-up call.

import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSourceSnippet } from "../src/output/source.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import type { GraphNode } from "../src/graph/types.js";

test("repro-078: truncated source includes read() continuation hint", () => {
  const projectRoot = join(tmpdir(), `pi-cg-repro-078-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  // 100-line function body. With the default maxLines of 50, we expect
  // 50 lines truncated and a hint pointing at line 51.
  const lines = Array.from({ length: 100 }, (_, i) => `  // line ${i + 1}`);
  const fileContent = lines.join("\n") + "\n";
  writeFileSync(join(projectRoot, "src/big.ts"), fileContent);
  const hash = sha256Hex(fileContent);

  const node: GraphNode = {
    id: "src/big.ts::big:1",
    kind: "function",
    name: "big",
    file: "src/big.ts",
    start_line: 1,
    end_line: 100,
    content_hash: hash,
  };

  try {
    const result = readSourceSnippet(node, projectRoot, 50);
    expect(result).not.toBeNull();
    expect(result!.truncated).toBe(50);

    // Bug: today the truncation notice is the bare string
    //   "(50 more lines truncated)"
    // and the agent has no way to read the remaining 50 lines without
    // a separate symbol lookup. The fix should emit a single-line hint
    // referencing the file path, the offset of the first omitted line,
    // and the count to read.

    // The hint must reference the file path so the agent can call read directly.
    expect(result!.text).toContain("src/big.ts");

    // The hint must reference the first omitted line as an offset.
    // First displayed line is 1, last displayed is 50, so first omitted is 51.
    expect(result!.text).toMatch(/offset:\s*51\b/);

    // The hint must indicate how many more lines remain.
    expect(result!.text).toMatch(/limit:\s*50\b/);

    // And it should be expressed as a read() call so the agent can copy/paste it.
    expect(result!.text).toMatch(/read\(/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

The four `expect` assertions on `result!.text` are deliberately loose (no exact phrasing) — Task 2 picks the final wording, and these assertions will continue to hold as long as the hint contains the file path, `offset:`, `limit:`, and `read(`.

**Step 2 — Run test, verify it fails**

Run: `bun test test/repro-078-source-truncation-hint.test.ts`

Expected: FAIL — Bun prints:

```
error: expect(received).toContain(expected)

Expected to contain: "src/big.ts"
Received: "1:cb8f|  // line 1\n…\n50:a0d9|  // line 50\n(50 more lines truncated)"

      at .../test/repro-078-source-truncation-hint.test.ts:51:26
(fail) repro-078: truncated source includes read() continuation hint
 0 pass
 1 fail
```

(Verified during reproduce — see `.megapowers/plans/078-symbol-graph-source-include-truncated-ou/reproduce.md` Evidence section.)

**Step 3 — Write minimal implementation**

Implementation deferred to Task 2 — this task only locks the failing test as the contract.

**Step 4 — Run test, verify it passes**

Skip — passing comes from Task 2.

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: 1 pre-existing failure on `test/repro-078-source-truncation-hint.test.ts`; all other tests pass. The test/read-source-snippet.test.ts:124 assertion `(15 more lines truncated)` still passes (current impl still produces that phrase).

After this task: `tests_failed` signal — RED is recorded for issue #078.
