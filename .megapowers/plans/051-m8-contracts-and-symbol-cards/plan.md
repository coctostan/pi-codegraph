# Plan

### Task 1: Verify M8 milestone integration — full test suite passes [no-test]

### Task 1: Verify M8 milestone integration — full test suite passes [no-test]

**Justification:** This is a batch close-out verification. All three source issues (#048, #049, #050) are already implemented and tested. The only file change is updating ROADMAP.md to mark M8 as complete.

**Covers:** AC 1 (all tests pass), AC 2 (symbol_card registered), AC 3 (symbol_contract registered), AC 4 (signatures extracted/persisted), AC 5 (no regressions)

**Step 1 — Verify full test suite**
Run: `bun test`
Expected: 334 tests pass, 0 failures

**Step 2 — Verify symbol_card tool registration**
Run: `grep -n "symbol_card" src/index.ts`
Expected: Import of `symbolCard` and tool registration with name `"symbol_card"` and params `{ name: string, file?: string }`

**Step 3 — Verify symbol_contract tool registration**
Run: `grep -n "symbol_contract" src/index.ts`
Expected: Import of `symbolContract` and tool registration with name `"symbol_contract"` and params `{ name: string, file?: string }`

**Step 4 — Verify signature field exists in schema**
Run: `grep -n "signature" src/graph/types.ts src/graph/sqlite.ts`
Expected: `signature?: string` in GraphNode type, `signature TEXT` column in SQLite schema

**Step 5 — Verify no regressions in pre-existing tools**
Run: `bun test`
Expected: All tests pass

**Step 6 — Update ROADMAP.md to mark M8 complete**
Change M8 header from `🔶 NEXT` to `✅ COMPLETE` and check all scope items as done. Update the status paragraph at the top to include M8.
