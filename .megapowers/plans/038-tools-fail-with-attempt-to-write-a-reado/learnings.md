# Learnings — Issue #038

- **Write gates must never be mandatory for read paths.** The `ensureIndexed()` → `indexProject()` chain made every tool call depend on write access even though the actual tool logic was read-only. Structurally separating write (indexing) from read (querying) at the call site would have prevented this class of bug entirely.

- **`finally` is not `catch`.** The LSP stage used `try/finally` to ensure client shutdown, but this doesn't prevent errors from propagating. The tree-sitter stage's per-file `try/catch` pattern was the correct model — the inconsistency across stages was the root cause of the crash.

- **Test under production constraints early.** The entire codebase was tested under `bun test` with full write access. The readonly constraint from pi's extension runtime was never exercised until a user hit it. A single integration test with `chmod 0o444` on the DB file would have caught this immediately.

- **Graceful degradation > strict correctness for agent tools.** Returning stale graph data with an `indexing-failed` note is far more useful to an agent than a crash. Agents can reason about staleness; they can't reason about missing data.

- **Top-level catch is a valid strategy when the entire write pipeline is optional.** Rather than adding error handling to every indexing stage individually, catching at `ensureIndexed` was simpler and equally effective since the entire indexing pipeline is optional for read-only tool usage.

- **Module-level singletons need reset functions for testing.** The `lastIndexError` state variable required `resetStoreForTesting()` to also clear it. Without this, test isolation would have been impossible since the module is cached across `import()` calls in bun.
