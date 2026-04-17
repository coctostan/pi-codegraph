---
id: 5
title: Add automated docs drift test and update public docs for unified symbol_graph
status: approved
depends_on:
  - 3
  - 4
no_test: false
files_to_modify:
  - README.md
  - ARCHITECTURE.md
  - docs/tool-descriptions.md
files_to_create:
  - test/docs-symbol-graph-unified-surface.test.ts
---

### Task 5: Add automated docs drift test and update public docs for unified symbol_graph [depends: 3, 4]

Covers AC 20, AC 22.
**Scope note (responds to review):**
The previous Task 5 ("append contract sections") duplicated behavior that already exists in `src/tools/symbol-graph.ts:191-195`, so it had no credible RED. Per reviewer guidance on Task 5 ("merge the contract append regression coverage into Task 3 / Task 4" — done; contract-append block is now left intact by Task 3) and on Task 8 ("convert this into a tested docs task or add a paired task that owns the docs drift test"), this slot is **repurposed** to own the docs drift test plus the README / ARCHITECTURE / tool-description updates that AC 20 and AC 22 require.

Because the current `README.md` still documents `symbol_card` and `symbol_contract` as public tools, the drift test has a real, specific RED state.
**Files:**
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `docs/tool-descriptions.md`
- Create: `test/docs-symbol-graph-unified-surface.test.ts`
**Step 1 — Write the failing test**
Create `test/docs-symbol-graph-unified-surface.test.ts`:

```ts
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("public docs describe symbol_graph as the unified lookup surface", () => {
  const readme = read("README.md");
  const architecture = read("ARCHITECTURE.md");
  const guide = read("docs/tool-descriptions.md");

  expect(readme).toContain('symbol_graph({ name: "validateToken" })');
  expect(readme).toContain('include: ["neighborhood"]');
  expect(readme).toContain('include: ["contract"]');
  expect(readme).toContain('include: ["source"]');
  expect(readme).not.toContain("#### `symbol_card`");
  expect(readme).not.toContain("#### `symbol_contract`");

  expect(architecture).toContain("symbol_graph");
  expect(architecture).not.toContain("symbol_card tool");
  expect(architecture).not.toContain("symbol_contract tool");

  expect(guide).toContain("5-tool default public surface");
  expect(guide).toContain("internal-only `symbol_search`");
});
```
**Step 2 — Run test, verify it fails**
Run: `bun test test/docs-symbol-graph-unified-surface.test.ts`
Expected: FAIL — Bun first reports `expect(received).toContain(expected)` against `include: ["neighborhood"]` from `README.md`. The same test also remains red on the missing `include: ["source"]` example, the `"5-tool default public surface"` guide text, and the `README.md` / `ARCHITECTURE.md` `symbol_card` / `symbol_contract` references.
**Step 3 — Write minimal implementation**
Update the three docs files so the assertions above hold.

In `README.md`:
- Replace the 7-public-tools language with the 5 default public tools: `symbol_graph`, `resolve_edge`, `delete_edge`, `impact`, `trace`.
- Remove the standalone `#### `symbol_card`` and `#### `symbol_contract`` subsections entirely.
- Expand the `symbol_graph` subsection with these usage patterns (copy-pasteable example lines):
  - `symbol_graph({ name: "validateToken" })`
  - `symbol_graph({ name: "validateToken", include: ["neighborhood"] })`
  - `symbol_graph({ name: "validateToken", include: ["contract"] })`
  - `symbol_graph({ name: "validateToken", include: ["source"] })`
  - `symbol_graph({ name: "validateToken", include: ["neighborhood", "contract", "source"] })`
- Update the project-structure comments so `symbol-card.ts` and `symbol-contract.ts` are described as internal/shared rendering modules, not public tools.

In `ARCHITECTURE.md`:
- Update the system overview ASCII block so the public surface lists only `symbol_graph | resolve_edge | delete_edge | impact | trace`.
- Replace any `symbol_card tool` / `symbol_contract tool` prose so only `symbol_graph` is described as a public tool; reference `symbol-card.ts` / `symbol-contract.ts` as shared renderer modules used by `symbol_graph`.

In `docs/tool-descriptions.md`:
- Update the maintenance note so the source of truth reflects the `5-tool default public surface` plus dev-only tools and `internal-only `symbol_search``.
- Add a short note that `symbol_graph.include` usage belongs in README/schema docs, while top-level descriptions stay terse.
**Step 4 — Run test, verify it passes**
Run: `bun test test/docs-symbol-graph-unified-surface.test.ts`
Expected: PASS
**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
