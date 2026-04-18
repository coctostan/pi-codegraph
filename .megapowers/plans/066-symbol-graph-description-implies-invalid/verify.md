## Test Suite Results

### Full suite
Command: `bun test`

Relevant output:
```text
test/extension-tool-descriptions.test.ts:
(pass) pi extension registers the approved descriptions for the 5 default public tools [0.21ms]

test/extension-wiring.test.ts:
(pass) pi extension registers symbol_graph tool with correct schema [0.11ms]
(pass) pi extension registers resolve_edge tool with correct schema [0.15ms]
(pass) pi extension registers trace tool with correct schema [0.05ms]
(pass) pi extension registers delete_edge tool with correct schema [0.04ms]

test/tool-symbol-graph-include-schema.test.ts:
(pass) symbol_graph accepts include values for neighborhood, contract, and source and keeps default output byte-identical [1.72ms]

test/tool-symbol-graph-legacy-neighborhood.test.ts:
(pass) symbol_graph schema accepts only neighborhood, contract, and source includes [0.11ms]

test/docs-symbol-graph-unified-surface.test.ts:
(pass) public docs explain symbol_graph include values without implying tests is valid [0.70ms]

 444 pass
 0 fail
 1341 expect() calls
Ran 444 tests across 187 files. [10.20s]
EXIT:0
```

### Typecheck
Command: `bun run check`

Output:
```text
$ tsc --noEmit
EXIT:0
```

### Impact coverage check
Primary changed symbol for verification: `symbolGraph`.

Command: `impact({ symbols:["symbolGraph"], changeType:"behavior_change", maxDepth:2 })`
Output:
```text
src/index.ts:176:07cd  piCodegraph  behavioral  depth:1  [fan-in:0, fan-out:16, roles:entry-point, coverage:untested, co-change:0.00, chain-confidence:0.90]
```

Command: `ast_search("piCodegraph($ARG)", path="test")`
Output excerpt:
```text
--- test/tool-symbol-graph-include-schema.test.ts ---
>>21:0f3|  piCodegraph(mockPi);
--- test/extension-wiring.test.ts ---
>>13:c5e|  piCodegraph(mockPi as any);
>>35:c5e|  piCodegraph(mockPi as any);
>>65:c5e|  piCodegraph(mockPi as any);
>>87:c5e|  piCodegraph(mockPi as any);
--- test/tool-symbol-graph-legacy-neighborhood.test.ts ---
>>24:0f3|  piCodegraph(mockPi);
```

`read("test/extension-tool-descriptions.test.ts", offset=35, limit=3)`
```text
35:398|  const mod = await import("../src/index.js");
36:58d|  if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();
37:65e|  mod.default(mockPi as any);
```
Verification: the only impacted dependent surfaced by `impact` was `piCodegraph`. Fresh test output includes passing extension-entry tests that execute `piCodegraph`, including `test/extension-tool-descriptions.test.ts`, `test/extension-wiring.test.ts`, `test/tool-symbol-graph-include-schema.test.ts`, and `test/tool-symbol-graph-legacy-neighborhood.test.ts`.

## Symptom Reproduction

Command:
```text
symbol_graph({ name: "symbolGraph", file: "src/tools/symbol-graph.ts", include: ["tests"] })
```
Output:
```text
Validation failed for tool "symbol_graph":
  - include/0: must be equal to constant
  - include/0: must be equal to constant
  - include/0: must be equal to constant
  - include/0: must match a schema in anyOf

Received arguments:
{
  "name": "symbolGraph",
  "file": "src/tools/symbol-graph.ts",
  "include": [
    "tests"
  ]
}
```

Verification: the invalid value is still rejected, but the mismatch is gone because the registered schema and public docs now explicitly say `"tests"` is not a valid include value and that test signals appear by default in the compact card.

## Per-Criterion Verification

### Criterion 1: `symbol_graph`'s registered schema/docs explicitly enumerate the valid include literals: `"neighborhood"`, `"contract"`, and `"source"`.
**Identify:** inspect the registration source of truth in `src/index.ts`, inspect the entry-point registration via `symbol_graph`/`trace`, and verify the schema assertions in tests.

**Evidence:**

`read("src/index.ts", offset=23, limit=17)`
```text
23:137|const SymbolGraphParams = Type.Object({
24:3ef|  name: Type.String({ description: "Symbol name to look up" }),
25:6a4|  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
26:f5a|  include: Type.Optional(
27:eb8|    Type.Array(
28:f09|      Type.Union([
29:36b|        Type.Literal("neighborhood"),
30:0d0|        Type.Literal("contract"),
31:c25|        Type.Literal("source"),
32:375|      ]),
33:1fc|      {
34:805|        description:
35:9d5|          'Optional extra sections. Allowed values: "neighborhood", "contract", "source". "tests" is not a valid include value.',
36:2f6|      },
37:5f9|    ),
38:5f9|  ),
39:d86|});
```

`symbol_graph({ name: "piCodegraph", file: "src/index.ts", include: ["source"] })`
```text
## piCodegraph (function)
src/index.ts:176:07cd

### Source
176:07cd|export default function piCodegraph(pi: ExtensionAPI): void {
178:e313|  registerReadOnlyTool(pi, {
179:5f50|    name: "symbol_graph",
180:92d2|    label: "Symbol Graph",
181:0046|    description: "Return a compact symbol summary with relationships, test signals, and key metadata.\nWhen to use: You need structural context for a named symbol.",
182:b9c7|    parameters: SymbolGraphParams,
207:e5c7|        include: params.include as Array<"neighborhood" | "contract" | "source"> | undefined,
```

`trace({ entry: "piCodegraph", file: "src/index.ts" })`
```text
src/index.ts:176:07cd  piCodegraph  function [entry-point, untested]
...
src/tools/symbol-graph.ts:171:288e  symbolGraph  function [untested]
```

`ast_search("Value.Check($SCHEMA, { name: \"foo\", include: [$VALUE] })", lang="typescript", path="test")`
```text
--- test/tool-symbol-graph-legacy-neighborhood.test.ts ---
>>32:77f|  expect(Value.Check(schema, { name: "foo", include: ["neighborhood"] })).toBe(true);
>>33:4bd|  expect(Value.Check(schema, { name: "foo", include: ["contract"] })).toBe(true);
>>34:f81|  expect(Value.Check(schema, { name: "foo", include: ["source"] })).toBe(true);
>>35:8b7|  expect(Value.Check(schema, { name: "foo", include: ["signals"] })).toBe(false);
>>36:aa2|  expect(Value.Check(schema, { name: "foo", include: ["wat"] })).toBe(false);
--- test/tool-symbol-graph-include-schema.test.ts ---
>>30:c01|  if (!Value.Check(schema, { name: "foo", include: ["neighborhood"] })) {
>>33:2f7|  if (!Value.Check(schema, { name: "foo", include: ["contract"] })) {
>>36:37a|  if (!Value.Check(schema, { name: "foo", include: ["source"] })) {
>>39:2b2|  if (Value.Check(schema, { name: "foo", include: ["signals"] })) {
```

Fresh targeted test run:
```text
test/tool-symbol-graph-include-schema.test.ts:
(pass) symbol_graph accepts include values for neighborhood, contract, and source and keeps default output byte-identical

test/extension-tool-descriptions.test.ts:
(pass) pi extension registers the approved descriptions for the 5 default public tools

test/tool-symbol-graph-legacy-neighborhood.test.ts:
(pass) symbol_graph schema accepts only neighborhood, contract, and source includes

EXIT:0
```

**Verify:** `src/index.ts` enumerates only the three allowed literals, the include-property description explicitly lists them and rejects `"tests"`, the registered tool description is updated at the entry point, and fresh tests assert both exact descriptions and schema acceptance/rejection.

**Verdict:** pass

### Criterion 2: Agent-facing docs explicitly distinguish default card contents (including test signals / covering tests) from optional include sections, so `"tests"` is no longer implied to be a valid include value.
**Identify:** inspect README/docs wording, inspect renderer/source semantics for default tests vs optional include sections, and reproduce the old invalid call to confirm the contract now explains the rejection.

**Evidence:**

`read("README.md", offset=68, limit=11)`
```text
68:3da|#### `symbol_graph`
69:e48|Return a compact symbol summary with relationships, test signals, and key metadata.
70:9ee|By default, `symbol_graph({ name: "validateToken" })` already includes test signals in the compact card.
71:54d|Allowed include values: `"neighborhood"`, `"contract"`, `"source"`. `"tests"` is not a valid include value.
72:fd6|```
73:af6|symbol_graph({ name: "validateToken" })
74:483|symbol_graph({ name: "validateToken", file: "src/auth.ts" })
75:5f1|symbol_graph({ name: "validateToken", include: ["neighborhood"] })
76:6ac|symbol_graph({ name: "validateToken", include: ["contract"] })
77:4e7|symbol_graph({ name: "validateToken", include: ["source"] })
78:219|symbol_graph({ name: "validateToken", include: ["neighborhood", "contract", "source"] })
```

`read("docs/tool-descriptions.md", offset=24, limit=4)`
```text
24:355|## Maintenance
25:e63|`src/index.ts` is the source of truth for registered tools. Keep the 5-tool default public surface, the 3 dev-mode-only tools behind `CODEGRAPH_DEVMODE=1`, and the internal-only `symbol_search` status consistent across this guide, `README.md`, and `ARCHITECTURE.md`.
26:8a6|Keep top-level descriptions terse. Parameter-level notes such as `symbol_graph.include` usage belong in README or schema docs, not in top-level tool descriptions.
```

`symbol_graph({ name: "renderSymbolCardBody", file: "src/tools/symbol-card.ts", include: ["source"] })`
```text
## renderSymbolCardBody (function)
src/tools/symbol-card.ts:49:d6e3

### Source
81:8b32|  const tests = allNeighbors.filter((nr) => nr.edge.kind === "tested_by" && nr.edge.source === node.id);
82:1cf3|  if (tests.length > 0) {
83:b0ff|    lines.push("");
84:f8dc|    lines.push(`### Covering Tests (${tests.length})`);
85:3de1|    for (const t of tests) {
86:6615|      const testAnchor = computeAnchor(t.node, projectRoot);
87:2aa1|      lines.push(`  ${testAnchor.anchor}  "${t.node.name}"`);
88:d10b|    }
89:d10b|  }
```

`read("src/tools/symbol-graph.ts", offset=171, limit=37)`
```text
171:dbb|export function symbolGraph(params: SymbolGraphParams): string {
172:761|  const { include } = params;
175:cf9|  const useNeighborhoodBase = (include ?? []).includes("neighborhood");
176:161|  const base = useNeighborhoodBase
177:9f7|    ? renderLegacyNeighborhoodBody(params)
178:d97|    : renderSymbolCardBody({
186:cbb|  if (resolvedNodes.length === 1 && (include ?? []).includes("contract")) {
197:2d1|  if (resolvedNodes.length === 1 && (include ?? []).includes("source")) {
207:f85|  return prependTrustHeader(body, { stats, hasLocalExceptions });
208:b18|}
```

Fresh invalid-input reproduction:
```text
Validation failed for tool "symbol_graph":
  - include/0: must be equal to constant
  - include/0: must be equal to constant
  - include/0: must be equal to constant
  - include/0: must match a schema in anyOf
```

Fresh targeted doc test run:
```text
test/docs-symbol-graph-unified-surface.test.ts:
(pass) public docs explain symbol_graph include values without implying tests is valid
EXIT:0
```

**Verify:** README now separates default compact-card content from optional include sections. `renderSymbolCardBody()` still renders covering tests by default, while `symbolGraph()` only switches on `neighborhood`, `contract`, and `source`. The invalid `include:["tests"]` call still fails, but that failure now matches the published contract instead of contradicting it.

**Verdict:** pass

### Criterion 3: Repo-owned documentation and exact-string tests are updated together so the stale wording cannot be reintroduced silently.
**Identify:** search for the new wording and include guidance across source/docs/tests, search for stale wording, and confirm the exact-string guard tests pass.

**Evidence:**

`grep("Return a compact symbol summary with relationships, test signals, and key metadata.", literal=true, glob="{src/index.ts,README.md,docs/tool-descriptions.md,test/extension-tool-descriptions.test.ts,test/docs-symbol-graph-unified-surface.test.ts}")`
```text
src/index.ts:>>181:c53|    description: "Return a compact symbol summary with relationships, test signals, and key metadata.\nWhen to use: You need structural context for a named symbol.",
README.md:>>69:e48|Return a compact symbol summary with relationships, test signals, and key metadata.
docs/tool-descriptions.md:>>14:e29|- `Return a compact symbol summary with relationships, test signals, and key metadata.`
test/extension-tool-descriptions.test.ts:>>6:951|      "Return a compact symbol summary with relationships, test signals, and key metadata.\nWhen to use: You need structural context for a named symbol.",
test/docs-symbol-graph-unified-surface.test.ts:>>9:64f|  const expectedDescription = "Return a compact symbol summary with relationships, test signals, and key metadata.";
```

`grep("Optional extra sections. Allowed values: \"neighborhood\", \"contract\", \"source\". \"tests\" is not a valid include value.", literal=true, glob="{src/index.ts,test/extension-tool-descriptions.test.ts}")`
```text
src/index.ts:>>35:9d5|          'Optional extra sections. Allowed values: "neighborhood", "contract", "source". "tests" is not a valid include value.',
test/extension-tool-descriptions.test.ts:>>26:700|    'Optional extra sections. Allowed values: "neighborhood", "contract", "source". "tests" is not a valid include value.';
```

`grep("Return a symbol's callers, callees, tests, and key signals.", literal=true, glob="{src/index.ts,README.md,docs/tool-descriptions.md,test/extension-tool-descriptions.test.ts,test/docs-symbol-graph-unified-surface.test.ts}")`
```text
[2 matches in 1 files]
--- test/docs-symbol-graph-unified-surface.test.ts ---
>>24:12e|  if (readme.includes("Return a symbol's callers, callees, tests, and key signals.")) {
>>52:96e|  if (guide.includes("Return a symbol's callers, callees, tests, and key signals.")) {
```

Fresh targeted test run:
```text
test/extension-tool-descriptions.test.ts:
(pass) pi extension registers the approved descriptions for the 5 default public tools

test/docs-symbol-graph-unified-surface.test.ts:
(pass) public docs explain symbol_graph include values without implying tests is valid

EXIT:0
```

**Verify:** the new wording is synchronized across registration, README, style guide, and exact-string tests. The stale wording no longer appears in source/docs; the only remaining occurrences are negative assertions in `test/docs-symbol-graph-unified-surface.test.ts`, which will fail if the stale text comes back.

**Verdict:** pass

## Overall Verdict
pass

Summary:
- Fresh full suite passed: `444 pass, 0 fail`.
- Fresh typecheck passed: `tsc --noEmit`, `EXIT:0`.
- The original invalid input `include:["tests"]` is still rejected, but the contract mismatch is fixed: schema, README, and tests now explicitly state that `"tests"` is not a valid include value and that test signals appear by default in the compact card.
- All three acceptance criteria are satisfied with source, tool-output, and fresh test evidence.
