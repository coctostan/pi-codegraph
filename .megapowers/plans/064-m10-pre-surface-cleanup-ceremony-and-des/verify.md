## Test Suite Results

### Project conventions checked
- `AGENTS.md:65-71` documents `Bun runtime, TypeScript`.
- `package.json` scripts inspected via Nushell:

```json
{
  "scripts": {
    "test": "bun test",
    "build": "echo \"nothing to build\"",
    "check": "tsc --noEmit"
  }
}
```

### Full test suite run fresh
Command:
```bash
bun test && bun run check
```

Output summary:
```text
422 pass
0 fail
1267 expect() calls
Ran 422 tests across 177 files. [14.87s]
$ tsc --noEmit
```

### Bugfix reproduction
Not applicable. This batch issue is a feature/doc cleanup issue, not a bugfix workflow.

## Per-Criterion Verification

### Criterion 1: When a read-only tool call resolves `TrustStatus` to `fresh`, the returned text omits the `## Trust` header entirely.
**Identify:** Verify the fresh-path suppression helper and the extension-level fresh output.

**Read evidence:**
- `src/output/read-only-ceremony.ts:1-7` strips only headers whose second line is exactly `status: fresh`.
- `test/extension-readonly-trust-gating.test.ts:47-65` asserts a fresh `symbol_graph` call must not include `## Trust`.

**Run evidence:**
Command:
```bash
bun test test/output-readonly-ceremony.test.ts test/extension-readonly-trust-gating.test.ts
```
Output:
```text
test/output-readonly-ceremony.test.ts:
(pass) suppressFreshTrustHeader strips only fresh trust headers

test/extension-readonly-trust-gating.test.ts:
(pass) fresh symbol_graph tool calls omit the Trust header but keep provenance and signal lines
(pass) non-fresh trace tool calls still render the Trust header
(pass) readonly reindex output still renders the indexing-failed note
```

Direct extension output check:
```text
## shared (function)
src/shared.ts:1:de88 [entry-point, untested]
### Callees
  src/helper.ts:1:d31d  helper  calls  confidence:0.9  tree-sitter [leaf, untested]
```
That output starts with `## shared (function)`, not `## Trust`.

**Verdict:** pass

### Criterion 2: When a read-only tool call resolves `TrustStatus` to `stale`, `mixed`, `heuristic`, or `runtime-backed`, the returned text still includes the Trust header in the current format.
**Identify:** Use the trust-header tests that explicitly assert the header text for heuristic, runtime-backed, and mixed outputs, plus the extension heuristic path.

**Read evidence:**
- `test/tool-trace-trust-heuristic.test.ts:47-50` expects `## Trust`, `status: heuristic`, and the shared evidence line.
- `test/tool-trace-trust-runtime.test.ts:62-76` expects `status: runtime-backed` first, then `status: mixed` after staleness is introduced.
- `test/tool-graph-query-trust-header.test.ts:62-64` expects `status: mixed` on stale graph-query output.
- `test/extension-readonly-trust-gating.test.ts:97-100` expects extension `trace` output to start with `## Trust\nstatus: heuristic`.

**Run evidence:**
Command:
```bash
bun test test/tool-trace-trust-heuristic.test.ts test/tool-trace-trust-runtime.test.ts test/tool-graph-query-trust-header.test.ts test/extension-readonly-trust-gating.test.ts
```
Output:
```text
test/tool-trace-trust-runtime.test.ts:
(pass) trace prepends a runtime-backed trust header and degrades to mixed when a stored coverage step goes stale

test/tool-graph-query-trust-header.test.ts:
(pass) graphQuery prepends the shared trust header and keeps stale node markers local

test/tool-trace-trust-heuristic.test.ts:
(pass) trace prepends the shared trust header for static heuristic paths without changing mode semantics

test/extension-readonly-trust-gating.test.ts:
(pass) fresh symbol_graph tool calls omit the Trust header but keep provenance and signal lines
(pass) non-fresh trace tool calls still render the Trust header
(pass) readonly reindex output still renders the indexing-failed note
```

Direct heuristic extension output:
```text
## Trust
status: heuristic
evidence: tree-sitter  stale-files: 0/1
mode: static (heuristic, no runtime evidence)
src/app.ts:2:6726  foo  function [entry-point, leaf, untested]
```

**Verdict:** pass

### Criterion 3: The `_meta: tokens_saved:...` footer is suppressed when `CODEGRAPH_DEVMETA` is unset or falsy.
**Identify:** Run the per-call env-gating test and a direct extension invocation with the env unset.

**Read evidence:**
- `src/tools/token-tracker.ts:138-151` reads `process.env.CODEGRAPH_DEVMETA` on each call and returns the unmodified output when disabled.
- `test/extension-readonly-devmeta.test.ts:38-50` asserts `_meta:` is absent when the env var is unset.

**Run evidence:**
Command:
```bash
bun test test/extension-readonly-devmeta.test.ts
```
Output:
```text
test/extension-readonly-devmeta.test.ts:
(pass) CODEGRAPH_DEVMETA gates _meta per call without restart
```

Direct extension output check:
```text
off_has_meta=false
on_has_meta=true
off_again_has_meta=false
```

**Verdict:** pass

### Criterion 4: The `_meta: tokens_saved:...` footer is emitted when `CODEGRAPH_DEVMETA` is truthy, and the environment variable is read on each tool call so changing it during a running session affects the next call without restart.
**Identify:** Use the same per-call env-gating test and direct toggle output.

**Read evidence:**
- `test/extension-readonly-devmeta.test.ts:52-75` toggles `CODEGRAPH_DEVMETA` off → on → off again and asserts `_meta:` follows each call.
- `src/tools/token-tracker.ts:138-151` implements per-call env reads via `devMetaEnabled()`.

**Run evidence:**
Command:
```bash
bun test test/extension-readonly-devmeta.test.ts
```
Output:
```text
(pass) CODEGRAPH_DEVMETA gates _meta per call without restart
```

Direct extension toggle output:
```text
off_has_meta=false
on_has_meta=true
off_again_has_meta=false
```

**Verdict:** pass

### Criterion 5: Per-edge provenance labels such as `[source: lsp]` remain rendered wherever they are rendered today and are not removed, hidden, or gated by AC 1-4.
**Identify:** Verify a fresh read-only extension output still includes provenance text on edge rows, and verify the underlying rendering tests still pass.

**Read evidence:**
- `test/tool-symbol-graph-signals.test.ts:49-53` expects a rendered neighbor line containing `confidence:0.9  tree-sitter`.
- `test/output-format-neighborhood.test.ts:67-72` expects neighborhood output to contain `tree-sitter`.

**Run evidence:**
Command:
```bash
bun test test/tool-symbol-graph-signals.test.ts
```
Output:
```text
test/tool-symbol-graph-signals.test.ts:
(pass) symbolGraph renders inline role tags on header and resolved neighbors
```

Direct fresh extension output:
```text
## shared (function)
src/shared.ts:1:de88 [entry-point, untested]
### Callees
  src/helper.ts:1:d31d  helper  calls  confidence:0.9  tree-sitter [leaf, untested]
```
The `tree-sitter` provenance label is present in the read-only path even though the fresh Trust header was suppressed.

**Verdict:** pass

### Criterion 6: Per-symbol signal badges such as `[hub]`, `[tested]`, and `[bottleneck]` remain rendered wherever they are rendered today and are not removed, hidden, or gated by AC 1-4.
**Identify:** Verify signal-rendering tests and verify fresh read-only extension output still includes signal badges.

**Read evidence:**
- `test/tool-symbol-graph-signals.test.ts:51-52` expects `[entry-point, tested]` on the header and `[leaf, untested]` on a rendered neighbor.
- `test/tool-trace-signals.test.ts:53-56` expects `[entry-point, tested]` and `[leaf, untested]` on trace step lines.
- `test/extension-readonly-trust-gating.test.ts:72-73` asserts fresh extension output still contains `leaf` and `untested`.

**Run evidence:**
Command:
```bash
bun test test/tool-symbol-graph-signals.test.ts test/tool-trace-signals.test.ts test/extension-readonly-trust-gating.test.ts
```
Output:
```text
test/tool-trace-signals.test.ts:
(pass) trace appends inline role tags to coverage and static step lines without changing mode header

test/tool-symbol-graph-signals.test.ts:
(pass) symbolGraph renders inline role tags on header and resolved neighbors

test/extension-readonly-trust-gating.test.ts:
(pass) fresh symbol_graph tool calls omit the Trust header but keep provenance and signal lines
(pass) non-fresh trace tool calls still render the Trust header
(pass) readonly reindex output still renders the indexing-failed note
```

Direct fresh extension output contains signal badges:
```text
src/shared.ts:1:de88 [entry-point, untested]
  src/helper.ts:1:d31d  helper  calls  confidence:0.9  tree-sitter [leaf, untested]
```

**Verdict:** pass

### Criterion 7: The line `indexing-failed: graph may be stale (readonly database)` is still rendered whenever `lastIndexError` is set, regardless of Trust status and regardless of whether `_meta` is suppressed.
**Identify:** Verify the shared note is still prepended in the read-only finalizer and that the readonly-db extension test passes.

**Read evidence:**
- `src/index.ts:150-165` keeps `indexingFailedNote()` and prepends it before `_meta` gating in `finalizeReadOnlyOutput()`.
- `test/extension-readonly-trust-gating.test.ts:109-137` asserts the readonly reindex path still includes `indexing-failed: graph may be stale (readonly database)`.

**Run evidence:**
Command:
```bash
bun test test/extension-readonly-trust-gating.test.ts
```
Output:
```text
test/extension-readonly-trust-gating.test.ts:
(pass) fresh symbol_graph tool calls omit the Trust header but keep provenance and signal lines
(pass) non-fresh trace tool calls still render the Trust header
(pass) readonly reindex output still renders the indexing-failed note
```

**Verdict:** pass

### Criterion 8: AC 1-7 apply uniformly to every tool currently registered through the read-only path in `src/index.ts` ... no per-tool override is introduced.
**Identify:** Inspect the shared read-only finalizer and confirm every read-only tool routes through it.

**Read evidence:**
- `src/index.ts:155-165` defines one shared `finalizeReadOnlyOutput()` that performs fresh-header suppression, readonly indexing note injection, and `_meta` gating.
- `src/index.ts` grep results show every read-only tool calls that one helper:
  - `symbol_graph` at `index.ts:206`
  - `impact` at `index.ts:292`
  - `trace` at `index.ts:308`
  - `graph_query` at `index.ts:324`
  - `symbol_card` at `index.ts:339`
  - `symbol_contract` at `index.ts:354`
  - `graph_overview` at `index.ts:369`
  - `dead_code` at `index.ts:384`
  - `symbol_search` at `index.ts:406`

**Run evidence:**
Command:
```bash
grep in src/index.ts for finalizeReadOnlyOutput("...")
```
Output (from anchored search):
```text
index.ts:206 finalizeReadOnlyOutput("symbol_graph", ...)
index.ts:292 finalizeReadOnlyOutput("impact", ...)
index.ts:308 finalizeReadOnlyOutput("trace", ...)
index.ts:324 finalizeReadOnlyOutput("graph_query", ...)
index.ts:339 finalizeReadOnlyOutput("symbol_card", ...)
index.ts:354 finalizeReadOnlyOutput("symbol_contract", ...)
index.ts:369 finalizeReadOnlyOutput("graph_overview", ...)
index.ts:384 finalizeReadOnlyOutput("dead_code", ...)
index.ts:406 finalizeReadOnlyOutput("symbol_search", ...)
```

**Verdict:** pass

### Criterion 9: The repo contains `docs/tool-descriptions.md` that codifies the required style guide.
**Identify:** Inspect the guide file directly.

**Read evidence:**
`docs/tool-descriptions.md:1-25` contains:
- the guide title and purpose (`1-4`)
- the six required rules (`5-11`), including `When to use:`, no inline examples, no cross-tool references, and no parameter restatement
- maintenance guidance pointing back to `src/index.ts` as source of truth (`24-25`)

Key lines:
- `docs/tool-descriptions.md:6` one terse action-oriented first line
- `docs/tool-descriptions.md:7-8` optional `When to use:` block, 1-2 short lines
- `docs/tool-descriptions.md:9` no inline examples
- `docs/tool-descriptions.md:10` no cross-references
- `docs/tool-descriptions.md:11` no top-level parameter restatement

**Run evidence:**
Command:
```bash
bun -e '...read docs/tool-descriptions.md...'
```
Output summary:
```text
Guide rules ok
```

**Verdict:** pass

### Criterion 10: `README.md` and `ARCHITECTURE.md` list exactly the 11 tools registered in `src/index.ts`, and `ARCHITECTURE.md` points to `docs/tool-descriptions.md`.
**Identify:** Verify README tool headings, ARCHITECTURE tool inventory, and the pointer line.

**Read evidence:**
- `README.md:21` says `11 agent tools`.
- README tool headings are at `README.md:66,75,88,96,104,112,121,129,137,145,153`.
- `ARCHITECTURE.md:9-12` lists all 11 tools in the system overview.
- `ARCHITECTURE.md:228` contains `Tool description authoring rules live in docs/tool-descriptions.md.`
- `ARCHITECTURE.md:251-260` lists the current tool files including `delete-edge.ts`, `symbol-card.ts`, `symbol-contract.ts`, `graph-overview.ts`, `dead-code.ts`, and `symbol-search.ts`.

**Run evidence:**
Command:
```bash
bun -e '...validate README headings, ARCHITECTURE inventory, and guide pointer...'
```
Output:
```text
README headings: symbol_graph, resolve_edge, delete_edge, impact, trace, graph_query, symbol_card, symbol_contract, graph_overview, dead_code, symbol_search
ARCHITECTURE tool inventory ok and points to docs/tool-descriptions.md
Guide rules ok
```

**Verdict:** pass

### Criterion 11: The `description` strings in `src/index.ts` match the approved table for all 11 registered tools.
**Identify:** Verify the runtime-registered descriptions against the approved map and inspect the source lines.

**Read evidence:**
Relevant source lines in `src/index.ts`:
- `182` `symbol_graph`
- `214` `resolve_edge`
- `247` `delete_edge`
- `279` `impact`
- `300-301` `trace`
- `316-317` `graph_query`
- `332` `symbol_card`
- `347` `symbol_contract`
- `362` `graph_overview`
- `377` `dead_code`
- `392` `symbol_search`

**Run evidence:**
Command:
```bash
bun /tmp/verify-descriptions.mjs
```
Output:
```text
symbol_graph: description ok
resolve_edge: description ok
delete_edge: description ok
impact: description ok
trace: description ok
graph_query: description ok
symbol_card: description ok
symbol_contract: description ok
graph_overview: description ok
dead_code: description ok
symbol_search: description ok
```

Also covered by:
```text
bun test test/extension-tool-descriptions.test.ts test/extension-trace-description.test.ts test/extension-graph-query-description.test.ts test/extension-symbol-search.test.ts
=> 5 pass, 0 fail
```

**Verdict:** pass

### Criterion 12: This issue does not change any tool `name` or `parameters` schema, does not add/remove/gate whole tools, and does not change tool output semantics other than the Trust-header and `_meta` gating plus approved description/doc updates.
**Identify:** Verify the registered tool names and parameter schemas, then inspect the shared output finalizer to confirm the behavior change is narrowly scoped.

**Read evidence:**
- `src/index.ts:24-98` defines the parameter schemas.
- `src/index.ts:155-165` shows the only shared read-only output change: `suppressFreshTrustHeader(...)`, `indexingFailedNote()`, and `appendTokenMetaIfEnabled(...)`.
- `src/tools/token-tracker.ts:138-151` scopes `_meta` gating to `CODEGRAPH_DEVMETA`.

**Run evidence:**
Command:
```bash
bun -e '...register tools and print names + parameter schema shapes...'
```
Output:
```text
tool names ok: dead_code, delete_edge, graph_overview, graph_query, impact, resolve_edge, symbol_card, symbol_contract, symbol_graph, symbol_search, trace
symbol_graph: props=[file,name] required=[name]
resolve_edge: props=[evidence,kind,source,sourceFile,target,targetFile] required=[evidence,kind,source,target]
delete_edge: props=[kind,source,sourceFile,target,targetFile] required=[kind,source,target]
impact: props=[changeType,maxDepth,symbols] required=[changeType,symbols]
trace: props=[entry,file] required=[entry]
graph_query: props=[query] required=[query]
symbol_card: props=[file,maxSourceLines,name] required=[name]
symbol_contract: props=[file,name] required=[name]
graph_overview: props=[] required=[]
dead_code: props=[file,glob,kind,name] required=[]
symbol_search: props=[file,kind,limit,query] required=[query]
```
This confirms the 11-tool surface and parameter schemas are unchanged. The only shared behavior change in source is the centralized read-only finalizer and `_meta` env gate.

**Verdict:** pass

### Criterion 13: This issue introduces no changes to the indexer, graph store, SQLite schema, or `.codegraph/` layout.
**Identify:** Inspect the modified/untracked file list for this issue.

**Run evidence:**
Command:
```bash
printf 'MODIFIED\n'; git ls-files -m; printf 'UNTRACKED\n'; git ls-files -o --exclude-standard
```
Output excerpt:
```text
MODIFIED
ARCHITECTURE.md
README.md
src/index.ts
src/tools/token-tracker.ts
test/extension-graph-query-description.test.ts
test/extension-symbol-search.test.ts
test/extension-trace-description.test.ts
UNTRACKED
docs/tool-descriptions.md
src/output/read-only-ceremony.ts
test/extension-readonly-devmeta.test.ts
test/extension-readonly-trust-gating.test.ts
test/extension-tool-descriptions.test.ts
test/output-readonly-ceremony.test.ts
```
No modified or untracked files are under `src/indexer/`, `src/graph/`, migrations, or `.codegraph/`.

**Verdict:** pass

### Criterion 14: The test suite is updated as needed to verify AC 1-8, and all existing tests pass after updates.
**Identify:** Verify the new/updated tests exist, targeted acceptance tests pass, and the full suite passes.

**Read evidence:**
New/updated acceptance-focused tests present in the working tree:
- `test/output-readonly-ceremony.test.ts`
- `test/extension-readonly-trust-gating.test.ts`
- `test/extension-readonly-devmeta.test.ts`
- `test/extension-tool-descriptions.test.ts`
- updated `test/extension-trace-description.test.ts`
- updated `test/extension-graph-query-description.test.ts`
- updated `test/extension-symbol-search.test.ts`

**Run evidence:**
Targeted acceptance command:
```bash
bun test test/output-readonly-ceremony.test.ts test/extension-readonly-trust-gating.test.ts test/extension-readonly-devmeta.test.ts test/extension-tool-descriptions.test.ts test/extension-trace-description.test.ts test/extension-graph-query-description.test.ts test/extension-symbol-search.test.ts
```
Output:
```text
10 pass
0 fail
Ran 10 tests across 7 files.
```

Fresh full-suite command:
```bash
bun test && bun run check
```
Output summary:
```text
422 pass
0 fail
1267 expect() calls
Ran 422 tests across 177 files. [14.87s]
$ tsc --noEmit
```

**Verdict:** pass

## Overall Verdict
pass

All 14 acceptance criteria are satisfied with fresh evidence from this session. The read-only ceremony change is centralized in `src/index.ts:155-165`, `_meta` is gated per call in `src/tools/token-tracker.ts:138-151`, the normalized 11-tool description surface is registered exactly as approved, the docs are reconciled to that 11-tool surface, and the full suite plus targeted acceptance tests passed fresh.
