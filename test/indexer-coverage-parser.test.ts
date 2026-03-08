import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCoverageReports } from "../src/indexer/coverage.js";

test("parseCoverageReports normalizes coverage deterministically, ignores unsupported URLs, and skips malformed entries without aborting", () => {
  const projectRoot = join(tmpdir(), `pi-cg-coverage-parser-${Date.now()}`);
  const coverageDir = join(projectRoot, ".codegraph", "coverage");
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(coverageDir, { recursive: true });

  const appSource = [
    "export function prod() {",
    "  return 1;",
    "}",
    "",
    "export function helper() {",
    "  return prod();",
    "}",
    "",
  ].join("\n");
  const testSource = [
    "export function prodTest() {",
    "  return 1;",
    "}",
    "",
  ].join("\n");

  writeFileSync(join(projectRoot, "src", "app.ts"), appSource);
  writeFileSync(join(projectRoot, "src", "app.test.ts"), testSource);

  const appText = readFileSync(join(projectRoot, "src", "app.ts"), "utf8");
  const testText = readFileSync(join(projectRoot, "src", "app.test.ts"), "utf8");
  const prodStart = appText.indexOf("export function prod");
  const prodEnd = appText.indexOf("\n\nexport function helper") + 1;
  const helperStart = appText.indexOf("export function helper");
  const helperEnd = appText.length;
  const testStart = testText.indexOf("export function prodTest");
  const testEnd = testText.length;

  writeFileSync(
    join(coverageDir, "b-report.json"),
    JSON.stringify({
      result: [
        {
          url: new URL(`file://${join(projectRoot, "src", "app.ts")}`).href,
          functions: [
            { functionName: "helper", ranges: [{ startOffset: helperStart, endOffset: helperEnd, count: 1 }] },
            { functionName: "prod", ranges: [{ startOffset: prodStart, endOffset: prodEnd, count: 1 }] },
          ],
        },
        {
          url: "https://example.com/outside.ts",
          functions: [
            { functionName: "external", ranges: [{ startOffset: 0, endOffset: 1, count: 1 }] },
          ],
        },
        {
          url: new URL(`file://${join(projectRoot, "src", "missing.ts")}`).href,
          functions: [
            { functionName: "broken", ranges: [{ startOffset: 0, endOffset: 1, count: 1 }] },
          ],
        },
      ],
    }),
  );

  writeFileSync(
    join(coverageDir, "a-report.json"),
    JSON.stringify({
      result: [
        {
          url: new URL(`file://${join(projectRoot, "src", "app.test.ts")}`).href,
          functions: [
            { functionName: "prodTest", ranges: [{ startOffset: testStart, endOffset: testEnd, count: 1 }] },
          ],
        },
        {
          url: new URL(`file://${join(projectRoot, "src", "notes.js")}`).href,
          functions: [
            { functionName: "ignoredJs", ranges: [{ startOffset: 0, endOffset: 1, count: 1 }] },
          ],
        },
        {
          url: new URL(`file://${join(projectRoot, "src", "app.ts")}`).href,
          functions: "not-an-array",
        },
      ],
    }),
  );

  writeFileSync(join(coverageDir, "c-malformed.json"), "{ not valid json");

  try {
    const first = parseCoverageReports(projectRoot, coverageDir);
    const second = parseCoverageReports(projectRoot, coverageDir);
    const expected = [
      ["src/app.test.ts", "prodTest", 1, 4],
      ["src/app.ts", "helper", 5, 8],
      ["src/app.ts", "prod", 1, 4],
    ];

    expect(first.map((record) => [record.file, record.functionName, record.startLine, record.endLine])).toEqual(expected);
    expect(second.map((record) => [record.file, record.functionName, record.startLine, record.endLine])).toEqual(expected);
    expect(first.some((record) => record.functionName === "external")).toBe(false);
    expect(first.some((record) => record.functionName === "ignoredJs")).toBe(false);
    expect(first.some((record) => record.functionName === "broken")).toBe(false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
