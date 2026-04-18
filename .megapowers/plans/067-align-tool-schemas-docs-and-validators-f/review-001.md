---
type: plan-review
iteration: 1
verdict: revise
reviewed_tasks:
  - 1
  - 4
  - 5
  - 6
  - 7
  - 8
  - 9
  - 10
  - 11
  - 2
  - 3
approved_tasks:
  - 1
  - 4
  - 5
  - 6
  - 7
  - 8
  - 9
  - 10
  - 11
needs_revision_tasks:
  - 2
  - 3
---


## Summary

10 of 11 tasks pass review. **Tasks 2 and 3 need revision** because they introduce a new module `src/graph/edge-kinds.ts`, which conflicts with:

- **Spec Out-of-Scope O1**: "Extracting shared constants/helpers for closed sets across schema + description + validator … may be done opportunistically during implementation only if it **stays within existing files** and changes no runtime behavior."
- **AC 2**: `VALID_EDGE_KINDS` must be "exported as `VALID_EDGE_KINDS` in `src/tools/resolve-edge.ts`" (not in a new module).
- **AC 4**: Must match `VALID_EDGE_KINDS` "in `src/tools/delete-edge.ts`".
- **AC 7**: The validators `isValidEdgeKind` in both tool files must "remain in place."

Fix: keep each tool's local `VALID_EDGE_KINDS` / `isValidEdgeKind` definitions and just add `export` keywords. Import the exported constant from each tool file directly in `src/index.ts`. No new file.

Detailed revise instructions written to `.megapowers/plans/067-align-tool-schemas-docs-and-validators-f/revise-instructions-1.md`.

## Per-task Assessment

- **Task 1** ✅ PASS — AC 1, AC 12. Test and Step 2 failure message accurately reflect current src/index.ts line 61 (`"Kind of change"`).
- **Task 2** ❌ REVISE — scope violation (new file) + AC 2/AC 7 file-location mismatch. See revise-instructions-1.md.
- **Task 3** ❌ REVISE — same issue for `delete-edge.ts` + AC 4/AC 7. See revise-instructions-1.md.
- **Task 4** ✅ PASS — AC 6, AC 15. Correctly gates on `CODEGRAPH_DEVMODE=1`; asserts schema stays `Type.Optional(Type.String)` per spec C4.
- **Task 5** ✅ PASS — AC 17. Lock-in regression test; Step 2 honestly notes it may already PASS after Tasks 1–4.
- **Task 6** ✅ PASS — AC 8, part of AC 16. Section-extraction regex is robust.
- **Task 7** ✅ PASS — AC 9, part of AC 16. Both presence and validity-of-examples assertions present.
- **Task 8** ✅ PASS — AC 10, part of AC 16. Reuses constants/helpers from Tasks 6–7 correctly.
- **Task 9** ✅ PASS — AC 11, part of AC 16. Quoted-match regex avoids English-word false positives.
- **Task 10** ✅ PASS — AC 18. Lock-in guard for #066 wording; exact expected description matches current src/index.ts line 35.
- **Task 11** ✅ PASS — AC 21, AC 19, AC 20. Registration-surface assertions match spec (5 public default + 3 dev-mode). `bun run check` included in Step 5.

## Coverage

All AC 1–22 are covered by at least one task. AC 7 is additionally guaranteed by existing tests (`test/tool-resolve-edge.test.ts`, `test/tool-delete-edge.test.ts`) that assert `"Invalid edge kind"` — the plan correctly notes those remain green under AC 22.

## Dependencies & Ordering

Dependency DAG is sound: 1 → {2, 4, 5, 10, 11}; 2 → 3; 2–5 → 5; 6 → 7 → 8 → 9. No cycles. Every task that references symbols from a prior task has a matching `depends_on` entry.

## TDD & Granularity

All tasks follow the 5-step TDD template with specific, accurate Step 2 failure messages. Each test file has a single behavioral focus. No "and" in titles; no multi-test tasks.

