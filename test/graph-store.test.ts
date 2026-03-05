import { expect, test } from "bun:test";
import type { GraphStore } from "../src/graph/store.js";

test("graph store modules load", async () => {
  const storeModule = await import("../src/graph/store.js");
  expect(storeModule).toBeDefined();

  const { SqliteGraphStore } = await import("../src/graph/sqlite.js");
  const store: GraphStore = new SqliteGraphStore();
  expect(store).toBeInstanceOf(SqliteGraphStore);
});
