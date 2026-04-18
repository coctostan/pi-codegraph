## Task 3: Make symbol_graph default to compact card

Task 3 still does not have a sequential GREEN path.

### Problem: Step 5 cannot pass with the current split
After Task 3 Step 3 flips `symbolGraph()` to the compact-card default, the registered-tool tests in `test/tool-symbol-graph-lsp.test.ts` still call `exec!` with no `include` and still assert legacy neighborhood sections:

```ts
const result = await exec!("tc1", { name: "shared", file: "src/api.ts" }, undefined, undefined, { cwd: projectRoot });
expect(result.content[0].text).toContain("Callers");
```

```ts
const result = await exec!("tc-intf", { name: "IWorker", file: "src/api.ts" }, undefined, undefined, { cwd: projectRoot });
expect(result.content[0].text).toContain("Implemented By");
```

```ts
const result2 = await exec!("tc-a2", { name: "IWorker", file: "src/api.ts" }, undefined, undefined, { cwd: projectRoot });
expect(result2.content[0].text).toContain("Implemented By");
```

Those tests **do not go through runtime schema validation**. They capture `tool.execute` directly:

```ts
let exec: Function | undefined;
const mockPi = {
  registerTool(tool: { name: string; execute: Function }) {
    if (tool.name === "symbol_graph") exec = tool.execute;
  },
  on() {},
};
```

Because of that, your current “move the three `exec!` edits to Task 4” split makes Task 3 Step 5 (`bun test`) impossible.

### Required fix
Put the three `test/tool-symbol-graph-lsp.test.ts` `include: ["neighborhood"]` edits back into **Task 3**, and add that file back to Task 3 metadata/body.

Use these exact call shapes in Task 3:

```ts
const result = await exec!(
  "tc1",
  { name: "shared", file: "src/api.ts", include: ["neighborhood"] },
  undefined,
  undefined,
  { cwd: projectRoot },
);
```

```ts
const result = await exec!(
  "tc-intf",
  { name: "IWorker", file: "src/api.ts", include: ["neighborhood"] },
  undefined,
  undefined,
  { cwd: projectRoot },
);
```

```ts
const result2 = await exec!(
  "tc-a2",
  { name: "IWorker", file: "src/api.ts", include: ["neighborhood"] },
  undefined,
  undefined,
  { cwd: projectRoot },
);
```

Then remove the “Task 4 owns those three LSP edits” text.

### Also update metadata
Task 3 `files_to_modify` must include:

- `test/tool-symbol-graph-lsp.test.ts`

Task 4 must no longer claim ownership of those three `exec!` edits.

---

## Task 4: Validate include values and preserve legacy neighborhood output

Task 4 Step 3 is incomplete for the current codebase.

### Problem: existing include-schema test will fail after schema broadening
Current `test/tool-symbol-graph-include-schema.test.ts` still contains the old negative check:

```ts
if (Value.Check(schema, { name: "foo", include: ["neighborhood"] })) {
  throw new Error('symbol_graph schema accepted include=["neighborhood"]');
}
```

After Task 4 broadens the schema to accept `"neighborhood"` and `"source"`, that existing test file will fail during Step 5 `bun test` unless Task 4 updates it.

### Required fix
Add `test/tool-symbol-graph-include-schema.test.ts` back to **Task 4** metadata/body and explicitly update its schema assertions.

Replace the old schema block with positive/negative checks that match the widened schema, for example:

```ts
if (!Value.Check(schema, { name: "foo", include: ["neighborhood"] })) {
  throw new Error('symbol_graph schema rejected include=["neighborhood"]');
}
if (!Value.Check(schema, { name: "foo", include: ["contract"] })) {
  throw new Error('symbol_graph schema rejected include=["contract"]');
}
if (!Value.Check(schema, { name: "foo", include: ["source"] })) {
  throw new Error('symbol_graph schema rejected include=["source"]');
}
if (Value.Check(schema, { name: "foo", include: ["signals"] })) {
  throw new Error('symbol_graph schema accepted include=["signals"]');
}
```

If you prefer `expect(...)` style, make the replacement equally concrete. Do not leave Task 4 changing the runtime schema without changing this existing test file.

### Also update scope/files
If you move the three LSP `exec!` edits back to Task 3, remove `test/tool-symbol-graph-lsp.test.ts` from Task 4.

---

## Task 5: Add automated docs drift test and update public docs for unified symbol_graph

Task 5 Step 2 is still not accurate for the actual test body.

### Problem: the first failing assertion is currently the README neighborhood example
In your Step 1 test, the first README assertions are:

```ts
expect(readme).toContain('symbol_graph({ name: "validateToken" })');
expect(readme).toContain('include: ["neighborhood"]');
expect(readme).toContain('include: ["contract"]');
expect(readme).toContain('include: ["source"]');
```

Current `README.md` contains:

```md
symbol_graph({ name: "validateToken" })
symbol_graph({ name: "validateToken", file: "src/auth.ts" })
symbol_graph({ name: "validateToken", include: ["contract"] })
```

It does **not** contain `include: ["neighborhood"]` or `include: ["source"]`.

So Bun’s first red will be the missing neighborhood example, not the `"5-tool default public surface"` assertion.

### Required fix
Make Step 2 match the actual first failure.

Either:
1. **Reorder the Step 1 assertions** so the first failure really is the `"5-tool default public surface"` / `symbol_card` / `symbol_contract` drift you describe,

or
2. **Rewrite Step 2** to say the first failure is:

```md
Expected: FAIL — Bun first reports `expect(received).toContain(expected)` against `include: ["neighborhood"]` from `README.md`. The same test also remains red on the missing `include: ["source"]` example, the `"5-tool default public surface"` guide text, and the `README.md` / `ARCHITECTURE.md` `symbol_card` / `symbol_contract` references.
```

Do not leave Step 2 claiming a different first failure than the test body will actually produce.

---

## Task 7: Remove standalone symbol_card and symbol_contract registrations

Task 7 Step 2 is still inaccurate.

### Problem: the failure list does not match the current tests
After your Step 1 edits:

- `test/tool-symbol-card-wiring.test.ts` will fail with `expect(received).toBeUndefined()` because `symbol_card` is still registered.
- `test/tool-symbol-contract-wiring.test.ts` will fail with `expect(received).toBeUndefined()` because `symbol_contract` is still registered.
- `test/extension-tool-descriptions.test.ts` will fail with its **custom thrown error**, not `expect(received).toEqual(expected)`. The current file throws:

```ts
throw new Error(`registered tool list mismatch: ${names.join(",")}`);
```

- `tests/ptc-metadata.test.ts` will still pass before Task 7 Step 3, because it only checks that the listed tools exist; it does not fail on extra registered tools.
- `test/token-tracker-wiring-check.test.ts` will also still pass before Task 7 Step 3, because it only checks that the expected tools are present; it does not fail on extra registered tools.

### Required fix
Rewrite Step 2 so it names only the reds that actually happen.

A correct Step 2 block is:

```md
Run: `bun test test/tool-symbol-card-wiring.test.ts test/tool-symbol-contract-wiring.test.ts test/extension-tool-descriptions.test.ts tests/ptc-metadata.test.ts test/token-tracker-wiring-check.test.ts`
Expected: FAIL — the two wiring tests report `expect(received).toBeUndefined()` because `symbol_card` / `symbol_contract` are still registered in `src/index.ts`, and `test/extension-tool-descriptions.test.ts` throws `Error: registered tool list mismatch: ...` because the default public tool list is still 7 tools. `tests/ptc-metadata.test.ts` and `test/token-tracker-wiring-check.test.ts` are expected to stay green at this step because they do not fail on extra registrations.
```

Do not claim `tests/ptc-metadata.test.ts` or `test/token-tracker-wiring-check.test.ts` are red before the registration removal lands.
