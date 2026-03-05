import { expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import type { GraphStore } from "../src/graph/store.js";
import { SqliteGraphStore } from "../src/graph/sqlite.js";

test("graph store modules load", async () => {
  const storeModule = await import("../src/graph/store.js");
  expect(storeModule).toBeDefined();

  const { SqliteGraphStore } = await import("../src/graph/sqlite.js");
  const store: GraphStore = new SqliteGraphStore();
  expect(store).toBeInstanceOf(SqliteGraphStore);
});

test("SqliteGraphStore constructor accepts default dbPath", () => {
  expect(() => new SqliteGraphStore()).not.toThrow();
});

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

test("addNode + getNode round-trip, upsert, and unknown returns null", () => {
  const store = new SqliteGraphStore();

  const original = {
    id: "src/a.ts::foo:1",
    kind: "function" as const,
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h1",
  };

  store.addNode(original);
  expect(store.getNode(original.id)).toEqual(original);

  const updated = { ...original, end_line: 4, content_hash: "h2" };
  store.addNode(updated);
  expect(store.getNode(original.id)).toEqual(updated);

  expect(store.getNode("src/a.ts::missing:99")).toBeNull();
});

test("addEdge + getNeighbors supports in/out/both and kind filters", () => {
  const store = new SqliteGraphStore();

  const n1 = {
    id: "src/a.ts::a:1",
    kind: "function" as const,
    name: "a",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "ha",
  };
  const n2 = {
    id: "src/b.ts::b:2",
    kind: "function" as const,
    name: "b",
    file: "src/b.ts",
    start_line: 2,
    end_line: 2,
    content_hash: "hb",
  };
  const n3 = {
    id: "src/c.ts::c:3",
    kind: "function" as const,
    name: "c",
    file: "src/c.ts",
    start_line: 3,
    end_line: 3,
    content_hash: "hc",
  };

  store.addNode(n1);
  store.addNode(n2);
  store.addNode(n3);

  store.addEdge({
    source: n1.id,
    target: n2.id,
    kind: "calls",
    provenance: {
      source: "tree-sitter",
      confidence: 0.8,
      evidence: "a() calls b()",
      content_hash: "e1",
    },
    created_at: 1,
  });

  store.addEdge({
    source: n3.id,
    target: n1.id,
    kind: "imports",
    provenance: {
      source: "tree-sitter",
      confidence: 0.7,
      evidence: "import { a }",
      content_hash: "e2",
    },
    created_at: 2,
  });

  const out = store.getNeighbors(n1.id, { direction: "out" });
  expect(out).toHaveLength(1);
  expect(out[0]?.node.id).toBe(n2.id);
  expect(out[0]?.edge.kind).toBe("calls");

  const inbound = store.getNeighbors(n1.id, { direction: "in" });
  expect(inbound).toHaveLength(1);
  expect(inbound[0]?.node.id).toBe(n3.id);
  expect(inbound[0]?.edge.kind).toBe("imports");

  const both = store.getNeighbors(n1.id);
  expect(both).toHaveLength(2);

  const importsAnyDirection = store.getNeighbors(n1.id, { kind: "imports" });
  expect(importsAnyDirection).toHaveLength(1);
  expect(importsAnyDirection[0]?.edge.kind).toBe("imports");
  expect(importsAnyDirection[0]?.node.id).toBe(n3.id);

  const importsOnly = store.getNeighbors(n1.id, { direction: "in", kind: "imports" });
  expect(importsOnly).toHaveLength(1);
  expect(importsOnly[0]?.edge.kind).toBe("imports");

  const callsOnlyInbound = store.getNeighbors(n1.id, { direction: "in", kind: "calls" });
  expect(callsOnlyInbound).toHaveLength(0);
});

test("getNodesByFile returns matching nodes and [] for missing files", () => {
  const store = new SqliteGraphStore();

  const n1 = {
    id: "src/a.ts::foo:1",
    kind: "function" as const,
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 2,
    content_hash: "h1",
  };
  const n2 = {
    id: "src/a.ts::bar:10",
    kind: "function" as const,
    name: "bar",
    file: "src/a.ts",
    start_line: 10,
    end_line: 12,
    content_hash: "h2",
  };
  const n3 = {
    id: "src/b.ts::baz:5",
    kind: "function" as const,
    name: "baz",
    file: "src/b.ts",
    start_line: 5,
    end_line: 6,
    content_hash: "h3",
  };

  store.addNode(n1);
  store.addNode(n2);
  store.addNode(n3);

  const fromA = store.getNodesByFile("src/a.ts");
  expect(fromA).toHaveLength(2);
  expect(fromA.map((n) => n.id).sort()).toEqual([n1.id, n2.id].sort());

  expect(store.getNodesByFile("src/missing.ts")).toEqual([]);
});

test("deleteFile removes file nodes and all touching edges, preserves unrelated data", () => {
  const store = new SqliteGraphStore();

  const a = {
    id: "src/a.ts::a:1",
    kind: "function" as const,
    name: "a",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "ha",
  };
  const b = {
    id: "src/b.ts::b:1",
    kind: "function" as const,
    name: "b",
    file: "src/b.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "hb",
  };
  const c = {
    id: "src/c.ts::c:1",
    kind: "function" as const,
    name: "c",
    file: "src/c.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "hc",
  };

  store.addNode(a);
  store.addNode(b);
  store.addNode(c);

  // source in src/a.ts
  store.addEdge({
    source: a.id,
    target: b.id,
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 1, evidence: "a->b", content_hash: "e1" },
    created_at: 1,
  });

  // target in src/a.ts (incoming cross-file)
  store.addEdge({
    source: c.id,
    target: a.id,
    kind: "imports",
    provenance: { source: "tree-sitter", confidence: 1, evidence: "c->a", content_hash: "e2" },
    created_at: 2,
  });

  // unrelated edge (must survive)
  store.addEdge({
    source: b.id,
    target: c.id,
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 1, evidence: "b->c", content_hash: "e3" },
    created_at: 3,
  });

  store.deleteFile("src/a.ts");

  expect(store.getNodesByFile("src/a.ts")).toEqual([]);

  // edge where source was in src/a.ts is removed
  expect(store.getNeighbors(a.id, { direction: "out" })).toEqual([]);

  // edge where target was in src/a.ts is removed
  expect(store.getNeighbors(a.id, { direction: "in" })).toEqual([]);

  // nodes in other files remain
  expect(store.getNodesByFile("src/b.ts")).toHaveLength(1);
  expect(store.getNodesByFile("src/c.ts")).toHaveLength(1);

  // unrelated edge remains
  const bOut = store.getNeighbors(b.id, { direction: "out" });
  expect(bOut).toHaveLength(1);
  expect(bOut[0]?.node.id).toBe(c.id);
});

test("getFileHash returns null initially; setFileHash round-trips and overwrites", () => {
  const store = new SqliteGraphStore();

  expect(store.getFileHash("src/a.ts")).toBeNull();

  store.setFileHash("src/a.ts", "abc123");
  expect(store.getFileHash("src/a.ts")).toBe("abc123");

  store.setFileHash("src/a.ts", "def456");
  expect(store.getFileHash("src/a.ts")).toBe("def456");
});

test("data persists after close() and reopen with same db path", () => {
  const dir = join(tmpdir(), "pi-codegraph-tests");
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, `persist-${Date.now()}.sqlite`);

  try {
    const n1 = {
      id: "src/persist.ts::keep:1",
      kind: "function" as const,
      name: "keep",
      file: "src/persist.ts",
      start_line: 1,
      end_line: 2,
      content_hash: "persist-hash",
    };

    const store1 = new SqliteGraphStore(dbPath);
    store1.addNode(n1);
    store1.close();

    const store2 = new SqliteGraphStore(dbPath);
    expect(store2.getNode(n1.id)).toEqual(n1);
    store2.close();
  } finally {
    rmSync(dbPath, { force: true });
  }
});

test("edges table schema uses provenance_source column, not provenance", () => {
  const store = new SqliteGraphStore();
  // Access the private db via type assertion to inspect raw schema
  const db = (store as unknown as { db: Database }).db;
  const cols = db.query("PRAGMA table_info(edges)").all() as Array<{ name: string }>;
  const names = cols.map((c) => c.name);
  expect(names).toContain("provenance_source");
  expect(names).not.toContain("provenance");
  store.close();
});

test("addEdge provenance round-trips correctly through getNeighbors", () => {
  const store = new SqliteGraphStore();
  const n1 = { id: "src/a.ts::x:1", kind: "function" as const, name: "x", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "hx" };
  const n2 = { id: "src/b.ts::y:1", kind: "function" as const, name: "y", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "hy" };
  store.addNode(n1);
  store.addNode(n2);
  store.addEdge({
    source: n1.id,
    target: n2.id,
    kind: "calls",
    provenance: { source: "lsp", confidence: 0.9, evidence: "hover", content_hash: "eh" },
    created_at: 42,
  });
  const result = store.getNeighbors(n1.id, { direction: "out" });
  expect(result).toHaveLength(1);
  expect(result[0]?.edge.provenance.source).toBe("lsp");
  expect(result[0]?.edge.provenance.confidence).toBe(0.9);
  expect(result[0]?.edge.provenance.evidence).toBe("hover");
  expect(result[0]?.edge.provenance.content_hash).toBe("eh");
  expect(result[0]?.edge.created_at).toBe(42);
  store.close();
});
