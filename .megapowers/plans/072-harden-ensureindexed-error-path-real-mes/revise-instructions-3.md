## Task 7: RC-D stickiness: clear lastIndexError on evidence of store health

Your Step 1 test is green on baseline (before Task 7's implementation lands). This is not a valid red/green driver. Step 2's expected FAIL is inaccurate.

### Why the test passes without the implementation

Trace of the current test against baseline (Task 1 landed, Task 7 impl not landed):

**call-1** (`listFilesCalls === 1` → throws):
- `getOrCreateStore(root)` opens the pre-populated DB.
- `ensureIndexed` → `indexProject`:
  - Tree-sitter loop at `src/indexer/pipeline.ts:70-94`: for `src/hello.ts`, `store.getFileHash(rel)` matches the `populateStore()` hash, so `skipped++` and no store writes.
  - Stale-cleanup loop at `src/indexer/pipeline.ts:96`: `store.listFiles()` — this is the first `listFiles` call and it throws `"transient scan failure"`.
- `ensureIndexed`'s catch at `src/index.ts:109-112` sets `lastIndexError = Error("transient scan failure")`.
- `symbol_graph` tool runs → `store.findNodes("alpha")` returns the populated node → output includes `"alpha"`.
- `finalizeReadOnlyOutput` prepends `indexing-failed: transient scan failure\n` (Task 1 format).
- call-1 assertions pass ✓

**call-2** (`listFilesCalls === 2` → normal behaviour per your revised test):
- `ensureIndexed` → `indexProject`:
  - Tree-sitter loop: `src/hello.ts` still matches hash → `skipped++`.
  - Stale-cleanup loop: `store.listFiles()` returns `["src/hello.ts"]` → `currentRel.has("src/hello.ts")` is true → no deletions.
  - LSP stage: `TsServerClient` spawn fails (no `tsserver` in the tmp dir) → `isStartupError` branch returns cleanly.
  - Remaining stages no-op.
  - `result = { errors: 0, ... }`.
- `ensureIndexed`'s happy path at `src/index.ts:104-108`: `result.errors === 0` so the `else` branch fires: **`lastIndexError = null`**. This clear happens on baseline today, without any Task 7 code.
- `symbol_graph` output: `finalizeReadOnlyOutput` sees `lastIndexError === null` → `indexingFailedNote()` returns `""` → output contains only `alpha` details.
- call-2 assertions pass ✓

Both calls pass on baseline. There is no red step and no implementation needed — the happy-path clear at `src/index.ts:107` already satisfies the contract you're asserting.

### Two acceptable fixes

Pick **one**:

#### Option A — direct-state regression via the test helpers

Restructure so Task 7 directly asserts the clear-on-success hook on a single tool call, using the existing `getLastIndexErrorForTesting` getter at `src/index.ts:70-72` (already exported today). Task 7 introduces its own `setLastIndexErrorForTesting(err)` helper (Task 8 will later upgrade the signature to include `setAt`, but Task 7 can ship with an `Error`-only signature first).

Replace the test body with:

```ts
test("finalizeReadOnlyOutput clears transient lastIndexError after a successful read", async () => {
  const root = createTestProject();
  dirs.push(root);
  populateStore(root);

  const mod = await import("../src/index.js");
  mod.resetStoreForTesting();

  let sgExecute: Function | undefined;
  const mockPi = {
    registerTool(tool: { name: string; execute: Function }) {
      if (tool.name === "symbol_graph") sgExecute = tool.execute;
    },
    on() {},
  };
  const prevDev = process.env.CODEGRAPH_DEVMODE;
  process.env.CODEGRAPH_DEVMODE = "1";
  try {
    mod.default(mockPi as any);
  } finally {
    if (prevDev === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = prevDev;
  }

  try {
    // Directly simulate a transient failure having been captured.
    mod.setLastIndexErrorForTesting(new Error("transient scan failure"));
    expect(mod.getLastIndexErrorForTesting()?.message).toBe("transient scan failure");

    const ctx = { cwd: root };
    const r1 = await sgExecute!("c1", { name: "alpha" }, undefined, undefined, ctx);
    const t1: string = r1.content[0]?.text ?? "";

    // The tool output on THIS call still carries the accurate message (Task 1's
    // contract): the clear happens AFTER the note is built.
    expect(t1).toContain("alpha");
    expect(t1).toContain("indexing-failed");
    expect(t1).toContain("transient scan failure");

    // Post-prefix clear hook must have wiped the flag by the time the call returns.
    expect(mod.getLastIndexErrorForTesting()).toBeNull();

    // "readonly database" is verified-persistent and must survive the hook.
    mod.setLastIndexErrorForTesting(new Error("readonly database"));
    await sgExecute!("c2", { name: "alpha" }, undefined, undefined, ctx);
    expect(mod.getLastIndexErrorForTesting()?.message).toBe("readonly database");
  } finally {
    mod.setLastIndexErrorForTesting(null);
    mod.resetStoreForTesting();
  }
});
```

Step 3 keeps the post-prefix clear design exactly as you have it. Additionally add the setter helper near `getLastIndexErrorForTesting` at `src/index.ts:70-72`:

```ts
export function setLastIndexErrorForTesting(error: Error | null): void {
  lastIndexError = error;
}
```

Step 2's expected failure becomes a concrete `TypeError: mod.setLastIndexErrorForTesting is not a function` (helper doesn't exist on baseline) or, if you scaffold the setter first, `expect(received).toBeNull(); Received: Error: transient scan failure` (the hook does not exist, so the flag survives call-1).

This design also adds `"readonly database"` persistence coverage that the previous test did not force.

Downstream: Task 8 must **upgrade** the setter signature to the `(error, setAt)` form (matching its current Step 3 body) rather than introduce it. Update Task 8's Step 3 to say "extend" instead of "add" for `setLastIndexErrorForTesting` and add `getIndexingFailedNoteForTesting` as new.

#### Option B — make listFiles throw on every call AND switch to pre-prefix clear, while making Task 1 use the helper-based assertion

This is the structurally clean alternative, but it requires coordinated edits to Task 1:

1. Task 1 introduces `setLastIndexErrorForTesting` + `getIndexingFailedNoteForTesting` helpers.
2. Task 1's red/green driver asserts `getIndexingFailedNoteForTesting()` contains `"tsserver crashed"` rather than asserting against tool output.
3. Task 7 uses `listFiles` throws on every call and pre-prefix clear so both call-1 and call-2 tool outputs are clean.

Most of this refactor is more invasive than Option A, and you already adopted the post-prefix design in Task 8's Step 3. Option A is the recommended minimal fix.

### What to update

- **Task 7 Step 1:** replace the two-call test body with the single-call helper-based assertion above.
- **Task 7 Step 2:** rewrite the expected FAIL to the actual runner output. Either:
  - `TypeError: mod.setLastIndexErrorForTesting is not a function` (if the helper does not exist on baseline), or
  - `error: expect(received).toBeNull()\n\nReceived: [Error: transient scan failure]` (if the helper is scaffolded but the hook is absent).
- **Task 7 Step 3:** keep the post-prefix `finalizeReadOnlyOutput` change and additionally add `setLastIndexErrorForTesting(error: Error | null)` next to `getLastIndexErrorForTesting`.
- **Task 7 Step 4:** describe what PASS looks like — `getLastIndexErrorForTesting()` returns `null` after the symbol_graph call, and the `"readonly database"` case survives.
- **Task 7 files_to_modify:** already correct (`src/index.ts` + the new test file). No change needed.
- **Task 8 Step 3:** change "Add two test-only helpers" to "Extend `setLastIndexErrorForTesting` to accept an optional `setAt` timestamp, and add `getIndexingFailedNoteForTesting`". The new `setLastIndexErrorForTesting` signature becomes:

  ```ts
  export function setLastIndexErrorForTesting(error: Error | null, setAt: number = Date.now()): void {
    lastIndexError = error ? { error, setAt } : null;
  }
  ```

  This replaces Task 7's simpler setter when the `IndexErrorRecord` shape lands.

Do not resubmit with a Task 7 test whose red step is not actually red. The plan cannot be approved until Task 7 has a valid red/green driver for Fixed When #6.
