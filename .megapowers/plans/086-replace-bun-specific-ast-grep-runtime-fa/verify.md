# Verification Report — Issue 086

## Test Suite Results

### Impact / dependency check before relying on the suite

Command/tool: `impact({ symbols: ["runScan"], changeType: "behavior_change", maxDepth: 3 })`

Output:

```text
Symbol "runScan" not found
```

Command/tool: `impact({ symbols: ["runAstGrepIndexStage"], changeType: "behavior_change", maxDepth: 4 })`

Output:

```text
Symbol "runAstGrepIndexStage" not found
```

Because the graph did not surface dependents, I used LSP references to confirm the changed execution chain:

```text
action: references
query: runScan
resolvedPosition: 141:1
src/indexer/ast-grep.ts:141:23
src/indexer/ast-grep.ts:283:18
src/indexer/ast-grep.ts:283:28
```

```text
action: references
query: readRuleFile
resolvedPosition: 66:1
src/indexer/ast-grep.ts:66:17
src/indexer/ast-grep.ts:81:31
```

Dependency tests confirmed as run:

```text
grep readRuleFile in test: 5 matches in 2 files
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/indexer-ast-grep-rules.test.ts: 3 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/repro-086-ast-grep-node-yaml-fallback.test.ts: 2 matches

grep runScan in test: 11 matches in 1 files
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/indexer-ast-grep-scan.test.ts: 11 matches

grep runAstGrepIndexStage in test: 5 matches in 1 files
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/indexer-ast-grep-express-integration.test.ts: 5 matches

grep loadRules in test: 15 matches in 1 files
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/indexer-ast-grep-rules.test.ts: 15 matches
```

### Fresh full-suite command

Command:

```sh
bun test && bun run check
```

Output summary from the fresh run:

```text
bun test v1.3.13 (bf2e2cec)
...
test/repro-086-ast-grep-node-yaml-fallback.test.ts:
(pass) Node runtime YAML fallback preserves quoted # characters in project-local ast-grep rules [1.35ms]
...
test/indexer-ast-grep-express-integration.test.ts:
(pass) sg binary is available for Stage 3 subprocess integration [8.21ms]
(pass) runAstGrepIndexStage passes only changed files to scanFn [0.69ms]
(pass) runAstGrepIndexStage passes exactly provided changed files to scanFn [1.32ms]
(pass) SqliteGraphStore.deleteFile removes endpoint nodes and Stage-3 routes_to edges [0.46ms]
(pass) bundled rules path resolves and bundled files exist
(pass) pipeline Stage 3 minimal Express integration creates endpoint node id and routes_to edge [33.42ms]
(pass) pipeline Stage 3 indexes express routes, replaces changed matches, keeps unchanged reruns stable, and cleans removed-file artifacts [78.14ms]
...
test/indexer-ast-grep-scan.test.ts:
(pass) ast-grep indexer has no Bun runtime branches [0.11ms]
(pass) runScan uses sg CLI args and normalizes --json output [0.11ms]
(pass) runScan wraps subprocess launch failures [0.17ms]
(pass) runScan returns [] when sg exits successfully with empty stdout [0.01ms]
(pass) runScan returns [] when sg stdout is whitespace-only [0.05ms]
(pass) runScan still rejects malformed non-empty JSON output [0.01ms]
...
 420 pass
 0 fail
 1218 expect() calls
Ran 420 tests across 173 files. [14.17s]
$ tsc --noEmit
```

Exit status: success (the chained command proceeded through `bun run check`, and `tsc --noEmit` returned without errors).

## Bugfix Reproduction — Original Symptom

Command:

```sh
bun --eval 'import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRuleFile } from "./src/indexer/ast-grep.ts";
const root = join(tmpdir(), `pi-cg-repro-086-verify-${Date.now()}`);
const file = join(root, "rule.yaml");
mkdirSync(root, { recursive: true });
const pattern = "$APP.get('\''/api # not a yaml comment'\'', $HANDLER)";
writeFileSync(file, `- name: quoted-comment-pattern\n  pattern: "${pattern}"\n  lang: typescript\n  produces:\n    edge_kind: routes_to\n    from_capture: HANDLER\n    to_template: endpoint:{PATH}\n    confidence: 0.9\n`);
try {
  const actual = readRuleFile(file, {})[0]?.pattern;
  console.log(JSON.stringify({ actual, expected: pattern, equal: actual === pattern }, null, 2));
} finally {
  rmSync(root, { recursive: true, force: true });
}'
```

Output:

```json
{
  "actual": "$APP.get('/api # not a yaml comment', $HANDLER)",
  "expected": "$APP.get('/api # not a yaml comment', $HANDLER)",
  "equal": true
}
```

Verdict: the original truncation symptom no longer occurs.

## Graph-tool evidence

Command/tool: `symbol_graph({ name: "readRuleFile", file: "src/indexer/ast-grep.ts", include: ["source"] })`

Output:

```text
Symbol "readRuleFile" not found
```

Command/tool: `symbol_graph({ name: "runScan", file: "src/indexer/ast-grep.ts", include: ["source"] })`

Output:

```text
Symbol "runScan" not found
```

Command/tool: `trace({ entry: "runAstGrepIndexStage", file: "src/indexer/ast-grep.ts" })`

Output:

```text
Symbol "runAstGrepIndexStage" not found in the graph
```

The graph tools did not resolve these symbols in the current graph, so verification below uses anchored source reads, LSP references, ast_search, grep, and fresh tests.

## Per-Criterion Verification

### Criterion 1: `readRuleFile` uses one Node-compatible YAML parser path in both Bun and Node runtimes; `parseSimpleRuleYaml` is no longer used for runtime parsing.

**IDENTIFY:** Source inspection of `src/indexer/ast-grep.ts`, dependency inspection in `package.json`, ast_search for the parser call, and grep for removed fallback parser.

**RUN / READ evidence:**

Anchored source:

```text
src/indexer/ast-grep.ts
5:b95|import { parse as parseYaml } from "yaml";
66:3f8|export function readRuleFile(filePath: string, _runtime?: unknown): AstGrepRule[] {
67:a4b|  let raw: unknown;
68:a6c|  try {
69:605|    const content = readFileSync(filePath, "utf8");
70:a1f|    raw = parseYaml(content);
71:5e8|  } catch (error) {
72:dcb|    const message = error instanceof Error ? error.message : String(error);
73:ae4|    throw new Error(`Invalid rule file ${filePath}: ${message}`);
74:b18|  }
75:302|  return validateRuleFile(filePath, raw);
76:b18|}
```

```text
package.json
17:72a|  "dependencies": {
18:789|    "tree-sitter": "^0.25.0",
19:274|    "tree-sitter-typescript": "^0.23.2",
20:407|    "yaml": "^2.8.3"
21:2f6|  },
```

ast_search:

```text
--- src/indexer/ast-grep.ts ---
>>70:a1f|    raw = parseYaml(content);
```

Grep:

```text
grep parseSimpleRuleYaml src/indexer/ast-grep.ts: [0 matches in 0 files]
```

**VERIFY:** `readRuleFile` imports and calls the portable `yaml` parser directly, ignores the old runtime argument, and `parseSimpleRuleYaml` is absent.

**Verdict:** pass.

### Criterion 2: The failing repro test passes: a quoted scalar containing ` #` is preserved exactly when loading a project-local rule.

**IDENTIFY:** Repro test source and fresh test/direct repro output.

**RUN / READ evidence:**

Anchored test source:

```text
test/repro-086-ast-grep-node-yaml-fallback.test.ts
7:db5|test("Node runtime YAML fallback preserves quoted # characters in project-local ast-grep rules", () => {
11:93a|  const pattern = "$APP.get('/api # not a yaml comment', $HANDLER)";
18:159|    expect(readRuleFile(file, {})[0]?.pattern).toBe(pattern);
```

Direct repro output:

```json
{
  "actual": "$APP.get('/api # not a yaml comment', $HANDLER)",
  "expected": "$APP.get('/api # not a yaml comment', $HANDLER)",
  "equal": true
}
```

Targeted test output:

```text
test/repro-086-ast-grep-node-yaml-fallback.test.ts:
(pass) Node runtime YAML fallback preserves quoted # characters in project-local ast-grep rules [1.21ms]
```

**VERIFY:** The direct repro and regression test both show the quoted `#` pattern is preserved exactly.

**Verdict:** pass.

### Criterion 3: Existing ast-grep rule validation behavior and offending-file-path error messages remain covered and passing.

**IDENTIFY:** Validation code source and rule tests that assert file-path-bearing errors.

**RUN / READ evidence:**

Anchored source:

```text
src/indexer/ast-grep.ts
35:74e|function validateRuleFile(filePath: string, raw: unknown): AstGrepRule[] {
36:b66|  if (!Array.isArray(raw)) throw new Error(`Invalid rule file ${filePath}: expected YAML array`);
40:470|    if (!rule.name) throw new Error(`Invalid rule file ${filePath}: missing name`);
41:6ce|    if (!rule.pattern) throw new Error(`Invalid rule file ${filePath}: missing pattern`);
42:be7|    if (!rule.lang) throw new Error(`Invalid rule file ${filePath}: missing lang`);
43:f8a|    if (!rule.produces?.edge_kind) throw new Error(`Invalid rule file ${filePath}: missing produces.edge_kind`);
46:e98|      throw new Error(`Invalid rule file ${filePath}: unsupported produces.edge_kind ${rule.produces.edge_kind}`);
48:ae5|    if (typeof rule.produces?.confidence !== "number") throw new Error(`Invalid rule file ${filePath}: missing produces.confidence`);
52:8f2|      throw new Error(`Invalid rule file ${filePath}: specify exactly one of produces.from_capture or produces.from_context`);
57:1af|      throw new Error(`Invalid rule file ${filePath}: specify exactly one of produces.to_capture or produces.to_template`);
60:08d|      throw new Error(`Invalid rule file ${filePath}: unsupported produces.from_context ${rule.produces.from_context}`);
73:ae4|    throw new Error(`Invalid rule file ${filePath}: ${message}`);
```

Anchored tests:

```text
test/indexer-ast-grep-rules.test.ts
42:e40|test("loadRules enforces exactly one from_* and one to_* selector", () => {
50:b6b|    expect(() => loadRules({ bundledDir, projectRoot: root })).toThrow(
51:ab3|      `Invalid rule file ${badFile}: specify exactly one of produces.from_capture or produces.from_context`,
58:179|test("loadRules rejects rules that specify both to_capture and to_template", () => {
66:b6b|    expect(() => loadRules({ bundledDir, projectRoot: root })).toThrow(
67:fe4|      `Invalid rule file ${badFile}: specify exactly one of produces.to_capture or produces.to_template`,
90:b2f|test("loadRules rejects invalid from_context values with offending file path", () => {
98:b6b|    expect(() => loadRules({ bundledDir, projectRoot: root })).toThrow(
99:82c|      `Invalid rule file ${badFile}: unsupported produces.from_context invalid_value`,
106:ba2|test("loadRules wraps YAML parse errors with offending file path", () => {
114:af4|    expect(() => loadRules({ bundledDir, projectRoot: root })).toThrow(`Invalid rule file ${badFile}`);
120:161|test("loadRules rejects unsupported edge_kind values with offending file path", () => {
131:b6b|    expect(() => loadRules({ bundledDir, projectRoot: root })).toThrow(
132:80c|      `Invalid rule file ${badFile}: unsupported produces.edge_kind unknown_edge`,
```

Targeted output:

```text
test/indexer-ast-grep-rules.test.ts:
(pass) Bun.YAML.parse API is available [1.62ms]
(pass) readRuleFile parses bundled-style YAML when bun.YAML.parse is missing [6.39ms]
(pass) loadRules merges bundled + project-local rules and accepts generic selectors [3.61ms]
(pass) loadRules enforces exactly one from_* and one to_* selector [1.83ms]
(pass) loadRules rejects rules that specify both to_capture and to_template [1.18ms]
(pass) loadRules rejects rules that specify neither from_capture nor from_context [0.83ms]
(pass) loadRules rejects invalid from_context values with offending file path [1.07ms]
(pass) loadRules wraps YAML parse errors with offending file path [1.96ms]
(pass) loadRules rejects unsupported edge_kind values with offending file path [0.95ms]
```

**VERIFY:** Validation code still includes file paths in errors, and every validation/error-wrapping test passed in the targeted run and full suite.

**Verdict:** pass.

### Criterion 4: Bundled and project-local rules still merge and sort correctly through `loadRules`.

**IDENTIFY:** Source for `loadRules` and passing test that creates both bundled and `.codegraph/rules` inputs.

**RUN / READ evidence:**

Anchored source:

```text
src/indexer/ast-grep.ts
78:3f9|export function loadRules(options: LoadRulesOptions): AstGrepRule[] {
79:9d9|  const userDir = join(options.projectRoot, ".codegraph", "rules");
80:144|  const files = [...listRuleFiles(options.bundledDir), ...listRuleFiles(userDir)];
81:65b|  return files.flatMap((f) => readRuleFile(f)).sort((a, b) => a.name.localeCompare(b.name));
82:b18|}
```

Anchored test:

```text
test/indexer-ast-grep-rules.test.ts
25:b09|test("loadRules merges bundled + project-local rules and accepts generic selectors", () => {
27:e7e|  const bundledDir = join(root, "bundled");
28:7a7|  const userDir = join(root, ".codegraph", "rules");
31:6c2|  writeFileSync(join(bundledDir, "express.yaml"), `- name: express-route\n  pattern: $APP.$METHOD($PATH, $$$HANDLERS)\n  lang: typescript\n  produces:\n    edge_kind: routes_to\n    from_capture: HANDLERS\n    to_template: endpoint:{METHOD}:{PATH}\n    confidence: 0.9\n`);
32:811|  writeFileSync(join(userDir, "generic.yaml"), `- name: generic-context-template\n  pattern: foo()\n  lang: typescript\n  produces:\n    edge_kind: routes_to\n    from_context: enclosing_function\n    to_template: endpoint:{NAME}\n    confidence: 0.5\n`);
35:c44|    const rules = loadRules({ bundledDir, projectRoot: root });
36:787|    expect(rules.map((r) => r.name).sort()).toEqual(["express-route", "generic-context-template"]);
```

Targeted output:

```text
(pass) loadRules merges bundled + project-local rules and accepts generic selectors [3.61ms]
```

**VERIFY:** `loadRules` still loads bundled plus project-local rules and sorts by name; the test that proves merge behavior passed.

**Verdict:** pass.

### Criterion 5: No ast-grep indexer production code depends on `Bun.YAML.parse`; for the broader issue, no ast-grep subprocess execution path depends on `Bun.spawn` either.

**IDENTIFY:** Grep for Bun-specific runtime strings, source inspection of `defaultExec`, ast_search for `nodeSpawn`, and scan tests.

**RUN / READ evidence:**

Grep results:

```text
grep "Bun.YAML" src/indexer/ast-grep.ts: [0 matches in 0 files]
grep "Bun.spawn" src/indexer/ast-grep.ts: [0 matches in 0 files]
grep "(globalThis as any).Bun" src/indexer/ast-grep.ts: [0 matches in 0 files]
```

Anchored source:

```text
src/indexer/ast-grep.ts
1:717|import { spawn as nodeSpawn } from "node:child_process";
102:484|async function defaultExec(cmd: string[], opts: { cwd: string }): Promise<string> {
103:8d9|  return await new Promise<string>((resolve, reject) => {
104:3fe|    const child = nodeSpawn(cmd[0]!, cmd.slice(1), { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"] });
105:c07|    let stdout = "";
106:73e|    let stderr = "";
107:703|    child.stdout.setEncoding("utf8");
108:5c0|    child.stderr.setEncoding("utf8");
109:d76|    child.stdout.on("data", (chunk) => { stdout += chunk; });
110:dee|    child.stderr.on("data", (chunk) => { stderr += chunk; });
111:fd2|    child.on("error", (error) => {
112:0ed|      reject(new Error(`Failed to launch sg. Is ast-grep installed? ${error.message}`));
113:d86|    });
114:7ee|    child.on("close", (code) => {
115:c64|      const exitCode = code ?? 0;
116:4dc|      // sg exits 1 when no matches found (like grep) — treat 0 and 1 as success
117:de0|      if (exitCode > 1) reject(new Error(`sg failed (${exitCode}): ${stderr.trim() || stdout.trim()}`));
118:772|      else resolve(stdout);
119:d86|    });
120:d86|  });
121:b18|}
```

ast_search:

```text
--- src/indexer/ast-grep.ts ---
>>104:3fe|    const child = nodeSpawn(cmd[0]!, cmd.slice(1), { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"] });
```

Anchored test:

```text
test/indexer-ast-grep-scan.test.ts
6:777|test("ast-grep indexer has no Bun runtime branches", () => {
8:2cb|  expect(source).not.toContain("(globalThis as any).Bun");
9:11e|  expect(source).not.toContain("Bun.YAML");
10:b38|  expect(source).not.toContain("Bun.spawn");
11:a32|  expect(source).not.toContain("bun?.spawn");
12:8f6|  expect(source).not.toContain("bun.spawn");
27:0a3|test("runScan uses sg CLI args and normalizes --json output", async () => {
48:9f8|test("runScan wraps subprocess launch failures", async () => {
57:163|test("runScan returns [] when sg exits successfully with empty stdout", async () => {
63:bcd|test("runScan returns [] when sg stdout is whitespace-only", async () => {
69:e65|test("runScan still rejects malformed non-empty JSON output", async () => {
```

Targeted output:

```text
test/indexer-ast-grep-scan.test.ts:
(pass) ast-grep indexer has no Bun runtime branches [0.24ms]
(pass) runScan uses sg CLI args and normalizes --json output [0.12ms]
(pass) runScan wraps subprocess launch failures [0.11ms]
(pass) runScan returns [] when sg exits successfully with empty stdout [0.03ms]
(pass) runScan returns [] when sg stdout is whitespace-only
(pass) runScan still rejects malformed non-empty JSON output [0.05ms]
```

**VERIFY:** Production code contains no searched Bun runtime branches and `defaultExec` uses `node:child_process.spawn` through `nodeSpawn`.

**Verdict:** pass.

### Criterion 6: `bun test test/indexer-ast-grep-rules.test.ts test/repro-086-ast-grep-node-yaml-fallback.test.ts` passes, followed by the full test suite and `tsc --noEmit` during verification.

**IDENTIFY:** Run the specified targeted test command plus the relevant scan/integration tests, then the full suite/check command.

**RUN / READ evidence:**

Command:

```sh
bun test test/indexer-ast-grep-rules.test.ts test/repro-086-ast-grep-node-yaml-fallback.test.ts test/indexer-ast-grep-scan.test.ts test/indexer-ast-grep-express-integration.test.ts
```

Output:

```text
bun test v1.3.13 (bf2e2cec)

test/indexer-ast-grep-rules.test.ts:
(pass) Bun.YAML.parse API is available [1.62ms]
(pass) readRuleFile parses bundled-style YAML when bun.YAML.parse is missing [6.39ms]
(pass) loadRules merges bundled + project-local rules and accepts generic selectors [3.61ms]
(pass) loadRules enforces exactly one from_* and one to_* selector [1.83ms]
(pass) loadRules rejects rules that specify both to_capture and to_template [1.18ms]
(pass) loadRules rejects rules that specify neither from_capture nor from_context [0.83ms]
(pass) loadRules rejects invalid from_context values with offending file path [1.07ms]
(pass) loadRules wraps YAML parse errors with offending file path [1.96ms]
(pass) loadRules rejects unsupported edge_kind values with offending file path [0.95ms]

test/repro-086-ast-grep-node-yaml-fallback.test.ts:
(pass) Node runtime YAML fallback preserves quoted # characters in project-local ast-grep rules [1.21ms]

test/indexer-ast-grep-express-integration.test.ts:
(pass) sg binary is available for Stage 3 subprocess integration [11.96ms]
(pass) runAstGrepIndexStage passes only changed files to scanFn [2.69ms]
(pass) runAstGrepIndexStage passes exactly provided changed files to scanFn [2.02ms]
(pass) SqliteGraphStore.deleteFile removes endpoint nodes and Stage-3 routes_to edges [0.95ms]
(pass) bundled rules path resolves and bundled files exist [0.13ms]
(pass) pipeline Stage 3 minimal Express integration creates endpoint node id and routes_to edge [46.50ms]
(pass) pipeline Stage 3 indexes express routes, replaces changed matches, keeps unchanged reruns stable, and cleans removed-file artifacts [88.94ms]

test/indexer-ast-grep-scan.test.ts:
(pass) ast-grep indexer has no Bun runtime branches [0.24ms]
(pass) runScan uses sg CLI args and normalizes --json output [0.12ms]
(pass) runScan wraps subprocess launch failures [0.11ms]
(pass) runScan returns [] when sg exits successfully with empty stdout [0.03ms]
(pass) runScan returns [] when sg stdout is whitespace-only
(pass) runScan still rejects malformed non-empty JSON output [0.05ms]

 23 pass
 0 fail
 52 expect() calls
Ran 23 tests across 4 files. [218.00ms]
```

Full command output summary:

```text
bun test && bun run check
...
 420 pass
 0 fail
 1218 expect() calls
Ran 420 tests across 173 files. [14.17s]
$ tsc --noEmit
```

**VERIFY:** The required targeted tests passed. The full suite passed with zero failures, and `tsc --noEmit` completed with exit 0.

**Verdict:** pass.

## Overall Verdict

pass

All six acceptance criteria are verified with fresh command output and anchored source/test evidence. The original YAML quoted-`#` truncation symptom no longer reproduces, validation and rule-merging behavior remain covered, and ast-grep subprocess execution now uses `node:child_process` without Bun runtime branches.
