import { expect, test } from "bun:test";
import { formatNeighborhood } from "../src/output/anchoring.js";
import type { AnchorResult } from "../src/output/anchoring.js";

interface AnchoredNeighbor {
  anchor: AnchorResult;
  name: string;
  edgeKind: string;
  confidence: number;
  provenanceSource: string;
}

test("formatNeighborhood produces header and populated sections, omits empty ones", () => {
  const symbolAnchor: AnchorResult = { anchor: "src/a.ts:10:abcd", stale: false };

  const callers: { items: AnchoredNeighbor[]; omitted: number } = {
    items: [
      {
        anchor: { anchor: "src/b.ts:5:1234", stale: false },
        name: "caller1",
        edgeKind: "calls",
        confidence: 0.9,
        provenanceSource: "tree-sitter",
      },
    ],
    omitted: 0,
  };

  const callees: { items: AnchoredNeighbor[]; omitted: number } = {
    items: [
      {
        anchor: { anchor: "src/c.ts:20:5678", stale: false },
        name: "callee1",
        edgeKind: "calls",
        confidence: 0.5,
        provenanceSource: "tree-sitter",
      },
    ],
    omitted: 0,
  };

  // Empty imports — should be omitted from output
  const imports: { items: AnchoredNeighbor[]; omitted: number } = {
    items: [],
    omitted: 0,
  };

  const unresolved: { items: AnchoredNeighbor[]; omitted: number } = {
    items: [],
    omitted: 0,
  };

  const output = formatNeighborhood(
    { name: "myFunc", kind: "function", anchor: symbolAnchor },
    [
      { title: "Callers", section: callers },
      { title: "Callees", section: callees },
      { title: "Imports", section: imports },
      { title: "Unresolved", section: unresolved },
    ],
  );

  // Has header
  expect(output).toContain("myFunc (function)");
  expect(output).toContain("src/a.ts:10:abcd");

  // Has callers section
  expect(output).toContain("Callers");
  expect(output).toContain("src/b.ts:5:1234");
  expect(output).toContain("caller1");
  expect(output).toContain("0.9");
  expect(output).toContain("tree-sitter");

  // Has callees section
  expect(output).toContain("Callees");
  expect(output).toContain("src/c.ts:20:5678");
  expect(output).toContain("callee1");

  // No imports section (empty)
  expect(output).not.toContain("Imports");
});


test("formatNeighborhood shows (N more omitted) when a category is truncated", () => {
  const symbolAnchor: AnchorResult = { anchor: "src/a.ts:10:abcd", stale: false };

  const callers = {
    items: [
      {
        anchor: { anchor: "src/b.ts:5:1234", stale: false } as AnchorResult,
        name: "caller1",
        edgeKind: "calls",
        confidence: 0.9,
        provenanceSource: "tree-sitter",
      },
    ],
    omitted: 5,
  };

  const callees = { items: [], omitted: 0 };
  const imports = { items: [], omitted: 0 };
  const unresolved = { items: [], omitted: 0 };

  const output = formatNeighborhood(
    { name: "myFunc", kind: "function", anchor: symbolAnchor },
    [
      { title: "Callers", section: callers },
      { title: "Callees", section: callees },
      { title: "Imports", section: imports },
      { title: "Unresolved", section: unresolved },
    ],
  );

  expect(output).toContain("(5 more omitted)");
});


test("formatNeighborhood suffixes stale entries with [stale]", () => {
  const symbolAnchor: AnchorResult = { anchor: "src/a.ts:10:abcd", stale: false };

  const callers = {
    items: [
      {
        anchor: { anchor: "src/b.ts:5:1234", stale: true } as AnchorResult,
        name: "staleCaller",
        edgeKind: "calls",
        confidence: 0.9,
        provenanceSource: "tree-sitter",
      },
      {
        anchor: { anchor: "src/c.ts:8:5678", stale: false } as AnchorResult,
        name: "freshCaller",
        edgeKind: "calls",
        confidence: 0.8,
        provenanceSource: "tree-sitter",
      },
    ],
    omitted: 0,
  };

  const callees = { items: [], omitted: 0 };
  const imports = { items: [], omitted: 0 };
  const unresolved = { items: [], omitted: 0 };

  const output = formatNeighborhood(
    { name: "myFunc", kind: "function", anchor: symbolAnchor },
    [
      { title: "Callers", section: callers },
      { title: "Callees", section: callees },
      { title: "Imports", section: imports },
      { title: "Unresolved", section: unresolved },
    ],
  );

  // Stale entry has [stale] marker
  const staleCallerLine = output.split("\n").find((l) => l.includes("staleCaller"));
  expect(staleCallerLine).toContain("[stale]");

  // Fresh entry does not
  const freshCallerLine = output.split("\n").find((l) => l.includes("freshCaller"));
  expect(freshCallerLine).not.toContain("[stale]");
});


test("formatNeighborhood shows Unresolved section for __unresolved__ nodes", () => {
  const symbolAnchor: AnchorResult = { anchor: "src/a.ts:10:abcd", stale: false };

  const callers = { items: [], omitted: 0 };
  const callees = { items: [], omitted: 0 };
  const imports = { items: [], omitted: 0 };

  const unresolved = {
    items: [
      {
        anchor: { anchor: "__unresolved__::Parser:0:?", stale: true } as AnchorResult,
        name: "Parser",
        edgeKind: "calls",
        confidence: 0.5,
        provenanceSource: "tree-sitter",
      },
    ],
    omitted: 0,
  };

  const output = formatNeighborhood(
    { name: "myFunc", kind: "function", anchor: symbolAnchor },
    [
      { title: "Callers", section: callers },
      { title: "Callees", section: callees },
      { title: "Imports", section: imports },
      { title: "Unresolved", section: unresolved },
    ],
  );

  expect(output).toContain("Unresolved");
  expect(output).toContain("Parser");
});

test("formatNeighborhood accepts named sections array and renders them in order", () => {
  const symbolAnchor: AnchorResult = { anchor: "src/a.ts:10:abcd", stale: false };

  const sections = [
    {
      title: "Callers",
      section: {
        items: [
          {
            anchor: { anchor: "src/b.ts:5:1234", stale: false } as AnchorResult,
            name: "caller1",
            edgeKind: "calls",
            confidence: 0.9,
            provenanceSource: "tree-sitter",
          },
        ],
        omitted: 0,
      },
    },
    {
      title: "Extends",
      section: {
        items: [
          {
            anchor: { anchor: "src/c.ts:20:5678", stale: false } as AnchorResult,
            name: "BaseClass",
            edgeKind: "extends",
            confidence: 0.8,
            provenanceSource: "lsp",
          },
        ],
        omitted: 0,
      },
    },
  ];

  const output = formatNeighborhood(
    { name: "MyClass", kind: "class", anchor: symbolAnchor },
    sections,
  );

  expect(output).toContain("MyClass (class)");
  expect(output).toContain("### Callers");
  expect(output).toContain("caller1");
  expect(output).toContain("### Extends");
  expect(output).toContain("BaseClass");

  // Callers should appear before Extends (order preserved)
  const callersIdx = output.indexOf("### Callers");
  const extendsIdx = output.indexOf("### Extends");
  expect(callersIdx).toBeLessThan(extendsIdx);
});