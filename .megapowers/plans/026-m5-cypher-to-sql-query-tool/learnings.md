# Learnings — 026-m5-cypher-to-sql-query-tool

- **Parse before validate before compile.** Separating unsupported-feature rejection, alias/property validation, and SQL compilation into distinct phases made each phase independently testable and kept error kinds well-typed. Mixing them would have made tests brittle and error messages ambiguous.

- **Regex-based unsupported checks must strip string literals first.** Running `/\bCREATE\b/i` against the raw query matches `{name: "create"}` — a valid read-only filter. Stripping double-quoted literals to `""` before the check is a one-liner fix that prevents a whole class of false positives on common function names.

- **WHERE alias binding belongs in the parser, not the compiler.** The compiler's `nodeAliases[predicate.alias]!` non-null assertion silently emits `undefined.column = ?` when an alias is unbound. The parser already has the alias sets in scope; validating there gives a `validation_error` with a clear message instead of a runtime `execution_error` with no hint about what went wrong.

- **Three-layer architecture (parser / compiler / renderer) pays off in test precision.** The compiler test can assert SQL shape and param ordering without running SQLite. The renderer tests can feed synthetic row objects without parsing or executing anything. End-to-end tests only need to cover the orchestration glue.

- **`effectiveEdgeAliases = {}` when no edge alias is cleaner than a sentinel key.** Using `"_edge"` as a fallback key in `edgeAliases` and then replacing it with an empty object for projections is confusing. A dead map entry that is never read adds noise. The right approach is to simply not populate `edgeAliases` at all when there is no alias.

- **Bound parameters need ordering discipline.** The param array must mirror the `?` placeholder order in the SQL string. Documenting and testing the exact ordering (left-node filters → edge kind → right-node filters → WHERE predicates → LIMIT) prevents subtle bugs when queries are partially specified.

- **The `queryRows` SELECT-only guard is worth keeping even when the compiler only emits SELECTs.** Defense-in-depth matters: if a future code path bypasses the compiler and calls `queryRows` directly, the guard is the last line of defense. The test for it is one assertion and costs nothing.
