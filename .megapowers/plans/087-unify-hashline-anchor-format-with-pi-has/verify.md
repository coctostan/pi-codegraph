# Verification Report — 087-unify-hashline-anchor-format-with-pi-has

## Test Suite Results

### Full suite command

```sh
bun run check && bun test
```

Actual output excerpt from this verification session:

```text
$ tsc --noEmit
bun test v1.3.13 (bf2e2cec)
...
test/typecheck.test.ts:
(pass) tsc --noEmit passes with no type errors [2118.55ms]
...
test/output-compute-anchor.test.ts:
(pass) computeAnchor emits bare editable anchors with separate file context [0.89ms]
(pass) computeAnchor preserves stale status while emitting current bare anchor [0.65ms]
(pass) computeAnchor returns stale non-editable anchors for unavailable line content [0.80ms]
...
test/output-format-neighborhood.test.ts:
(pass) formatAnchorLocation renders file path separately from bare editable anchor [0.06ms]
(pass) formatNeighborhood renders header and neighbor rows with file-separated anchors [0.04ms]
...
test/tool-impact-output-signals.test.ts:
(pass) impact appends always-on why annotations with chain confidence [1.68ms]
...
test/tool-symbol-card-anchor-format.test.ts:
(pass) symbolGraph default card renders file-separated editable anchors [1.30ms]
(pass) symbolCard and symbolContract render file-separated anchors [1.79ms]
...
test/read-source-snippet.test.ts:
(pass) readSourceSnippet returns hashlined source for a valid node [0.64ms]
(pass) readSourceSnippet returns null when file does not exist on disk [0.11ms]
(pass) readSourceSnippet returns null when end_line is null [0.39ms]
(pass) readSourceSnippet returns null for invalid requested line ranges [0.49ms]
...
test/output-hashline-compat.test.ts:
(pass) computeLineHash matches pi-hashline-readmap golden vectors [0.12ms]
(pass) computeLineHash fails clearly before hash initialization [0.73ms]
...
test/tool-trace-static-fallback.test.ts:
(pass) trace falls back to a deterministic static call path when no coverage trace exists [1.84ms]
(pass) trace file-scoped miss candidates render file-separated editable anchors [0.66ms]
...
 448 pass
 0 fail
 1335 expect() calls
Ran 448 tests across 184 files. [14.86s]
```

### Impact review before concluding coverage

Command/tool:

```text
impact({ symbols: ["computeLineHash", "computeAnchor", "formatAnchorLocation", "readSourceSnippet"], changeType: "behavior_change", maxDepth: 4 })
```

Output:

```text
Trust: fresh
src/tools/symbol-card.ts:25:0544  renderSymbolSourceSection  behavioral  depth:1  [fan-in:2, fan-out:2, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
src/tools/symbol-contract.ts:147:03d6  renderSymbolContractBody  behavioral  depth:1  [fan-in:2, fan-out:9, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
src/tools/symbol-resolution.ts:20:0871  resolveUniqueSymbol  behavioral  depth:2  [fan-in:2, fan-out:1, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
src/output/anchoring.ts:156:0ee7  formatNeighborhood  behavioral  depth:1  [fan-in:1, fan-out:3, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
src/output/anchoring.ts:129:0a28  formatSection  behavioral  depth:1  [fan-in:1, fan-out:2, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
src/tools/symbol-card.ts:49:09b6  renderSymbolCardBody  behavioral  depth:1  [fan-in:1, fan-out:5, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
src/tools/symbol-graph.ts:103:06bd  renderLegacyNeighborhoodBody  behavioral  depth:1  [fan-in:1, fan-out:7, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
src/tools/symbol-graph.ts:40:0de8  toAnchoredNeighbor  behavioral  depth:1  [fan-in:1, fan-out:2, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
src/tools/symbol-resolution.ts:10:0954  formatAmbiguousMatches  behavioral  depth:1  [fan-in:1, fan-out:2, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
src/tools/trace.ts:109:0179  formatFileScopedMiss  behavioral  depth:1  [fan-in:1, fan-out:2, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
src/tools/trace.ts:82:07c9  formatNodeLine  behavioral  depth:1  [fan-in:1, fan-out:3, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
src/tools/trace.ts:62:000c  formatStoredTraceLine  behavioral  depth:1  [fan-in:1, fan-out:3, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
src/tools/symbol-graph.ts:59:0fcc  buildSection  behavioral  depth:2  [fan-in:1, fan-out:2, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
src/tools/symbol-graph.ts:265:0dbb  symbolGraph  behavioral  depth:2  [fan-in:1, fan-out:7, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
src/tools/trace.ts:97:05f8  formatLiveTraceLine  behavioral  depth:2  [fan-in:1, fan-out:1, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
src/index.ts:200:0c9c  piCodegraph  behavioral  depth:3  [fan-in:1, fan-out:9, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
src/tools/impact.ts:163:0e1c  impact  behavioral  depth:1  [fan-in:0, fan-out:8, roles:entry-point, coverage:untested, co-change:0.00, chain-confidence:0.90]
src/tools/symbol-card.ts:120:0ae3  symbolCard  behavioral  depth:1  [fan-in:0, fan-out:7, roles:entry-point, coverage:untested, co-change:0.00, chain-confidence:0.90]
src/tools/symbol-contract.ts:262:058b  symbolContract  behavioral  depth:2  [fan-in:0, fan-out:2, roles:entry-point, coverage:untested, co-change:0.00, chain-confidence:0.90]
src/tools/trace.ts:160:0a6c  trace  behavioral  depth:2  [fan-in:0, fan-out:12, roles:entry-point, coverage:untested, co-change:0.00, chain-confidence:0.90]
test/extension-readonly-trust-gating.test.ts:10:0760  registerTools  behavioral  depth:4  [fan-in:0, fan-out:2, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
```

The full suite output includes tests for every surfaced dependent family: `test/tool-symbol-card-*`, `test/tool-symbol-contract-*`, `test/tool-symbol-resolution-anchor-format.test.ts`, `test/output-format-neighborhood.test.ts`, `test/tool-symbol-graph-*`, `test/tool-impact-*`, `test/tool-trace-*`, `test/extension-*`, and `test/read-source-snippet.test.ts`.

### Bugfix symptom reproduction

Original symptom class: editable output used old `file:line:4hex` / embedded-file anchor forms instead of separate file context plus bare `LINE:HASH`.

Command:

```sh
bun test test/output-compute-anchor.test.ts test/output-format-neighborhood.test.ts test/tool-symbol-resolution-anchor-format.test.ts test/tool-symbol-card-anchor-format.test.ts test/tool-impact-output-signals.test.ts test/tool-trace-static-fallback.test.ts test/read-source-snippet.test.ts
```

Actual output:

```text
test/tool-symbol-resolution-anchor-format.test.ts:
(pass) formatAmbiguousMatches renders candidate files separately from editable anchors [6.28ms]
(pass) symbolGraph neighborhood ambiguity uses file-separated candidate anchors [3.48ms]

test/output-compute-anchor.test.ts:
(pass) computeAnchor emits bare editable anchors with separate file context [1.09ms]
(pass) computeAnchor preserves stale status while emitting current bare anchor [0.62ms]
(pass) computeAnchor returns stale non-editable anchors for unavailable line content [1.35ms]

test/output-format-neighborhood.test.ts:
(pass) formatAnchorLocation renders file path separately from bare editable anchor [0.06ms]
(pass) formatNeighborhood renders header and neighbor rows with file-separated anchors [0.10ms]
(pass) formatNeighborhood produces header and populated sections, omits empty ones [0.05ms]
(pass) formatNeighborhood shows (N more omitted) when a category is truncated [0.02ms]
(pass) formatNeighborhood suffixes stale entries with [stale] [0.05ms]
(pass) formatNeighborhood shows Unresolved section for __unresolved__ nodes [0.04ms]
(pass) formatNeighborhood accepts named sections array and renders them in order [0.07ms]

test/tool-impact-output-signals.test.ts:
(pass) impact appends always-on why annotations with chain confidence [3.68ms]

test/tool-symbol-card-anchor-format.test.ts:
(pass) symbolGraph default card renders file-separated editable anchors [1.41ms]
(pass) symbolCard and symbolContract render file-separated anchors [4.94ms]

test/read-source-snippet.test.ts:
(pass) readSourceSnippet returns hashlined source for a valid node [0.70ms]
(pass) readSourceSnippet returns null when file does not exist on disk [0.22ms]
(pass) readSourceSnippet returns null when end_line is null [0.54ms]
(pass) readSourceSnippet truncates when source exceeds maxLines [0.56ms]
(pass) readSourceSnippet sets stale=true when content hash mismatches [0.46ms]
(pass) readSourceSnippet sets stale=false when content hash matches [0.50ms]
(pass) readSourceSnippet returns null for invalid requested line ranges [0.42ms]

test/tool-trace-static-fallback.test.ts:
(pass) trace falls back to a deterministic static call path when no coverage trace exists [2.05ms]
(pass) trace file-scoped miss candidates render file-separated editable anchors [0.99ms]

 24 pass
 0 fail
 96 expect() calls
Ran 24 tests across 7 files. [152.00ms]
```

## Graph/Path Evidence

### `symbol_graph` for changed hash helper

Tool call: `symbol_graph({ name: "computeLineHash", include: ["source"], suppressTrustHeader: true })`

```text
## computeLineHash (function)
src/output/anchoring.ts:32:00a5

### Signature
(_lineNumber: number, line: string) => string

### Key Relationships
  Callers (2):  computeAnchor, readSourceSnippet
    computeAnchor: (node: GraphNode, projectRoot: string) => AnchorResult
    readSourceSnippet: (node: GraphNode, projectRoot: string, maxLines?: number) => SourceSnippetResult | null
  Callees (1):  xxh32
    xxh32: (input: string) => number

### Signals
[untested]

### Source
32:9fc3|export function computeLineHash(_lineNumber: number, line: string): string {
33:6b63|  if (line.endsWith("\r")) line = line.slice(0, -1);
34:349e|  line = line.replace(/\s+/g, "");
35:d39d|  return HASH_DICT[xxh32(line) % HASH_MOD]!;
36:d10b|}
```

Note: the line prefixes in this Pi tool's own `### Source` block are emitted by the harness used for inspection. The acceptance criteria for pi-codegraph source-snippet output are verified below against `src/output/source.ts` and `test/read-source-snippet.test.ts`.

### `trace` from public feature entry point

Tool call: `trace({ entry: "symbolGraph", file: "src/tools/symbol-graph.ts", suppressTrustHeader: true })`

Relevant output excerpt:

```text
mode: static (heuristic, no runtime evidence)
src/tools/symbol-graph.ts:265:0dbb  symbolGraph  function [untested]
...
src/tools/symbol-card.ts:25:0544  renderSymbolSourceSection  function [untested]
src/output/anchoring.ts:47:0d83  computeAnchor  function [untested]
src/output/anchoring.ts:32:00a5  computeLineHash  function [untested]
src/output/anchoring.ts:27:0ee6  xxh32  function [leaf, untested]
src/output/anchoring.ts:43:0afc  sha256Hex  function [leaf, untested]
src/output/anchoring.ts:81:0ebe  formatAnchorLocation  function [leaf, untested]
...
src/tools/symbol-graph.ts:103:06bd  renderLegacyNeighborhoodBody  function [untested]
src/output/anchoring.ts:156:0ee7  formatNeighborhood  function [untested]
src/output/anchoring.ts:129:0a28  formatSection  function [untested]
```

This confirms the public `symbolGraph` execution path reaches the new anchor helpers used by default cards, source include, and legacy neighborhood rendering.

### Structural search for formatter usage

Command/tool: `ast_search({ path: "src", lang: "typescript", pattern: "formatAnchorLocation($A)" })`

Output excerpt:

```text
--- src/tools/symbol-resolution.ts ---
>>15:585|    lines.push(`  ${formatAnchorLocation(anchor)}  ${node.name} (${node.kind})${staleMarker}`);
--- src/tools/impact.ts ---
>>239:d4b|      `${formatAnchorLocation(anchor)}  ${hit.name}  ${hit.classification}  depth:${hit.depth}${anchor.stale ? " [stale]" : ""}  ${why}`,
--- src/output/anchoring.ts ---
>>141:92a|      `  ${formatAnchorLocation(item.anchor)}  ${item.name}  ${item.edgeKind}  confidence:${item.confidence}  ${item.provenanceSource}${staleMarker}${signalTags}`,
>>162:964|  const header = `## ${symbol.name} (${symbol.kind})\n${formatAnchorLocation(symbol.anchor)}${staleMarker}${signalTags}`;
--- src/tools/symbol-card.ts ---
>>36:585|      lines.push(`  ${formatAnchorLocation(anchor)}  ${node.name} (${node.kind})${staleMarker}`);
>>76:ccd|  lines.push(formatAnchorLocation(anchor));
>>87:e9f|      lines.push(`  ${formatAnchorLocation(testAnchor)}  "${t.node.name}"`);
--- src/tools/trace.ts ---
>>77:3af|    line: `${formatAnchorLocation(anchor)}  ${node.name}  ${node.kind}${stale ? " [stale]" : ""} ${tags}`,
>>92:b70|    line: `${formatAnchorLocation(anchor)}  ${node.name}  ${node.kind}${anchor.stale ? " [stale]" : ""} ${tags}`,
>>117:585|    lines.push(`  ${formatAnchorLocation(anchor)}  ${node.name} (${node.kind})${staleMarker}`);
--- src/tools/symbol-contract.ts ---
>>158:585|      lines.push(`  ${formatAnchorLocation(anchor)}  ${node.name} (${node.kind})${staleMarker}`);
>>168:ccd|  lines.push(formatAnchorLocation(anchor));
--- src/tools/symbol-graph.ts ---
>>114:585|      lines.push(`  ${formatAnchorLocation(anchor)}  ${node.name} (${node.kind})${staleMarker}`);
```

## Per-Criterion Verification

### Criterion 1
pi-codegraph provides a single local line-hash helper that mirrors pi-hashline-readmap's algorithm.

**Evidence:** Source inspection of `src/output/anchoring.ts`:

```text
7:220|import xxhashWasm from "xxhash-wasm";
9:264|const HASH_LEN = 3;
10:b5b|const RADIX = 16;
11:2a5|const HASH_MOD = RADIX ** HASH_LEN;
12:556|const HASH_DICT = Array.from({ length: HASH_MOD }, (_, i) => i.toString(RADIX).padStart(HASH_LEN, "0"));
27:ee6|function xxh32(input: string): number {
28:429|  if (!h32Fn) throw new Error("Hash not initialized — call ensureHashInit() first");
29:09c|  return h32Fn(input, 0) >>> 0;
32:0a5|export function computeLineHash(_lineNumber: number, line: string): string {
33:cfe|  if (line.endsWith("\r")) line = line.slice(0, -1);
34:0c5|  line = line.replace(/\s+/g, "");
35:56a|  return HASH_DICT[xxh32(line) % HASH_MOD]!;
36:b18|}
```

**Verdict:** pass.

### Criterion 2
The local helper is covered by golden-vector tests for representative lines, whitespace differences, and trailing `\r`.

**Evidence:** `test/output-hashline-compat.test.ts`:

```text
4:c6e|test("computeLineHash matches pi-hashline-readmap golden vectors", async () => {
5:e1a|  await ensureHashInit();
7:656|  expect(computeLineHash(1, "export function foo() {}" )).toBe("c27");
8:656|  expect(computeLineHash(1, "export   function foo() {}")).toBe("c27");
9:dd3|  expect(computeLineHash(1, "  return 1;")).toBe("0da");
10:ef2|  expect(computeLineHash(1, "  return 1;\r")).toBe("0da");
11:ba7|  expect(computeLineHash(1, "")).toBe("d05");
12:386|  expect(computeLineHash(1, "   \t  ")).toBe("d05");
```

Full suite output includes:

```text
test/output-hashline-compat.test.ts:
(pass) computeLineHash matches pi-hashline-readmap golden vectors [0.12ms]
(pass) computeLineHash fails clearly before hash initialization [0.73ms]
```

**Verdict:** pass.

### Criterion 3
`xxhash-wasm` is a runtime dependency and initialized through a shared `ensureHashInit()` path before hashline-compatible anchors are computed.

**Evidence:** Runtime dependency in `package.json`:

```text
57:72a|  "dependencies": {
58:165|    "@sinclair/typebox": "^0.34.48",
59:789|    "tree-sitter": "^0.25.0",
60:274|    "tree-sitter-typescript": "^0.23.2",
61:18b|    "yaml": "^2.8.3",
62:c53|    "xxhash-wasm": "^1.1.0"
```

Shared init in `src/output/anchoring.ts`:

```text
14:a97|let h32Fn: ((input: string, seed?: number) => number) | null = null;
15:fd8|let initPromise: Promise<void> | null = null;
17:4d7|export async function ensureHashInit(): Promise<void> {
18:ba0|  if (h32Fn) return;
19:8d7|  if (!initPromise) {
20:3f0|    initPromise = xxhashWasm().then((hasher) => {
21:f5e|      h32Fn = hasher.h32;
22:d86|    });
23:b18|  }
24:c10|  await initPromise;
```

Public tool initialization in `src/index.ts`:

```text
16:062|import { ensureHashInit } from "./output/anchoring.js";
209:df4|      await ensureIndexed(projectRoot, store);
210:e1a|      await ensureHashInit();
256:df4|      await ensureIndexed(projectRoot, store);
257:e1a|      await ensureHashInit();
286:df4|      await ensureIndexed(projectRoot, store);
287:e1a|      await ensureHashInit();
```

Full suite output includes:

```text
test/extension-hash-init.test.ts:
(pass) extension tool execution initializes hashing before rendering anchors [416.96ms]
```

**Verdict:** pass.

### Criterion 4
Anchor computation may remain synchronous after initialization and fails clearly before initialization.

**Evidence:** Cached synchronous function in `src/output/anchoring.ts`:

```text
14:a97|let h32Fn: ((input: string, seed?: number) => number) | null = null;
27:ee6|function xxh32(input: string): number {
28:429|  if (!h32Fn) throw new Error("Hash not initialized — call ensureHashInit() first");
29:09c|  return h32Fn(input, 0) >>> 0;
32:0a5|export function computeLineHash(_lineNumber: number, line: string): string {
35:56a|  return HASH_DICT[xxh32(line) % HASH_MOD]!;
```

Test:

```text
15:029|test("computeLineHash fails clearly before hash initialization", async () => {
16:860|  const mod = await import(`../src/output/anchoring.js?uninit-${Date.now()}`);
17:0a4|  expect(() => mod.computeLineHash(1, "export function foo() {}"))
18:219|    .toThrow("Hash not initialized — call ensureHashInit() first");
```

Full suite output includes the pre-init failure test passing.

**Verdict:** pass.

### Criterion 5
`computeAnchor` computes from current on-disk content at `node.start_line`.

**Evidence:** `src/output/anchoring.ts` reads the file from disk and uses the current line:

```text
47:d83|export function computeAnchor(node: GraphNode, projectRoot: string): AnchorResult {
48:0c9|  const fullPath = join(projectRoot, node.file);
54:60e|  let fileContent: string;
56:107|    fileContent = readFileSync(fullPath, "utf-8");
63:fff|  const lines = fileContent.split("\n");
64:cdf|  const lineIndex = node.start_line - 1;
70:2e1|  const lineHash = computeLineHash(node.start_line, lines[lineIndex]!);
71:3e7|  return { file: node.file, anchor: `${node.start_line}:${lineHash}`, stale };
```

**Verdict:** pass.

### Criterion 6
Fresh file returns `stale:false` and `^\d+:[0-9a-f]{3}$` editable token.

**Evidence:** `test/output-compute-anchor.test.ts`:

```text
12:946|test("computeAnchor emits bare editable anchors with separate file context", () => {
31:304|    const result = computeAnchor(node, projectRoot);
33:c86|    expect(result.file).toBe("src/a.ts");
34:3f0|    expect(result.anchor).toBe("2:c27");
35:12b|    expect(result.anchor).toMatch(/^\d+:[0-9a-f]{3}$/);
36:4ba|    expect(result.anchor).not.toContain("src/a.ts");
37:a2f|    expect(result.stale).toBe(false);
```

Full suite output includes this test passing.

**Verdict:** pass.

### Criterion 7
Changed file still computes current editable anchor and returns `stale:true`.

**Evidence:** `test/output-compute-anchor.test.ts`:

```text
50:af5|test("computeAnchor preserves stale status while emitting current bare anchor", () => {
54:b7b|  const originalContent = "line one\nexport function foo() {}\nline three";
55:893|  const modifiedContent = "line one\nexport function foo() { return 1; }\nline three";
57:204|  writeFileSync(join(projectRoot, filePath), modifiedContent);
66:0be|    content_hash: sha256Hex(originalContent),
70:304|    const result = computeAnchor(node, projectRoot);
72:c86|    expect(result.file).toBe("src/a.ts");
73:d78|    expect(result.anchor).toBe(`2:${computeLineHash(2, "export function foo() { return 1; }")}`);
74:9a2|    expect(result.stale).toBe(true);
```

**Verdict:** pass.

### Criterion 8
Missing files, out-of-range lines, or unavailable line content return stale non-editable anchors.

**Evidence:** Source guard and test:

```text
50:52c|  if (!existsSync(fullPath)) {
51:ff1|    return { file: node.file, anchor: `${node.start_line}:?`, stale: true };
57:eef|  } catch {
58:ff1|    return { file: node.file, anchor: `${node.start_line}:?`, stale: true };
66:77f|  if (lineIndex < 0 || lineIndex >= lines.length) {
67:ff1|    return { file: node.file, anchor: `${node.start_line}:?`, stale: true };
```

```text
80:882|test("computeAnchor returns stale non-editable anchors for unavailable line content", () => {
96:a73|    expect(computeAnchor({ ...node, file: "src/gone.ts", start_line: 5 }, projectRoot)).toEqual({
98:c86|      anchor: "5:?",
99:d2a|      stale: true,
101:a86|    expect(computeAnchor({ ...node, start_line: 99 }, projectRoot)).toEqual({
103:77f|      anchor: "99:?",
104:d2a|      stale: true,
106:28e|    expect(computeAnchor({ ...node, file: "src" }, projectRoot)).toEqual({
108:0f6|      anchor: "1:?",
109:d2a|      stale: true,
```

**Verdict:** pass.

### Criterion 9
`formatNeighborhood` renders file and editable anchor as separate adjacent fields.

**Evidence:** Source:

```text
81:ebe|export function formatAnchorLocation(anchor: AnchorResult): string {
82:efe|  return `${anchor.file}  ${anchor.anchor}`;
141:92a|      `  ${formatAnchorLocation(item.anchor)}  ${item.name}  ${item.edgeKind}  confidence:${item.confidence}  ${item.provenanceSource}${staleMarker}${signalTags}`,
162:964|  const header = `## ${symbol.name} (${symbol.kind})\n${formatAnchorLocation(symbol.anchor)}${staleMarker}${signalTags}`;
```

Test output:

```text
test/output-format-neighborhood.test.ts:
(pass) formatAnchorLocation renders file path separately from bare editable anchor [0.06ms]
(pass) formatNeighborhood renders header and neighbor rows with file-separated anchors [0.10ms]
```

**Verdict:** pass.

### Criterion 10
`symbolGraph` ambiguity and candidate-match outputs render file paths separately from bare anchors.

**Evidence:** Source:

```text
src/tools/symbol-resolution.ts
10:954|export function formatAmbiguousMatches(name: string, nodes: GraphNode[], projectRoot: string): string {
13:875|    const anchor = computeAnchor(node, projectRoot);
15:585|    lines.push(`  ${formatAnchorLocation(anchor)}  ${node.name} (${node.kind})${staleMarker}`);

src/tools/symbol-graph.ts
109:759|  if (nodes.length > 1) {
112:875|      const anchor = computeAnchor(node, projectRoot);
114:585|      lines.push(`  ${formatAnchorLocation(anchor)}  ${node.name} (${node.kind})${staleMarker}`);
```

Test:

```text
28:e1f|    expect(output).toContain('Multiple matches for "foo"');
29:fae|    expect(output).toContain("src/a.ts  1:c27  foo (function)");
30:086|    expect(output).toMatch(/src\/b\.ts  1:[0-9a-f]{3}  foo \(class\)/);
31:b60|    expect(output).not.toContain("src/a.ts:1:");
```

Targeted test output shows both symbol-resolution tests passing.

**Verdict:** pass.

### Criterion 11
`impact` output renders each affected symbol with file path and bare anchor while preserving classification, depth, stale marker, and why text.

**Evidence:** Source:

```text
236:f60|    const anchor = computeAnchor(node, params.projectRoot);
237:1af|    const why = formatImpactWhy(hit.signals, hit.chainConfidence);
239:d4b|      `${formatAnchorLocation(anchor)}  ${hit.name}  ${hit.classification}  depth:${hit.depth}${anchor.stale ? " [stale]" : ""}  ${why}`,
```

Test:

```text
30:119|    expect(out).toMatch(
31:3f7|      /src\/caller\.ts  2:[0-9a-f]{3}  caller  breaking  depth:1( \[stale\])?  \[fan-in:0, fan-out:1, roles:none, coverage:untested, co-change:0\.00, chain-confidence:0\.80\]/,
33:0f0|    expect(out).not.toMatch(/src\/caller\.ts:2:[0-9a-f]{4}/);
```

Full suite output includes `test/tool-impact-output-signals.test.ts` passing.

**Verdict:** pass.

### Criterion 12
`trace` output renders trace steps and file-scoped miss candidates with file path and bare anchor while preserving mode, names, kinds, tags, and stale markers.

**Evidence:** Source:

```text
77:3af|    line: `${formatAnchorLocation(anchor)}  ${node.name}  ${node.kind}${stale ? " [stale]" : ""} ${tags}`,
92:b70|    line: `${formatAnchorLocation(anchor)}  ${node.name}  ${node.kind}${anchor.stale ? " [stale]" : ""} ${tags}`,
117:585|    lines.push(`  ${formatAnchorLocation(anchor)}  ${node.name} (${node.kind})${staleMarker}`);
```

Test:

```text
30:a05|    expect(output).toContain("mode: static");
31:576|    expect(output).toMatch(/src\/app\.ts  1:[0-9a-f]{3}  entry  function/);
32:795|    expect(output).toMatch(/src\/app\.ts  2:[0-9a-f]{3}  first  function/);
33:d75|    expect(output).toMatch(/src\/app\.ts  3:[0-9a-f]{3}  second  function/);
34:5a6|    expect(output).not.toMatch(/src\/app\.ts:1:[0-9a-f]{4}/);
61:68b|    expect(output).toContain('Symbol "foo" was not found in src/missing.ts');
62:fae|    expect(output).toContain("src/a.ts  1:c27  foo (function)");
63:b60|    expect(output).not.toContain("src/a.ts:1:");
```

Targeted test output shows both trace static fallback tests passing.

**Verdict:** pass.

### Criterion 13
`readSourceSnippet` renders source as `LINE:HASH|content` using the same helper.

**Evidence:** Source:

```text
5:fb3|import { computeLineHash } from "./anchoring.js";
47:e3c|  const hashlined = displayLines.map((content, i) => {
48:74e|    const lineNum = node.start_line + i;
49:ea0|    const lineHash = computeLineHash(lineNum, content);
50:e92|    return `${lineNum}:${lineHash}|${content}`;
```

Test:

```text
33:f3c|    expect(lines).toEqual([
34:27f|      `2:${computeLineHash(2, "line two")}|line two`,
35:71d|      `3:${computeLineHash(3, "line three")}|line three`,
36:a31|      `4:${computeLineHash(4, "line four")}|line four`,
38:5ed|    for (const line of lines) {
39:d0d|      expect(line).toMatch(/^\d+:[a-f0-9]{3}\|/);
```

Full suite output includes the valid source-snippet test passing.

**Verdict:** pass.

### Criterion 14
`readSourceSnippet` preserves guard behavior for missing `end_line`, missing file, and invalid range.

**Evidence:** Source:

```text
27:1e9|  if (node.end_line == null) return null;
29:0c9|  const fullPath = join(projectRoot, node.file);
30:2ce|  if (!existsSync(fullPath)) return null;
40:c9b|  if (startIdx < 0 || endIdx >= allLines.length || startIdx > endIdx) return null;
```

Tests:

```text
46:eab|test("readSourceSnippet returns null when file does not exist on disk", () => {
62:f9c|    expect(result).toBeNull();
68:446|test("readSourceSnippet returns null when end_line is null", () => {
88:f9c|    expect(result).toBeNull();
189:249|test("readSourceSnippet returns null for invalid requested line ranges", async () => {
209:ba7|    expect(readSourceSnippet({ ...node, start_line: 0, end_line: 1 }, projectRoot)).toBeNull();
210:8bd|    expect(readSourceSnippet({ ...node, start_line: 2, end_line: 99 }, projectRoot)).toBeNull();
211:ce5|    expect(readSourceSnippet({ ...node, start_line: 3, end_line: 2 }, projectRoot)).toBeNull();
```

**Verdict:** pass.

### Criterion 15
Public tool output tests assert `^\d+:[0-9a-f]{3}$`-style anchors and absence of old `file:line:4hex` shape.

**Evidence:** Public-output tests and grep:

```text
test/tool-symbol-resolution-anchor-format.test.ts:29 expects "src/a.ts  1:c27" and lines 31-32 reject "src/a.ts:1:" / "src/b.ts:1:".
test/tool-symbol-card-anchor-format.test.ts:28 expects "src/foo.ts  1:c27" and lines 29, 51-52 reject "src/foo.ts:1:".
test/tool-impact-output-signals.test.ts:31 matches /src\/caller\.ts  2:[0-9a-f]{3}/ and line 33 rejects /src\/caller\.ts:2:[0-9a-f]{4}/.
test/tool-trace-static-fallback.test.ts:31-33 match /src\/app\.ts  [123]:[0-9a-f]{3}/ and line 34 rejects /src\/app\.ts:1:[0-9a-f]{4}/.
```

Grep output for old-shape rejection assertions:

```text
[17 matches in 14 files]
tool-trace-static-fallback.test.ts:>>34:5a6|    expect(output).not.toMatch(/src\/app\.ts:1:[0-9a-f]{4}/);
tool-symbol-graph-signals.test.ts:>>53:eab|    expect(out).not.toMatch(/src\/shared\.ts:1:[0-9a-f]{4}/);
tool-impact-output-signals.test.ts:>>33:0f0|    expect(out).not.toMatch(/src\/caller\.ts:2:[0-9a-f]{4}/);
extension-impact.test.ts:>>52:0f0|    expect(out).not.toMatch(/src\/caller\.ts:2:[0-9a-f]{4}/);
```

Targeted test output shows all relevant public-output suites passing.

**Verdict:** pass.

### Criterion 16
Compatibility tests demonstrate emitted `LINE:HASH` satisfies the expected parser/hash shape without importing pi-hashline-readmap internals.

**Evidence:** `test/output-compute-anchor.test.ts` checks emitted anchor against helper for corresponding file line:

```text
39:c1c|    const match = result.anchor.match(/^(\d+):([0-9a-f]{3})$/);
41:8fa|    const lineNumber = Number(match![1]);
42:915|    const emittedHash = match![2];
43:9b2|    const line = fileContent.split("\n")[lineNumber - 1]!;
44:bba|    expect(emittedHash).toBe(computeLineHash(lineNumber, line));
```

Golden vectors in `test/output-hashline-compat.test.ts` verify known pi-hashline-compatible values; grep against runtime/tests shows no internal import (see Criterion 17).

**Verdict:** pass.

### Criterion 17
Runtime code and tests do not import pi-hashline-readmap internals.

**Evidence:** Native grep in `src` and `test`:

```text
grep path=src pattern="src/hashline\.ts|pi-hashline-readmap/.*/hashline|pi-hashline-readmap.*src/hashline" glob="**/*.ts"
[0 matches in 0 files]

grep path=test pattern="src/hashline\.ts|pi-hashline-readmap/.*/hashline|pi-hashline-readmap.*src/hashline" glob="**/*.ts"
[0 matches in 0 files]
```

**Verdict:** pass.

### Criterion 18
README replaces `file:line:hash` claims with shared `LINE:HASH` format and separate file context.

**Evidence:** `README.md`:

```text
23:518|Editable anchor locations are rendered as two adjacent fields: the file path as context, then a bare `LINE:HASH` token, for example `src/a.ts  10:abc`. The `LINE:HASH` token uses the same whitespace-insensitive xxhash line-hash algorithm as pi-hashline-readmap.
160:108|- **Hashline-compatible anchor locations** rendered as file context plus a bare editable `LINE:HASH` token on every symbol reference
```

Native grep against root docs:

```text
grep path=. glob={README.md,ARCHITECTURE.md,AGENTS.md,VISION.md} pattern="file:line:hash|edit any result immediately|No re-reading|No translation layer"
[0 matches in 0 files]
```

**Verdict:** pass.

### Criterion 19
README does not claim edit-without-re-reading unless it states the read-before-edit/file-anchoring gate still applies.

**Evidence:** `README.md`:

```text
25:6f5|The graph can point an agent to the right file and line, but pi-hashline-readmap's read-before-edit/file-anchoring gate still applies. Codegraph does not provide true edit-without-prior-read anchoring.
```

`VISION.md` also carries the caveat:

```text
11:e08|... That makes the location actionable after pi-hashline-readmap has anchored the file through its normal read/grep/ast_search/write gate; codegraph does not bypass the read-before-edit requirement.
25:34c|**1. Agent-native output.** Every editable result includes exact symbol identity plus file context next to a bare `LINE:HASH` token, so agents can connect understanding to action after pi's normal file-anchoring gate.
```

Native grep for stale phrases returned 0 matches as shown under Criterion 18.

**Verdict:** pass.

### Criterion 20
Architecture and other docs distinguish whole-file SHA content hashes from line-level edit anchors.

**Evidence:** `ARCHITECTURE.md`:

```text
161:ef5|Content hashes on every node determine staleness. If a file hasn't changed, its nodes and edges are still valid.
163:65b|- `content_hash` is a whole-file SHA-256 value used for staleness and incremental indexing.
164:f5a|- Editable line anchors are not stored in SQLite. They are computed from current on-disk line content at render time as bare `LINE:HASH` tokens and displayed next to the file path, e.g. `src/a.ts  10:abc`.
```

`AGENTS.md`:

```text
34:cef|Tool output is hashline-compatible: file paths are rendered as separate context fields next to bare editable `LINE:HASH` anchors. The line hash is the local pi-hashline-compatible 3-hex xxhash value. Whole-file `content_hash` values remain SHA-256 freshness markers.
```

**Verdict:** pass.

## Overall Verdict

pass

All 20 acceptance criteria are verified with fresh test output, source inspection, targeted bug-symptom reproduction, structural search, `symbol_graph`, `impact`, and `trace` evidence. The full suite and typecheck pass: `448 pass`, `0 fail`, `tsc --noEmit` passed.
