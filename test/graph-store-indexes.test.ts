import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";

test("SQLite store has index on nodes(name) for findNodes/symbol_graph queries", () => {
  const store = new SqliteGraphStore();
  try {
    const rows = store.queryRows<{ name: string }>(
      "SELECT name FROM pragma_index_list('nodes') WHERE name = 'idx_nodes_name'"
    );
    expect(rows).toHaveLength(1);
  } finally {
    store.close();
  }
});

test("SQLite store has index on edges(kind) for graph_query kind filters", () => {
  const store = new SqliteGraphStore();
  try {
    const rows = store.queryRows<{ name: string }>(
      "SELECT name FROM pragma_index_list('edges') WHERE name = 'idx_edges_kind'"
    );
    expect(rows).toHaveLength(1);
  } finally {
    store.close();
  }
});

test("SQLite store preserves existing indexes on nodes(file), edges(source), edges(target)", () => {
  const store = new SqliteGraphStore();
  try {
    const nodeFile = store.queryRows<{ name: string }>(
      "SELECT name FROM pragma_index_list('nodes') WHERE name = 'idx_nodes_file'"
    );
    expect(nodeFile).toHaveLength(1);

    const edgeSource = store.queryRows<{ name: string }>(
      "SELECT name FROM pragma_index_list('edges') WHERE name = 'idx_edges_source'"
    );
    expect(edgeSource).toHaveLength(1);

    const edgeTarget = store.queryRows<{ name: string }>(
      "SELECT name FROM pragma_index_list('edges') WHERE name = 'idx_edges_target'"
    );
    expect(edgeTarget).toHaveLength(1);
  } finally {
    store.close();
  }
});
