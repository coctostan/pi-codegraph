export type NodeKind =
  | "function"
  | "class"
  | "interface"
  | "module"
  | "endpoint"
  | "test";

export type EdgeKind =
  | "calls"
  | "imports"
  | "implements"
  | "extends"
  | "tested_by"
  | "co_changes_with"
  | "renders"
  | "routes_to";

export type ProvenanceSource =
  | "tree-sitter"
  | "lsp"
  | "ast-grep"
  | "coverage"
  | "git"
  | "agent";

export interface Provenance {
  source: ProvenanceSource;
  confidence: number;
  evidence: string;
  content_hash: string;
}

export interface GraphNode {
  id: string;
  kind: NodeKind;
  name: string;
  file: string;
  start_line: number;
  end_line: number | null;
  content_hash: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: EdgeKind;
  provenance: Provenance;
  created_at: number;
}

export function nodeId(file: string, name: string, startLine: number): string {
  return `${file}::${name}:${startLine}`;
}
