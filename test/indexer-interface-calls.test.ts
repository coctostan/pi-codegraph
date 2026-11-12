import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";
import { TsServerClient } from "../src/indexer/tsserver-client.js";
import { impactResult } from "../src/tools/impact.js";

// `total` calls `s.area()` on a `Shape`, the interface `Square` and `Circle` implement, then `double`.
const SHAPE = ["export interface Shape {", "  area(): number;", "}", ""].join("\n");
const shapeClass = (name: string, value: number, implementsShape = true) =>
  [
    'import type { Shape } from "./shape";',
    `export class ${name}${implementsShape ? " implements Shape" : ""} {`,
    "  area(): number {",
    `    return ${value};`,
    "  }",
    "}",
    "",
  ].join("\n");
const USE = [
  'import type { Shape } from "./shape";',
  "export function total(shapes: Shape[]): number {",
  "  let sum = 0;",
  "  for (const s of shapes) sum += s.area();",
  "  return double(sum);",
  "}",
  "export function double(n: number): number {",
  "  return n * 2;",
  "}",
  "",
].join("\n");
const TOTAL_ROW = /^src\/use\.ts {2}2:[0-9a-f]{3} {2}total {2}behavioral {2}depth:1$/m;

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

/** The fixture in a temp dir, on this repo's tsserver. */
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "pi-cg-interface-calls-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "shape.ts"), SHAPE);
  writeFileSync(join(root, "src", "square.ts"), shapeClass("Square", 4));
  writeFileSync(join(root, "src", "circle.ts"), shapeClass("Circle", 3));
  writeFileSync(join(root, "src", "use.ts"), USE);
  writeFileSync(join(root, "tsconfig.json"), '{ "include": ["src"] }\n');
  // The client takes a project's own tsserver before one on PATH, which CI's runners lack.
  mkdirSync(join(root, "node_modules", ".bin"), { recursive: true });
  symlinkSync(join(import.meta.dir, "..", "node_modules", "typescript", "bin", "tsserver"), join(root, "node_modules", ".bin", "tsserver"));
  cleanup = () => rmSync(root, { recursive: true, force: true });
  return root;
}

const impact = (root: string, store: SqliteGraphStore, symbol: string) =>
  impactResult({ symbols: [symbol], changeType: "behavior_change", maxDepth: 1, store, projectRoot: root }).text;

test("impact on each class member implementing an interface member lists the caller through the interface", async () => {
  const root = fixture();
  const store = new SqliteGraphStore();
  try {
    await indexProject(root, store);
    expect(impact(root, store, "Square.area")).toMatch(TOTAL_ROW);
    expect(impact(root, store, "Circle.area")).toMatch(TOTAL_ROW);
  } finally {
    store.close();
  }
});

test("a class that starts implementing the interface gains the caller, its caller's file unchanged", async () => {
  const root = fixture();
  const store = new SqliteGraphStore();
  try {
    await indexProject(root, store);
    writeFileSync(join(root, "src", "triangle.ts"), shapeClass("Triangle", 5));
    await indexProject(root, store);
    expect(impact(root, store, "Triangle.area")).toMatch(TOTAL_ROW);
  } finally {
    store.close();
  }
});

test("a class that stops implementing the interface loses the caller, the others and the caller's other calls kept", async () => {
  const root = fixture();
  const store = new SqliteGraphStore();
  try {
    await indexProject(root, store);
    writeFileSync(join(root, "src", "circle.ts"), shapeClass("Circle", 3, false));
    await indexProject(root, store);
    expect(impact(root, store, "Circle.area")).not.toMatch(TOTAL_ROW);
    expect(impact(root, store, "Square.area")).toMatch(TOTAL_ROW);
    expect(impact(root, store, "double")).toMatch(TOTAL_ROW);
  } finally {
    store.close();
  }
});

test("a failed implementations lookup records the call's lookup failed until a run answers", async () => {
  const root = fixture();
  const store = new SqliteGraphStore();
  const failing = (projectRoot: string) => {
    const client = new TsServerClient(projectRoot);
    client.implementations = async () => {
      throw new Error("TsServer request timed out: implementation");
    };
    return client;
  };
  try {
    await indexProject(root, store, { lspClientFactory: failing });
    expect(store.getFailures()).toEqual([{ kind: "definition", source: "src/use.ts::total:2", evidence: "area:4:36" }]);
    expect(impact(root, store, "Square.area")).toStartWith("Trust: partial\n");
    await indexProject(root, store);
    expect(store.getFailures()).toEqual([]);
    expect(impact(root, store, "Square.area")).toMatch(TOTAL_ROW);
  } finally {
    store.close();
  }
});
