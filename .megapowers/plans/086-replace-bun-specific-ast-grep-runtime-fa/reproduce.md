# Reproduction: Node ast-grep YAML fallback truncates quoted `#` in rule patterns

## Steps to Reproduce
1. From the repository root, add/run the focused repro test at `test/repro-086-ast-grep-node-yaml-fallback.test.ts`.
2. The test writes a temporary ast-grep rule file containing a YAML-quoted pattern with `#` inside the quoted string:
   ```yaml
   - name: quoted-comment-pattern
     pattern: "$APP.get('/api # not a yaml comment', $HANDLER)"
     lang: typescript
     produces:
       edge_kind: routes_to
       from_capture: HANDLER
       to_template: endpoint:{PATH}
       confidence: 0.9
   ```
3. The test calls `readRuleFile(file, {})` to simulate pi's Node runtime where `Bun.YAML.parse` is unavailable.
4. Run:
   ```sh
   bun test test/repro-086-ast-grep-node-yaml-fallback.test.ts
   ```

## Expected Behavior
`readRuleFile(file, {})` should parse the same YAML string a real YAML parser would parse and preserve the full quoted value:

```ts
"$APP.get('/api # not a yaml comment', $HANDLER)"
```

## Actual Behavior
The Node-runtime fallback parser treats the ` #` inside the quoted string as the start of a YAML comment and truncates the pattern to:

```ts
"$APP.get('/api"
```

Exact failing output:

```text
bun test v1.3.13 (bf2e2cec)

test/repro-086-ast-grep-node-yaml-fallback.test.ts:
13 |     file,
14 |     `- name: quoted-comment-pattern\n  pattern: "${pattern}"\n  lang: typescript\n  produces:\n    edge_kind: routes_to\n    from_capture: HANDLER\n    to_template: endpoint:{PATH}\n    confidence: 0.9\n`,
15 |   );
16 | 
17 |   try {
18 |     expect(readRuleFile(file, {})[0]?.pattern).toBe(pattern);
                                                    ^
error: expect(received).toBe(expected)

Expected: "$APP.get('/api # not a yaml comment', $HANDLER)"
Received: "$APP.get('/api"

      at <anonymous> (/Users/maxwellnewman/pi/workspace/pi-codegraph/test/repro-086-ast-grep-node-yaml-fallback.test.ts:18:48)
(fail) Node runtime YAML fallback preserves quoted # characters in project-local ast-grep rules [13.07ms]

 0 pass
 1 fail
 1 expect() calls
Ran 1 test across 1 file. [133.00ms]


Command exited with code 1
```

## Evidence
Relevant current `readRuleFile` signature and branch:

```ts
export function readRuleFile(filePath: string, bun: any = (globalThis as any).Bun): AstGrepRule[] {
  let raw: unknown;
  try {
    const content = readFileSync(filePath, "utf8");
    raw = typeof bun?.YAML?.parse === "function"
      ? bun.YAML.parse(content)
      : parseSimpleRuleYaml(filePath, content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid rule file ${filePath}: ${message}`);
  }
  return validateRuleFile(filePath, raw);
}
```

Relevant current fallback parser line:

```ts
for (const rawLine of content.split(/\r?\n/)) {
  const line = rawLine.replace(/\s+#.*$/, "");
```

`symbol_graph` was attempted for `readRuleFile` with `include: ["source"]`; the graph returned `Symbol "readRuleFile" not found`, so source context was captured with `read({ symbol: "readRuleFile" })` and `read({ symbol: "parseSimpleRuleYaml" })` instead.

Recent VCS history checked for the affected files:

```text
1a4fa435 feat: ship 072-harden-ensureindexed-error-path-real-mes (#48)
0ba9d71e Ship 024-m3-impact-analysis-ast-grep-rule-engine (#5)
```

Current working-tree diff for `src/indexer/ast-grep.ts` shows an uncommitted Node fallback was added after the original `Bun.YAML.parse is unavailable in this runtime` path. The repro confirms the fallback still diverges from normal YAML parsing for a project-local rule using a quoted `#` character.

Related existing rule tests still pass and do not cover this YAML feature:

```text
bun test v1.3.13 (bf2e2cec)

test/indexer-ast-grep-rules.test.ts:
(pass) Bun.YAML.parse API is available [0.89ms]
(pass) readRuleFile parses bundled-style YAML when bun.YAML.parse is missing [1.65ms]
(pass) loadRules merges bundled + project-local rules and accepts generic selectors [5.90ms]
(pass) loadRules enforces exactly one from_* and one to_* selector [1.37ms]
(pass) loadRules rejects rules that specify both to_capture and to_template [0.38ms]
(pass) loadRules rejects rules that specify neither from_capture nor from_context [0.42ms]
(pass) loadRules rejects invalid from_context values with offending file path [0.38ms]
(pass) loadRules wraps YAML parse errors with offending file path [0.81ms]
(pass) loadRules rejects unsupported edge_kind values with offending file path [1.92ms]

 9 pass
 0 fail
 10 expect() calls
Ran 9 tests across 1 file. [31.00ms]
```

## Environment
- OS: `Darwin MaxMBP.casa 25.3.0 Darwin Kernel Version 25.3.0: Wed Jan 28 20:51:28 PST 2026; root:xnu-12377.91.3~2/RELEASE_ARM64_T6041 arm64`
- Bun: `1.3.13`
- Node: `v25.9.0`
- Project test runner: `bun test`

## Failing Test
`test/repro-086-ast-grep-node-yaml-fallback.test.ts`

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRuleFile } from "../src/indexer/ast-grep.js";

test("Node runtime YAML fallback preserves quoted # characters in project-local ast-grep rules", () => {
  const root = join(tmpdir(), `pi-cg-repro-086-${Date.now()}`);
  const file = join(root, "rule.yaml");
  mkdirSync(root, { recursive: true });
  const pattern = "$APP.get('/api # not a yaml comment', $HANDLER)";
  writeFileSync(
    file,
    `- name: quoted-comment-pattern\n  pattern: "${pattern}"\n  lang: typescript\n  produces:\n    edge_kind: routes_to\n    from_capture: HANDLER\n    to_template: endpoint:{PATH}\n    confidence: 0.9\n`,
  );

  try {
    expect(readRuleFile(file, {})[0]?.pattern).toBe(pattern);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

## Reproducibility
Always, under the specific condition that `readRuleFile` runs without `Bun.YAML.parse` and the YAML rule contains ` #` inside a quoted scalar value.
