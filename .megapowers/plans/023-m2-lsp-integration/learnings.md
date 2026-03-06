# Learnings — 023-m2-lsp-integration

- **The catch-block fallback anti-pattern:** The original `resolveMissingCallers` catch block
  wrote `lsp`-provenance edges from a name-match fallback when `references()` threw. Using
  high-confidence provenance for a low-confidence operation misleads any consumer of the graph
  (including future agent calls). When an error path cannot do the right thing, do nothing
  and let the next call retry — don't fake success. Removed in code review.

- **Empty vs. absent: trust authoritative "no results":** `resolveImplementations` had a
  fallback that fired on both `catch` (tsserver unavailable) AND when tsserver returned an
  empty array (authoritative "no implementations"). These are semantically different. The
  fallback on empty result can produce false positives for interfaces that genuinely have no
  implementations. Separate "error" from "empty result" clearly in error-handling design.

- **Test hermeticity via inline fake servers beats relying on real tools:** The "tool wiring"
  test previously relied on either a real tsserver or the (wrong) fallback to create lsp edges.
  After the fallback was removed the test broke. The fix — embedding a 12-line fake tsserver
  as a bash-wrapped Node.js script in `node_modules/.bin/` — is now fully hermetic and
  deterministic. This pattern (from `tsserver-client.test.ts`) should be used from the start
  for any test that needs process-level tool interaction.

- **Marker system via edge, not node:** Encoding "this symbol has been resolved" as an edge
  from a marker node to the symbol node (rather than just the marker node's existence) gives
  staleness invalidation for free: `deleteFile()` already cascades all non-agent edges from
  affected nodes, which removes the marker→symbol edge without any special logic.

- **Protocol correctness vs. practical compatibility:** `notify("open")` is silently dropped
  on the first request because `this.proc` is null when the public method is called (before
  the queue's `run` function spawns it). Real tsserver loads project files from tsconfig, so
  this causes no functional failure — but it's still wrong protocol usage. Defer-or-accept
  these kinds of known deviations consciously; don't leave them as hidden surprises.

- **tsc `--noEmit` is a required gate, not optional:** The `graph-types.typecheck.ts` mock
  was missing 3 new `GraphStore` methods, causing `tsc` to fail silently (tests use `bun`
  which doesn't type-check). Always run `tsc --noEmit` as part of verify, not just `bun test`.

- **`IndexProjectOptions` factory pattern for LSP client injection:** Accepting a
  `lspClientFactory` function instead of an `ITsServerClient` instance in `IndexProjectOptions`
  lets tests inject a pre-configured fake without needing to touch the real spawn path. This
  pattern scales cleanly to future stages (ast-grep, coverage) that will also need injection
  points.
