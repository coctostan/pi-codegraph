export interface GraphNode {
  id: string;
  kind: string;
  name: string;
  file: string;
  line: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: string;
}

export interface Provenance {
  source: string;
  confidence: number;
}
