---
id: 1
title: Add pi-hashline-compatible line hash helper
status: approved
depends_on: []
no_test: false
files_to_modify:
  - package.json
  - bun.lock
  - src/output/anchoring.ts
files_to_create:
  - test/output-hashline-compat.test.ts
---

Covers AC 1, AC 2, AC 3, AC 4, AC 17.

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `src/output/anchoring.ts`
- Create: `test/output-hashline-compat.test.ts`

**Step 1 — Write the failing test**
Create `test/output-hashline-compat.test.ts`:

```ts
import { expect, test } from "bun:test";
import { computeLineHash, ensureHashInit } from "../src/output/anchoring.js";

test("computeLineHash matches pi-hashline-readmap golden vectors", async () => {
  await ensureHashInit();

  expect(computeLineHash(1, "export function foo() {}" )).toBe("c27");
  expect(computeLineHash(1, "export   function foo() {}")).toBe("c27");
  expect(computeLineHash(1, "  return 1;")).toBe("0da");
  expect(computeLineHash(1, "  return 1;\r")).toBe("0da");
  expect(computeLineHash(1, "")).toBe("d05");
  expect(computeLineHash(1, "   \t  ")).toBe("d05");
});

test("computeLineHash fails clearly before hash initialization", async () => {
  const mod = await import(`../src/output/anchoring.js?uninit-${Date.now()}`);
  expect(() => mod.computeLineHash(1, "export function foo() {}"))
    .toThrow("Hash not initialized — call ensureHashInit() first");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-hashline-compat.test.ts`
Expected: FAIL — `SyntaxError: Export named 'computeLineHash' not found in module '../src/output/anchoring.js'.`

**Step 3 — Write minimal implementation**
Add dependency in `package.json` under `dependencies`:

```json
"xxhash-wasm": "^1.1.0"
```

Run `bun install` to update `bun.lock`.

In `src/output/anchoring.ts`, add the xxhash helper code near the top of the file while keeping existing `sha256Hex` for file-level stale detection:

```ts
import xxhashWasm from "xxhash-wasm";

const HASH_LEN = 3;
const RADIX = 16;
const HASH_MOD = RADIX ** HASH_LEN;
const HASH_DICT = Array.from({ length: HASH_MOD }, (_, i) => i.toString(RADIX).padStart(HASH_LEN, "0"));

let h32Fn: ((input: string, seed?: number) => number) | null = null;
let initPromise: Promise<void> | null = null;

export async function ensureHashInit(): Promise<void> {
  if (h32Fn) return;
  if (!initPromise) {
    initPromise = xxhashWasm().then((hasher) => {
      h32Fn = hasher.h32;
    });
  }
  await initPromise;
}

function xxh32(input: string): number {
  if (!h32Fn) throw new Error("Hash not initialized — call ensureHashInit() first");
  return h32Fn(input, 0) >>> 0;
}

export function computeLineHash(_lineNumber: number, line: string): string {
  if (line.endsWith("\r")) line = line.slice(0, -1);
  line = line.replace(/\s+/g, "");
  return HASH_DICT[xxh32(line) % HASH_MOD]!;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-hashline-compat.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: PASS — all tests passing.
