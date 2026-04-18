---
id: 62
type: feature
status: in-progress
created: 2026-04-16T15:01:36.275Z
milestone: M10
---
# M10 Phase 4: Unify symbol-lookup family — fold symbol_card / symbol_contract into symbol_graph
## Goal

Collapse the overlapping symbol-inspection surface (`symbol_graph`, `symbol_card`, `symbol_contract`) into **one tool** with tunable output.

## Context

Four registered tools currently start with a symbol name and return different views: `symbol_graph`, `symbol_card`, `symbol_contract`, `symbol_search`. The overlap dilutes each tool's distinctive signal and creates choice paralysis for the model. Phase 3 already demotes `symbol_search` and begins the `symbol_contract` absorption; this phase finishes the collapse.

See `~/pi/workspace/thinkingspace/plans/codegraph-refocus-plan.md` — Phase 4.

## Changes

- **`symbol_graph` gains an optional `include` parameter:** `Array<"neighborhood" | "contract" | "signals" | "source">`.
- **Default output = card-style view:** definition, signals, top callers/callees summary, tests. (Absorbs the useful parts of `symbol_card`.)
- **`include: ["neighborhood"]`** returns the current full neighborhood output.
- **`include: ["contract"]`** returns contract info (folded from `symbol_contract`).
- **`include: ["source"]`** inlines source snippets (current `symbol_card` behavior).
- **Remove `symbol_card` and `symbol_contract` as standalone registered tools.** Their internal extraction logic stays — for reuse by CODI and internal code.

## Explicit uncertainty

- This changes the output shape contract. If `symbol_card`'s compact output is being consumed by a downstream system relying on its specific format, that integration breaks. **Audit consumers before committing** — in particular pi-coding-tools' brokers if still active. If pi-coding-tools is being shelved, this is moot. Document the audit result in the PLAN phase of this issue.
- If `symbol_contract` extraction is expensive (coverage traversal, test parsing), making it opt-in via `include` is correct. If it's cheap, it can always run. **Benchmark during planning** and decide.

## Sequencing

- Must ship **after Phase 3** has landed.
- Must ship **after CODI v0.2** usage data validates what the default output should contain. If that data isn't yet available, hold this issue and revisit.
- If Phase 3 did not cause tool-pick-rate on structural questions to rise, **re-diagnose before proceeding** — the surface-size thesis would be wrong and this phase may be the wrong move.

## Exit criteria

- `symbol_graph` default output matches the current `symbol_card` "useful parts" (definition, signals, top callers/callees, tests).
- `include` parameter returns richer views on demand.
- `symbol_card` and `symbol_contract` tools are no longer registered.
- README + `ARCHITECTURE.md` reflect the single unified tool.
- Consumer audit documented; any broken consumer updated or explicitly accepted as out of scope.
- All tests updated; snapshots renewed. No deprecation warnings in tool output (deprecation periods add the exact ceremony the refocus is removing).
