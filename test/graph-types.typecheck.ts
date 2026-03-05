import type { GraphEdge, GraphNode, Provenance } from "../src/graph/types.js";
// compile-time placeholder type assertions

const _node: GraphNode = {
  id: "n1",
  kind: "function",
  name: "run",
  file: "src/run.ts",
  line: 1,
};

const _edge: GraphEdge = {
  source: "n1",
  target: "n2",
  kind: "calls",
};

const _provenance: Provenance = {
  source: "tree-sitter",
  confidence: 0.8,
};

void [_node, _edge, _provenance];
export {};
