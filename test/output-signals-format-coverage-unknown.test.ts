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

test("formatRoleTags carries no coverage tag when coverage is not indexed", () => {
  expect(formatRoleTags({ ...base, tested: false, coverageKnown: false })).toBe("[leaf]");
  expect(formatRoleTags({ ...base, roles: [], tested: false, coverageKnown: false })).toBe("");
  // tested_by edges an earlier report left behind once its reports are gone
  expect(formatRoleTags({ ...base, tested: true, coverageKnown: false })).toBe("[leaf]");
});

test("formatRoleTags emits untested when coverage is indexed but symbol has no tested_by edge", () => {
  expect(formatRoleTags({ ...base, tested: false, coverageKnown: true })).toBe(
    "[leaf, untested]",
  );
});

test("formatRoleTags emits tested when coverage is indexed and symbol has a tested_by edge", () => {
  expect(formatRoleTags({ ...base, tested: true, coverageKnown: true })).toBe(
    "[leaf, tested]",
  );
});
