# #078 — `symbol_graph` source-include truncation hint

## Summary

When `symbol_graph(include: ["source"])` (or `symbol_card` with `maxSourceLines`) truncated a function body, the trailing notice was a bare numeric count — `(50 more lines truncated)` — with no continuation path. The agent saw "you missed N lines" and had to chase a second symbol lookup to read the rest.

The fix re-shapes that single trailing line into a copy-paste-ready `read()` invocation that points back at the source file and the first omitted line.

## Root cause

`src/output/source.ts` — `readSourceSnippet`. The function had every value the agent needed (`node.file`, `node.start_line`, `displayLines.length`, `truncated`) in scope at the format string, but discarded all of them and emitted only `truncated`:

```ts
text += `\n(${truncated} more lines truncated)`;
```

This was a missing-feature regression from #057, where the literal `(N more lines truncated)` was set as the spec before the agent-ergonomics requirement of #078 existed. No runtime fault — the function did exactly what it was specified to do.

## Fix approach

Single-site producer change (`src/output/source.ts:53–56`). When `truncated > 0`, emit a single line containing the file path, 1-indexed offset of the first omitted line, the remaining-line count, and the literal `read(` token:

```ts
let text = hashlined.join("\n");
if (truncated > 0) {
  const nextOffset = node.start_line + displayLines.length;
  text += `\n(${truncated} more lines — use read("${node.file}", offset: ${nextOffset}, limit: ${truncated}) to see the rest)`;
}
```

`displayLines.length === limit` whenever `truncated > 0` (line 44 slices to `limit`), so `node.start_line + displayLines.length` is the 1-indexed first omitted line. `truncated` is exactly the line count the agent must request.

No signature change. No new I/O. `SourceSnippetResult` interface unchanged. Non-truncated output (when `truncated === 0`) is byte-identical to today.

Example output:

```
1:cb8f|  // line 1
…
50:a0d9|  // line 50
(50 more lines — use read("src/big.ts", offset: 51, limit: 50) to see the rest)
```

## Files changed

- `src/output/source.ts` — truncation-notice format string (single-site producer).
- `test/repro-078-source-truncation-hint.test.ts` — regression test asserting file path, `offset:`, `limit:`, and `read(` are present in the truncation suffix.
- `test/read-source-snippet.test.ts` — updated the line-124 literal assertion (`"(15 more lines truncated)"`) to assert the new contract (`offset: 6`, `limit: 15`, `src/a.ts`, `read(`).
- `test/tool-symbol-card-source.test.ts` — updated the line-184 substring assertion (`"more lines truncated)"`) to a regex (`/\(\d+ more lines — use read\(/`) covering the new format.
- `.megapowers/docs/057-inline-source-snippets-in-symbol-card-ou.md` — updated the public `maxSourceLines` description with the new continuation-hint example.

## How to verify

1. Reproduce that the bug is gone:
   ```
   bun test test/repro-078-source-truncation-hint.test.ts
   ```
   Expected: `1 pass, 0 fail` — assertions for `src/big.ts`, `offset: 51`, `limit: 50`, and `read(` all hold.

2. Confirm no regressions across all consumers of `readSourceSnippet`:
   ```
   bun test test/read-source-snippet.test.ts test/tool-symbol-card-source.test.ts test/tool-symbol-graph-source-include.test.ts
   ```
   Expected: `17 pass, 0 fail`.

3. Confirm the doc was updated and the obsolete phrase is gone:
   ```
   grep -n "more lines truncated" .megapowers/docs/057-inline-source-snippets-in-symbol-card-ou.md   # → no matches
   grep -n "use read("            .megapowers/docs/057-inline-source-snippets-in-symbol-card-ou.md   # → 1 match on line 21
   ```

4. Full suite green:
   ```
   bun test
   ```
   Expected: `402 pass, 0 fail` across 163 files (matches verify.md baseline).
