## Task 3: Report symbol graph freshness

Step 1 still leaves existing-test updates too ambiguous/incomplete. In `test/tool-symbol-graph-trust-header.test.ts`, the current legacy assertions are:

```ts
expect(freshLines[0]).toBe("## Trust");
expect(freshLines[1]).toBe("status: fresh");
expect(freshLines[2]).toBe("evidence: agent  stale-files: 0/1");
// ...
expect(mixedLines[0]).toBe("## Trust");
expect(mixedLines[1]).toBe("status: mixed");
expect(mixedLines[2]).toBe("evidence: agent  stale-files: 0/1");
```

Your task currently says to replace only the “first-line assertions”, which would leave the `status:` and `evidence:` assertions behind and `bun test` would still fail. Replace the instruction with an exact replacement for the whole legacy header assertion block:

```ts
expect(freshLines[0]).toBe("Trust: fresh");
expect(freshOutput).toContain("## foo (function)");
expect(freshOutput).not.toContain("bar  calls  confidence:0.7  agent [stale]");

// ... after mixedOutput
expect(mixedLines[0]).toBe("Trust: partial");
expect(mixedOutput).toContain("changed files: src/a.ts");
expect(mixedOutput).toContain("stale edges: 1");
expect(mixedOutput).toContain("bar  calls  confidence:0.7  agent [stale]");
```

Also make the `test/tool-symbol-graph-contract-include.test.ts` instructions explicit for both existing `## Trust` count assertions. Replace both occurrences of:

```ts
expect((withContract.match(/## Trust/g) ?? []).length).toBe(1);
```

with:

```ts
expect((withContract.match(/^Trust: /gm) ?? []).length).toBe(1);
```

Finally, split the new test named `symbolGraph reports stale target and partial stale neighborhood evidence`. It currently tests fresh output, partial stale neighborhood output, and stale target output in one `test(...)`. Keep the same test file, but use two focused tests:

```ts
test("symbolGraph reports partial freshness for stale returned neighborhood evidence", () => {
  // same foo/bar setup
  const fresh = symbolGraph({ name: "foo", include: ["neighborhood"], store, projectRoot });
  expect(fresh.split("\n")[0]).toBe("Trust: fresh");

  writeFileSync(join(projectRoot, "src", "bar.ts"), "export function bar() { return 2; }\n");
  const partial = symbolGraph({ name: "foo", include: ["neighborhood"], store, projectRoot });
  expect(partial).toContain("Trust: partial");
  expect(partial).toContain("changed files: src/bar.ts");
  expect(partial).toContain("affected symbols: bar");
  expect(partial).toContain("bar  calls  confidence:0.8  tree-sitter [stale]");
});

test("symbolGraph reports stale freshness when the target symbol file changed", () => {
  // same foo/bar setup, without mutating bar.ts first
  writeFileSync(join(projectRoot, "src", "foo.ts"), "export function foo() { return bar() + 1; }\n");
  const stale = symbolGraph({ name: "foo", include: ["neighborhood"], store, projectRoot });
  expect(stale).toContain("Trust: stale");
  expect(stale).toContain("changed files: src/foo.ts");
  expect(stale).toContain("affected symbols: bar, foo");
});
```

Keep the existing separate omitted-neighbor limit regression test.

## Task 5: Warn on unreliable coverage trace freshness

The existing-test update instructions are incorrect/incomplete for several trace tests.

### `test/tool-trace-trust-heuristic.test.ts`

The current assertions are:

```ts
expect(lines[0]).toBe("## Trust");
expect(lines[1]).toBe("status: heuristic");
expect(lines[2]).toBe("evidence: tree-sitter  stale-files: 0/1");
expect(lines[3]).toBe("mode: static (heuristic, no runtime evidence)");
expect(lines[4]).toContain("src/app.ts:1:");
expect(lines[4]).toContain("entry  function");
```

Replace the whole block with compact-header indexes:

```ts
expect(lines[0]).toBe("Trust: fresh");
expect(lines[1]).toBe("mode: static (heuristic, no runtime evidence)");
expect(lines[2]).toContain("src/app.ts:1:");
expect(lines[2]).toContain("entry  function");
```

### `test/tool-trace-static-mode-header.test.ts`

Replace the current legacy header/index assertions:

```ts
expect(lines[0]).toBe("## Trust");
expect(lines[1]).toBe("status: heuristic");
expect(lines[3]).toBe("mode: static (heuristic, no runtime evidence)");
expect(lines[4]).toContain("src/app.ts:1:");
expect(lines[4]).toContain("entry  function");
expect(lines).toHaveLength(7);
```

with:

```ts
expect(lines[0]).toBe("Trust: fresh");
expect(lines[1]).toBe("mode: static (heuristic, no runtime evidence)");
expect(lines[2]).toContain("src/app.ts:1:");
expect(lines[2]).toContain("entry  function");
expect(lines).toHaveLength(5);
```

### `test/tool-trace-trust-runtime.test.ts`

Replace the full fresh/mixed legacy header assertion blocks, not only the status lines:

```ts
expect(freshLines[0]).toBe("Trust: fresh");
expect(freshLines[1]).toBe("mode: coverage");
expect(freshOutput).not.toContain("function [stale]");

// ... after mixedOutput
expect(mixedLines[0]).toBe("Trust: partial");
expect(mixedOutput).toContain("changed files: src/app.ts");
expect(mixedOutput).toContain("trace path may be unreliable; refresh index before relying on this result");
expect(mixedOutput).toContain("mode: coverage [stale]");
expect(mixedOutput).toContain("prod  function [stale]");
```

### `test/tool-trace-signals.test.ts`

The current task instruction says this should be `Trust: fresh` and static mode, but this existing test is a stale coverage trace: it seeds fake `content_hash` values (`"h-test"`, `"h-app"`) against real source files and expects `mode: coverage [stale]`. Replace the current assertions:

```ts
expect(lines[0]).toBe("## Trust");
expect(lines[3]).toBe("mode: coverage [stale]");
```

with:

```ts
expect(lines[0]).toBe("Trust: partial");
expect(lines).toContain("mode: coverage [stale]");
```

Keep the existing role-tag regex assertions unchanged; they should search all lines as they already do.

### `test/extension-suppress-trust-header-trace.test.ts` and `test/extension-readonly-trust-gating.test.ts`

Your compact assertions are directionally right, but ensure the old `## Trust`/`status: heuristic` expectations are fully removed. The unsuppressed trace assertion should be exactly:

```ts
expect(baselineText.startsWith("Trust: fresh\nmode: static (heuristic, no runtime evidence)")).toBe(true);
```

and suppressed output should assert both header forms are absent:

```ts
expect(suppressedText.includes("## Trust")).toBe(false);
expect(suppressedText.includes("Trust: ")).toBe(false);
expect(suppressedText).toContain("mode: static (heuristic, no runtime evidence)");
```
