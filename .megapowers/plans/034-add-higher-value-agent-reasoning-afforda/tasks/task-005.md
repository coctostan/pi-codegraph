---
id: 5
title: Append always-on impact why annotations
status: approved
depends_on:
  - 4
no_test: false
files_to_modify:
  - src/tools/impact.ts
  - test/extension-impact.test.ts
files_to_create:
  - test/tool-impact-output-signals.test.ts
---

**Files:**
- Create: `test/tool-impact-output-signals.test.ts`
- Modify: `src/tools/impact.ts`
- Modify: `test/extension-impact.test.ts`
- Test: `test/tool-impact-output-signals.test.ts`

**TDD Steps:**
1. Add a tool-level impact output test that writes real fixture files, calls `impact(...)`, and asserts the line still contains anchor + classification + depth plus an inline bracketed annotation with role tags, `fan-in`, coverage, `co-change`, and `chain-confidence`; also update the existing exact-line regex assertions in `test/extension-impact.test.ts` to accept the new trailing annotation with an optional stale marker `( \[stale\])?` between `depth:1` and the new bracketed suffix.
2. Run `bun test test/tool-impact-output-signals.test.ts` and confirm it fails because the annotation is missing.
3. Update only the `impact(...)` renderer in `src/tools/impact.ts` to call `formatImpactWhy(hit.signals, hit.chainConfidence)` and append the returned bracketed suffix without removing stale markers, `classification`, or `depth`, then update `test/extension-impact.test.ts` so its exact-line regexes match the new annotated output by keeping the optional stale marker `( \[stale\])?` between `depth:1` and `  \[fan-in:`.
4. Re-run `bun test test/tool-impact-output-signals.test.ts` and expect PASS.
5. Run `bun test` and expect all passing.
