import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { createSignalComputer } from "../src/output/signals.js";

function makeStoreWithFn() {
  const store = new SqliteGraphStore();
  store.addNode({
    id: "src/x.ts::fn:1",
    kind: "function",
    name: "fn",
    file: "src/x.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "h",
    is_exported: true,
  });
  return store;
}

test("NodeSignals.coverageKnown is false when store has no coverage data", () => {
  const store = makeStoreWithFn();
  try {
    const computer = createSignalComputer(store);
    const signals = computer.compute("src/x.ts::fn:1");
    expect(signals.coverageKnown).toBe(false);
    expect(signals.tested).toBe(false);
  } finally {
    store.close();
  }
});

test("NodeSignals.coverageKnown is true when store.markCoverageIndexed() was called", () => {
  const store = makeStoreWithFn();
  try {
    store.markCoverageIndexed();
    const computer = createSignalComputer(store);
    const signals = computer.compute("src/x.ts::fn:1");
    expect(signals.coverageKnown).toBe(true);
    expect(signals.tested).toBe(false);
  } finally {
    store.close();
  }
});
