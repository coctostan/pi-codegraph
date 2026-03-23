import { expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { graphQuery } from "../src/tools/graph-query.js";

test("graphQuery surfaces actual SQLite error in execution_error message", () => {
  const projectRoot = join(tmpdir(), `pi-cg-gq-err-detail-${Date.now()}`);
  mkdirSync(projectRoot, { recursive: true });

  const store = new SqliteGraphStore();
  try {
    // Query a non-existent column — compiles to valid SQL that fails at SQLite level
    const output = graphQuery({
      query: 'MATCH (n) WHERE n.nonexistent_column = "test" RETURN n',
      store,
      projectRoot,
    });

    // Should contain an execution_error
    expect(output).toContain("execution_error:");

    // Should surface the actual SQLite error message, not a generic string.
    // Should surface the actual SQLite error message instead.
    expect(output).toContain("no such column");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
