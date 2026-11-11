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
  is_exported?: boolean;
  signature?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: EdgeKind;
  provenance: Provenance;
  created_at: number;
  /** A `calls` edge's call site: the 1-based line and column of its call expression's last character. */
  call_end?: { line: number; col: number };
}

export function nodeId(file: string, name: string, startLine: number): string {
  return `${file}::${name}:${startLine}`;
}

/** A call tree-sitter couldn't name a node for, `__unresolved__::<name>:0`: the LSP stage may resolve it to one. */
export const UNRESOLVED = "__unresolved__";

export function isUnresolved(id: string): boolean {
  return id.startsWith(`${UNRESOLVED}::`);
}

/** A call to another object's member, `obj.m()`: no reader shows it until the LSP stage resolves it to a project node. */
export const MEMBER_CALL = "__member__";

export function isMemberCall(target: string): boolean {
  return target.startsWith(`${MEMBER_CALL}::`);
}

/**
 * The name a call to `node` uses: a member `Class.m`'s bare `m`, a constructor's class, as `new Class()` names it, any
 * other node's whole name, a dotted file's too.
 */
export function calledName(node: Pick<GraphNode, "kind" | "name">): string {
  const dot = node.name.indexOf(".");
  if (node.kind !== "function" || dot < 0) return node.name;
  const member = node.name.slice(dot + 1);
  return member === "constructor" ? node.name.slice(0, dot) : member;
}
