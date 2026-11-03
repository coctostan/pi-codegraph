import type { EdgeKind, GraphEdge, GraphNode } from "./types.js";

/** The git stage's last-seen HEAD, kept in `file_hashes` beside the files; no file has this key. */
export const GIT_HEAD_KEY = "__git_cochange_head__";
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
  deleteFile(file: string): void;
  /**
   * Delete what indexing `file` wrote: its nodes and hash, the edges they source but git's, and the coverage edges and
   * test traces touching them, which the coverage stage rebuilds. Other edges into it stay, a vanished target's for the
   * caller to fix.
   */
  clearFile(file: string): void;
  /** The indexed files, `GIT_HEAD_KEY`'s row left out. */
  listFiles(): string[];
  getFileHash(file: string): string | null;
  /** `partial` records that tree-sitter parsed the file with errors. */
  setFileHash(file: string, hash: string, partial?: boolean): void;
  getUnresolvedEdges(): GraphEdge[];
  getEdgesBySource(sourceId: string): GraphEdge[];
  deleteEdge(source: string, target: string, kind: string, provenanceSource: string): void;
  saveTestTrace(trace: TestTraceRecord): void;
  getTestTrace(testNodeId: string): TestTraceRecord | null;
  getStatistics(projectRoot?: string): GraphStatistics;
  queryRows<T extends Record<string, unknown>>(sql: string, params?: unknown[]): T[];
  hasCoverageData(): boolean;
  /** Set or, with `false`, clear the sentinel `hasCoverageData` reads. */
  markCoverageIndexed(indexed?: boolean): void;
  close(): void;
}
