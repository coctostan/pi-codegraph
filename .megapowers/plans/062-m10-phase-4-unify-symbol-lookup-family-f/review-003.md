---
type: plan-review
iteration: 3
verdict: revise
reviewed_tasks:
  - 1
  - 2
  - 3
  - 4
  - 5
  - 6
  - 7
  - 8
approved_tasks: []
needs_revision_tasks:
  - 1
  - 2
  - 3
  - 4
  - 5
  - 6
  - 7
  - 8
---

### Task 1: Extract shared compact card renderer — ❌ REVISE
- TDD structure is incomplete. The task only has 4 headings; `bun test` is embedded under Step 4 instead of a distinct Step 5.
- To satisfy the review contract, split the tail into:
  - Step 4: `bun test test/tool-symbol-card-render-body.test.ts`
  - Step 5: `bun test`

### Task 2: Extract shared legacy neighborhood renderer — ❌ REVISE
- The task is missing the required explicit AC coverage callout. It needs a `Covers AC ...` line under the header.
- The implementation/test path itself is realistic, but the plan must state which ACs this task owns. Based on the current body, that should include AC 2, AC 10, and AC 22.

### Task 3: Make symbol_graph default to compact card — ❌ REVISE
- Ordering/TDD violation: the task explicitly says Task 3 and Task 4 are landed atomically and that Task 3's full-suite `bun test` may remain red until Task 4. That breaks the sequential GREEN requirement.
- The three `exec!` updates in `test/tool-symbol-graph-lsp.test.ts` are misplaced here. With the current codebase, `src/index.ts:25-34` only accepts `include:["contract"]`, and `src/index.ts:212` still casts `params.include` as `Array<"contract"> | undefined`. Those registered-tool calls cannot safely pass `include:["neighborhood"]` until Task 4 broadens the schema/cast.
- The `test/tool-symbol-graph-include-schema.test.ts` change is too vague. That file currently uses an exact `toBe(...)` against the old output, so the plan must say exactly how to replace it.
- Coverage gap in the task header: the existing contract-append regression (`test/tool-symbol-graph-contract-include.test.ts`) becomes part of this task once the default base flips from neighborhood to card, so AC 12 / AC 13 need to be called out here.
- TDD structure is incomplete: no explicit Step 5 heading.

### Task 4: Validate include values and preserve legacy neighborhood output — ❌ REVISE
- This task inherits the Task 3 atomic-landing workaround. Once Task 3 is fixed, Task 4 should be a normal sequential GREEN step; the atomic note should be removed.
- The three registered-tool `exec!` updates for `test/tool-symbol-graph-lsp.test.ts` belong here, after the `src/index.ts` schema and execute-path cast are broadened.
- TDD structure is incomplete: no explicit Step 5 heading.

### Task 5: Add automated docs drift test and update public docs for unified symbol_graph — ❌ REVISE
- Step 2's expected RED is inaccurate. `docs/tool-descriptions.md` already contains `internal-only \`symbol_search\`` today, so that assertion is not part of the initial failure.
- The real REDs are the `README.md` 7-tool language and standalone subsections, the `ARCHITECTURE.md` public-surface/file-layout references, and the `docs/tool-descriptions.md` `7-tool default public surface` line.

### Task 6: Append source sections from the shared source renderer — ❌ REVISE
- TDD structure is incomplete. The task embeds `bun test` under Step 4 instead of having a distinct Step 5.
- Split the tail into Step 4 (targeted test) and Step 5 (full suite).

### Task 7: Remove standalone symbol_card and symbol_contract registrations — ❌ REVISE
- TDD structure is incomplete. The task embeds `bun test` under Step 4 instead of having a distinct Step 5.
- Split the tail into Step 4 (targeted registration/metadata assertions) and Step 5 (full suite).

### Task 8: Record AC 21 downstream audit artifact — ❌ REVISE
- The artifact content is too broad. It claims: `Inside this repository, all known references ... have been migrated`, but the plan does not actually enumerate or audit those references. The artifact needs a concrete file-by-file audit record, not a blanket claim.
- AC coverage is incorrect. The task claims AC 23 but only verifies file existence + `grep` + `bun run check`. Either remove AC 23 from the `Covers ...` line or add a full-suite `bun test` verification. For a `[no-test]` markdown-only task, the cleaner fix is to cover AC 21 only.

### Missing Coverage
- AC 12 is not explicitly claimed by any task header today.
- AC 13 is not explicitly claimed by any task header today.
- Task 2 also lacks any explicit `Covers AC ...` line, which makes the plan's AC trace incomplete even where the implementation intent is sound.

### Verdict
revise — the plan is close on codebase realism, but it is not ready for implementation until the TDD sequencing issues are fixed, every task has an explicit 5-step structure where required, and AC coverage is made explicit and complete.
