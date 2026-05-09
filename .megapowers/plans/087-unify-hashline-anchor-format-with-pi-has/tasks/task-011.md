---
id: 11
title: Update anchor-format documentation
status: approved
depends_on:
  - 1
  - 2
  - 3
  - 5
  - 6
  - 7
  - 8
  - 9
  - 10
no_test: true
files_to_modify:
  - README.md
  - ARCHITECTURE.md
  - AGENTS.md
  - VISION.md
files_to_create: []
---

Covers AC 18, AC 19, AC 20.

**No-test justification:** Documentation-only task. It changes no runtime behavior and is verified with targeted documentation grep plus the normal typecheck/test suite.

**Files:**
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `AGENTS.md`
- Modify: `VISION.md`

**Step 1 — Documentation verification before implementation**
Run: `bun test test/docs-symbol-graph-unified-surface.test.ts test/docs-closed-enum-drift.test.ts`
Expected: PASS for existing docs tests, but manual grep still finds stale claims such as:

```md
Every node in every response carries `file:line:hash`. The agent can edit any result immediately. No translation layer between "understanding" and "acting."
```

**Step 2 — Expected stale-doc evidence**
Run: `grep -R "file:line:hash\|edit any result immediately\|No re-reading\|No translation layer" README.md ARCHITECTURE.md AGENTS.md VISION.md`
Expected: FAIL for the documentation contract — output includes stale old-format claims in root docs, especially `VISION.md` and `AGENTS.md`.

**Step 3 — Update documentation**
In `README.md`, replace any old editable-anchor wording with:

```md
Editable anchor locations are rendered as two adjacent fields: the file path as context, then a bare `LINE:HASH` token, for example `src/a.ts  10:abc`. The `LINE:HASH` token uses the same whitespace-insensitive xxhash line-hash algorithm as pi-hashline-readmap.

The graph can point an agent to the right file and line, but pi-hashline-readmap's read-before-edit/file-anchoring gate still applies. Codegraph does not provide true edit-without-prior-read anchoring.
```

In `ARCHITECTURE.md`, distinguish the two hash concepts:

```md
- `content_hash` is a whole-file SHA-256 value used for staleness and incremental indexing.
- Editable line anchors are not stored in SQLite. They are computed from current on-disk line content at render time as bare `LINE:HASH` tokens and displayed next to the file path, e.g. `src/a.ts  10:abc`.
```

In `AGENTS.md`, replace the old tool-output statement with:

```md
Tool output is hashline-compatible: file paths are rendered as separate context fields next to bare editable `LINE:HASH` anchors. The line hash is the local pi-hashline-compatible 3-hex xxhash value. Whole-file `content_hash` values remain SHA-256 freshness markers.
```

In `VISION.md`, replace:

```md
Every node in every response carries `file:line:hash`. The agent can edit any result immediately. No translation layer between "understanding" and "acting."
```

with:

```md
Every node in editable output carries the file path as context plus a bare `LINE:HASH` anchor token that matches pi's hashline format, for example `src/a.ts  10:abc`. That makes the location actionable after pi-hashline-readmap has anchored the file through its normal read/grep/ast_search/write gate; codegraph does not bypass the read-before-edit requirement.
```

**Step 4 — Verify documentation checks pass**
Run: `bun test test/docs-symbol-graph-unified-surface.test.ts test/docs-closed-enum-drift.test.ts`
Expected: PASS

Then verify no stale root-doc claims remain:

```sh
grep -R "file:line:hash\|edit any result immediately\|No re-reading\|No translation layer" README.md ARCHITECTURE.md AGENTS.md VISION.md
```

Expected: no matches for stale editable-anchor claims. If the grep returns matches in historical context, rewrite them to mention separate `file path` plus bare `LINE:HASH` and the read-before-edit caveat.

**Step 5 — Verify no regressions**
Run: `bun run check && bun test`
Expected: PASS — typecheck and all tests passing.
