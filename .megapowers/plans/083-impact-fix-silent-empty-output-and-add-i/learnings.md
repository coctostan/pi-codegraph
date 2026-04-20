# Learnings — batch #083 (impact: silent output + implements traversal)

- **Two bugs with a silent failure mode compound each other.** Both #073 and #074 independently produced empty output, making the symptom identical regardless of which root cause was active. Diagnosing them together and ordering the tasks so #074 (traversal) landed before #073 (diagnostic) was correct: the interface diagnostic only fires when the traversal truly finds nothing, so implementing them in reverse order would have produced a misleading "interface has no dependents" message for interfaces that *do* have implementors.

- **The `dedupeInboundByStrongestEdge` function was already built for cross-kind merging.** It keys by `node.id` and keeps the highest-confidence edge — concatenating two kind-filtered `getNeighbors` calls directly into it was the entire implementation. The fix was genuinely one extra line once the pattern was understood.

- **Test fixture `is_exported` field matters for role signals.** The reproduce-phase test omitted `is_exported: true` on the entry-point node, causing the reproduction to fall through to the "genuinely isolated" diagnostic branch instead of the "entry-point" branch. The `entry-point` role in `SignalComputer` requires `isExported && kind !== "module" && fanIn === 0`. Fixture nodes should always explicitly set `is_exported` when signal-role behaviour is under test.

- **The TDD guard blocked `task_done` after the RED/GREEN cycle crossed a session boundary.** Task 3's RED and GREEN were both established in the same session, but the harness state was reset between sessions, so `tests_failed` had to be re-signalled by temporarily reverting `is_exported` to `false`, running the test to produce a failure, then restoring and running green again. This is a friction point when tasks span multiple sessions.

- **`bun -e` inline TypeScript is the fastest way to reproduce a symptom outside a test file.** Running a one-shot script that exercises the real `impact()` function with a realistic store setup gave direct confirmation that the original header-only output was gone and the new traversal was returning the right nodes — without the indirection of a test harness assertion message.

- **Ordering the interface-vs-entry-point check in `buildEmptyImpactDiagnostic` matters.** Interfaces satisfy `fanIn === 0` and would also qualify as `entry-point` if not caught first. The interface branch must precede the role branch to avoid the misleading message. This ordering is now locked in by the dedicated regression tests.

- **`git diff --name-only -- src` is the fastest way to confirm blast radius of production changes.** Seeing only `src/tools/impact.ts` immediately confirmed criterion 7 without needing to list store or type files manually.
