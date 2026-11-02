import { expect, test } from "bun:test";
import { extractAnswer, grade } from "../bench/grade.js";

const key = { all: ["tools/impact.ts", "tools/trace.ts"], none: ["output/anchoring.ts"] };

test("extractAnswer takes the last <answer> block, trimmed", () => {
  const text = "I think <answer>draft</answer> then\n<answer>\nsrc/tools/trace.ts\n</answer>\n";
  expect(extractAnswer(text)).toBe("src/tools/trace.ts");
});

test("extractAnswer returns null when the reply has no closed answer block", () => {
  expect(extractAnswer("src/tools/trace.ts")).toBeNull();
  expect(extractAnswer("<answer>src/tools/trace.ts")).toBeNull();
});

test("grade is correct when every key item appears and no forbidden one does", () => {
  const result = grade(key, "<answer>\n- src/tools/impact.ts\n- src/tools/trace.ts\n</answer>");
  expect(result).toEqual({ correct: true, answer: "- src/tools/impact.ts\n- src/tools/trace.ts", missing: [], unexpected: [] });
});

test("grade lists missing and forbidden items and marks the cell incorrect", () => {
  const result = grade(key, "<answer>src/tools/impact.ts, src/output/anchoring.ts</answer>");
  expect(result.correct).toBe(false);
  expect(result.missing).toEqual(["tools/trace.ts"]);
  expect(result.unexpected).toEqual(["output/anchoring.ts"]);
});

test("grade ignores key items outside the answer block and fails a reply without one", () => {
  const result = grade(key, "Found tools/impact.ts and tools/trace.ts.");
  expect(result).toEqual({ correct: false, answer: null, missing: key.all, unexpected: [] });
});
