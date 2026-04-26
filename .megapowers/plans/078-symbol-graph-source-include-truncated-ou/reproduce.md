# Reproduction: symbol_graph source include truncates without continuation hint

## Steps to Reproduce

1. Build a `GraphNode` whose body spans more lines than the source-snippet
   limit (e.g. a 100-line function with `maxLines = 50`).
2. Call `readSourceSnippet(node, projectRoot, 50)` from
   `src/output/source.ts`.
3. Inspect `result.text` — the trailing line is the bare truncation notice.

## Expected Behavior

When the body is truncated, the trailing notice should give the agent a
single-line continuation hint referencing the source file, the offset of
the first omitted line, and the number of lines remaining — for
example:

```
(50 more lines — use read("src/big.ts", offset: 51, limit: 50) to see the rest)
```

This satisfies the issue's acceptance criteria:
- includes a `read(file, offset: N)` hint pointing to the first omitted line,
- non-truncated output is unchanged,
- one short line, low token overhead.

## Actual Behavior

The truncation notice contains only the count of omitted lines. There is
no file path, no offset, no `read()` hint:

```
50:a0d9|  // line 50
(50 more lines truncated)
```

The agent sees the truncation count but has no anchored next step. It
must either re-call `symbol_graph` (no source offset control), call
`symbol_card` with a higher `maxSourceLines`, or guess the file path and
line range to feed to `read`.

## Evidence

Failing test output (`bun test test/repro-078-source-truncation-hint.test.ts`):

```
test/repro-078-source-truncation-hint.test.ts:
50 |     // The hint must reference the file path so the agent can call read directly.
51 |     expect(result!.text).toContain("src/big.ts");
                              ^
error: expect(received).toContain(expected)

Expected to contain: "src/big.ts"
Received: "1:cb8f|  // line 1\n…\n50:a0d9|  // line 50\n(50 more lines truncated)"

      at .../test/repro-078-source-truncation-hint.test.ts:51:26
(fail) repro-078: truncated source includes read() continuation hint [8.46ms]

 0 pass
 1 fail
```

Source of the truncation notice — `src/output/source.ts` lines 52–55:

```
52:9b5|  let text = hashlined.join("\n");
53:53d|  if (truncated > 0) {
54:4f1|    text += `\n(${truncated} more lines truncated)`;
55:b18|  }
```

`readSourceSnippet` already has every value the hint needs in scope:
- `node.file`              — the project-relative file path
- `node.start_line + limit` — the first omitted line (1-indexed)
- `truncated`              — the number of lines remaining

So the fix is local to this function; no caller changes required.

The function is the only place that emits the truncation notice — grep:

```
src/output/source.ts:54:    text += `\n(${truncated} more lines truncated)`;
```

The string is consumed verbatim by `symbol_card`/`symbol_graph` source
includes (`src/tools/symbol-card.ts:41` calls `readSourceSnippet`).

## Environment

- Bun 1.3.13
- macOS (darwin), arm64
- pi-codegraph @ branch `fix/078-symbol-graph-source-include-truncated-ou`
- TypeScript / ESM, `bun test` runner

## Failing Test

`test/repro-078-source-truncation-hint.test.ts`

```ts
test("repro-078: truncated source includes read() continuation hint", () => {
  // 100-line function body, maxLines = 50 → 50 lines truncated, first
  // omitted line is 51.
  const result = readSourceSnippet(node, projectRoot, 50);
  expect(result!.truncated).toBe(50);
  expect(result!.text).toContain("src/big.ts");
  expect(result!.text).toMatch(/offset:\s*51\b/);
  expect(result!.text).toMatch(/limit:\s*50\b/);
  expect(result!.text).toMatch(/read\(/);
});
```

The test fails today on the first `toContain("src/big.ts")` assertion
because the truncation notice never references the file. Once the fix
emits a hint such as
`(50 more lines — use read("src/big.ts", offset: 51, limit: 50) to see the rest)`,
all four assertions pass.

The existing snapshot of expected behavior in
`test/read-source-snippet.test.ts` ("readSourceSnippet truncates when
source exceeds maxLines") asserts the old `(15 more lines truncated)`
phrasing and will need to be updated during implement to match the new
hint format. The non-truncated cases in that file already pass and must
remain unchanged (per acceptance criterion #2).

## Reproducibility

Always — pure function of inputs, no I/O outside a tmp dir, no
clock/race dependencies. `bun test test/repro-078-source-truncation-hint.test.ts`
fails deterministically.
