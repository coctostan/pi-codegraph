## Ordering issue: Task 2 / Task 3 / Task 4

The remaining blocker is task ordering vs the required Step 5 full-suite gate.

After the current Task 2 changes `computeAnchor(...)` to call the synchronous `computeLineHash(...)`, many existing direct unit tests that call `computeAnchor`, `symbolGraph`, `impact`, `trace`, `symbolCard`, or `readSourceSnippet` will throw:

```text
Error: Hash not initialized — call ensureHashInit() first
```

But the current direct-test preload task is Task 4, so Task 2's Step 5 (`bun test`) and Task 3's Step 5 (`bun test`) cannot honestly pass. The fix is to move the direct Bun test preload immediately after Task 1, before `computeAnchor` starts using `computeLineHash`.

### Required task order

Renumber/restructure the first four tasks to this order:

1. `Add pi-hashline-compatible line hash helper` — unchanged.
2. `Initialize direct test hash runtime` — moved from current Task 4, depends on Task 1 only.
3. `Switch computeAnchor to bare editable anchors` — moved from current Task 2, depends on Tasks 1 and 2.
4. `Initialize hash helper in extension tools` — moved from current Task 3, depends on Tasks 1, 2, and 3.

Then update downstream dependencies and `plan.md` accordingly:

```yaml
Task 5 depends_on: [2, 3]
Task 6 depends_on: [2, 3, 5]
Task 7 depends_on: [2, 3, 5]
Task 8 depends_on: [2, 3, 5]
Task 9 depends_on: [2, 3, 5]
Task 10 depends_on: [1, 2]
Task 11 depends_on: [1, 2, 3, 5, 6, 7, 8, 9, 10]
```

## New Task 2: Initialize direct test hash runtime

Because this task now runs before `computeAnchor` changes, its Step 1 test must not call `computeAnchor`. Use `computeLineHash(...)` from Task 1 instead.

Replace the moved task body with this self-contained TDD sequence:

```md
Covers AC 3 and AC 4 for direct unit tests that call synchronous hashline-compatible helpers and renderers.

**Files:**
- Create: `bunfig.toml`
- Create: `test/setup-hash-init.ts`
- Create: `test/hash-init-preload.test.ts`

**Step 1 — Write the failing test**
Create `test/hash-init-preload.test.ts`:

```ts
import { expect, test } from "bun:test";
import { computeLineHash } from "../src/output/anchoring.js";

test("direct unit tests preload hash initialization before synchronous line hashing", () => {
  expect(computeLineHash(1, "export function foo() {}")).toBe("c27");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/hash-init-preload.test.ts`
Expected: FAIL — `Error: Hash not initialized — call ensureHashInit() first`

**Step 3 — Write minimal implementation**
Create `test/setup-hash-init.ts`:

```ts
import { ensureHashInit } from "../src/output/anchoring.js";

await ensureHashInit();
```

Create `bunfig.toml`:

```toml
[test]
preload = ["./test/setup-hash-init.ts"]
```

This initializes hashing once for direct Bun unit tests that call `computeLineHash`, `computeAnchor`, `symbolGraph`, `impact`, `trace`, `symbolCard`, `renderLegacyNeighborhoodBody`, or `readSourceSnippet` without repeating `await ensureHashInit()` in every test file. The Task 1 pre-init guard test still uses a cache-busted module import and continues to verify the clear pre-init failure path.

**Step 4 — Run test, verify it passes**
Run: `bun test test/hash-init-preload.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: PASS — all tests passing.
```

## New Task 3: Switch computeAnchor to bare editable anchors

Move the current Task 2 body here and update frontmatter:

```yaml
id: 3
depends_on:
  - 1
  - 2
files_to_modify:
  - src/output/anchoring.ts
  - test/output-compute-anchor.test.ts
```

Keep the current Task 2 test and implementation body. With the preload from new Task 2 already in place, Step 5 can truthfully remain:

```md
Run: `bun test`
Expected: PASS — all tests passing after updating affected direct `AnchorResult` fixtures in this task.
```

## New Task 4: Initialize hash helper in extension tools

Move the current Task 3 body here and update frontmatter:

```yaml
id: 4
depends_on:
  - 1
  - 2
  - 3
files_to_modify:
  - src/index.ts
files_to_create:
  - test/extension-hash-init.test.ts
```

Keep the corrected assertions from the current Task 3:

```ts
expect(text).toContain("## foo (function)");
expect(text).toMatch(/\b1:c27\b/);
expect(text).not.toContain("Hash not initialized");
```

With the direct-test preload already in new Task 2, this task's Step 5 full-suite gate is now realistic.

## Downstream task metadata

If you keep Task IDs 5-11 unchanged, only update their `depends_on` metadata and any `plan.md` ordering notes/coverage table that mention old task numbers. Do not change their already-approved test and implementation bodies unless needed to repair the dependency renumbering.
