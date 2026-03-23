# Learnings

- **Copy-paste bugs in branching logic are common.** The `ambiguous` branch correctly used `resolved.text` but the `not_found` branch used `""`. When adding multiple branches that handle similar cases, double-check each one uses the right value.
- **Compare sibling tools for consistency patterns.** `trace.ts` already had the correct not-found handling — comparing the three tools' patterns immediately revealed the inconsistency.
- **Data layer vs rendering layer distinction matters.** `collectImpactDetails` correctly returns `[]` for additions. The bug was purely in the rendering wrapper not distinguishing "zero results" from "unsupported operation." Keeping these layers separate made the fix surgical.
- **Empty output is worse than an error message for agents.** An agent seeing an empty body might conclude "zero impact" and proceed incorrectly. Explicit diagnostics prevent silent misinterpretation.
- **Reproduction tests written early pay off.** The failing tests from the reproduce phase carried through to implementation with zero rework.
