import type { EdgeKind, GraphEdge, GraphNode } from "./types.js";

export interface NeighborOptions {
  kind?: EdgeKind;
  direction?: "in" | "out" | "both";
}

export interface NeighborResult {
  node: GraphNode;
  edge: GraphEdge;
}

export interface TestTraceStep {
  nodeId: string;
  ordinal: number;
  contentHash: string;
}

export interface TestTraceRecord {
  testNodeId: string;
  steps: TestTraceStep[];
}

export interface GraphStatistics {
  nodes: Record<string, number>;
  edges: Record<string, Record<string, number>>;
  files: { total: number; stale: number };
}

export interface GraphStore {
  addNode(node: GraphNode): void;
  addEdge(edge: GraphEdge): void;
  getNode(id: string): GraphNode | null;
  findNodes(name: string, file?: string): GraphNode[];
  getNeighbors(nodeId: string, options?: NeighborOptions): NeighborResult[];
  getNodesByFile(file: string): GraphNode[];
  /** Delete `file`'s nodes and hash, every edge touching them but agent's and coverage's, and every resolver marker. */
  deleteFile(file: string): void;
  /**
   * Delete what indexing `file` wrote: its nodes and hash, and the edges they source but git's and coverage's, which
   * their stages rewrite, and every resolver marker. Other edges into it stay, a vanished target's for the caller to fix.
   */
  clearFile(file: string): void;
  /** The indexed files. */
  listFiles(): string[];
  getFileHash(file: string): string | null;
  /** `partial` records that tree-sitter parsed the file with errors. */
  setFileHash(file: string, hash: string, partial?: boolean): void;
  getUnresolvedEdges(): GraphEdge[];
  getEdgesBySource(sourceId: string): GraphEdge[];
  deleteEdge(source: string, target: string, kind: string, provenanceSource: string): void;
  saveTestTrace(trace: TestTraceRecord): void;
  getTestTrace(testNodeId: string): TestTraceRecord | null;
  /** Delete every `coverage` edge and test trace, so the coverage stage writes only what its reports back; with none, write nothing. */
  clearCoverage(): void;
  getStatistics(projectRoot?: string): GraphStatistics;
  queryRows<T extends Record<string, unknown>>(sql: string, params?: unknown[]): T[];
  hasCoverageData(): boolean;
  /** Set or, with `false`, clear the sentinel `hasCoverageData` reads. */
  markCoverageIndexed(indexed?: boolean): void;
  /** A `graph_metadata` value, null when unset. */
  getMetadata(key: string): string | null;
  /** Set a `graph_metadata` value or, with null, delete it. */
  setMetadata(key: string, value: string | null): void;
  /** The calls whose last `definition` lookup timed out or errored, by the edge's source and evidence. */
  getFailedLookups(): FailedLookup[];
  /** Record, or with `false` clear, a failed lookup for the call `source` makes at `evidence`. */
  setLookupFailed(source: string, evidence: string, failed: boolean): void;
  close(): void;
}

export interface FailedLookup {
  source: string;
  evidence: string;
}
