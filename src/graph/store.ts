import type { EdgeKind, GraphEdge, GraphNode } from "./types.js";

export interface NeighborOptions {
  kind?: EdgeKind;
  direction?: "in" | "out" | "both";
}

export interface NeighborResult {
  node: GraphNode;
  edge: GraphEdge;
}

export interface GraphStore {
  addNode(node: GraphNode): void;
  addEdge(edge: GraphEdge): void;
  getNode(id: string): GraphNode | null;
  findNodes(name: string, file?: string): GraphNode[];
  getNeighbors(nodeId: string, options?: NeighborOptions): NeighborResult[];
  getNodesByFile(file: string): GraphNode[];
  deleteFile(file: string): void;
  listFiles(): string[];
  getFileHash(file: string): string | null;
  setFileHash(file: string, hash: string): void;
  /** Returns all edges whose target begins with "__unresolved__::". */
  getUnresolvedEdges(): GraphEdge[];
  /** Returns all edges whose source equals sourceId, ordered by created_at ASC. */
  getEdgesBySource(sourceId: string): GraphEdge[];
  /** Deletes the single edge identified by (source, target, kind, provenanceSource). */
  deleteEdge(source: string, target: string, kind: string, provenanceSource: string): void;
  close(): void;
}
