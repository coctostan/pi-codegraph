# Learnings — Issue #078

- **Output continuations are a first-class agent contract.** The codebase's `AGENTS.md` explicitly says "every truncation must lead somewhere" — but `readSourceSnippet` was the one place that emitted a numeric count without a copy-paste-ready next action. When you have the inputs in scope, embed the `read()` shape in-line; don't make the agent re-derive offsets from line counts.

- **A bare-string assertion is a soft contract.** Two unrelated tests pinned the literal `"(N more lines truncated)"`. Both had to flip in the same task as the producer change because there is no abstraction layer between the format string and the test snapshot. Lesson: when adding a "small" string to public output, treat it like an interface — `grep` for it across `test/` and `docs/` before writing the implementation, not after.

- **Diagnose-snapshot anchors drift.** The plan's `124:040` and `184:12b` line-hash anchors were stale by the time implement ran. Re-`read` the file immediately before each `edit` to pull a fresh anchor; never paste an anchor copied from the diagnosis or plan artifact.

- **`tdd-guard` strictness lives across files.** Editing `src/output/source.ts` was blocked even though three test files were already RED — the guard required an explicit `tests_failed` signal first. Plan signal beats run state. (Easy to fix: just call `megapowers_signal({ action: "tests_failed" })` and retry; no need to re-arrange edits.)

- **Loose-by-construction assertions paid off.** The repro test's four `expect`s asserted "contains `src/big.ts`", "matches `/offset:\s*51\b/`", "matches `/limit:\s*50\b/`", and "matches `/read\(/`" — never the exact phrasing. Task 2 was free to pick the final wording (`(N more lines — use read(...) to see the rest)`) without rewriting the test. Future RED tests should default to this pattern when the spec only constrains the *information content* of a string.

- **`impact` is a useful planning tool but not always available.** The verify run showed `indexing-failed: Bun is not defined`, so coverage of dependents had to be confirmed via `grep` instead. Have a manual fallback ready (`grep -rn <symbol> src test`) and don't block on `impact` when it's offline.

- **Producer-side fix > caller patches.** `renderSymbolSourceSection` and `symbolCard` both consume `snippet.text` verbatim. Fixing the format inside `readSourceSnippet` covered every caller in one edit; the alternative (mutating the text in the renderer) would have left the function returning a misleading `text` field. When two callers need the same change, change the producer.
