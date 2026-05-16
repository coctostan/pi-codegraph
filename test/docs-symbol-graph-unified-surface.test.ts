import { test } from "bun:test";
import { readFileSync } from "node:fs";
const read = (path: string) => readFileSync(path, "utf8");

test("public docs explain symbol_graph include values without implying tests is valid", () => {
  const readme = read("README.md");
  const architecture = read("ARCHITECTURE.md");
  const guide = read("docs/tool-descriptions.md");
  const expectedDescription = "Summarize a symbol with relationships, tests, and key metadata.";
  const expectedIncludeGuidance =
    'Allowed include values: `"neighborhood"`, `"contract"`, `"source"`. `"tests"` is not a valid include value.';
  const expectedDefaultGuidance =
    'By default, `symbol_graph({ name: "validateToken" })` already includes test signals in the compact card.';

  if (!readme.includes(expectedIncludeGuidance)) {
    throw new Error("README is missing explicit symbol_graph include guidance");
  }
  if (!readme.includes(expectedDefaultGuidance)) {
    throw new Error("README is missing default symbol_graph test-signals guidance");
  }
  if (!readme.includes(expectedDescription)) {
    throw new Error("README is missing compact symbol_graph description");
  }
  if (readme.includes("Return a compact symbol summary with relationships, test signals, and key metadata.")) {
    throw new Error("README still uses previous symbol_graph wording");
  }
  if (readme.includes("#### `symbol_card`")) {
    throw new Error("README must not reintroduce the removed symbol_card section");
  }
  if (readme.includes("#### `symbol_contract`")) {
    throw new Error("README must not reintroduce the removed symbol_contract section");
  }
  if (!readme.includes('symbol_graph({ name: "validateToken", include: ["neighborhood"] })')) {
    throw new Error("README lost neighborhood include example");
  }
  if (!readme.includes('symbol_graph({ name: "validateToken", include: ["contract"] })')) {
    throw new Error("README lost contract include example");
  }
  if (!readme.includes('symbol_graph({ name: "validateToken", include: ["source"] })')) {
    throw new Error("README lost source include example");
  }
  if (!readme.includes('symbol_graph({ name: "validateToken", include: ["neighborhood", "contract", "source"] })')) {
    throw new Error("README lost combined include example");
  }
  if (readme.includes('include: ["tests"]')) {
    throw new Error("README must not show tests as a valid include example");
  }

  if (!guide.includes(`- \`${expectedDescription}\``)) {
    throw new Error("tool description guide is missing updated symbol_graph example");
  }
  if (guide.includes("Return a symbol's callers, callees, tests, and key signals.")) {
    throw new Error("tool description guide still uses previous symbol_graph wording");
  }
  if (!guide.includes("Parameter-level notes such as `symbol_graph.include` usage belong in README or schema docs, not in top-level tool descriptions.")) {
    throw new Error("tool description guide lost the schema-vs-description guidance");
  }

  if (!architecture.includes("symbol_graph")) {
    throw new Error("ARCHITECTURE.md lost symbol_graph reference");
  }
  if (architecture.includes("symbol_card tool")) {
    throw new Error("ARCHITECTURE.md unexpectedly references symbol_card tool");
  }
  if (architecture.includes("symbol_contract tool")) {
    throw new Error("ARCHITECTURE.md unexpectedly references symbol_contract tool");
  }
});