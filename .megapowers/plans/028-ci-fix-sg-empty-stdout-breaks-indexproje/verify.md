# Verification Report — 028-ci-fix-sg-empty-stdout-breaks-indexproje

## Test Suite Results

```
bun test 2>&1
...
168 pass
0 fail
507 expect() calls
Ran 168 tests across 67 files. [4.60s]
```

All 168 tests pass. Exit code 0.

---

## Step 1b: Bug Reproduction — Original Symptom

The spec diagnoses the broken code in historical commit `296616c1`, where `runScan()` had no empty-stdout guard before `JSON.parse(stdout)`. The current commit has the fix.

**Fake-sg condition** (what CI produced): `sg` exits with code `1` and empty `stdout`.

The integration test at `test/indexer-index-project.test.ts:206` directly reproduces this:

```ts
(Bun as any).spawn = (cmd: string[], opts: any) => {
  if (Array.isArray(cmd) && cmd[0] === "sg") {
    return {
      stdout: textStream(""),
      stderr: textStream(""),
      exited: Promise.resolve(1),   // ← exit code 1, empty stdout
    };
  }
  return prevSpawn(cmd as any, opts);
};
await expect(indexProject(root, store, { lspClientFactory: () => fakeClient }))
  .resolves.toEqual({ indexed: 1, skipped: 0, removed: 0, errors: 0 });
```

**Result:** Test passes — no `JSON Parse error: Unexpected EOF` thrown. Symptom no longer occurs.

---

## Per-Criterion Verification

### Criterion 1: `runScan()` returns `[]` when the `sg` subprocess returns empty or whitespace-only stdout for a no-match case

**Code inspection:** `src/indexer/ast-grep.ts:151-152`:
```ts
// sg outputs empty string (not "[]") when no matches found — treat as empty result
if (!stdout.trim()) return [];
```

**Tests run (`test/indexer-ast-grep-scan.test.ts`):**
```
(pass) runScan returns [] when sg exits successfully with empty stdout
(pass) runScan returns [] when sg stdout is whitespace-only
```

Both use injected `ExecFn` stubs (`() => ""` and `() => " \n\t "`) and assert `.resolves.toEqual([])`.

**Verdict:** ✅ PASS

---

### Criterion 2: `runScan()` still throws for genuinely malformed non-empty JSON output

**Test run (`test/indexer-ast-grep-scan.test.ts`):**
```
(pass) runScan still rejects malformed non-empty JSON output [0.15ms]
```

Test uses `malformedExec = async () => "not-json"` and asserts:
```ts
.rejects.toThrow('Invalid sg JSON output: JSON Parse error: Unexpected identifier "not"')
```

The guard `if (!stdout.trim()) return []` only fires for empty/whitespace — `"not-json"` passes through to `JSON.parse()`, which throws, and the error is wrapped.

**Verdict:** ✅ PASS

---

### Criterion 3: `indexProject()` continues successfully when Stage 3 receives a no-match empty-stdout response

**Test run (`test/indexer-index-project.test.ts`):**
```
(pass) indexProject treats empty sg stdout as a no-match Stage 3 result [5.16ms]
```

The test monkey-patches `Bun.spawn` so every `sg` invocation returns exit code `1` with empty stdout, then asserts:
```ts
.resolves.toEqual({ indexed: 1, skipped: 0, removed: 0, errors: 0 })
```
and:
```ts
expect(store.findNodes("alpha", "src/plain.ts")).toHaveLength(1);
```

`indexProject` completes, Stage 1 (tree-sitter) ran correctly, Stage 3 (ast-grep) returned silently.

**Verdict:** ✅ PASS

---

### Criterion 4: At least one regression test covers the subprocess boundary directly, and one integration path confirms `indexProject()` does not fail under the empty-stdout no-match condition

**Subprocess boundary (unit):**
- `test/indexer-ast-grep-scan.test.ts` — lines 70-87, three tests covering empty, whitespace, and malformed inputs to `runScan()` via injected `ExecFn`.

**Integration path:**
- `test/indexer-index-project.test.ts:206-255` — full `indexProject()` run with `Bun.spawn` patched to return empty stdout for `sg`.

Both are in the test suite and pass.

**Verdict:** ✅ PASS

---

## Overall Verdict

**PASS**

All four acceptance criteria are met:

1. `runScan()` guard `if (!stdout.trim()) return []` at `src/indexer/ast-grep.ts:152` handles empty and whitespace-only `sg` output.
2. Malformed non-empty JSON still throws `Invalid sg JSON output` as before.
3. `indexProject()` succeeds end-to-end when Stage 3 receives the CI-style empty-stdout no-match response.
4. Both a unit regression test (subprocess boundary) and an integration regression test (`indexProject` with fake `sg`) are in place and pass.

The original bug symptom (`JSON Parse error: Unexpected EOF` thrown from `runScan()`) no longer occurs under the reproduction conditions.
