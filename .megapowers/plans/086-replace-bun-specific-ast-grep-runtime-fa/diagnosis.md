# Diagnosis

## Root Cause
The reproduced bad value is caused by the Node-runtime YAML fallback parser in `src/indexer/ast-grep.ts`, not by ast-grep scanning or rule validation.

`readRuleFile(filePath, bun)` chooses between Bun's YAML parser and the hand-rolled fallback:

```ts
raw = typeof bun?.YAML?.parse === "function"
  ? bun.YAML.parse(content)
  : parseSimpleRuleYaml(filePath, content);
```

When called as `readRuleFile(file, {})`, the fallback path runs. In `parseSimpleRuleYaml`, every line is preprocessed with:

```ts
const line = rawLine.replace(/\s+#.*$/, "");
```

That regular expression strips any whitespace followed by `#` through end-of-line without tracking YAML quoting state. For this valid YAML line:

```yaml
pattern: "$APP.get('/api # not a yaml comment', $HANDLER)"
```

it converts the line to:

```text
  pattern: "$APP.get('/api
```

before `parseRuleValue` removes the leading quote, producing the observed truncated value:

```ts
"$APP.get('/api"
```

Minimal confirmation of the exact transformation:

```text
"  pattern: \"$APP.get('/api"
"$APP.get('/api"
```

Bun's real YAML parser preserves the same quoted `#` content:

```text
"$APP.get('/api # not a yaml comment', $HANDLER)"
```

So the source of corruption is the fallback comment-stripping regex in `parseSimpleRuleYaml`. The violated assumption is that any ` #` sequence begins a YAML comment; in YAML, `#` inside a quoted scalar is data.

## Trace
1. The failing repro assertion sees the wrong value at `test/repro-086-ast-grep-node-yaml-fallback.test.ts:18`:
   ```ts
   expect(readRuleFile(file, {})[0]?.pattern).toBe(pattern);
   ```
2. `readRuleFile(file, {})` simulates the pi Node runtime by passing an object without `YAML.parse`.
3. `readRuleFile` reads the YAML file, sees no `bun?.YAML?.parse`, and calls `parseSimpleRuleYaml(filePath, content)`.
4. `parseSimpleRuleYaml` iterates over raw YAML lines and unconditionally applies `rawLine.replace(/\s+#.*$/, "")`.
5. That preprocessing step is where the correct input becomes incorrect: the quoted pattern containing ` #` is truncated before property extraction and before validation.
6. `validateRuleFile` accepts the truncated string because it only checks that `pattern` is truthy, not whether the value matches the original YAML scalar.
7. `readRuleFile` returns an `AstGrepRule[]` containing the corrupted `pattern`, which is what the test observes.

Graph-tool notes:
- `trace({ entry: "readRuleFile", file: "src/indexer/ast-grep.ts" })` returned `Symbol "readRuleFile" not found in the graph`.
- `symbol_graph` and `impact` also could not resolve `readRuleFile` / `parseSimpleRuleYaml` in the current graph, so call/risk tracing was performed with `read`, `grep`, and LSP references.

## Affected Code
- `src/indexer/ast-grep.ts:71-115` — `parseSimpleRuleYaml(filePath, content)` implements the narrow fallback parser. The root cause is line 77:
  ```ts
  const line = rawLine.replace(/\s+#.*$/, "");
  ```
- `src/indexer/ast-grep.ts:117-129` — `readRuleFile(filePath, bun = (globalThis as any).Bun)` selects `Bun.YAML.parse` when available and `parseSimpleRuleYaml` otherwise.
- `src/indexer/ast-grep.ts:131-135` — `loadRules` reads bundled plus project-local `.codegraph/rules/*.yaml` files via `readRuleFile`.
- `src/indexer/ast-grep.ts:349-364` — `runAstGrepIndexStage` calls `loadRules`, so the corrupted rule can affect actual indexing.
- `src/indexer/pipeline.ts:53-126` — `indexProject` invokes `runAstGrepIndexStage` at line 116, making this part of normal indexing.
- `package.json:17-25` — no standard Node-compatible YAML parser dependency is present; only `tree-sitter`, `tree-sitter-typescript`, `@mariozechner/pi-coding-agent`, `@types/bun`, and `typescript` are listed.

Related runtime-portability code also remains in `src/indexer/ast-grep.ts:155-191`: `defaultExec` branches on `(globalThis as any).Bun.spawn` before falling back to `node:child_process.spawn`. This is not the cause of the reproduced YAML truncation, but it shares the same design issue called out by the issue: runtime-specific fallbacks embedded inside the ast-grep indexer.

## Pattern Analysis
Working examples:
- `src/rules/express.yaml` uses plain scalar values only:
  ```yaml
  pattern: $APP.$METHOD($PATH, $$$HANDLERS)
  ```
- `src/rules/react.yaml` also uses a plain scalar without quoted comment characters:
  ```yaml
  pattern: <$COMPONENT $$$ATTRS />
  ```
- Existing fallback coverage in `test/indexer-ast-grep-rules.test.ts` uses bundled-style YAML and only asserts the parsed rule name:
  ```ts
  expect(readRuleFile(file, {}).map((r) => r.name)).toEqual(["r"]);
  ```

Broken example:
- The repro uses normal YAML quoting with `#` inside the quoted scalar:
  ```yaml
  pattern: "$APP.get('/api # not a yaml comment', $HANDLER)"
  ```

Specific differences:
1. Bundled rules avoid quoted scalars containing YAML comment markers; the repro uses one.
2. The fallback parser strips comments before parsing key/value syntax and has no quote awareness.
3. Real YAML parsing preserves `#` inside quotes; the fallback treats it as a comment delimiter.
4. Existing tests exercise only the narrow bundled-rule subset, so they pass while project-local YAML with ordinary quoted syntax fails.
5. `parseRuleValue` only strips surrounding quotes; it does not and cannot recover content removed by the earlier line-level regex.

Assumption violated:
- Broken code assumes a rule file can be parsed safely with simple line regexes and global comment stripping. Project-local `.codegraph/rules/*.yaml` may use normal YAML features, so that assumption is false.

Dependency/config observations:
- There is no shared YAML parser dependency in `package.json`, so Node-runtime parsing currently depends on the hand-rolled fallback.
- Bun runtime uses `Bun.YAML.parse`, so the same file can behave differently between Bun tests and pi's Node runtime.

## Risk Assessment
Risk surface found through LSP/grep references:
- `readRuleFile` is used by `loadRules` and direct tests.
- `loadRules` is used by `runAstGrepIndexStage`.
- `runAstGrepIndexStage` is used by `indexProject` and ast-grep integration tests.
- Any bundled or project-local rule file can be affected by changing parser behavior.

What could break if changed:
1. Validation error wrapping must continue to include the offending file path (`Invalid rule file ${filePath}: ...`). Existing tests assert this behavior.
2. Existing bundled rules must still parse to the same `AstGrepRule` shape.
3. Project-local rule loading order and `loadRules(...).sort((a, b) => a.name.localeCompare(b.name))` behavior must remain unchanged.
4. TypeScript/runtime compatibility must be preserved under Bun tests and pi's Node extension runtime.
5. If the broader issue also removes the `Bun.spawn` branch, tests currently asserting `Bun.spawn` assumptions in `test/indexer-ast-grep-scan.test.ts` and integration tests may need to be adjusted to validate behavior instead of Bun-specific APIs.

Related bugs sharing the same root cause:
- Any valid YAML syntax outside the fallback's narrow subset can diverge between Bun and Node, including quoted strings with `#`, quoted strings with escaped characters, more complex scalars, and comments/formatting not anticipated by the regex parser.
- The old Node-runtime failure `indexing-failed: Bun.YAML.parse is unavailable in this runtime` and this truncation are both consequences of ast-grep rule parsing being tied to Bun-specific APIs plus a narrow fallback instead of a single portable parser path.

## Fixed When
1. `readRuleFile` uses one Node-compatible YAML parser path in both Bun and Node runtimes; `parseSimpleRuleYaml` is no longer used for runtime parsing.
2. The failing repro test passes: a quoted scalar containing ` #` is preserved exactly when loading a project-local rule.
3. Existing ast-grep rule validation behavior and offending-file-path error messages remain covered and passing.
4. Bundled and project-local rules still merge and sort correctly through `loadRules`.
5. No ast-grep indexer production code depends on `Bun.YAML.parse`; for the broader issue, no ast-grep subprocess execution path depends on `Bun.spawn` either.
6. `bun test test/indexer-ast-grep-rules.test.ts test/repro-086-ast-grep-node-yaml-fallback.test.ts` passes, followed by the full test suite and `tsc --noEmit` during verification.
