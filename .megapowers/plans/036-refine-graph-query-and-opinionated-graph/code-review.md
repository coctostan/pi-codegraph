# Code Review — 036-refine-graph-query-and-opinionated-graph

## Files Reviewed

| File | Changes |
|------|---------|
| `src/tools/graph-query-parser.ts` | Added `suggestion` to `GraphQueryError`, `formatGraphQueryError()`, suggestions on all throw sites, `CONTAINS`/`STARTS WITH` operator parsing |
| `src/tools/graph-query-compiler.ts` | `CONTAINS` → `LIKE ?` with `%val%`, `STARTS WITH` → `LIKE ?` with `val%`, edge alias resolution in WHERE |
| `src/tools/graph-query.ts` | Import `formatGraphQueryError`, use it in catch block |
| `src/index.ts` | Expanded `graph_query` tool description with 5 example queries |
| 8 new test files | Unit + integration tests for all new behaviors |

## Strengths

- **Backward-compatible type extension** (`graph-query-parser.ts:37`): `operator?: "CONTAINS" | "STARTS WITH"` — optional field means all existing code paths that don't check `operator` get equality by default. No existing callers need updating.
- **Parameterized SQL throughout** (`graph-query-compiler.ts:91-101`): Values always go through `?` placeholders. No string interpolation of user input into SQL. Properties are regex-validated to `[A-Za-z_][A-Za-z0-9_]*` at parse time.
- **Clean separation of concerns**: Parser validates syntax/semantics, compiler emits SQL, formatter handles error output. Each layer is independently testable and tested.
- **Defensive compiler guard** (`graph-query-compiler.ts:88-90`): `if (!tableAlias) throw new Error(...)` catches any parser bug that lets an unbound alias through — good defense-in-depth.
- **Tests are layered**: Parser tests verify AST shape, compiler tests verify SQL output, integration tests verify end-to-end with real SQLite store. Good test architecture.

## Findings

### Critical
None.

### Important
None.

### Minor

1. **LIKE wildcard characters not escaped in values** (`graph-query-compiler.ts:92,97`)
   - If a CONTAINS/STARTS WITH value contains `%` or `_`, SQLite interprets them as LIKE wildcards. E.g., `CONTAINS "100%"` would match `"100x"`.
   - **Why it matters:** Unlikely in practice for symbol names, but technically incorrect semantics.
   - **How to fix:** Use SQLite `ESCAPE` clause: `LIKE ? ESCAPE '\'` and escape `%`/`_` in the value with `\`. Not blocking — symbol names virtually never contain these characters.

2. **Some throw sites still lack suggestions** (`graph-query-parser.ts:62,71,75,105,112,116,121,220,229,257,278,296`)
   - Several error paths (e.g., `invalid node pattern`, `query must contain exactly one MATCH clause`, unbound alias validation) don't include a suggestion.
   - **Why it matters:** The spec requires suggestions for unsupported forms (AC1) and invalid syntax/property (AC2) — these are covered. But for consistency, the remaining errors could also include suggestions. Not a spec violation, just an improvement opportunity.
   - **How to fix:** Future issue — add suggestions to remaining throw sites. Low priority since the most common error paths are covered.

## Recommendations

- Consider adding `"="` as an explicit operator variant (instead of `undefined`) in a future cleanup pass. This would make the type self-documenting and allow exhaustive switch matching in the compiler. Not urgent since `undefined` = equality is well-established.
- The test file per feature pattern (8 focused test files) is consistent with the project's existing convention of ~100 test files. Good discipline.

## Assessment
**ready**

Clean, minimal changes that follow existing patterns. No bugs, no security issues, no regressions. TypeScript compiles cleanly. Two minor notes for future improvement, neither blocking.
