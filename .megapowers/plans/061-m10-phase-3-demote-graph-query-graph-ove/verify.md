## Test Suite Results
Command: `bun test`

Actual output summary from this session:
```text
432 pass
0 fail
1294 expect() calls
Ran 432 tests across 181 files. [10.71s]
```

Relevant lines from the full run for this issue’s scope:
```text
(pass) piCodegraph hides dev-only tools by default and does not re-register them after env changes
(pass) piCodegraph registers the dev-only tools for every approved CODEGRAPH_DEVMODE truthy value
(pass) graph_query keeps its existing runtime behavior when dev mode is enabled
(pass) symbol_search is no longer registered in the extension surface
(pass) symbolSearch remains exported for internal callers
(pass) symbol_graph accepts include:["contract"] in the schema and keeps default output byte-identical
(pass) symbolGraph appends the standalone symbol_contract body when include contains contract
(pass) symbolGraph appends the standalone symbol_contract empty state when include contains contract for an unknown symbol
(pass) pi extension registers symbol_contract tool with correct schema
(pass) pi extension registers the approved descriptions for the 7 default public tools
(pass) graphOverview includes hub symbols sorted by degree
(pass) deadCode sweep mode finds exported symbols with zero inbound edges
(pass) tsc --noEmit passes with no type errors
```

Bug reproduction: N/A. This issue changes tool registration, schema, and docs; it is not a bugfix workflow with explicit reproduction steps in the diagnosis.

## Per-Criterion Verification

### Criterion 1: During `piCodegraph(pi)` initialization, the extension reads `process.env.CODEGRAPH_DEVMODE` exactly once and treats `1`, `true`, `yes`, and `on` as enabled case-insensitively; unset, empty, `0`, and `false` leave dev mode disabled, and tool registration does not change mid-session after load.
**Evidence:**
- Code inspection:
  - `src/config/dev-mode.ts:1-3`
    ```text
    export function devModeEnabled(env: Record<string, string | undefined> = process.env): boolean {
      const raw = env.CODEGRAPH_DEVMODE?.trim().toLowerCase();
      return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
    }
    ```
  - `grep CODEGRAPH_DEVMODE src` returned exactly one source read:
    ```text
    src/config/dev-mode.ts:2  const raw = env.CODEGRAPH_DEVMODE?.trim().toLowerCase();
    ```
  - `grep devModeEnabled src` showed one call site in `src/index.ts`:
    ```text
    src/index.ts:182  const devMode = devModeEnabled();
    src/index.ts:323  if (devMode) {
    src/index.ts:371  if (devMode) {
    src/index.ts:388  if (devMode) {
    ```
- Fresh automated test run:
  - Command: `bun test test/dev-mode.test.ts test/extension-devmode-tools.test.ts ...`
  - Output:
    ```text
    (pass) devModeEnabled accepts the approved truthy values and rejects disabled values
    (pass) piCodegraph hides dev-only tools by default and does not re-register them after env changes
    (pass) piCodegraph registers the dev-only tools for every approved CODEGRAPH_DEVMODE truthy value
    ```
- Fresh registration probe:
  - Command: `bun -e '<registration probe>'`
  - Output:
    ```json
    {"value":"<unset>","tools":["symbol_graph","resolve_edge","delete_edge","impact","trace","symbol_card","symbol_contract"]}
    {"value":"","tools":["symbol_graph","resolve_edge","delete_edge","impact","trace","symbol_card","symbol_contract"]}
    {"value":"0","tools":["symbol_graph","resolve_edge","delete_edge","impact","trace","symbol_card","symbol_contract"]}
    {"value":"false","tools":["symbol_graph","resolve_edge","delete_edge","impact","trace","symbol_card","symbol_contract"]}
    {"value":"1","tools":["symbol_graph","resolve_edge","delete_edge","impact","trace","graph_query","symbol_card","symbol_contract","graph_overview","dead_code"]}
    {"value":"true","tools":["symbol_graph","resolve_edge","delete_edge","impact","trace","graph_query","symbol_card","symbol_contract","graph_overview","dead_code"]}
    {"value":"YES","tools":["symbol_graph","resolve_edge","delete_edge","impact","trace","graph_query","symbol_card","symbol_contract","graph_overview","dead_code"]}
    {"value":"On","tools":["symbol_graph","resolve_edge","delete_edge","impact","trace","graph_query","symbol_card","symbol_contract","graph_overview","dead_code"]}
    ```
- Fresh post-init mutation probe:
  - Command: `bun -e '<after-init env change probe>'`
  - Output:
    ```json
    {"afterInitEnvChangeTools":["symbol_graph","resolve_edge","delete_edge","impact","trace","symbol_card","symbol_contract"]}
    ```
**Verdict:** pass

### Criterion 2: When dev mode is disabled, the extension does not register `graph_query`, `graph_overview`, or `dead_code` with pi.
**Evidence:**
- Fresh registration probe output for `<unset>`, `""`, `"0"`, and `"false"` contained only:
  ```json
  ["symbol_graph","resolve_edge","delete_edge","impact","trace","symbol_card","symbol_contract"]
  ```
  None of `graph_query`, `graph_overview`, or `dead_code` appear.
- Fresh test output:
  ```text
  (pass) piCodegraph hides dev-only tools by default and does not re-register them after env changes
  ```
**Verdict:** pass

### Criterion 3: When dev mode is enabled, the extension registers `graph_query`, `graph_overview`, and `dead_code` with the same tool names, descriptions, parameter schemas, and runtime behavior they had before this issue.
**Evidence:**
- Fresh registration probe output for `"1"`, `"true"`, `"YES"`, and `"On"` included:
  ```json
  ["symbol_graph","resolve_edge","delete_edge","impact","trace","graph_query","symbol_card","symbol_contract","graph_overview","dead_code"]
  ```
- `src/index.ts:323-402` registers those exact tool names behind `if (devMode)` and wires them to the existing `graphQuery`, `graphOverview`, and `deadCode` implementations.
- Fresh targeted test run:
  ```text
  (pass) pi extension registers graph_query with query schema and auto-indexes on first call when CODEGRAPH_DEVMODE=1
  (pass) graph_query keeps its existing runtime behavior when dev mode is enabled
  (pass) pi extension registers graph_query with the approved description when CODEGRAPH_DEVMODE=1
  (pass) pi extension registers graph_overview with no required parameters when CODEGRAPH_DEVMODE=1
  (pass) pi extension registers dead_code with the existing schema when CODEGRAPH_DEVMODE=1
  ```
- Full-suite runtime coverage still passed for these tools:
  ```text
  (pass) graphOverview includes hub symbols sorted by degree
  (pass) graphOverview includes node kind distribution and file stats
  (pass) deadCode sweep mode finds exported symbols with zero inbound edges
  (pass) deadCode single symbol reports unreferenced when no inbound edges
  ```
**Verdict:** pass

### Criterion 4: The extension never registers `symbol_search` as a model-facing tool, regardless of whether `CODEGRAPH_DEVMODE` is enabled.
**Evidence:**
- Fresh registration probe never printed `symbol_search` for disabled or enabled values.
- `grep 'symbol_search|symbolSearch|symbol-search' src/index.ts` showed only an internal helper import:
  ```text
  src/index.ts:21  import { resetSearchCacheForTesting as _resetSearchCache } from "./tools/symbol-search.js";
  ```
  There is no `registerTool({ name: "symbol_search" ... })` block in `src/index.ts`.
- Fresh test output:
  ```text
  (pass) piCodegraph hides dev-only tools by default and does not re-register them after env changes
  (pass) piCodegraph registers the dev-only tools for every approved CODEGRAPH_DEVMODE truthy value
  (pass) symbol_search is no longer registered in the extension surface
  ```
**Verdict:** pass

### Criterion 5: `src/tools/symbol-search.ts` continues to export `symbolSearch` and existing internal/testing helpers needed by current internal consumers, with unchanged signatures and behavior.
**Evidence:**
- Code inspection of `src/tools/symbol-search.ts`:
  ```text
  lines 5-12: export interface SymbolSearchParams { query; kind?; file?; limit?; store; projectRoot }
  lines 22-24: export function resetSearchCacheForTesting(): void
  lines 76-108: export function symbolSearch(params: SymbolSearchParams): string
  ```
- Repo import scan:
  ```text
  src/index.ts imports resetSearchCacheForTesting
  test/tool-symbol-search*.test.ts import symbolSearch, resetSearchCacheForTesting
  test/extension-symbol-search.test.ts imports symbolSearch, resetSearchCacheForTesting
  ```
- Fresh symbol-search test run:
  ```text
  (pass) symbolSearch returns ranked results for a partial name match
  (pass) symbolSearch returns empty for no matches
  (pass) symbolSearch returns empty for empty query
  (pass) symbolSearch includes signature when present
  (pass) symbolSearch respects limit parameter
  (pass) symbolSearch default limit is 20
  (pass) symbolSearch cache invalidates when graph changes
  (pass) symbolSearch cache reuses index when graph unchanged
  (pass) symbolSearch kind filter excludes non-matching kinds
  (pass) symbolSearch file glob filter narrows results
  ```
**Verdict:** pass

### Criterion 6: Existing internal call sites that use `symbolSearch` continue to work without call-site changes.
**Evidence:**
- Repo-wide search for `symbolSearch(` found current call sites in the test/internal callers, and those call sites still import the same symbol name from the same file.
- Fresh test output:
  ```text
  (pass) symbolSearch remains exported for internal callers
  ```
- Full suite also passed typecheck:
  ```text
  (pass) tsc --noEmit passes with no type errors
  ```
  That means the remaining call sites compile against the current export surface.
**Verdict:** pass

### Criterion 7: The `symbol_graph` tool schema accepts an optional `include` parameter whose element type is limited to the literal value `"contract"`; unsupported values are rejected by schema validation.
**Evidence:**
- `src/index.ts:25-34` defines:
  ```text
  include: Type.Optional(
    Type.Array(
      Type.Union([Type.Literal("contract")]),
      { description: "Optional extra sections to append to the response" },
    ),
  )
  ```
- Fresh targeted test output:
  ```text
  (pass) symbol_graph accepts include:["contract"] in the schema and keeps default output byte-identical
  ```
- `test/tool-symbol-graph-include-schema.test.ts:29-38` explicitly checks `Value.Check(schema, { name: "foo", include: ["contract"] }) === true` and `Value.Check(... include: ["neighborhood"]) === false`.
**Verdict:** pass

### Criterion 8: Calling `symbol_graph` with `include` omitted, or with `include: []`, returns output that is byte-identical to the pre-change `symbol_graph` output for the same input.
**Evidence:**
- Fresh targeted test output:
  ```text
  (pass) symbol_graph accepts include:["contract"] in the schema and keeps default output byte-identical
  ```
- `test/tool-symbol-graph-include-schema.test.ts:61-67` compares the omitted-include output to a hardcoded expected string and then asserts `include: []` returns exactly the same bytes.
**Verdict:** pass

### Criterion 9: Calling `symbol_graph` with `include: ["contract"]` appends a clearly delimited contract section after the existing neighborhood output, without inlining contract content into the neighborhood section.
**Evidence:**
- `src/tools/symbol-graph.ts:191-193`:
  ```text
  if (include?.includes("contract")) {
    const rendered = renderSymbolContractBody({ name, file, store, projectRoot });
    body = `${body}${body.endsWith("\n") ? "\n" : "\n\n"}${rendered.body}`;
  }
  ```
- `src/tools/symbol-contract.ts:88-89` starts the appended body with a dedicated section header:
  ```text
  lines.push(`## Contract: ${node.name}`);
  lines.push(anchor.anchor);
  ```
- Fresh targeted test output:
  ```text
  (pass) symbolGraph appends the standalone symbol_contract body when include contains contract
  ```
- `test/tool-symbol-graph-contract-include.test.ts:89-91` checks the result starts with the existing neighborhood output, appends only the contract body as a suffix, and still contains exactly one `## Trust` header.
**Verdict:** pass

### Criterion 10: The appended contract section is generated through the same extraction/rendering path used by the standalone `symbol_contract` tool, so contract rendering has a single source of truth.
**Evidence:**
- `src/tools/symbol-graph.ts:12` imports `renderSymbolContractBody` from `./symbol-contract.js`.
- `src/tools/symbol-graph.ts:192` calls `renderSymbolContractBody(...)`.
- `src/tools/symbol-contract.ts:68-170` defines `renderSymbolContractBody(...)`, and `src/tools/symbol-contract.ts:167-170` shows standalone `symbolContract(...)` also delegates to that same renderer before adding the trust header.
- Fresh targeted test output:
  ```text
  (pass) symbolGraph appends the standalone symbol_contract body when include contains contract
  ```
- `test/tool-symbol-graph-contract-include.test.ts:83-90` asserts the standalone `symbol_contract` body exactly matches `renderSymbolContractBody(...)` and that `symbol_graph` appends that same body.
**Verdict:** pass

### Criterion 11: If `symbol_graph` is called with `include: ["contract"]` and the symbol is missing or no contract data is available, the main neighborhood output still renders and the contract portion follows the existing `symbol_contract` empty-state behavior.
**Evidence:**
- Fresh targeted test output:
  ```text
  (pass) symbolGraph appends the standalone symbol_contract empty state when include contains contract for an unknown symbol
  (pass) symbolContract omits test-evidenced behaviors section when no tested_by edges exist
  ```
- `test/tool-symbol-graph-contract-include.test.ts:100-108` verifies that for an unknown symbol, `withContract` starts with the normal `symbol_graph` output and appends the same empty-state body produced by standalone `symbol_contract`.
- Fresh no-test-data probe:
  - Command: `bun -e '<no tested_by edge probe>'`
  - Output:
    ```json
    {"baseContainsNeighborhood":true,"standaloneHasNoTestSection":true,"appendedMatchesStandalone":true}
    ```
  This shows the neighborhood still renders, no optional test-evidence section appears when data is absent, and the appended body still exactly matches standalone `symbol_contract`.
**Verdict:** pass

### Criterion 12: The standalone `symbol_contract` tool remains registered in this phase with its current name, parameters, and output behavior.
**Evidence:**
- `src/index.ts:356-369` still registers `name: "symbol_contract"` with the same parameter object and execute path.
- Fresh targeted test output:
  ```text
  (pass) pi extension registers symbol_contract tool with correct schema
  (pass) pi extension registers the approved descriptions for the 7 default public tools
  (pass) symbolContract renders full contract with takes, returns, throws, guards, and test behaviors
  (pass) symbolContract returns not-found message with trust header for unknown symbol
  (pass) symbolContract omits test-evidenced behaviors section when no tested_by edges exist
  ```
**Verdict:** pass

### Criterion 13: `README.md` documents the default public tool surface when `CODEGRAPH_DEVMODE` is unset, documents `CODEGRAPH_DEVMODE=1` as the way to expose `graph_query`, `graph_overview`, and `dead_code`, and removes `symbol_search` from the public tool list while noting it is internal-only.
**Evidence:**
- `README.md:21-23`
  ```text
  - 7 public tools by default — symbol_graph, resolve_edge, delete_edge, impact, trace, symbol_card, symbol_contract
  - 3 dev-mode tools behind CODEGRAPH_DEVMODE=1 — graph_query, graph_overview, dead_code
  - 1 internal helper — symbol_search remains exported for internal callers but is not registered on the public extension surface
  ```
- `README.md:65`
  ```text
  Once registered, the 7 default public tools are available ... Set CODEGRAPH_DEVMODE=1 before starting pi to also register graph_query, graph_overview, and dead_code. symbol_search remains internal-only.
  ```
- `README.md:70-75` documents `symbol_graph` and includes `symbol_graph({ name: "validateToken", include: ["contract"] })`.
- `README.md:121-146` documents the dev-mode section and places `symbol_search` only under `### Internal`.
**Verdict:** pass

### Criterion 14: `ARCHITECTURE.md` reflects the default registered tool set, documents the `CODEGRAPH_DEVMODE` gating rule, and identifies `symbol_search` as internal-only.
**Evidence:**
- `ARCHITECTURE.md:9-14`
  ```text
  Public: symbol_graph | resolve_edge | delete_edge | impact | trace | symbol_card | symbol_contract
  Dev:    graph_query | graph_overview | dead_code
          (registered only when CODEGRAPH_DEVMODE=1)
  Internal: symbol_search
  ```
- `ARCHITECTURE.md:60`
  ```text
  Default registration exposes 7 public tools. graph_query, graph_overview, and dead_code register only when CODEGRAPH_DEVMODE=1. symbol_search remains internal-only for same-process callers.
  ```
- `ARCHITECTURE.md:251-263` annotates the file layout with `graph-query.ts`, `graph-overview.ts`, and `dead-code.ts` as dev-mode only, and `symbol-search.ts` as internal only.
**Verdict:** pass

### Criterion 15: `docs/tool-descriptions.md` is updated only where needed to keep descriptions accurate for this issue, including any necessary mention of `symbol_graph.include`.
**Evidence:**
- Fresh diff:
  - Command: `git diff -- docs/tool-descriptions.md`
  - Output:
    ```diff
    -`src/index.ts` is the source of truth for registered tools. When the tool surface changes, update this guide, README.md, and ARCHITECTURE.md together.
    +`src/index.ts` is the source of truth for registered tools. Keep the 7-tool default public surface, the 3 dev-mode-only tools behind CODEGRAPH_DEVMODE=1, and the internal-only symbol_search status consistent across this guide, README.md, and ARCHITECTURE.md.
    +Keep parameter-level notes terse; additions such as symbol_graph.include belong in README or schema docs, not in top-level tool descriptions.
    ```
    Summary line from diff: `+2 -1`
- Current file contents at `docs/tool-descriptions.md:25-26` match that targeted maintenance guidance exactly.
**Verdict:** pass

### Criterion 16: Automated registration tests verify that, by default, `graph_query`, `graph_overview`, `dead_code`, and `symbol_search` are not registered.
**Evidence:**
- Fresh targeted test output:
  ```text
  (pass) piCodegraph hides dev-only tools by default and does not re-register them after env changes
  (pass) symbol_search is no longer registered in the extension surface
  ```
**Verdict:** pass

### Criterion 17: Automated registration tests verify that with `CODEGRAPH_DEVMODE=1`, `graph_query`, `graph_overview`, and `dead_code` are registered, while `symbol_search` is still not registered.
**Evidence:**
- Fresh targeted test output:
  ```text
  (pass) piCodegraph registers the dev-only tools for every approved CODEGRAPH_DEVMODE truthy value
  (pass) symbol_search is no longer registered in the extension surface
  ```
- The same targeted run also included:
  ```text
  (pass) pi extension registers graph_query with query schema and auto-indexes on first call when CODEGRAPH_DEVMODE=1
  (pass) pi extension registers graph_overview with no required parameters when CODEGRAPH_DEVMODE=1
  (pass) pi extension registers dead_code with the existing schema when CODEGRAPH_DEVMODE=1
  ```
**Verdict:** pass

### Criterion 18: Automated tests verify that `CODEGRAPH_DEVMODE` accepts `1`, `true`, `yes`, and `on` case-insensitively, and does not enable dev mode for unset, empty, `0`, or `false`.
**Evidence:**
- Fresh targeted test output:
  ```text
  (pass) devModeEnabled accepts the approved truthy values and rejects disabled values
  (pass) piCodegraph registers the dev-only tools for every approved CODEGRAPH_DEVMODE truthy value
  ```
- The fresh registration probe from Criterion 1 showed exactly the requested truthy and disabled behavior across `<unset>`, `""`, `"0"`, `"false"`, `"1"`, `"true"`, `"YES"`, and `"On"`.
**Verdict:** pass

### Criterion 19: Automated `symbol_graph` tests verify that default output is unchanged, `include: ["contract"]` appends a contract section, unsupported `include` values are rejected, and the appended contract content matches the output produced by the shared `symbol_contract` extraction/rendering path for the same symbol.
**Evidence:**
- Fresh targeted test output:
  ```text
  (pass) symbol_graph accepts include:["contract"] in the schema and keeps default output byte-identical
  (pass) symbolGraph appends the standalone symbol_contract body when include contains contract
  (pass) symbolGraph appends the standalone symbol_contract empty state when include contains contract for an unknown symbol
  ```
- `test/tool-symbol-graph-include-schema.test.ts` covers schema validation and unchanged default output.
- `test/tool-symbol-graph-contract-include.test.ts` covers appended contract output and shared renderer equivalence.
**Verdict:** pass

### Criterion 20: After updating or removing any tests that previously treated `symbol_search` as a registered tool, the full existing test suite passes.
**Evidence:**
- Fresh full-suite command: `bun test`
- Actual output summary:
  ```text
  432 pass
  0 fail
  1294 expect() calls
  Ran 432 tests across 181 files. [10.71s]
  ```
- The full suite explicitly included and passed the updated registration expectations:
  ```text
  (pass) symbol_search is no longer registered in the extension surface
  (pass) pi extension registers the approved descriptions for the 7 default public tools
  ```
**Verdict:** pass

## Overall Verdict
pass

All 20 acceptance criteria were verified with fresh evidence from this session. The implementation gates `graph_query`, `graph_overview`, and `dead_code` behind a load-time `CODEGRAPH_DEVMODE` decision, keeps `symbol_search` internal-only while preserving its exported helper API, adds `symbol_graph.include: ["contract"]` through the shared `symbol_contract` renderer without changing default output, updates the public docs, and passes the full test suite.