---
type: plan-review
iteration: 1
verdict: approve
reviewed_tasks:
  - 1
  - 2
  - 3
approved_tasks:
  - 1
  - 2
  - 3
needs_revision_tasks: []
---

All three tasks verified against the codebase.

- **Coverage:** Fixed When 1–2 → Task 1; Fixed When 3 → Tasks 1 & 2 Step 5 (existing `tool-symbol-contract-happy`, `tool-symbol-contract-generic-sig`, and other function/class contract tests); Fixed When 4–5 → Task 3. The failing repro file `test/repro-084-interface-handling.test.ts` is adopted by Tasks 1 and 3, satisfying the bugfix regression-test requirement.
- **Ordering:** Task 2 and Task 3 correctly depend on Task 1. Task 2's renderer extension builds on Task 1's `InterfaceContractSections` / `pushInterfaceContractSections` helpers. Task 3 is independent of Task 2 (signature match on `class X implements Y` works with or without the interface-member serialization).
- **TDD:** Step 1 tests are full and runnable. Step 2 expected-failure strings were probed against `bun test` and match the real runner output (`expect(received).toContain(expected)` for Task 1, `expect(received).toBe(expected)` for Task 2, `expect(received).toHaveLength(expected)` for Task 3). Step 3 uses real APIs: `SqliteGraphStore`, `extractFile`, `symbolGraph`, `renderSymbolContractBody`, `resolveImplementations`, `classImplementsInterface`, `escapeRegex`, tree-sitter `method_signature` / `property_signature` / `index_signature` / `call_signature` node types (verified by AST probe), and `childForFieldName("body")`.
- **Granularity:** Each task is one test + one minimal implementation. Task 2 modifies three files but they form a single extractor↔renderer contract.
- **Self-containment:** Imports (`bun:test`, `node:fs`, `node:os`, `node:path`, relative `../src/...` paths) match existing test conventions. Run command `bun test` matches `package.json` (Bun 1.3.11 runtime).
- **No regressions:** `test/indexer-extract-file.test.ts:134` continues to pass (empty interface body → header-only signature, matching existing `"interface MyInterface"` assertion). Other LSP tests (`indexer-lsp.test.ts`, `lsp-stage-guarded-writes.test.ts`) don't exercise `implements` resolution.

Approved for implementation.
