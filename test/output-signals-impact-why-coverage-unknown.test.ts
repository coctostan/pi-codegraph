import { expect, test } from "bun:test";
import { formatImpactWhy, type NodeSignals } from "../src/output/signals.js";

const base: NodeSignals = {
  roles: ["leaf"],
  fanIn: 0,
  fanOut: 1,
  tested: false,
  frameworkMediated: false,
  isExported: false,
  coChangeScore: 0,
  coverageKnown: false,
};

test("formatImpactWhy renders coverage:unknown when coverage is not indexed", () => {
  const why = formatImpactWhy({ ...base, tested: false, coverageKnown: false }, 0.75);
  expect(why).toContain("coverage:unknown");
  expect(why).not.toContain("coverage:untested");
  expect(why).toContain("chain-confidence:0.75");
});

test("formatImpactWhy renders coverage:untested when coverage is indexed but symbol has no tested_by edge", () => {
  const why = formatImpactWhy({ ...base, tested: false, coverageKnown: true });
  expect(why).toContain("coverage:untested");
  expect(why).not.toContain("coverage:unknown");
});

test("formatImpactWhy renders coverage:tested when symbol has a tested_by edge", () => {
  const why = formatImpactWhy({ ...base, tested: true, coverageKnown: false });
  expect(why).toContain("coverage:tested");
});
