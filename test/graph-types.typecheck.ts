import type { GraphEdge, GraphNode, Provenance } from "../src/graph/types.js";
import { nodeId } from "../src/graph/types.js";
import type { GraphStore } from "../src/graph/store.js";
import { SqliteGraphStore } from "../src/graph/sqlite.js";

const validNode: GraphNode = {
  id: "src/a.ts::foo:10",
  kind: "function",
  name: "foo",
  file: "src/a.ts",
  start_line: 10,
  end_line: 20,
  content_hash: "hash-node",
};

const validEdge: GraphEdge = {
  source: "src/a.ts::foo:10",
  target: "src/b.ts::bar:3",
  kind: "calls",
  provenance: {
    source: "tree-sitter",
    confidence: 0.8,
    evidence: "foo() calls bar()",
    content_hash: "hash-edge",
  },
  created_at: 1700000000,
};

const validProvenance: Provenance = {
  source: "lsp",
  confidence: 1,
  evidence: "go-to-definition",
  content_hash: "hash-prov",
};

const id = nodeId("src/a.ts", "foo", 10);
if (id !== "src/a.ts::foo:10") {
  throw new Error(`unexpected nodeId: ${id}`);
}

// @ts-expect-error invalid NodeKind must be rejected
const invalidNodeKind: GraphNode = { ...validNode, kind: "not-a-kind" };

// @ts-expect-error invalid EdgeKind must be rejected
const invalidEdgeKind: GraphEdge = { ...validEdge, kind: "not-a-kind" };

// @ts-expect-error invalid ProvenanceSource must be rejected
const invalidProvSource: Provenance = { ...validProvenance, source: "not-a-kind" };

void [
  validNode,
  validEdge,
  validProvenance,
  invalidNodeKind,
  invalidEdgeKind,
  invalidProvSource,
];

const validStore: GraphStore = {
  addNode: () => {},
  addEdge: () => {},
  getNode: () => null,
  getNeighbors: () => [],
  getNodesByFile: () => [],
  findNodes: () => [],
  listFiles: () => [],
  deleteFile: () => {},
  getFileHash: () => null,
  setFileHash: () => {},
  close: () => {},
};

// @ts-expect-error GraphStore must require all 11 methods
const invalidStore: GraphStore = {};

void [validStore, invalidStore];
const sqliteAsStore: GraphStore = new SqliteGraphStore();
void sqliteAsStore;
export {};
