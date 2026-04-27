import { expect, test } from "bun:test";
import { formatRoleTags, type NodeSignals } from "../src/output/signals.js";

const base: NodeSignals = {
  roles: ["leaf"],
  fanIn: 0,
  fanOut: 0,
  tested: false,
  frameworkMediated: false,
  isExported: false,
  coChangeScore: 0,
  coverageKnown: false,
};

test("formatRoleTags emits coverage-unknown when coverage is not indexed", () => {
  expect(formatRoleTags({ ...base, tested: false, coverageKnown: false })).toBe(
    "[leaf, coverage-unknown]",
  );
});

test("formatRoleTags emits untested when coverage is indexed but symbol has no tested_by edge", () => {
  expect(formatRoleTags({ ...base, tested: false, coverageKnown: true })).toBe(
    "[leaf, untested]",
  );
});

test("formatRoleTags emits tested when symbol has a tested_by edge regardless of coverageKnown", () => {
  expect(formatRoleTags({ ...base, tested: true, coverageKnown: false })).toBe(
    "[leaf, tested]",
  );
  expect(formatRoleTags({ ...base, tested: true, coverageKnown: true })).toBe(
    "[leaf, tested]",
  );
});
