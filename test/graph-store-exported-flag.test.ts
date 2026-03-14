import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";

import { SqliteGraphStore } from "../src/graph/sqlite.js";

test("SqliteGraphStore persists is_exported on nodes and exposes schema column", () => {
  const store = new SqliteGraphStore();

  const node = {
    id: "src/a.ts::foo:1",
    kind: "function" as const,
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "h1",
    is_exported: true,
  };

  store.addNode(node);
  expect(store.getNode(node.id)).toEqual(node);

  const db = (store as unknown as { db: Database }).db;
  const cols = db.query("PRAGMA table_info(nodes)").all() as Array<{ name: string }>;
  expect(cols.map((c) => c.name)).toContain("is_exported");

  store.close();
});
