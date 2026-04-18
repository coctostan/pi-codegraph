# Brainstorm — #067 Align tool schemas, docs, and validators for closed-value parameters

## Goal
Close the contract-drift pattern exposed by #066: every currently-registered tool parameter that is effectively a closed set should enumerate its allowed values consistently across the TypeBox schema, the parameter description, the top-level tool description (where relevant), and README/public docs — and a regression test should lock each alignment so drift cannot silently return.

## Mode
`Direct requirements`. The problem, affected params, and correct wording pattern are already established by #066 and the issue body. The main work is capturing the audit scope and acceptance criteria clearly.

## Must-Have Requirements
- **R1** `impact.changeType` schema remains the authoritative closed set already present (`signature_change`, `removal`, `behavior_change`, `addition`) — no schema change required, but the parameter description must explicitly enumerate those four values.
- **R2** `resolve_edge.kind` schema is upgraded from `Type.String` to a closed union of the 8 runtime-valid edge kinds (`calls`, `imports`, `implements`, `extends`, `tested_by`, `co_changes_with`, `renders`, `routes_to`), matching `VALID_EDGE_KINDS` in `src/tools/resolve-edge.ts`.
- **R3** `resolve_edge.kind` parameter description explicitly enumerates the 8 allowed values and removes the trailing "..." that implies an open set.
- **R4** `delete_edge.kind` schema is upgraded to the same closed union of 8 edge kinds, matching `VALID_EDGE_KINDS` in `src/tools/delete-edge.ts`.
- **R5** `delete_edge.kind` parameter description explicitly enumerates the 8 allowed values and removes the trailing "..." that implies an open set.
- **R6** `dead_code.kind` parameter description explicitly enumerates the 6 `NodeKind` values (`function`, `class`, `interface`, `module`, `endpoint`, `test`) and removes the trailing "etc." that implies an open set. (Schema stays `Type.Optional(Type.String)` since this param is a filter, not a chosen literal — see C4.)
- **R7** `README.md` lists every `impact.changeType` value at least once in the `impact` section (not just `signature_change`).
- **R8** `README.md` lists all 8 valid `resolve_edge` / `delete_edge` edge kinds in their respective sections.
- **R9** `README.md` examples never use edge kinds, change types, or node kinds outside the published closed sets.
- **R10** A regression test asserts `impact.changeType`'s schema literals and the exact enumerating parameter description.
- **R11** A regression test asserts `resolve_edge.kind`'s schema literals, that it matches `VALID_EDGE_KINDS`, and the exact enumerating parameter description.
- **R12** A regression test asserts `delete_edge.kind`'s schema literals, that it matches `VALID_EDGE_KINDS`, and the exact enumerating parameter description.
- **R13** A regression test asserts `dead_code.kind`'s enumerating parameter description.
- **R14** A README/docs-drift test asserts that every enumerated value in schemas appears at least once in `README.md`'s corresponding tool section, and that `README.md` contains no example using a value outside the closed sets.
- **R15** No agent-facing description for any audited parameter uses open-ended suffixes like "..." or "etc." that imply the set is open when it is not.

## Optional / Nice-to-Have
- **O1** Extract a small shared constant/helper for each closed set (edge kinds, change types, node kinds) reused by schema + description + validator, so future drift is structurally harder. Only if the factoring stays within existing files and does not change runtime behavior.
- **O2** Cross-link the `docs/tool-descriptions.md` style guide with a short note on handling closed-value parameters, so new tools inherit the pattern.

## Explicitly Deferred
- **D1** Any change to the runtime-valid set of edge kinds, change types, or node kinds. This issue aligns the published surface with what runtime already supports — it does not expand or shrink it.
- **D2** Any upstream prompt-assembly fix for "loss of enum literals in the model-facing tool surface" (noted in #066's scope paragraph) — that belongs in the pi prompt-assembly layer, not here.
- **D3** Broader tool-surface consolidation work (M10 Phases 3–5 around `symbol_graph.include` unification, demoting dev-mode tools, etc.).
- **D4** Ceremony cleanup or description normalization beyond the enum-alignment scope (that is M10 Phase 1/#059 and Phase 2/#060).

## Constraints
- **C1** No changes to graph/indexing behavior, tool execution behavior, or tool output format.
- **C2** Schema upgrades for `resolve_edge.kind` and `delete_edge.kind` must keep the runtime validator in place (defense in depth) — callers relying on the existing "Invalid edge kind" error message must still see it for the same values they see it for today.
- **C3** The `symbol_graph.include` wording and schema set by #066 must remain intact; this issue must not regress it. The new tests live alongside `test/extension-tool-descriptions.test.ts` / `test/docs-symbol-graph-unified-surface.test.ts`.
- **C4** `dead_code.kind` is a free-form filter used in a SQL `n.kind = ?` clause rather than a chosen literal, so enumerating the set in the description is sufficient — schema tightening is out of scope unless it is trivially safe.
- **C5** Top-level tool descriptions (per `docs/tool-descriptions.md`) must stay terse and stay free of inline examples — enumerations live in the parameter description and in README, not in the top-level tool description.
- **C6** All existing tests must continue to pass; the 5-default-public-tools surface must not change.
- **C7** Dev-mode-only tools (`graph_query`, `graph_overview`, `dead_code`) are still covered by this audit but their descriptions must continue to register only when `CODEGRAPH_DEVMODE=1`.

## Open Questions
None.

## Recommended Direction
Treat this as a focused, test-first alignment pass, not a redesign. For each audited parameter, write the enumerating description string in a failing test first (both for the TypeBox schema description and, where applicable, for the schema literals and README coverage), then make the minimal change to `src/index.ts` (schemas + descriptions), `README.md`, and — if it cleans up nicely — a shared constants helper to keep schema, description, and validator in sync.

The three edge-kind changes (`resolve_edge.kind`, `delete_edge.kind`) are the only ones that also need schema literal upgrades; `impact.changeType` is already a closed union, so its work is description + docs + test only; `dead_code.kind` is description + docs + test only. Keep runtime validators in place for defense in depth — the schema is best-effort protection, the validator is the canonical source of truth.

Regression tests follow the existing pattern from `test/extension-tool-descriptions.test.ts` and `test/docs-symbol-graph-unified-surface.test.ts`: one extension-level test asserting registered descriptions and schema shapes, one docs-level test asserting README enumerations and the absence of stale or out-of-set values.

## Testing Implications
- Extension-level registration tests that exact-match parameter descriptions for `impact.changeType`, `resolve_edge.kind`, `delete_edge.kind`, and `dead_code.kind`.
- Schema-shape tests that assert `resolve_edge.kind` and `delete_edge.kind` TypeBox schemas are unions of the 8 runtime edge kinds (order and set).
- Schema-shape test for `impact.changeType` that asserts the 4 literal values are still present (lock-in).
- Docs-drift tests that scan `README.md` for presence of every enumerated value within each tool's section, and for absence of any out-of-set example values.
- Negative-wording tests that `README.md` and schema/parameter descriptions contain no open-ended suffixes (`...`, `etc.`) in the audited parameter descriptions.
- Runtime-validator tests remain untouched and must continue to pass against the same valid/invalid inputs as today.
