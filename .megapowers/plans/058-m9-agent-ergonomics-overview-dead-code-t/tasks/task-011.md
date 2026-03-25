---
id: 11
title: "token-tracker: estimateNaiveCost and session accumulation"
status: approved
depends_on: []
no_test: false
files_to_modify: []
files_to_create:
  - src/tools/token-tracker.ts
  - test/token-tracker.test.ts
---

### Task 11: token-tracker: estimateNaiveCost and session accumulation

**Files:**
- Create: `src/tools/token-tracker.ts`
- Create: `test/token-tracker.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/token-tracker.test.ts
import { expect, test, beforeEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  estimateNaiveCost,
  trackCall,
  getSessionStats,
  resetSession,
  formatMetaLine,
} from "../src/tools/token-tracker.js";

beforeEach(() => {
  resetSession();
});

test("estimateNaiveCost sums file sizes and divides by 4", () => {
  const projectRoot = join(tmpdir(), `pi-cg-token-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  // 40 chars -> 10 tokens
  writeFileSync(join(projectRoot, "src/a.ts"), "a".repeat(40));
  // 80 chars -> 20 tokens
  writeFileSync(join(projectRoot, "src/b.ts"), "b".repeat(80));

  try {
    const cost = estimateNaiveCost(["src/a.ts", "src/b.ts"], projectRoot);
    expect(cost).toBe(30); // (40 + 80) / 4
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("estimateNaiveCost ignores missing files", () => {
  const projectRoot = join(tmpdir(), `pi-cg-token-missing-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/a.ts"), "a".repeat(40));

  try {
    const cost = estimateNaiveCost(["src/a.ts", "src/nonexistent.ts"], projectRoot);
    expect(cost).toBe(10); // only a.ts counts
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("trackCall accumulates session stats", () => {
  trackCall("symbol_graph", 100, 20);
  trackCall("trace", 200, 30);

  const stats = getSessionStats();
  expect(stats.totalCalls).toBe(2);
  expect(stats.totalTokensSaved).toBe(250); // (100-20) + (200-30)
});

test("resetSession clears accumulated stats", () => {
  trackCall("symbol_graph", 100, 20);
  resetSession();

  const stats = getSessionStats();
  expect(stats.totalCalls).toBe(0);
  expect(stats.totalTokensSaved).toBe(0);
});

test("formatMetaLine includes per-call and session stats", () => {
  trackCall("symbol_graph", 100, 20);
  const line = formatMetaLine("trace", 200, 30);
  // After formatMetaLine, trackCall for "trace" should have been called internally
  expect(line).toContain("tokens_saved:170");
  expect(line).toContain("naive_tokens:200");
  expect(line).toContain("actual_tokens:30");
  expect(line).toContain("session_calls:2");
  expect(line).toContain("session_tokens_saved:250");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/token-tracker.test.ts`
Expected: FAIL — `error: Cannot find module "../src/tools/token-tracker.js"`

**Step 3 — Write minimal implementation**

```typescript
// src/tools/token-tracker.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

interface SessionStats {
  totalCalls: number;
  totalTokensSaved: number;
}

let session: SessionStats = { totalCalls: 0, totalTokensSaved: 0 };

export function estimateNaiveCost(files: string[], projectRoot: string): number {
  let totalBytes = 0;
  for (const file of files) {
    try {
      const content = readFileSync(join(projectRoot, file), "utf8");
      totalBytes += content.length;
    } catch {
      // File missing or unreadable — skip
    }
  }
  return Math.floor(totalBytes / 4);
}

export function trackCall(toolName: string, naiveTokens: number, actualTokens: number): void {
  session.totalCalls += 1;
  session.totalTokensSaved += Math.max(0, naiveTokens - actualTokens);
}

export function getSessionStats(): SessionStats {
  return { ...session };
}

export function resetSession(): void {
  session = { totalCalls: 0, totalTokensSaved: 0 };
}

export function formatMetaLine(toolName: string, naiveTokens: number, actualTokens: number): string {
  trackCall(toolName, naiveTokens, actualTokens);
  const saved = Math.max(0, naiveTokens - actualTokens);
  return `_meta: tokens_saved:${saved} naive_tokens:${naiveTokens} actual_tokens:${actualTokens} session_calls:${session.totalCalls} session_tokens_saved:${session.totalTokensSaved}`;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/token-tracker.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
