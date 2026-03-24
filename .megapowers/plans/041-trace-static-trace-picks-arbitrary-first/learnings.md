# Learnings — Issue #041

- **Linear chain followers are a common graph traversal antipattern.** The `while` + `[0]` pattern looks clean but silently discards siblings. Always use a stack (DFS) or queue (BFS) when the graph can branch.
- **Existing tests masked the bug** because they all used linear chains (each node had exactly 1 callee). Branching is the common case in real code — tests should cover it.
- **Iterative DFS with reverse-push preserves sort order determinism.** Push children in reverse sort order so the first-in-sort is popped first — simple trick for deterministic DFS pre-order.
- **"By design for v1" technical debt has a shelf life.** The v1 code review explicitly noted this as acceptable. It became a real bug once the tool was used on non-trivial code.
- **The fix was minimal** — only `buildStaticTrace` changed (linear loop → stack-based DFS). The consumer code, output format, and all existing tests were unaffected because a linear chain is a degenerate case of full DFS.
