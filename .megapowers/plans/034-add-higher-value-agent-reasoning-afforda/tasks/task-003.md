---
id: 3
title: Add a shared signal computer for roles and quantitative signals
status: approved
depends_on:
  - 2
no_test: false
files_to_modify: []
files_to_create:
  - src/output/signals.ts
  - test/output-signals.test.ts
---

**Files:**
- Create: `src/output/signals.ts`
- Create: `test/output-signals.test.ts`
- Test: `test/output-signals.test.ts`

**TDD Steps:**
1. Add a new unit test file that covers: distinct call fan-in/fan-out counting, `entry-point` / `hub` / `leaf` tagging, `tested` / `untested`, `framework-mediated`, module-based co-change scoring, and formatting helpers for role tags and impact why annotations, including the `leaf` role appearing first in `formatImpactWhy(...)` for an untested leaf candidate.
2. Run `bun test test/output-signals.test.ts` and confirm it fails because `src/output/signals.ts` does not exist.
3. Create `src/output/signals.ts` with `NodeSignals`, `SignalComputer`, `createSignalComputer(store)`, distinct call-neighbor counting, module-node lookup by file, git evidence parsing for `co_changes`, `formatRoleTags(...)`, and `formatImpactWhy(...)`.
4. Re-run `bun test test/output-signals.test.ts` and expect PASS.
5. Run `bun test` and expect all passing.
