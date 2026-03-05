import { expect, test } from "bun:test";

import { SqliteGraphStore } from "../src/graph/sqlite.js";

test("SqliteGraphStore.listFiles returns indexed files and reflects deleteFile", () => {
  const store = new SqliteGraphStore();

  store.setFileHash("src/a.ts", "ha");
  store.setFileHash("src/b.ts", "hb");

  expect(store.listFiles()).toEqual(["src/a.ts", "src/b.ts"]);

  store.deleteFile("src/a.ts");
  expect(store.listFiles()).toEqual(["src/b.ts"]);
});
