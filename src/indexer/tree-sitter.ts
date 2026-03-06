import { createHash } from "node:crypto";

import Parser from "tree-sitter";
import ts from "tree-sitter-typescript";

import type { GraphEdge, GraphNode, NodeKind } from "../graph/types.js";
import { nodeId } from "../graph/types.js";

export interface ExtractionResult {
  module: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function countLines(content: string): number {
  return content.split(/\r?\n/).length;
}

type SyntaxNode = Parser.SyntaxNode;

function typescriptLanguage(): unknown {
  // tree-sitter-typescript is CommonJS; under ESM default import is an object.
  return (ts as unknown as { typescript: unknown }).typescript;
}

function addNode(
  nodes: GraphNode[],
  file: string,
  kind: NodeKind,
  name: string,
  startLine: number,
  endLine: number,
  contentHash: string
): void {
  nodes.push({
    id: nodeId(file, name, startLine),
    kind,
    name,
    file,
    start_line: startLine,
    end_line: endLine,
    content_hash: contentHash,
  });
}

function walk(node: SyntaxNode, visit: (n: SyntaxNode) => void): void {
  visit(node);
  for (const child of node.namedChildren) walk(child, visit);
}

function unresolvedId(name: string): string {
  return nodeId("__unresolved__", name, 0);
}


export function extractFile(file: string, content: string): ExtractionResult {
  const contentHash = sha256Hex(content);

  const moduleNode: GraphNode = {
    id: nodeId(file, file, 1),
    kind: "module",
    name: file,
    file,
    start_line: 1,
    end_line: countLines(content),
    content_hash: contentHash,
  };

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const edgeKeys = new Set<string>();
  const pushEdge = (edge: GraphEdge) => {
    const key = `${edge.source}|${edge.target}|${edge.kind}|${edge.provenance.source}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push(edge);
  };

  try {
    const parser = new Parser();
    parser.setLanguage(typescriptLanguage() as never);
    const tree = parser.parse(content);
    const hasParseError =
      typeof (tree.rootNode as unknown as { hasError: unknown }).hasError === "function"
        ? (tree.rootNode as unknown as { hasError: () => boolean }).hasError()
        : Boolean((tree.rootNode as unknown as { hasError: unknown }).hasError);
    if (hasParseError) {
      return { module: moduleNode, nodes: [], edges: [] };
    }

    walk(tree.rootNode, (n) => {
      if (n.type === "function_declaration") {
        const nameNode = n.childForFieldName("name");
        if (!nameNode) return;
        addNode(
          nodes,
          file,
          "function",
          nameNode.text,
          n.startPosition.row + 1,
          n.endPosition.row + 1,
          contentHash
        );
        return;
      }

      if (n.type === "class_declaration") {
        const nameNode = n.childForFieldName("name");
        if (!nameNode) return;
        addNode(
          nodes,
          file,
          "class",
          nameNode.text,
          n.startPosition.row + 1,
          n.endPosition.row + 1,
          contentHash
        );
        return;
      }

      if (n.type === "interface_declaration") {
        const nameNode = n.childForFieldName("name");
        if (!nameNode) return;
        addNode(
          nodes,
          file,
          "interface",
          nameNode.text,
          n.startPosition.row + 1,
          n.endPosition.row + 1,
          contentHash
        );
        return;
      }

      if (n.type === "import_statement") {
        const sourceNode = n.childForFieldName("source");
        if (!sourceNode) return;

        const evidence = sourceNode.text;
        const importClause = n.namedChildren.find((c) => c.type === "import_clause");
        if (!importClause) return;

        const hasDefault = importClause.namedChildren.some((c) => c.type === "identifier");
        if (hasDefault) {
          pushEdge({
            source: moduleNode.id,
            target: unresolvedId("default"),
            kind: "imports",
            provenance: {
              source: "tree-sitter",
              confidence: 0.5,
              evidence,
              content_hash: contentHash,
            },
            created_at: Date.now(),
          });
        }

        const namedImports = importClause.namedChildren.find((c) => c.type === "named_imports");
        if (namedImports) {
          for (const spec of namedImports.namedChildren) {
            if (spec.type !== "import_specifier") continue;
            const nameNode = spec.childForFieldName("name");
            if (!nameNode) continue;
            const importedName = nameNode.text;

            pushEdge({
              source: moduleNode.id,
              target: unresolvedId(importedName),
              kind: "imports",
              provenance: {
                source: "tree-sitter",
                confidence: 0.5,
                evidence,
                content_hash: contentHash,
              },
              created_at: Date.now(),
            });
          }
        }

        return;
      }

      if (n.type === "variable_declarator") {
        const nameNode = n.childForFieldName("name");
        const valueNode = n.childForFieldName("value");

        if (nameNode?.type !== "identifier") return;
        if (valueNode?.type !== "arrow_function") return;

        addNode(
          nodes,
          file,
          "function",
          nameNode.text,
          n.startPosition.row + 1,
          valueNode.endPosition.row + 1,
          contentHash
        );
      }
    });

    function callEvidence(node: SyntaxNode): string {
      return `${node.text}:${node.startPosition.row + 1}:${node.startPosition.column + 1}`;
    }
    const visitCalls = (n: SyntaxNode, currentFunctionId: string | null): void => {
      let nextFunctionId = currentFunctionId;

      if (n.type === "function_declaration") {
        const nameNode = n.childForFieldName("name");
        if (nameNode) {
          nextFunctionId = nodeId(file, nameNode.text, n.startPosition.row + 1);
        }
      }

      if (n.type === "variable_declarator") {
        const nameNode = n.childForFieldName("name");
        const valueNode = n.childForFieldName("value");
        if (nameNode?.type === "identifier" && valueNode?.type === "arrow_function") {
          nextFunctionId = nodeId(file, nameNode.text, n.startPosition.row + 1);
        }
      }

      if (nextFunctionId && n.type === "call_expression") {
        const callee = n.childForFieldName("function");
        if (callee?.type === "identifier") {
          pushEdge({
            source: nextFunctionId,
            target: unresolvedId(callee.text),
            kind: "calls",
            provenance: {
              source: "tree-sitter",
              confidence: 0.5,
              evidence: callEvidence(callee),
              content_hash: contentHash,
            },
            created_at: Date.now(),
          });
        }
      }

      if (nextFunctionId && n.type === "new_expression") {
        const ctor = n.childForFieldName("constructor");
        if (ctor?.type === "identifier") {
          pushEdge({
            source: nextFunctionId,
            target: unresolvedId(ctor.text),
            kind: "calls",
            provenance: {
              source: "tree-sitter",
              confidence: 0.5,
              evidence: callEvidence(ctor),
              content_hash: contentHash,
            },
            created_at: Date.now(),
          });
        }
      }

      for (const child of n.namedChildren) visitCalls(child, nextFunctionId);
    };

    visitCalls(tree.rootNode, null);
  } catch {
    // If parser initialization fails, return only the module node.
    return { module: moduleNode, nodes: [], edges: [] };
  }

  return { module: moduleNode, nodes, edges };
}

// Back-compat with the existing placeholder export test
export const treeSitterIndex = extractFile;
