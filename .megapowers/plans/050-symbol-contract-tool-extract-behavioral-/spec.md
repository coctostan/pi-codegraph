# Spec: symbol_contract tool

## Goal

Add a `symbol_contract` tool that extracts behavioral evidence about a symbol from its type signature, function body (throws, guards), and covering test assertions. Returns a structured contract in one call — what it takes, returns, throws, and what tests prove about it.

## Acceptance Criteria

1. **Tool registration:** `symbol_contract` is registered in `src/index.ts` with params `{ name: string, file?: string }` and calls a `symbolContract()` function from `src/tools/symbol-contract.ts`.

2. **Takes section:** When a node has a `signature` field, the output includes a `### Takes` section listing each parameter with its name and type annotation.

3. **Returns section:** When a node has a `signature` field with a return type, the output includes a `### Returns` section showing the return type.

4. **Throws section:** The tool parses the symbol's function body with tree-sitter and extracts `throw` statements. `throw new Error("msg")` produces the error message string. `throw new SomeError(...)` produces the class name. Plain `throw expr` produces the expression text. Results appear in a `### Throws / Error paths` section.

5. **Guards section:** The tool extracts early-return guard patterns (`if (!x) return`, `if (x == null) return`, etc.) from the function body. Results appear in a `### Guards / Preconditions` section showing the condition.

6. **Test assertion mining — core matchers:** The tool reads test files linked via `tested_by` edges and extracts assertions using tree-sitter. Supported patterns at minimum: `expect().toBe()`, `expect().toThrow()`, `expect().toContain()`, `expect().toHaveLength()`.

7. **Test assertion grouping:** Extracted assertions are grouped by enclosing test name (the string argument to `it()` or `test()`). Output appears in a `### Test-evidenced behaviors` section with test names as context lines and assertions indented beneath.

8. **Trust header:** Output includes a trust header using `prependTrustHeader()`, consistent with all other tools.

9. **Hashline anchor:** Output includes a hashline-anchored definition location via `computeAnchor()`.

10. **Ambiguous symbol — disambiguation:** When multiple nodes match the name, return a disambiguation list (same pattern as `symbol_card` and `symbol_graph`).

11. **Not found:** When no nodes match, return `Symbol "name" not found` with trust header.

12. **Fallback — no tests:** When no `tested_by` edges exist, the `### Test-evidenced behaviors` section is omitted entirely (not shown as empty).

13. **Fallback — no signature:** When the node has no `signature`, the `### Takes` and `### Returns` sections are omitted. Throws, guards, and test evidence still appear if available.

14. **Fallback — no body content:** When the source file can't be read or the function body can't be located, throws/guards sections are omitted. Signature and test evidence still appear if available.

15. **Existing tests pass:** All existing test files continue to pass without modification.

## Out of Scope

- Invariant inference beyond direct AST extraction (D1)
- Cross-function contract composition (D2)
- Doc comment / JSDoc parsing (D3)
- Deep type resolution — only surface syntax types (D4)
- Assertion matchers beyond the four core (`toBe`, `toThrow`, `toContain`, `toHaveLength`) — may be added but not required (O1)
- Conditional return type / union analysis from function body (O2)

## Open Questions

None.

## Requirement Traceability

- `R1` → AC 1
- `R2` → AC 2
- `R3` → AC 3
- `R4` → AC 4
- `R5` → AC 5
- `R6` → AC 6
- `R7` → AC 7
- `R8` → AC 8
- `R9` → AC 9
- `R10` → AC 10
- `R11` → AC 11
- `R12` → AC 12
- `R13` → AC 13
- `O1` → Out of Scope
- `O2` → Out of Scope
- `D1–D4` → Out of Scope
- `C1` → implicit (TypeScript-only project)
- `C2` → implicit (no external deps pattern)
- `C3` → AC 4, AC 5, AC 6 (tree-sitter used for body analysis and test mining)
- `C4` → AC 15
- `C5` → implicit (Bun runtime)

Note: AC 14 covers the robustness edge case where source files are unreadable. Not an explicit R# but needed for production correctness.
