# Learnings — #044 delete_edge tool

- **Mirror-pattern features are fast to ship.** When the new tool closely mirrors an existing one (`resolve_edge`), the implementation is straightforward and most error paths are already covered by the first task's implementation. Tasks 2-8 were purely additive test coverage.
- **Duplication is the cost of mirroring.** `VALID_EDGE_KINDS`, `isValidEdgeKind`, and `formatDisambiguation` are now duplicated between `resolve-edge.ts` and `delete-edge.ts`. This is a known tradeoff — extracting to shared utilities would be cleaner but wasn't in scope. Worth a future cleanup issue.
- **Existence checks before mutation prevent silent no-ops.** The agent-edge existence check before calling `store.deleteEdge()` is critical — SQLite's DELETE is a no-op if no rows match, which would silently succeed and confuse the agent. The explicit check-then-delete pattern gives actionable feedback.
- **Agent edges need lifecycle management.** This issue confirms the design principle that agent-authored knowledge is first-class but mutable. `resolve_edge` creates, `delete_edge` retracts — the graph stays correctable without re-indexing.
- **New files need `git add`.** The code review caught that `src/tools/delete-edge.ts` and `test/tool-delete-edge.test.ts` were untracked. The ship script should handle this, but it's worth remembering during implementation.
