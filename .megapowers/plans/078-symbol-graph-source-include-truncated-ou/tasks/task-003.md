---
id: 3
title: Update the maxSourceLines doc to describe the new continuation hint
status: approved
depends_on:
  - 2
no_test: true
files_to_modify:
  - .megapowers/docs/057-inline-source-snippets-in-symbol-card-ou.md
files_to_create: []
---

**Justification:** Documentation-only change. Updates the public description of `maxSourceLines` in the M9 feature doc to reflect the new continuation hint emitted by Task 2. No observable behavior — the running code's truncation format is already covered by the test updates in Task 2.

**Files:**
- Modify: `.megapowers/docs/057-inline-source-snippets-in-symbol-card-ou.md`

**Step 1 — Make the change**

The current doc at line 21 reads:

```
21:b32|`maxSourceLines` (optional number, default 50) — controls how many lines of the target symbol's source are included. Excess lines are truncated with a `(N more lines truncated)` indicator.
```

Replace it with (preserving surrounding `### New parameter` heading and the blank line at 22):

```
`maxSourceLines` (optional number, default 50) — controls how many lines of the target symbol's source are included. Excess lines are truncated with a single-line continuation hint pointing back at the source file, e.g. `(50 more lines — use read("src/big.ts", offset: 51, limit: 50) to see the rest)`. The hint references the file path, the 1-indexed offset of the first omitted line, and the remaining line count, so an agent can read the rest in one follow-up `read()` call without a second symbol lookup.
```

Use an anchored edit — re-`read` the file immediately before editing to refresh the line-21 hashline (the `21:b32` shown in the diagnosis is from a prior snapshot and may have drifted):

```
read({ path: ".megapowers/docs/057-inline-source-snippets-in-symbol-card-ou.md", offset: 19, limit: 5 })
edit({
  path: ".megapowers/docs/057-inline-source-snippets-in-symbol-card-ou.md",
  edits: [{
    set_line: {
      anchor: "<refreshed line 21 anchor>",
      new_text: "`maxSourceLines` (optional number, default 50) — controls how many lines of the target symbol's source are included. Excess lines are truncated with a single-line continuation hint pointing back at the source file, e.g. `(50 more lines — use read(\"src/big.ts\", offset: 51, limit: 50) to see the rest)`. The hint references the file path, the 1-indexed offset of the first omitted line, and the remaining line count, so an agent can read the rest in one follow-up `read()` call without a second symbol lookup."
    }
  }]
})
```

**Step 2 — Verify**

Run: `bash -lc 'grep -n "more lines truncated" .megapowers/docs/057-inline-source-snippets-in-symbol-card-ou.md'`

Expected: no matches (exit code 1) — the obsolete literal phrase is gone from the doc.

Then run: `bash -lc 'grep -n "use read(" .megapowers/docs/057-inline-source-snippets-in-symbol-card-ou.md'`

Expected: one match on or near line 21 — the new continuation-hint example is present.

Final sanity: `bun test` once more to confirm nothing else regresses (the doc is not consumed by code, but cheap to re-run and closes the issue's "full suite green" criterion #7).

Expected: full suite green, including the three tests modified in Task 2.
