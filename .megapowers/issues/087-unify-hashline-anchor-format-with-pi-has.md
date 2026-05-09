---
id: 87
type: feature
status: in-progress
created: 2026-05-08T16:27:41.907Z
priority: 2
---
# Unify hashline anchor format with pi-hashline-readmap so agents can edit symbols without re-reading
## Problem

pi-codegraph's README promises that *"every result is hashline-anchored (`file:line:hash`) — the agent can edit any symbol it finds without re-reading the file."* In practice, an agent paired with `pi-hashline-readmap` (the de facto hashline editor in the pi ecosystem) **cannot** feed pi-codegraph's anchors into its `edit` tool. The two formats look similar but are byte-incompatible at three levels.

### Current pi-codegraph format

`src/output/anchoring.ts` → `computeAnchor()` emits:

```
${file}:${start_line}:${lineHash}
```

where `lineHash = sha256Hex(lineContent.trim()).slice(0, 4)` — e.g. `src/auth.ts:42:a3f1`.

### Current pi-hashline-readmap format

`src/hashline.ts` → `formatHashlineDisplay()` emits:

```
${lineNumber}:${computeLineHash(...)}|${content}
```

where `computeLineHash` is `xxhash32(lineContent.replace(/\s+/g, "")) % 16³`, padded to **exactly 3 hex chars** — e.g. `42:a3f|return n;`.

`parseLineRef` enforces a strict regex `^(\d+):([0-9a-fA-F]{3})$` and rejects 4-char hashes outright with `"Invalid line reference… Expected 'LINE:HASH'"`.

### Concrete divergences

| Dimension | pi-codegraph | pi-hashline-readmap |
|---|---|---|
| Shape | `path:line:hash` | `line:hash` (file implicit from read context) |
| Hash algorithm | sha256 | xxhash32 mod 16³ |
| Hash length | 4 hex chars | exactly 3 hex chars |
| Hash input | `lineContent.trim()` | `lineContent.replace(/\s+/g, "")` |
| Trailing | nothing | `\|<line content>` after hash |

So even a hand-edited pi-codegraph anchor like `42:a3f1` would (a) fail length validation and (b) hash to a different value than pi-hashline-readmap computes for the same line. Round-trip is impossible.

### Why this matters

1. **The README's "edit without re-reading" promise is broken** for any agent using pi-hashline-readmap.
2. The agent must `read` the file first anyway to get a real anchor, defeating much of the value of returning anchored output from `symbol_graph` / `trace` / `impact`.
3. Any future "jump from graph result straight to edit" workflow is blocked until the formats align.

## Goal

Make pi-codegraph emit anchors that pi-hashline-readmap will accept directly in `set_line.anchor`, `replace_lines.start_anchor`/`end_anchor`, and `insert_after.anchor`. After this issue, an agent should be able to take any anchor printed by a pi-codegraph tool and pass it straight to `edit` without an intervening `read`.

## Proposed design

### 1. Adopt pi-hashline-readmap's hash function exactly

In `src/output/anchoring.ts`, replace the sha256-based `computeAnchor` with one that uses `xxhash-wasm` and the same canonicalization rules:

- `xxhash32(lineContent.replace(/\s+/g, ""), seed = 0)`
- `% 16³` then `.toString(16).padStart(3, "0")`
- Strip trailing `\r` before hashing (matches pi-hashline-readmap's `computeLineHash`)

This produces the **identical** 3-char hash for the same line. Compatibility is bit-exact, not best-effort.

### 2. Decide the anchor shape

Two viable options:

**Option A — keep file path, change hash only**

```
src/auth.ts:42:a3f
```

Pros: minimal churn, file context is preserved in display, easy to grep.
Cons: pi-hashline-readmap's `parseLineRef` would still reject this directly because it expects `42:a3f` with no path. The agent would need to know to strip the path before passing to `edit`. Still better than today (the hash itself would be valid), but not a clean drop-in.

**Option B — emit a separate file column + bare hashline**

Render anchored output as two columns:

```
src/auth.ts  42:a3f  validateToken  function  confidence:0.95  tree-sitter
```

Pros: the `42:a3f` token is byte-identical to what pi-hashline-readmap emits for that file, so the agent can use it directly after a `read` of that file. Display still shows the file.
Cons: small format change to `formatNeighborhood` / `formatSection` output.

**Recommendation: Option B.** It is the only one that delivers the README's promise. Option A still requires the agent to do path-stripping, which is exactly the kind of fragile string surgery hashlines exist to avoid.

### 3. Async-compatible API

`xxhash-wasm` requires a one-time async `xxhashWasm()` initialization. pi-hashline-readmap exposes `ensureHashInit()` for this. pi-codegraph will need to:

- add `xxhash-wasm` as a dependency
- add `ensureHashInit()` (or import it if pi-hashline-readmap exposes it via package exports — verify)
- await it once during indexer/tool startup (likely in `getOrCreateStore` or at the top of each tool's `execute`)
- keep `computeAnchor` synchronous after init by caching the resolved `h32` function in module scope, mirroring pi-hashline-readmap's pattern

### 4. Update consumers

- `src/output/anchoring.ts` — new hash function, new format string
- `src/tools/symbol-graph.ts`, `src/tools/impact.ts`, `src/tools/trace.ts`, `src/tools/symbol-card.ts`, `src/tools/symbol-contract.ts`, `src/output/freshness.ts`, `src/output/source.ts`, `src/output/signals.ts` — anywhere that currently consumes `AnchorResult.anchor` and renders it inline
- `src/index.ts` — call `ensureHashInit()` once in extension setup before any tool can run

### 5. Tests

- A unit test in `tests/` that asserts pi-codegraph's hash for a representative line is **byte-identical** to the value pi-hashline-readmap's `computeLineHash` produces for the same line. Pin the algorithm by importing both and asserting equality on a small fixture file.
- A test that asserts the rendered anchor token matches the regex `^\d+:[0-9a-f]{3}$` (the same regex `parseLineRef` enforces).
- Update existing snapshot/golden tests for tool output to the new format.

### 6. Documentation

- Update README "Why pi-codegraph?" — the bullet *"Show me the source"* and the closing line *"Every result is hashline-anchored… the agent can edit any symbol it finds without re-reading the file"* should now be **truthful**. Cross-link to pi-hashline-readmap explaining that the anchor format is shared.
- Update `ARCHITECTURE.md` "Output Layer" section if it documents the old format.

## Out of scope

- Changing how nodes are stored in SQLite (`content_hash` on the node row stays sha256 of the whole file — that's a different concept and works fine for staleness detection).
- Replacing the file-level `content_hash` used to drive `[stale]` markers and the freshness/Trust system added in #086.
- Modifying pi-hashline-readmap.

## Acceptance criteria

- [ ] `computeAnchor` (or its replacement) produces a hash byte-identical to `pi-hashline-readmap`'s `computeLineHash` for the same input line.
- [ ] Tool output emits anchors that match `^\d+:[0-9a-f]{3}$` (with the file path rendered as a separate adjacent token, not embedded inside the anchor).
- [ ] A test pins the algorithm equivalence with both libraries imported.
- [ ] An agent can copy any anchor printed by `symbol_graph` / `impact` / `trace` and pass it directly to pi-hashline-readmap's `edit` tool's `set_line.anchor` field, with a successful edit on a fresh file.
- [ ] README's "edit without re-reading" claim is now accurate.

## Related

- pi-hashline-readmap source of truth: `~/pi/workspace/pi-hashline-readmap/src/hashline.ts` (`computeLineHash`, `parseLineRef`, `HASH_LEN = 3`).
- Issue #086 (freshness reporting) — orthogonal but adjacent: freshness uses file-level sha256, anchors use line-level xxhash. Keep them separate.

