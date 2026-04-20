---
type: plan-review
iteration: 1
verdict: revise
reviewed_tasks:
  - 1
  - 3
  - 2
approved_tasks:
  - 1
  - 3
needs_revision_tasks:
  - 2
---


### Task 1 — ✅ PASS
- Coverage: addresses #074 AC1-5 and Fixed-When #1, #2, #7.
- Test code is complete, uses real `SqliteGraphStore` / `collectImpact` / `GraphNode` APIs verified against source.
- Implementation correctly relies on `dedupeInboundByStrongestEdge` (keyed on `neighbor.node.id`, confirmed at `src/tools/impact.ts:45-53`) to handle the dual-edge case; the existing `seen` map at lines 94-101 prevents same-depth duplicates in subsequent BFS iterations.
- Expected FAIL message is accurate — `collectImpact` returns `[]` today so `toEqual` diff will print `Received: []`.

### Task 2 — ❌ REVISE
- **Self-inconsistency between Step 1 and Step 3.** The third test (`sha256Hex`, `is_exported: false`, no inbound) expects the *isolated* diagnostic, but the proposed Step 3 branch `else if (fanIn === 0)` will fire the *entry-point* diagnostic for that case. Step 4 would fail against the provided Step 1.
- Fix: use `signals.roles.includes("entry-point")` instead of raw `fanIn === 0`. The `entry-point` role (`src/output/signals.ts:144`) is already defined as `isExported && kind !== "module" && fanIn === 0`, which matches the issue's intent and correctly routes unexported leaves into the "genuinely isolated" bucket.
- All other aspects of Task 2 (signatures, imports, multi-seed ordering test, trailing-newline check, skip-interface-diagnostic ordering w.r.t. Task 1) are correct.

### Task 3 — ✅ PASS
- Tightened assertions align with the final contract established by Tasks 1 + 2.
- Correct removal of `console.log` instrumentation.
- Depends appropriately on [1, 2].

### Missing coverage
None — once Task 2 is corrected, all seven Fixed-When criteria and both source-issue AC blocks are covered:
- FW1 / #074.AC1-3 → Task 1
- FW2 / #074.AC5 → Task 1
- FW3 (entry-point, interface, isolated) → Task 2
- FW4 (multi-seed stable order) → Task 2
- FW5 (reproduction tests) → Task 3
- FW6 (existing tests) → Step 5 of each task
- FW7 (no store changes) → scope of each task

### Other observations
- Step 2 failure messages for both Tasks 1 and 2 are accurate to what Bun's `expect(...).toEqual/toContain` will actually print.
- File paths all exist or are being created at the correct locations; project uses `bun test` per `package.json`.
- No forward-reference / cycle issues in the `depends_on` DAG.

See `.megapowers/plans/083-impact-fix-silent-empty-output-and-add-i/revise-instructions-1.md` for the prescriptive code-level fix.

