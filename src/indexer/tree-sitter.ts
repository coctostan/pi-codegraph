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

function typescriptLanguage(file: string): unknown {
  // tree-sitter-typescript is CommonJS; under ESM default import is an object.
  const mod = ts as unknown as { typescript: unknown; tsx: unknown };
  if (!mod.typescript || !mod.tsx) {
    throw new Error("tree-sitter-typescript missing typescript/tsx exports");
  }
  return file.endsWith(".tsx") ? mod.tsx : mod.typescript;
}

function addNode(
  nodes: GraphNode[],
  file: string,
  kind: NodeKind,
  name: string,
  startLine: number,
  endLine: number,
  contentHash: string,
  isExported: boolean,
  signature?: string
): void {
  const node: GraphNode = {
    id: nodeId(file, name, startLine),
    kind,
    name,
    file,
    start_line: startLine,
    end_line: endLine,
    content_hash: contentHash,
    is_exported: isExported,
  };
  if (signature != null) {
    node.signature = signature;
  }
  nodes.push(node);
}

function walk(node: SyntaxNode, visit: (n: SyntaxNode) => void): void {
  visit(node);
  for (const child of node.namedChildren) walk(child, visit);
}

function unresolvedId(name: string): string {
  return nodeId("__unresolved__", name, 0);
}

function isExportedNode(node: SyntaxNode): boolean {
  let current: SyntaxNode | null = node;
  while (current) {
    if (current.type === "export_statement") return true;
    current = current.parent;
  }
  return false;
}

function extractFunctionSignature(node: SyntaxNode): string | undefined {
  const params = node.childForFieldName("parameters");
  if (!params) return undefined;

  const typeParams = node.namedChildren.find((c: SyntaxNode) => c.type === "type_parameters");
  const typeParamStr = typeParams ? typeParams.text : "";

  const paramParts: string[] = [];
  for (const child of params.namedChildren) {
    if (child.type === "required_parameter" || child.type === "optional_parameter") {
      const nameNode = child.namedChildren.find((c: SyntaxNode) => c.type === "identifier");
      const typeAnnotation = child.namedChildren.find((c: SyntaxNode) => c.type === "type_annotation");
      if (!nameNode) continue;
      const questionMark = child.type === "optional_parameter" ? "?" : "";
      const typeStr = typeAnnotation ? typeAnnotation.text.replace(/^\s*:\s*/, "") : "";
      if (typeStr) {
        paramParts.push(`${nameNode.text}${questionMark}: ${typeStr}`);
      } else {
        paramParts.push(`${nameNode.text}${questionMark}`);
      }
    }
  }

  const returnType = node.childForFieldName("return_type");
  const returnStr = returnType ? returnType.text.replace(/^\s*:\s*/, "") : "";

  const paramList = `(${paramParts.join(", ")})`;

  if (returnStr) {
    return `${typeParamStr}${paramList} => ${returnStr}`;
  }
  return `${typeParamStr}${paramList}`;
}

function extractClassSignature(node: SyntaxNode, name: string): string {
  const parts: string[] = [`class ${name}`];

  const heritage = node.namedChildren.find((c: SyntaxNode) => c.type === "class_heritage");
  if (heritage) {
    const extendsClause = heritage.namedChildren.find((c: SyntaxNode) => c.type === "extends_clause");
    if (extendsClause) {
      const extendsText = extendsClause.text.replace(/^extends\s+/, "");
      parts.push(`extends ${extendsText}`);
    }
    const implClause = heritage.namedChildren.find((c: SyntaxNode) => c.type === "implements_clause");
    if (implClause) {
      const implText = implClause.text.replace(/^implements\s+/, "");
      parts.push(`implements ${implText}`);
    }
  }

  const classBody = node.childForFieldName("body");
  if (classBody) {
    for (const member of classBody.namedChildren) {
      if (member.type === "method_definition") {
        const methodName = member.childForFieldName("name");
        if (methodName && methodName.text === "constructor") {
          const params = member.childForFieldName("parameters");
          if (params) {
            const paramParts: string[] = [];
            for (const child of params.namedChildren) {
              if (child.type === "required_parameter" || child.type === "optional_parameter") {
                const nameChild = child.namedChildren.find((c: SyntaxNode) => c.type === "identifier");
                const typeAnnotation = child.namedChildren.find((c: SyntaxNode) => c.type === "type_annotation");
                if (!nameChild) continue;
                const questionMark = child.type === "optional_parameter" ? "?" : "";
                const typeStr = typeAnnotation ? typeAnnotation.text.replace(/^\s*:\s*/, "") : "";
                if (typeStr) {
                  paramParts.push(`${nameChild.text}${questionMark}: ${typeStr}`);
                } else {
                  paramParts.push(`${nameChild.text}${questionMark}`);
                }
              }
            }
            parts.push(`{ constructor(${paramParts.join(", ")}) }`);
          }
          break;
        }
      }
    }
  }

  return parts.join(" ");
}

function extractInterfaceSignature(node: SyntaxNode, name: string): string {
  const extendsClause = node.namedChildren.find((c: SyntaxNode) => c.type === "extends_type_clause");
  if (extendsClause) {
    const types = extendsClause.namedChildren
      .filter((c: SyntaxNode) => c.type === "type_identifier" || c.type === "generic_type")
      .map((c: SyntaxNode) => c.text);
    if (types.length > 0) {
      return `interface ${name} extends ${types.join(", ")}`;
    }
  }
  return `interface ${name}`;
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
    is_exported: false,
  };

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const edgeKeys = new Set<string>();
  const pushEdge = (edge: GraphEdge) => {
    const key = `${edge.source}|${edge.target}|${edge.kind}|${edge.provenance.source}|${edge.provenance.evidence}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push(edge);
  };

  const aliasToOriginal = new Map<string, string>();
  const namespaceImports = new Set<string>();

  try {
    const parser = new Parser();
    parser.setLanguage(typescriptLanguage(file) as never);
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
        const signature = extractFunctionSignature(n);
        addNode(
          nodes,
          file,
          "function",
          nameNode.text,
          n.startPosition.row + 1,
          n.endPosition.row + 1,
          contentHash,
          isExportedNode(n),
          signature
        );
        return;
      }

      if (n.type === "class_declaration") {
        const nameNode = n.childForFieldName("name");
        if (!nameNode) return;
        const signature = extractClassSignature(n, nameNode.text);
        addNode(
          nodes,
          file,
          "class",
          nameNode.text,
          n.startPosition.row + 1,
          n.endPosition.row + 1,
          contentHash,
          isExportedNode(n),
          signature
        );
        return;
      }

      if (n.type === "interface_declaration") {
        const nameNode = n.childForFieldName("name");
        if (!nameNode) return;
        const signature = extractInterfaceSignature(n, nameNode.text);
        addNode(
          nodes,
          file,
          "interface",
          nameNode.text,
          n.startPosition.row + 1,
          n.endPosition.row + 1,
          contentHash,
          isExportedNode(n),
          signature
        );
        return;
      }

      if (n.type === "call_expression") {
        const fn = n.childForFieldName("function");
        if (fn?.type === "import") {
          const args = n.childForFieldName("arguments");
          if (args && args.namedChildren.length > 0) {
            const firstArg = args.namedChildren[0];
            if (firstArg?.type === "string" || firstArg?.type === "template_string") {
              const specifier = firstArg.text.replace(/^['"`]|['"`]$/g, "");
              pushEdge({
                source: moduleNode.id,
                target: unresolvedId(specifier),
                kind: "imports",
                provenance: {
                  source: "tree-sitter",
                  confidence: 0.3,
                  evidence: specifier,
                  content_hash: contentHash,
                },
                created_at: Date.now(),
              });
            }
          }
        }
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

        const nsImport = importClause.namedChildren.find((c) => c.type === "namespace_import");
        if (nsImport) {
          const nsNameNode = nsImport.namedChildren.find((c) => c.type === "identifier");
          if (nsNameNode) {
            namespaceImports.add(nsNameNode.text);
            pushEdge({
              source: moduleNode.id,
              target: unresolvedId("*"),
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

        const namedImports = importClause.namedChildren.find((c) => c.type === "named_imports");
        if (namedImports) {
          for (const spec of namedImports.namedChildren) {
            if (spec.type !== "import_specifier") continue;
            const nameNode = spec.childForFieldName("name");
            if (!nameNode) continue;
            const originalName = nameNode.text;

            const aliasNode = spec.childForFieldName("alias");
            if (aliasNode) {
              aliasToOriginal.set(aliasNode.text, originalName);
            }
            pushEdge({
              source: moduleNode.id,
              target: unresolvedId(originalName),
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

      if (n.type === "export_statement") {
        const sourceNode = n.childForFieldName("source");
        if (!sourceNode) return;

        const evidence = sourceNode.text;

        for (const child of n.namedChildren) {
          if (child.type === "export_clause") {
            for (const spec of child.namedChildren) {
              if (spec.type !== "export_specifier") continue;
              const nameNode = spec.childForFieldName("name");
              if (!nameNode) continue;
              const originalName = nameNode.text;

              pushEdge({
                source: moduleNode.id,
                target: unresolvedId(originalName),
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
        }
        return;
      }

      if (n.type === "variable_declarator") {
        const nameNode = n.childForFieldName("name");
        const valueNode = n.childForFieldName("value");
        if (!nameNode || nameNode.type !== "identifier") return;
        if (!valueNode || valueNode.type !== "arrow_function") return;
        const signature = extractFunctionSignature(valueNode);
        addNode(
          nodes,
          file,
          "function",
          nameNode.text,
          n.startPosition.row + 1,
          valueNode.endPosition.row + 1,
          contentHash,
          isExportedNode(n),
          signature
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
            target: unresolvedId(aliasToOriginal.get(callee.text) ?? callee.text),
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
        if (callee?.type === "member_expression") {
          const obj = callee.childForFieldName("object");
          const prop = callee.childForFieldName("property");
          if (obj?.type === "identifier" && prop?.type === "property_identifier" && namespaceImports.has(obj.text)) {
            pushEdge({
              source: nextFunctionId,
              target: unresolvedId(prop.text),
              kind: "calls",
              provenance: {
                source: "tree-sitter",
                confidence: 0.5,
                evidence: callEvidence(prop),
                content_hash: contentHash,
              },
              created_at: Date.now(),
            });
          }
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
