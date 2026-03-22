# Learnings — 036-refine-graph-query-and-opinionated-graph

- **Optional fields beat union types for backward-compatible extensions.** Using `operator?: "CONTAINS" | "STARTS WITH"` on `WhereClause` meant every existing code path that doesn't check operator automatically gets equality behavior — zero migration cost across parser, compiler, and all existing tests.

- **Suggestions are cheap to add when errors are already structured.** Because `GraphQueryError` was already a typed class with `kind`, adding a `suggestion` field and a `formatGraphQueryError()` helper was trivial. The lesson: invest in structured error types early — they compound.

- **Regex-based parsers get complex fast with multi-word operators.** The `STARTS WITH` operator required careful regex ordering (`=|CONTAINS|STARTS WITH`) since `STARTS` alone could conflict. For a future operator like `ENDS WITH`, this regex approach scales, but a tokenizer would be cleaner.

- **Edge alias resolution was a latent bug.** The compiler silently produced `undefined.property` when a WHERE predicate referenced an edge alias. This only surfaced when we explicitly tested edge WHERE predicates. Lesson: always test the cross-product of features (WHERE × edge aliases), not just each feature in isolation.

- **8 focused test files > 1 large test file.** The one-test-per-file convention in this project made the TDD cycle extremely fast — each RED→GREEN loop ran in <30ms. Worth maintaining even as the test count grows past 200.

- **Tool descriptions are API documentation.** Adding 5 example queries to the `graph_query` description is the single highest-impact change for agent usability — agents read tool descriptions before every call. This should have been done from the start.
