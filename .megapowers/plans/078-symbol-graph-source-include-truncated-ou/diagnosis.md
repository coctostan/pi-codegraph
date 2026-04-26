# Diagnosis

## Root Cause

**Where:** `src/output/source.ts` — `readSourceSnippet`, lines 52–55.

**What's broken:** When a body exceeds `maxLines`, the function appends a
truncation notice that *only* contains the count of omitted lines:

```
54:4f1|    text += `\n(${truncated} more lines truncated)`;
```

It deliberately leaves out the three pieces of information the calling
agent needs in order to read the rest in one follow-up call:

1. the source file path (`node.file`)
2. the offset of the first omitted line (`node.start_line + limit`,
   which equals `node.start_line + displayLines.length`)
3. the count of remaining lines (`truncated`)

All three values are already in scope at the point of the format string
(`node` is the parameter, `limit` is the local computed two lines
above). The notice does not synthesize a `read(...)` continuation hint,
so the agent receives a numeric "you missed 71 lines" without any
anchored next action.

The bug is a missing-feature regression from the original implementation
in #057, where the `(N more lines truncated)` literal was set as the
spec — see `.megapowers/plans/057-inline-source-snippets-in-symbol-card-ou/spec.md:11`
— before the agent-ergonomics requirement of #078 existed. There is no
runtime fault; the function does exactly what it was written to do. The
"correct → incorrect" transition happened at design time when the
truncation notice was specified without a continuation path.

**Evidence — `src/output/source.ts` (full body):**

```
21:427|export function readSourceSnippet(
22:85c|  node: GraphNode,
23:147|  projectRoot: string,
24:1ef|  maxLines?: number,
25:231|): SourceSnippetResult | null {
...
41:636|  const sourceLines = allLines.slice(startIdx, endIdx + 1);
42:02c|  const limit = maxLines ?? DEFAULT_MAX_SOURCE_LINES;
43:062|  const truncated = sourceLines.length > limit ? sourceLines.length - limit : 0;
44:c8b|  const displayLines = truncated > 0 ? sourceLines.slice(0, limit) : sourceLines;
...
52:9b5|  let text = hashlined.join("\n");
53:53d|  if (truncated > 0) {
54:4f1|    text += `\n(${truncated} more lines truncated)`;
55:b18|  }
...
57:dc2|  return { text, stale, truncated };
58:b18|}
```

**Evidence — failing test reproduces it deterministically:**

```
$ bun test test/repro-078-source-truncation-hint.test.ts
Expected to contain: "src/big.ts"
Received: "...50:a0d9|  // line 50\n(50 more lines truncated)"
(fail) repro-078: truncated source includes read() continuation hint [8.46ms]
```

## Trace

1. Agent calls `symbol_graph` with `include: ["source"]` (or `symbol_card`
   with `maxSourceLines`).
2. Tool dispatches to `renderSymbolSourceSection` in
   `src/tools/symbol-card.ts:25`.
3. Line 41 calls `readSourceSnippet(node, projectRoot, maxSourceLines)`.
4. `readSourceSnippet` slices the file content (`source.ts:41`),
   computes `truncated = sourceLines.length - limit` (line 43), trims to
   `limit` lines (line 44), and emits hashlined output (line 49).
5. **Defect site:** line 54 appends `(${truncated} more lines truncated)`
   — discarding `node.file`, `node.start_line`, and `limit`.
6. Caller in `symbol-card.ts:44` glues the snippet text under
   `### Source` verbatim. No caller mutates or augments the truncation
   notice — what `readSourceSnippet` writes is what the agent sees.

`renderSymbolSourceSection` is the only consumer of
`readSourceSnippet`, and the function is invoked from exactly two
caller sites in `symbol-card.ts` (`symbolCard` and the new `include`
path used by `symbol_graph`). Both consume the same `text` field, so
fixing the format at the producer covers all surfaces.

## Affected Code

- `src/output/source.ts:54` — the line that emits the bare truncation
  notice. Single-site fix.
- `src/output/source.ts:21–58` — `readSourceSnippet`. The fix lives
  inside this function; no signature change required (`SourceSnippetResult`
  carries `text`, `stale`, `truncated` and that interface is unchanged).
- `src/tools/symbol-card.ts:41` — only call site of `readSourceSnippet`.
  No change needed; it already concatenates `snippet.text` straight into
  the body, so the new hint flows through automatically.
- `src/tools/symbol-graph.ts:171` — `symbolGraph` reaches the same
  rendering path through `renderSymbolSourceSection`. No code change.

**Tests that hard-code the old truncation phrase (need updating during
implement, not now):**

- `test/read-source-snippet.test.ts:124` — `expect(result!.text).toContain("(15 more lines truncated)")`
- `test/tool-symbol-card-source.test.ts:184` — `expect(output).toContain("more lines truncated)")`

The second is loose and will probably keep passing if the new phrasing
contains the substring `more lines`; the first is exact and needs to be
adjusted.

**Documentation that hard-codes the old phrase:**

- `.megapowers/docs/057-inline-source-snippets-in-symbol-card-ou.md:21`
  — describes the public behavior of `maxSourceLines`. Update during
  implement to match the new format.

## Pattern Analysis

The codebase already has the exact pattern the fix needs — embed an
anchored, machine-parseable next-step inside agent output:

- `src/output/anchoring.ts` produces `file:line:hash` anchors for every
  node and writes them to output so the agent can feed them back into
  `read`.
- `src/tools/symbol-card.ts:36, 87` formats anchors right next to the
  human-readable name (`  ${anchor.anchor}  ${node.name}`), giving the
  agent a copy-paste-ready reference.
- `src/output/signals.ts` and the other output modules avoid bare
  numeric counts in favor of values plus their continuation context.

Compared to those, `readSourceSnippet`'s truncation notice is a
one-off: it's the only "you've been truncated" message in the output
layer that does not embed an actionable anchor. The asymmetry is the
diff.

**Working pattern (anchored, actionable):**

```
src/output/source.ts:46-49 (the displayed lines themselves):
  hashlined.map((content, i) => {
    const lineNum = node.start_line + i;
    const lineHash = sha256Hex(content.trim()).slice(0, 4);
    return `${lineNum}:${lineHash}|${content}`;
  });
```

Each rendered line carries `lineNum`, a hash, and the content — the
agent has everything it needs to call `read` and verify freshness.

**Broken pattern (numeric only):**

```
src/output/source.ts:54:
  text += `\n(${truncated} more lines truncated)`;
```

No file, no offset, no hash, no `read()` shape. The function knows
where the user is in the file and silently throws that information
away.

**Assumption violated:** the function assumes the consumer either
(a) doesn't need the rest, or (b) will compute the offset themselves.
The agent contract documented in `AGENTS.md` ("All output is
hashline-anchored. Every edge shows provenance.") expects the opposite —
every truncation must lead somewhere.

**Inputs/state required by the fix already present in scope at line 54:**

| Need                | Source                                  |
|---------------------|-----------------------------------------|
| File path           | `node.file` (param, available since L22)|
| Offset of cont.     | `node.start_line + limit` (L36, L42)    |
| Limit for `read()`  | `truncated` (L43)                       |
| Format precedent    | `read(file, offset: N, limit: M)` matches the issue's "Expected output" example |

No new I/O, no new imports, no new function signature. Pure string-
formatting change.

## Risk Assessment

`impact readSourceSnippet behavior_change`:

```
src/index.ts:199              piCodegraph                 behavioral depth:3
src/tools/symbol-card.ts:25   renderSymbolSourceSection   behavioral depth:1
src/tools/symbol-graph.ts:171 symbolGraph                 behavioral depth:2
src/tools/symbol-card.ts:120  symbolCard                  behavioral depth:2
test/extension-suppress-trust-header-*  4 register tests  depth:4
```

- **`renderSymbolSourceSection` (depth 1)** — direct consumer; passes
  `snippet.text` through verbatim. No code change required, but its
  test surface (`test/tool-symbol-card-source.test.ts`,
  `test/tool-symbol-graph-source-include.test.ts`) will see the new
  string and must accept it.
- **`symbolCard` and `symbolGraph` (depth 2)** — wrap the section with
  trust headers and other content. No structural impact; the trust
  header gating is driven by `snippet.stale`, not by the truncation
  notice text, so changes here cannot cause "Local Exceptions" flips.
- **`piCodegraph` (depth 3, the extension entry)** — only routes the
  output. No behavior change.
- **The four `extension-suppress-trust-header-*` tests** — they
  assert trust-header presence/absence, not snippet body. Risk:
  zero unless the new hint accidentally introduces the trust-header
  marker substring. (Mitigation: keep the hint to a single
  `(...)` line that does not contain "## Trust" or other reserved
  prefixes.)

**Risk surface summary:** purely cosmetic-output change, single
function, no I/O or schema impact. Two tests assert the *literal*
truncation phrase and need updating; one md doc references it. Nothing
that takes the truncation notice as input downstream — it is terminal
output.

**Related bugs that share this root cause:** none in the open issue
list (#073, #074, #076, #077, #079–#082 are unrelated). The
agent-ergonomics theme — "give the agent a continuation path, not just
a count" — overlaps philosophically with #073 (impact silent empty
output) and #082 ([untested] disambiguation) but those are different
output sites.

## Fixed When

1. `readSourceSnippet` returns a `text` whose truncation suffix
   contains the source file path (`node.file`), an `offset:` referring
   to the first omitted line (1-indexed,
   `node.start_line + displayLines.length`), and a `limit:` equal to
   `truncated`.
2. The truncation suffix is shaped as a single line containing a
   `read(...)` invocation the agent can copy verbatim — for example
   `(50 more lines — use read("src/big.ts", offset: 51, limit: 50) to see the rest)`.
3. Non-truncated output is byte-identical to today (acceptance
   criterion #2 from the issue): when `truncated === 0`, no suffix is
   appended and existing assertions in
   `test/read-source-snippet.test.ts` (returns hashlined source for a
   valid node, returns null when file does not exist, returns null when
   end_line is null, sets stale=true/false) keep passing.
4. The new failing test `test/repro-078-source-truncation-hint.test.ts`
   passes (all four assertions: file path present, `offset: 51`,
   `limit: 50`, `read(` token).
5. Existing assertions on the truncation phrase are updated to the new
   format:
   - `test/read-source-snippet.test.ts:124` updated to assert the new
     hint shape.
   - `test/tool-symbol-card-source.test.ts:184` continues to pass (its
     substring `more lines` should remain in the new phrasing) — verify
     in implement.
6. `.megapowers/docs/057-inline-source-snippets-in-symbol-card-ou.md:21`
   updated to describe the new continuation hint.
7. The full `bun test` suite is green (no regressions in the four
   `extension-suppress-trust-header-*` tests or any other consumer of
   the source-include path).
