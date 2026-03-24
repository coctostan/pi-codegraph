# Code Review: symbol_contract tool

## Files Reviewed

| File | Description |
|------|-------------|
| `src/indexer/contract-extractor.ts` (new, 176 lines) | Core extraction: `extractThrows`, `extractGuards`, `extractTestAssertions` |
| `src/tools/symbol-contract.ts` (new, 180 lines) | Tool function: `symbolContract`, signature parser |
| `src/index.ts` (+21 lines) | Tool registration wiring |
| 11 test files (464 lines total) | Unit + integration tests |

## Strengths

- **Clean separation of concerns.** Extraction logic (`contract-extractor.ts`) is cleanly separated from tool assembly (`symbol-contract.ts`) and registration (`index.ts`). Each layer is independently testable.

- **Consistent patterns.** Disambiguation, not-found, trust header, and anchor patterns match `symbol_card` and `symbol_graph` exactly (same code shape at `symbol-contract.ts:59-73`).

- **Robust fallback chain.** Each section (Takes, Returns, Throws, Guards, Test behaviors) degrades independently — missing source file doesn't block signature display, missing tests don't block throws, etc. (`symbol-contract.ts:84-164`).

- **Good test coverage.** 25 tests across 11 files covering: 3 extractor unit test suites (throws, guards, assertions) + 8 integration tests (happy path, not-found, ambiguous, no-tests, no-signature, no-body, wiring, nested generics).

- **Defensive error handling.** `try/catch` around file reads at `symbol-contract.ts:103` and `symbol-contract.ts:141` prevent tool crashes on unreadable files.

## Findings

### Critical

None.

### Important

1. **[FIXED] Nested generic type params broke signature parsing** — `symbol-contract.ts:19-21`

   `parseSignatureParams` used `s.indexOf(">")` to strip leading type params, which fails for `<T extends Map<string, number>>` (finds the `>` inside `Map<...>` instead of the closing bracket). Fixed with depth-tracking loop. Regression test added in `test/tool-symbol-contract-generic-sig.test.ts`.

### Minor

1. **Duplicated `walk` utility** — `contract-extractor.ts:14-17` duplicates the identical function in `tree-sitter.ts:61-64`. Both are 4-line private functions. Could be shared, but extraction is low-value for a private utility — note for future if a third copy appears.

2. **Repeated file reads for same test file** — `symbol-contract.ts:136-152` reads+parses the same test file once per `tested_by` edge. If 5 test nodes point to the same file, it's parsed 5 times. In practice this is negligible (tool-time, not indexing), but a `Map<string, TestBehavior[]>` cache would be a simple optimization if perf matters later.

3. **No `__meta__`/`__unresolved__` filter on neighbors** — `symbol_card.ts:38-40` filters out synthetic nodes from `getNeighbors()`, but `symbol-contract.ts:128` does not. Not a functional bug because the `tested_by` kind filter already excludes these (meta/unresolved nodes don't have `tested_by` edges), but adding the filter would be consistent.

## Recommendations

- The minor items (walk duplication, per-edge file re-parsing, meta-node filter) are fine to defer. They don't affect correctness or readability, and addressing them now would be YAGNI.

## Assessment

**ready** — One important bug (nested generic type params) was found and fixed during review with a regression test. All 334 tests pass. Code is clean, well-structured, and consistent with codebase patterns.
