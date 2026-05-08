---
id: 86
type: bugfix
status: done
created: 2026-04-30T14:23:17.522Z
---
# Replace Bun-specific ast-grep runtime fallbacks with Node-compatible implementation
pi-codegraph currently handles pi's Node runtime by falling back from Bun.YAML.parse to a narrow hand-rolled YAML parser and from Bun.spawn to node:child_process.spawn. This unblocks current bundled rules, but it is not ideal: behavior can differ between Bun and Node, project-local .codegraph/rules/*.yaml may fail if they use normal YAML features, and runtime branching is embedded in ast-grep indexing logic.

Fix should make the ast-grep indexing stage genuinely runtime-portable:

- Add a standard Node-compatible YAML parser dependency, e.g. `yaml`.
- Replace `Bun.YAML.parse` and the custom parseSimpleRuleYaml fallback with the shared parser.
- Use `node:child_process.spawn` unconditionally instead of Bun.spawn/runtime branching, assuming Bun supports the Node child_process API.
- Keep the existing `files.flatMap((f) => readRuleFile(f))` fix so Array.flatMap does not pass index/array into readRuleFile.
- Preserve validation behavior and error messages with offending file paths.
- Add regression coverage for project-local rule files using YAML syntax that the hand-rolled parser would not support, such as quoted strings containing colons or comments.
- Verify under Bun test suite and ensure pi Node runtime no longer reports `indexing-failed: Bun.YAML.parse is unavailable in this runtime`.

Acceptance criteria:

1. ast-grep rule loading uses one parser path in Bun and Node.
2. no direct `Bun.YAML` or `Bun.spawn` references remain in `src/indexer/ast-grep.ts`.
3. existing ast-grep rule tests pass.
4. new regression test covers a YAML rule feature supported by the real parser but not the previous fallback.
5. full test suite and `tsc --noEmit` pass.
