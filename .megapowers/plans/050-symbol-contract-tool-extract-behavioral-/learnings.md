# Learnings from #050: symbol_contract tool

- **Naive string parsing of type signatures is fragile.** `indexOf(">")` to strip generic type params breaks for nested generics like `<T extends Map<K, V>>`. Always use depth-tracking when parsing balanced delimiters. Caught in code review, not by planned tests — suggests generic signature test cases should be standard.

- **On-demand tree-sitter parsing at tool-call time works well.** The contract extractor reads source files and parses them fresh per invocation rather than persisting extracted data. This avoids schema changes and stale data, at the cost of ~5-10ms per call. Acceptable tradeoff for a tool-time operation.

- **Test files for edge cases (5-9) that pass immediately still provide value.** Even though the main implementation in Task 4 already handled all fallback paths, the individual test files serve as regression guards and make AC coverage auditable during verification.

- **Duplicated small utilities (like `walk`) across modules is acceptable when private.** `contract-extractor.ts` and `tree-sitter.ts` both have a 4-line `walk` function. Extracting to a shared module adds coupling for minimal gain — revisit only if a third copy appears.

- **The same test file may be read+parsed multiple times when multiple test nodes from that file cover a symbol.** A `Map<path, behaviors>` cache would be a simple optimization if this becomes a perf concern, but for now it's negligible.
