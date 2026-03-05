## Task 3: SqliteGraphStore bootstrap: constructor default, schema init, and schema_version

Two correctness issues need to be fixed in this task.

### 1) Step 1 compile-time block creates a duplicate `GraphStore` import

Current Step 1 tells the reviser to append:

```ts
import type { GraphStore } from "../src/graph/store.js";
import { SqliteGraphStore } from "../src/graph/sqlite.js";

const sqliteAsStore: GraphStore = new SqliteGraphStore();
void sqliteAsStore;
```

But Task 2 already appended `import type { GraphStore } ...` to the same file (`test/graph-types.typecheck.ts`). Repeating this exact import will produce a duplicate binding error.

Use this instead (alias the second type import):

```ts
import type { GraphStore as GraphStoreContract } from "../src/graph/store.js";
import { SqliteGraphStore } from "../src/graph/sqlite.js";

const sqliteAsStore: GraphStoreContract = new SqliteGraphStore();
void sqliteAsStore;
```

### 2) Step 1 schema test does not validate AC 43 (`exactly one row`)

Current schema test only checks `SELECT version ... LIMIT 1`, which can still pass if multiple rows exist.

Update the `schema_version` test in `test/graph-store.test.ts` to assert both value and cardinality:

```ts
test("SqliteGraphStore initializes schema_version=1", () => {
  const dir = join(tmpdir(), "pi-codegraph-tests");
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, `schema-${Date.now()}.sqlite`);

  try {
    new SqliteGraphStore(dbPath);
    const db = new Database(dbPath);

    const rows = db.query("SELECT version FROM schema_version").all() as Array<{ version: number }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.version).toBe(1);

    db.close();
  } finally {
    rmSync(dbPath, { force: true });
  }
});
```

Keep Step 3 implementation API usage as Bun SQLite (`Database`, `.exec`, `.query(...).get/run/all`).

## Task 5: SqliteGraphStore edges: addEdge/getNeighbors with direction and kind filters

AC 30 is currently under-specified in the test. The acceptance criterion requires:

- `getNeighbors(nodeId, { kind: 'imports' })` filters by kind (without requiring `direction` in options).

Current Step 1 only checks kind filtering with `direction: "in"`. Add the exact AC 30 call:

```ts
const importsAnyDirection = store.getNeighbors(n1.id, { kind: "imports" });
expect(importsAnyDirection).toHaveLength(1);
expect(importsAnyDirection[0]?.edge.kind).toBe("imports");
expect(importsAnyDirection[0]?.node.id).toBe(n3.id);
```

Place this assertion block in the same Task 5 test after edges are inserted.

No change is needed to the Bun SQLite method signatures in Step 3 (`addEdge(edge: GraphEdge): void`, `getNeighbors(nodeId: string, options?: NeighborOptions): NeighborResult[]`).