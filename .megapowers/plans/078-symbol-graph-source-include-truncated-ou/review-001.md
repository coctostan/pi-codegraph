---
type: plan-review
iteration: 1
verdict: approve
reviewed_tasks:
  - 1
  - 2
  - 3
approved_tasks:
  - 1
  - 2
  - 3
needs_revision_tasks: []
---

## Review verdict: APPROVE

Tight 3-task plan for a single-site format-string fix. All seven "Fixed When" criteria from the diagnosis map to at least one task. Linear dependency chain. No forward references.

### Per-task assessment

**Task 1 — Lock RED contract** ✅
- Full test code in Step 1 (verbatim from reproduce phase).
- Step 2 expected error is the actual Bun output captured during reproduce (not paraphrased).
- Steps 3/4 explicitly deferred to Task 2 — appropriate for a contract-locking task that doesn't ship impl.
- Files: 1.

**Task 2 — Emit `read()` hint** ✅ with one structural note
- Step 1 contains the full updated assertion block for `test/read-source-snippet.test.ts:124`.
- Step 2 expected failure is the real Bun output: `Expected to contain: "src/a.ts" / "src/big.ts"`.
- Step 3 contains the full impl diff against `src/output/source.ts:52–55`.
- Step 5 calls out the four `extension-suppress-trust-header-*` tests as the explicit risk surface to verify.
- **Note for implementer:** Step 3 discovers mid-task that `test/tool-symbol-card-source.test.ts:184` also pins the literal old phrase (`"more lines truncated)"` — closing paren breaks under the new format). The task lists three files-to-modify and includes the corrected assertion (`/\(\d+ more lines — use read\(/`). Treat this as part of RED — update both existing tests' literal assertions before running Step 2/3, otherwise Step 2 will only show one failure instead of two. The "Files (final, after correction)" block is the source of truth.
- Files: 3 (at the documented `≤3 files` limit; justified — one logical change touches one impl file plus the two literal-assertion tests it invalidates).

**Task 3 — Doc update** ✅
- `[no-test]` justified (doc-only, no observable runtime behavior).
- Step 1 contains the full replacement text.
- Step 2 verification is two `grep` invocations (negative match for old phrase, positive match for `use read(`) plus a final full-suite run.
- Files: 1.

### Quality bar checks

1. **Coverage** ✅ — all 7 Fixed-When criteria mapped in `plan.md` table.
2. **Ordering & dependencies** ✅ — Task 2 depends on 1 (RED first), Task 3 depends on 2 (doc reflects shipped behavior). No cycles.
3. **TDD completeness** ✅ — every non-`[no-test]` task has full test code, full impl code, real run commands, real expected error text.
4. **Granularity** ✅ — Task 2 is at the 3-file limit but the changes are mechanically coupled (one format change invalidates the two literal-assertion tests in the same commit window).
5. **No-test validity** ✅ — Task 3 is the only `[no-test]`; justification + grep verification step both present.
6. **Self-containment** ✅ — every task has runnable test/impl code, no "similar to Task N" pointers.

### Risk surface confirmed
`impact readSourceSnippet behavior_change` ran during diagnose. Risk is contained to:
- One depth-1 consumer (`renderSymbolSourceSection`) — passes through, no code change.
- Two depth-2 consumers (`symbolCard`, `symbolGraph`) — pass through.
- Four trust-header tests at depth 4 — assert header presence, not snippet body. Mitigation: hint stays inside `(...)` with no `## ` prefix (encoded in the impl diff in Task 2 Step 3).

### Ready to advance
Plan is approved. Advance to implement.
