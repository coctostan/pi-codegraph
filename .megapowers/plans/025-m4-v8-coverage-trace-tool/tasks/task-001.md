---
id: 1
title: Add deterministic V8 coverage parser
status: approved
depends_on: []
no_test: false
files_to_modify: []
files_to_create:
  - src/indexer/coverage.ts
  - test/indexer-coverage-parser.test.ts
---

### Task 1: Add deterministic V8 coverage parser
- Create: `src/indexer/coverage.ts`
- Create: `test/indexer-coverage-parser.test.ts`
**ACs covered:** 1, 2, 3, 4

**Step 1 — Write the failing test**
```ts
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
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-coverage-parser.test.ts`
Expected: FAIL — `Cannot find module '../src/indexer/coverage.js' from 'test/indexer-coverage-parser.test.ts'`

**Step 3 — Write minimal implementation**
`src/indexer/coverage.ts`
```ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface NormalizedCoverageRecord {
  reportFile: string;
  file: string;
  functionName: string;
  startOffset: number;
  endOffset: number;
  startLine: number;
  endLine: number;
  count: number;
}

function toPosixPath(value: string): string {
  return value.split("\\").join("/");
}

function countLineAtOffset(content: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < Math.min(offset, content.length); index++) {
    if (content[index] === "\n") line++;
  }
  return line;
}

function isProjectLocalTsFile(projectRoot: string, filePath: string): boolean {
  const resolvedRoot = resolve(projectRoot);
  const resolvedFile = resolve(filePath);
  if (!resolvedFile.startsWith(resolvedRoot)) return false;
  return resolvedFile.endsWith(".ts") || resolvedFile.endsWith(".tsx");
}

export function parseCoverageReports(projectRoot: string, coverageDir: string): NormalizedCoverageRecord[] {
  if (!existsSync(coverageDir)) return [];

  const records: NormalizedCoverageRecord[] = [];
  const fileNames = readdirSync(coverageDir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  for (const fileName of fileNames) {
    let raw: { result?: unknown[] };
    try {
      raw = JSON.parse(readFileSync(resolve(coverageDir, fileName), "utf8")) as { result?: unknown[] };
    } catch {
      continue;
    }

    for (const entry of raw.result ?? []) {
      try {
        if (!entry || typeof entry !== "object") continue;
        const url = (entry as { url?: unknown }).url;
        const functions = (entry as { functions?: unknown }).functions;
        if (typeof url !== "string" || !Array.isArray(functions)) continue;

        const filePath = url.startsWith("file://") ? fileURLToPath(url) : url;
        if (!isAbsolute(filePath) || !isProjectLocalTsFile(projectRoot, filePath)) continue;

        const content = readFileSync(filePath, "utf8");
        const relFile = toPosixPath(relative(projectRoot, filePath));

        for (const fn of functions) {
          if (!fn || typeof fn !== "object") continue;
          const functionName = (fn as { functionName?: unknown }).functionName;
          const ranges = (fn as { ranges?: unknown }).ranges;
          if (typeof functionName !== "string" || !Array.isArray(ranges)) continue;

          const firstCoveredRange = ranges.find((range) => {
            if (!range || typeof range !== "object") return false;
            const count = (range as { count?: unknown }).count;
            return typeof count === "number" && count > 0;
          }) as { startOffset: number; endOffset: number; count: number } | undefined;

          if (!firstCoveredRange) continue;
          if (typeof firstCoveredRange.startOffset !== "number") continue;
          if (typeof firstCoveredRange.endOffset !== "number") continue;
          if (typeof firstCoveredRange.count !== "number") continue;

          records.push({
            reportFile: fileName,
            file: relFile,
            functionName,
            startOffset: firstCoveredRange.startOffset,
            endOffset: firstCoveredRange.endOffset,
            startLine: countLineAtOffset(content, firstCoveredRange.startOffset),
            endLine: countLineAtOffset(content, Math.max(firstCoveredRange.endOffset - 1, firstCoveredRange.startOffset)),
            count: firstCoveredRange.count,
          });
        }
      } catch {
        continue;
      }
    }
  }

  return records.sort((a, b) => {
    return a.reportFile.localeCompare(b.reportFile)
      || a.file.localeCompare(b.file)
      || a.functionName.localeCompare(b.functionName)
      || a.startLine - b.startLine
      || a.endLine - b.endLine;
  });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-coverage-parser.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
