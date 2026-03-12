# Learnings — issue 033

- **Shared formatter as a drift-prevention contract.** Introducing `formatModeHeader()` to produce both the coverage and static headers is more valuable than it first appears: it's not just DRY, it makes it structurally impossible for the two header formats to diverge in the future. When the output format is the API surface, colocating both branches in one function is worth the tiny abstraction.

- **`toHaveLength(N)` is underused for output-shape tests.** Asserting the exact number of output lines is a clean way to enforce "no extra prose lines" without being fragile about content. The line-count assertion in `tool-trace-static-mode-header.test.ts` does more work per character than most content assertions.

- **Return-type asymmetry tells you something about design intent.** `formatStoredTraceLine` returns `{line, stale}` and `formatLiveTraceLine` returns `string` — this asymmetry means the static path can't aggregate step staleness into the header without a bigger change. When you notice a type-shape difference like this during implementation it's worth flagging: either both should propagate staleness or neither should; the current split is defensible but should be explicit.

- **Tool descriptions are part of the API, not just documentation.** The exact string in `pi.registerTool({ description })` is what agents receive as their schema. Testing it with `.toBe()` (not `.toContain()`) is appropriate — it's an interface contract, not a comment.

- **Pre-existing flaky tests are worth confirming during verify.** One tsserver test flaked during the full parallel run. Stashing changes and rerunning in isolation quickly confirmed it was pre-existing. Worth doing rather than assuming — a flake that started on this branch would have been a real signal.

- **Three small tasks sequenced correctly beats one big task.** Task 3 (route coverage headers through the shared formatter) being explicitly marked `[no-test]` and `[depends: 1]` kept the plan clean: the new helper was introduced with a failing test in task 1, then task 3 was a pure refactor that existing tests already covered. This ordering made the red-green cycle honest.
