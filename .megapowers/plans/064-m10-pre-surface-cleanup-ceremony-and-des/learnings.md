# Learnings — 064 M10 Pre-Surface Cleanup

- **Centralize first, test second.** Consolidating nine identical `indexingFailedNote() + appendTokenMeta()` call sites into one `finalizeReadOnlyOutput()` helper before writing tests made the behavioral contract obvious and the tests trivially small. Doing it the other way (patching each tool individually) would have created nine nearly-identical tests.

- **SQLite writability is a two-part check.** Testing only `graph.db` for `W_OK` misses the common production case where the directory is read-only (`chmod 555 .codegraph/`) while the file itself still passes `access()`. SQLite needs both the file and its containing directory to be writable to create the journal. The fix is to check both; the lesson is to test the filesystem precondition at the OS level, not just at the file level.

- **Per-call env reads need an explicit test for mid-session toggling.** `devMetaEnabled()` reads `process.env` on every call by design, but the test that matters is toggling off → on → off within a single test run, not just "off by default". Writing that sequence explicitly caught a hypothetical caching bug before it could be introduced.

- **Fresh-header suppression should be text-pattern-based, not trust-object-based.** Passing the rendered string into `suppressFreshTrustHeader()` means the suppression is independent of how the Trust header was generated and works correctly even for edge cases like empty graphs or missing project roots where `getStatistics()` might not be called.

- **Description tests as regression locks.** A single `extension-tool-descriptions.test.ts` that asserts the exact string for all 11 tools acts as a low-cost regression lock against future accidental description drift. Worth adding this style of test for any string-valued registration attribute that has a governance policy.

- **Docs drift in batches.** The README was 3 tools short of reality because additions of `graph_overview`, `dead_code`, and `symbol_search` each updated `src/index.ts` but never circled back to update prose docs. Keeping a style guide (`docs/tool-descriptions.md`) with an explicit maintenance note ("update this guide, `README.md`, and `ARCHITECTURE.md` together") converts a silent convention into a visible checklist.

- **Code review caught an important correctness issue.** The `dbIsWritable` gap was not covered by the pre-existing readonly test (which only tested `chmod 444` on the DB file). The directory-permissions scenario was only found by running a manual probe during review. The lesson: always ask "what other filesystem conditions can produce the same error?" when writing readonly-detection logic.
