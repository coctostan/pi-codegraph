# Bugfix Summary — 086 replace Bun-specific ast-grep runtime fallbacks

## Root cause

Ast-grep rule loading used runtime-specific parsing behavior. In Node-like runtime paths, the previous hand-rolled YAML fallback treated any whitespace followed by `#` as a comment delimiter, including inside quoted YAML scalars. A project-local rule such as:

```yaml
pattern: "$APP.get('/api # not a yaml comment', $HANDLER)"
```

was truncated before validation, so `readRuleFile(file, {})` returned `"$APP.get('/api"` instead of the full pattern.

The graph tools could not resolve `readRuleFile` or `runScan` in the current graph (`Symbol "readRuleFile" not found`, `Symbol "runScan" not found`), so affected locations were confirmed with anchored source reads and LSP references.

## Fix approach

- Replaced the ast-grep rule YAML fallback with the portable `yaml` package.
- Kept `validateRuleFile`, `loadRules`, and the rule shape behavior intact.
- Removed Bun-specific ast-grep subprocess branching and made `defaultExec` use `node:child_process.spawn` directly.
- Updated scan tests to assert there are no Bun runtime branches in `src/indexer/ast-grep.ts` and to cover `runScan` subprocess/error/output normalization behavior through injected `ExecFn` implementations.
- Added a regression test that reproduces the quoted-`#` YAML scalar and confirms it is preserved exactly.

## Files changed

Implementation and tests:

- `src/indexer/ast-grep.ts` — uses `parseYaml` from `yaml`; uses `nodeSpawn` for `sg run`; keeps sg exit-code and empty-output normalization.
- `package.json` — adds `yaml` dependency.
- `bun.lock` — records the new dependency.
- `test/repro-086-ast-grep-node-yaml-fallback.test.ts` — regression for quoted `#` in project-local YAML rules.
- `test/indexer-ast-grep-rules.test.ts` — existing rule parsing/validation coverage remains passing with the portable parser.
- `test/indexer-ast-grep-scan.test.ts` — verifies no Bun runtime branches and `runScan` behavior.

Workflow artifacts:

- `.megapowers/plans/086-replace-bun-specific-ast-grep-runtime-fa/verify.md`
- `.megapowers/docs/086-replace-bun-specific-ast-grep-runtime-fa.md`
- `.megapowers/plans/086-replace-bun-specific-ast-grep-runtime-fa/learnings.md`

## Verification

Fresh verification completed:

```text
bun test && bun run check
...
420 pass
0 fail
1218 expect() calls
Ran 420 tests across 173 files. [14.17s]
$ tsc --noEmit
```

Targeted ast-grep verification:

```text
bun test test/indexer-ast-grep-rules.test.ts test/repro-086-ast-grep-node-yaml-fallback.test.ts test/indexer-ast-grep-scan.test.ts test/indexer-ast-grep-express-integration.test.ts
...
23 pass
0 fail
52 expect() calls
Ran 23 tests across 4 files. [218.00ms]
```

Direct symptom reproduction now returns the expected full pattern:

```json
{
  "actual": "$APP.get('/api # not a yaml comment', $HANDLER)",
  "expected": "$APP.get('/api # not a yaml comment', $HANDLER)",
  "equal": true
}
```

## PR description draft

### Summary

This fixes ast-grep indexer runtime portability by removing Bun-specific YAML parsing and subprocess execution paths. Rule files are now parsed through the portable `yaml` package in both Bun and Node-like runtimes, preserving valid YAML quoting such as `#` inside quoted scalars. The `sg` subprocess launcher now uses `node:child_process.spawn` directly.

### What changed

- Added `yaml` dependency and parse ast-grep rule YAML through `parseYaml`.
- Removed the narrow hand-rolled YAML fallback that corrupted quoted `#` content.
- Replaced Bun subprocess branching with `node:child_process.spawn`.
- Added regression coverage for quoted `#` rule patterns.
- Updated ast-grep scan tests to assert no Bun runtime branches remain and that `runScan` still normalizes `sg --json` output correctly.

### Verification

- `bun test test/indexer-ast-grep-rules.test.ts test/repro-086-ast-grep-node-yaml-fallback.test.ts test/indexer-ast-grep-scan.test.ts test/indexer-ast-grep-express-integration.test.ts` — 23 pass, 0 fail
- `bun test && bun run check` — 420 pass, 0 fail; `tsc --noEmit` passed
