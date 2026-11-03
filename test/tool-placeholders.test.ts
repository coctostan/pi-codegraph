import { expect, test } from "bun:test";

// Each tool's one export is its `*Result` form.
test("each tool module exports its *Result form and no string wrapper", async () => {
  const expected: Record<string, string[]> = {
    "symbol-graph": ["symbolGraphResult"],
    impact: ["impactResult"],
    trace: ["traceResult"],
  };
  for (const [file, names] of Object.entries(expected)) {
    const mod = await import(`../src/tools/${file}.js`);
    const functions = Object.keys(mod).filter((key) => typeof mod[key] === "function").sort();
    expect({ file, functions }).toEqual({ file, functions: names });
  }
});
