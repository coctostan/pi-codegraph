import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("public docs describe symbol_graph as the unified lookup surface", () => {
  const readme = read("README.md");
  const architecture = read("ARCHITECTURE.md");
  const guide = read("docs/tool-descriptions.md");

  expect(readme).toContain('symbol_graph({ name: "validateToken" })');
  expect(readme).toContain('include: ["neighborhood"]');
  expect(readme).toContain('include: ["contract"]');
  expect(readme).toContain('include: ["source"]');
  expect(readme).not.toContain("#### `symbol_card`");
  expect(readme).not.toContain("#### `symbol_contract`");

  expect(architecture).toContain("symbol_graph");
  expect(architecture).not.toContain("symbol_card tool");
  expect(architecture).not.toContain("symbol_contract tool");

  expect(guide).toContain("5-tool default public surface");
  expect(guide).toContain("internal-only `symbol_search`");
});
