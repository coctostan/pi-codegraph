# Learnings — 020 M0 Tree-Sitter Indexer + Incremental Hashing

- **tree-sitter-typescript is CJS under ESM**: The default import from `tree-sitter-typescript` is an object `{ typescript, tsx }`, not the language directly. The workaround `(ts as { typescript: unknown }).typescript` is necessary when bundling as ESM. Worth capturing as a project-level note so future tree-sitter consumers don't burn time on it.

- **`hasError` changed from method to property across tree-sitter versions**: Between v0.20 and v0.25, `SyntaxNode.hasError` shifted from a callable method to a boolean property. The duck-typing guard (check `typeof .hasError === "function"`) handles both, but pinning to `^0.25.0` means the function branch is dead. When tree-sitter types stabilise, replace with a direct property access and drop the duck check.

- **`import_specifier.name` is always an identifier, never a quoted string**: The `unquoteStringLiteral` helper introduced in an earlier plan step was a no-op for named import specifiers (correctly removed in code-review). Import *paths* (`sourceNode.text`) arrive with surrounding quotes, but named import *names* are identifier AST nodes without quotes. Keep the extraction layer's type reasoning grounded in tree-sitter's actual node kinds.

- **Two-pass AST traversal is cleaner than a single stateful visitor**: Separating node extraction (first `walk`) from call-edge extraction (`visitCalls` with function-context tracking) made each pass easy to reason about and test independently. A single merged pass would have required more complex state management with minimal performance benefit at file scale.

- **Missing Criterion 23 test was caught at code-review, not verify**: The "file content changes between runs" code path was correct but untested. Verify passed it on code inspection; code-review caught it as a gap and added the test. Going forward, when an incremental pipeline has "skip / re-index / remove" branches, write explicit tests for each branch during implementation, not as an afterthought.

- **`deleteFile` must remove edges in both directions**: When cleaning a file's nodes, any edge where that file's node is either the *source* or the *target* must be removed. Missing the incoming direction leaves dangling edges from other files into stale node IDs. The `OR target IN (SELECT id FROM nodes WHERE file = ?)` clause in the DELETE is load-bearing.

- **Provenance `evidence` field doubles as human-readable audit trail**: Using the raw import path string (including quotes, e.g. `'./bar'`) as evidence keeps the string unambiguous and directly copy-pasteable from source. For call edges, using the callee name is similarly self-documenting. The field is worth keeping rich even though M0 consumers don't query it yet.
