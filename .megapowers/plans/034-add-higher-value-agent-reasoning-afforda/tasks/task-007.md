---
id: 7
title: Add inline signal tags to trace steps
status: approved
depends_on:
  - 3
no_test: false
files_to_modify:
  - src/tools/trace.ts
files_to_create:
  - test/tool-trace-signals.test.ts
---

**Files:**
- Create: `test/tool-trace-signals.test.ts`
- Modify: `src/tools/trace.ts`
- Test: `test/tool-trace-signals.test.ts`

**TDD Steps:**
1. Add a trace test that saves a coverage trace, renders it through `trace(...)`, and asserts production/helper step lines gain inline role tags while the `mode:` header remains unchanged; add a `calls` edge from `prod` to `helper` so `prod` is not tagged as a `leaf`.
2. Run `bun test test/tool-trace-signals.test.ts` and confirm it fails because step lines do not include tags.
3. Update `src/tools/trace.ts` to create one shared signal computer per invocation and append `formatRoleTags(...)` output in both stored coverage step rendering and live static step rendering; with the added `prod -> helper` call edge, `prod` should render `[entry-point, tested]` and `helper` should render `[leaf, untested]`.
4. Re-run `bun test test/tool-trace-signals.test.ts` and expect PASS.
5. Run `bun test` and expect all passing.
