import { expect, test } from "bun:test";

import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile marks exported symbols with is_exported metadata", () => {
  const file = "src/exported.ts";
  const content = [
    "export function exportedFn() {}",
    "function localFn() {}",
    "export class ExportedClass {}",
    "class LocalClass {}",
    "export interface ExportedInterface {}",
    "interface LocalInterface {}",
    "export const exportedArrow = () => {};",
    "const localArrow = () => {};",
  ].join("\n");

  const result = extractFile(file, content);
  const byName = new Map(result.nodes.map((node) => [node.name, node]));

  expect(result.module.is_exported).toBe(false);

  expect(byName.get("exportedFn")?.is_exported).toBe(true);
  expect(byName.get("localFn")?.is_exported).toBe(false);

  expect(byName.get("ExportedClass")?.is_exported).toBe(true);
  expect(byName.get("LocalClass")?.is_exported).toBe(false);

  expect(byName.get("ExportedInterface")?.is_exported).toBe(true);
  expect(byName.get("LocalInterface")?.is_exported).toBe(false);

  expect(byName.get("exportedArrow")?.is_exported).toBe(true);
  expect(byName.get("localArrow")?.is_exported).toBe(false);
});
