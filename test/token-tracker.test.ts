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
  writeFileSync(join(projectRoot, "src/a.ts"), "a".repeat(40));
  writeFileSync(join(projectRoot, "src/b.ts"), "b".repeat(80));
  try {
    const cost = estimateNaiveCost(["src/a.ts", "src/b.ts"], projectRoot);
    expect(cost).toBe(30);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("estimateNaiveCost ignores missing files", () => {
  const pr = join(tmpdir(), `pi-cg-token-m-${Date.now()}`);
  mkdirSync(join(pr, "src"), { recursive: true });
  writeFileSync(join(pr, "src/a.ts"), "a".repeat(40));
  try {
    expect(estimateNaiveCost(["src/a.ts", "src/x.ts"], pr)).toBe(10);
  } finally {
    rmSync(pr, { recursive: true, force: true });
  }
});

test("trackCall accumulates session stats", () => {
  trackCall("symbol_graph", 100, 20);
  trackCall("trace", 200, 30);
  const s = getSessionStats();
  expect(s.totalCalls).toBe(2);
  expect(s.totalTokensSaved).toBe(250);
});

test("resetSession clears accumulated stats", () => {
  trackCall("symbol_graph", 100, 20);
  resetSession();
  const s = getSessionStats();
  expect(s.totalCalls).toBe(0);
  expect(s.totalTokensSaved).toBe(0);
});

test("formatMetaLine includes per-call and session stats", () => {
  trackCall("symbol_graph", 100, 20);
  const line = formatMetaLine("trace", 200, 30);
  expect(line).toContain("tokens_saved:170");
  expect(line).toContain("naive_tokens:200");
  expect(line).toContain("actual_tokens:30");
  expect(line).toContain("session_calls:2");
  expect(line).toContain("session_tokens_saved:250");
});
