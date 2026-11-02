import { createHash } from "node:crypto";

import Parser from "tree-sitter";
import ts from "tree-sitter-typescript";

import type { GraphEdge, GraphNode, NodeKind } from "../graph/types.js";
import { nodeId } from "../graph/types.js";
import { JS_GLOBALS } from "./js-globals.js";

export interface ExtractionResult {
  module: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** True when tree-sitter parsed the file with errors: nodes and edges are what it recovered. */
  partial: boolean;
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

const TEST_CALLEES = new Set(["test", "it"]);
const CALLBACK_TYPES = new Set(["arrow_function", "function_expression"]);

// Each declaration's field that binds names.
const BINDING_FIELDS: Record<string, string> = {
  function_declaration: "name",
  function_signature: "name",
  generator_function_declaration: "name",
  function_expression: "name",
  generator_function: "name",
  class_declaration: "name",
  abstract_class_declaration: "name",
  class: "name",
  enum_declaration: "name",
  variable_declarator: "name",
  required_parameter: "pattern",
  optional_parameter: "pattern",
  arrow_function: "parameter",
  catch_clause: "parameter",
  for_in_statement: "left",
};
const BOUND_NAME_TYPES = new Set(["identifier", "type_identifier", "shorthand_property_identifier_pattern"]);
// The part of a pattern that binds: not a default value nor a computed key, which are expressions.
const PATTERN_BINDING_FIELD: Record<string, string> = {
  pair_pattern: "value",
  assignment_pattern: "left",
  object_assignment_pattern: "left",
};

function collectBoundNames(node: SyntaxNode, into: Set<string>): void {
  if (BOUND_NAME_TYPES.has(node.type)) into.add(node.text);
  const field = PATTERN_BINDING_FIELD[node.type];
  const parts = field ? [node.childForFieldName(field)] : node.namedChildren;
  for (const part of parts) if (part) collectBoundNames(part, into);
}

/** A package (`yaml`, `@scope/pkg`) or scheme (`node:fs`, `bun:test`) specifier, not `./`, `/`, `#`, `~/` or `@/`. */
// shortcut: a tsconfig `baseUrl` import like `src/x` and a monorepo's workspace package read as packages, so their
// calls go unrecorded; upgrade when an indexed repo uses one, by resolving the specifier against tsconfig and workspaces.
const isPackageSpecifier = (specifier: string): boolean => /^(?:[a-z][a-z0-9+.-]*:|@?[a-z0-9])/i.test(specifier);

/** A `test(`/`it(` call's callback and its title, null when the title is no literal; null when `n` is no such call. */
function testCall(n: SyntaxNode): { title: string | null; callback: SyntaxNode } | null {
  const callee = n.childForFieldName("function");
  if (callee?.type !== "identifier" || !TEST_CALLEES.has(callee.text)) return null;
  const args = (n.childForFieldName("arguments")?.namedChildren ?? []).filter((a) => a.type !== "comment");
  const callback = args.find((a) => CALLBACK_TYPES.has(a.type));
  if (!callback) return null;
  const first = args[0]!;
  const literal =
    first.type === "string" ||
    (first.type === "template_string" && !first.namedChildren.some((c) => c.type === "template_substitution"));
  return { title: literal ? first.text.slice(1, -1) : null, callback };
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

function extractInterfaceMembers(node: SyntaxNode): string[] {
  const body = node.childForFieldName("body");
  if (!body) return [];

  return body.namedChildren
    .filter(
      (member: SyntaxNode) =>
        member.type === "method_signature" ||
        member.type === "property_signature" ||
        member.type === "index_signature" ||
        member.type === "call_signature",
    )
    .map((member: SyntaxNode) => member.text.replace(/;\s*$/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
function extractInterfaceSignature(node: SyntaxNode, name: string): string {
  const extendsClause = node.namedChildren.find((c: SyntaxNode) => c.type === "extends_type_clause");
  const header = (() => {
    if (!extendsClause) return `interface ${name}`;
    const types = extendsClause.namedChildren
      .filter((c: SyntaxNode) => c.type === "type_identifier" || c.type === "generic_type")
      .map((c: SyntaxNode) => c.text);
    return types.length > 0 ? `interface ${name} extends ${types.join(", ")}` : `interface ${name}`;
  })();

  const members = extractInterfaceMembers(node);
  return members.length > 0 ? [header, ...members].join("\n") : header;
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

  const edgeIndex = new Map<string, number>();
  const pushEdge = (edge: GraphEdge) => {
    // The store keeps one edge per source, target, kind and provenance; of a callee's calls, keep the first to end, the first to run.
    const key = edge.call_end
      ? `${edge.source}|${edge.target}|${edge.kind}|${edge.provenance.source}`
      : `${edge.source}|${edge.target}|${edge.kind}|${edge.provenance.source}|${edge.provenance.evidence}`;
    const at = edgeIndex.get(key);
    if (at === undefined) {
      edgeIndex.set(key, edges.length);
      edges.push(edge);
      return;
    }
    const end = edge.call_end;
    const kept = edges[at]!.call_end;
    if (end && kept && (end.line < kept.line || (end.line === kept.line && end.col < kept.col))) edges[at] = edge;
  };

  const aliasToOriginal = new Map<string, string>();
  const namespaceImports = new Set<string>();
  // Local names: every one the file imports, those imported from a package, and every other one it binds.
  const importedLocals = new Set<string>();
  const packageLocals = new Set<string>();
  const boundNames = new Set<string>();
  const addImportLocal = (local: string, fromPackage: boolean) => {
    importedLocals.add(local);
    if (fromPackage) packageLocals.add(local);
  };
  // A call to a package import or a JS global is no project hole; a name the file binds itself keeps its edge.
  const isExternalCallee = (name: string): boolean =>
    !boundNames.has(name) && (packageLocals.has(name) || (!importedLocals.has(name) && JS_GLOBALS.has(name)));
  // A test callback's start index → the node its calls belong to: its test node, or the module for a non-literal title.
  const callbackOwners = new Map<number, string>();
  let partial = false;

  try {
    const parser = new Parser();
    parser.setLanguage(typescriptLanguage(file) as never);
    const tree = parser.parse(content);
    // A file that parses with errors keeps what tree-sitter recovered; `partial` lets the output say so.
    partial =
      typeof (tree.rootNode as unknown as { hasError: unknown }).hasError === "function"
        ? (tree.rootNode as unknown as { hasError: () => boolean }).hasError()
        : Boolean((tree.rootNode as unknown as { hasError: unknown }).hasError);

    walk(tree.rootNode, (n) => {
      const binding = BINDING_FIELDS[n.type] && n.childForFieldName(BINDING_FIELDS[n.type]!);
      if (binding) collectBoundNames(binding, boundNames);
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
        const tc = testCall(n);
        if (tc) {
          const startLine = tc.callback.startPosition.row + 1;
          const name = tc.title === null ? null : `${file} > ${tc.title}`;
          if (name !== null) {
            addNode(nodes, file, "test", name, startLine, tc.callback.endPosition.row + 1, contentHash, false);
          }
          callbackOwners.set(tc.callback.startIndex, name === null ? moduleNode.id : nodeId(file, name, startLine));
        }
      }

      if (n.type === "import_statement") {
        // `import x = require("pkg")` binds a local and makes no `imports` edge.
        const requireClause = n.namedChildren.find((c) => c.type === "import_require_clause");
        const requireLocal = requireClause?.namedChildren.find((c) => c.type === "identifier");
        const requireSource = requireClause?.childForFieldName("source");
        if (requireLocal && requireSource) addImportLocal(requireLocal.text, isPackageSpecifier(requireSource.text.slice(1, -1)));

        const sourceNode = n.childForFieldName("source");
        if (!sourceNode) return;

        const evidence = sourceNode.text;
        const fromPackage = isPackageSpecifier(evidence.slice(1, -1));
        const importClause = n.namedChildren.find((c) => c.type === "import_clause");
        if (!importClause) return;

        const defaultName = importClause.namedChildren.find((c) => c.type === "identifier");
        if (defaultName) {
          addImportLocal(defaultName.text, fromPackage);
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
            addImportLocal(nsNameNode.text, fromPackage);
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
            addImportLocal((aliasNode ?? nameNode).text, fromPackage);
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
    // `endPosition` sits just past the call's last character, so its 0-based column is that character's 1-based one.
    const callEnd = (call: SyntaxNode) => ({ line: call.endPosition.row + 1, col: call.endPosition.column });
    const visitCalls = (n: SyntaxNode, currentFunctionId: string | null): void => {
      let nextFunctionId = callbackOwners.get(n.startIndex) ?? currentFunctionId;

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
        if (callee?.type === "identifier" && !isExternalCallee(callee.text)) {
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
            call_end: callEnd(n),
          });
        }
        if (callee?.type === "member_expression") {
          const obj = callee.childForFieldName("object");
          const prop = callee.childForFieldName("property");
          if (obj?.type === "identifier" && prop?.type === "property_identifier" && namespaceImports.has(obj.text) && !isExternalCallee(obj.text)) {
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
              call_end: callEnd(n),
            });
          }
        }
      }

      if (nextFunctionId && n.type === "new_expression") {
        const ctor = n.childForFieldName("constructor");
        if (ctor?.type === "identifier" && !isExternalCallee(ctor.text)) {
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
            call_end: callEnd(n),
          });
        }
      }

      for (const child of n.namedChildren) visitCalls(child, nextFunctionId);
    };

    visitCalls(tree.rootNode, null);
  } catch {
    // If parser initialization fails, return only the module node; a walk that throws on a recovered tree stays partial.
    return { module: moduleNode, nodes: [], edges: [], partial };
  }

  return { module: moduleNode, nodes, edges, partial };
}

// Back-compat with the existing placeholder export test
export const treeSitterIndex = extractFile;
