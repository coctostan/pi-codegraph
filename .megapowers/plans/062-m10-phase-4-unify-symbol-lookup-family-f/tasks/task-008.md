---
id: 8
title: Record AC 21 downstream audit artifact
status: approved
depends_on:
  - 5
  - 7
no_test: true
files_to_modify: []
files_to_create:
  - .megapowers/plans/062-m10-phase-4-unify-symbol-lookup-family-f/audit.md
---

### Task 8: Record AC 21 downstream audit artifact [no-test]

Covers AC 21.

**Scope note (responds to review):**
The previous Task 8 bundled documentation edits and an AC 21 audit note. The documentation edits and their drift test are now owned by Task 5 (which has real RED/GREEN tests). What remains for Task 8 is a small, documentation-only AC 21 artifact that records the accepted out-of-scope break for the external downstream repo. This is genuinely test-free (it is an inert markdown record with no runtime behavior), so `[no-test]` is justified, and the file has an explicit path and a verification step.

**Justification for `[no-test]`:** This task only creates a human-readable audit record inside `.megapowers/plans/062-m10-phase-4-unify-symbol-lookup-family-f/`. It is not loaded by any runtime path. The docs that do affect runtime / tool descriptions are owned and tested by Task 5.
**Files:**
- Create: `.megapowers/plans/062-m10-phase-4-unify-symbol-lookup-family-f/audit.md`
**Step 1 — Make the change**
Create `.megapowers/plans/062-m10-phase-4-unify-symbol-lookup-family-f/audit.md` with exactly this content:
```md
# Downstream audit
## In-repo runtime / public-surface references audited
- `src/index.ts` — standalone `symbol_card` / `symbol_contract` registrations removed in Task 7.
- `test/tool-symbol-card-wiring.test.ts` — updated to assert non-registration.
- `test/tool-symbol-contract-wiring.test.ts` — updated to assert non-registration.
- `test/extension-tool-descriptions.test.ts` — expected default public surface reduced to 5 tools.
- `tests/ptc-metadata.test.ts` — removed from registered read-only tool list.
- `test/token-tracker-wiring-check.test.ts` — removed from expected default registrations.
- `README.md`, `ARCHITECTURE.md`, `docs/tool-descriptions.md` — public docs updated to describe `symbol_graph` as the unified lookup surface.

## Accepted out-of-scope breaks
- External downstream repo `pi-coding-tools` — known `symbol_card` / `symbol_contract` registered-tool references are intentionally not updated in this issue by explicit user direction. This is the accepted out-of-scope break for AC 21.

## Non-runtime historical references intentionally left unchanged
- Historical roadmap / issue / changelog files under `.megapowers/` and `ROADMAP.md` are not active runtime consumers of registered tool names.
```

This satisfies AC 21 (audit of known downstream references with explicit accepted-break disposition) in a way that is machine-locatable at a stable path.
**Step 2 — Verify**
Run:

```sh
test -f .megapowers/plans/062-m10-phase-4-unify-symbol-lookup-family-f/audit.md \
  && grep -q 'accepted out-of-scope break' .megapowers/plans/062-m10-phase-4-unify-symbol-lookup-family-f/audit.md \
  && bun run check
```

Expected:
- `test -f` exits 0 because the audit file exists at the specified path.
- `grep -q` exits 0 because the required `accepted out-of-scope break` phrase is present.
- `bun run check` (TypeScript + lint) succeeds unchanged; no runtime behavior is modified by this task.
