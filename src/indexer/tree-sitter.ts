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

const FUNCTION_TYPES = new Set([
  "function_declaration",
  "generator_function_declaration",
  "function_expression",
  "generator_function",
  "arrow_function",
  "method_definition",
]);

const MEMBER_NAME_TYPES = new Set(["property_identifier", "private_property_identifier"]);

/** `Class.member` for a method, accessor, constructor or arrow-valued field of a named class; null for any other node. */
function memberName(n: SyntaxNode): string | null {
  const isMember =
    n.type === "method_definition" || (n.type === "public_field_definition" && n.childForFieldName("value")?.type === "arrow_function");
  const cls = n.parent?.type === "class_body" ? n.parent.parent : null;
  const className = cls?.type === "class_declaration" ? cls.childForFieldName("name")?.text : undefined;
  const name = n.childForFieldName("name");
  return isMember && className && name && MEMBER_NAME_TYPES.has(name.type) ? `${className}.${name.text}` : null;
}

/** The nodes that bind their own `this`, so a `this.m()` inside one is no enclosing class's. */
const THIS_BINDERS = new Set([...FUNCTION_TYPES, "class", "abstract_class_declaration"].filter((t) => t !== "arrow_function"));

/** The innermost functions whose spans hold 0-based `row`: one holding no other that holds it; several only side by side. */
function innermostFunctionsAt(root: SyntaxNode, row: number): SyntaxNode[] {
  const holders: SyntaxNode[] = [];
  walk(root, (n) => {
    if (FUNCTION_TYPES.has(n.type) && n.startPosition.row <= row && n.endPosition.row >= row) holders.push(n);
  });
  return holders.filter((h) => !holders.some((o) => o !== h && o.startIndex >= h.startIndex && o.endIndex <= h.endIndex));
}

/** A member's `Class.member`, else a function's own name, else the variable, property or assignee it is bound to, else `<anonymous>`. */
function functionName(fn: SyntaxNode): string {
  const parent = fn.parent;
  const member = memberName(fn) ?? (parent ? memberName(parent) : null);
  if (member) return member;
  const named =
    fn.childForFieldName("name") ??
    (parent?.type === "variable_declarator" ? parent.childForFieldName("name") : null) ??
    (parent?.type === "pair" ? parent.childForFieldName("key") : null) ??
    (parent?.type === "assignment_expression" ? parent.childForFieldName("left") : null);
  return named?.text ?? "<anonymous>";
}

/** The function `extractFunctionAt` found, and the calls the index files under its owner from inside it. */
export interface FunctionAt {
  name: string;
  startLine: number;
  /** The node the index files its calls under: its own, or the enclosing function's or test's; null at module level. */
  ownerId: string | null;
  /** True when `ownerId` is the function's own node. */
  own: boolean;
  /** Its calls, each callee once at its first call to end, sourced at `nodeId(file, name, startLine)`. */
  calls: GraphEdge[];
}

/** What a line holds: no function, one innermost function, or several side by side, each by name and 1-based position. */
export type FunctionsAt =
  | { kind: "none" }
  | { kind: "one"; fn: FunctionAt }
  | { kind: "several"; fns: Array<{ name: string; line: number; column: number }> };

/** A push that keeps one edge per source, target, kind and provenance; of a callee's calls, the first to end, the first to run. */
function edgeSink(edges: GraphEdge[]): (edge: GraphEdge) => void {
  const edgeIndex = new Map<string, number>();
  return (edge) => {
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
}

function extract(file: string, content: string, entryLine?: number): ExtractionResult & { functionsAt: FunctionsAt } {
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
  const pushEdge = edgeSink(edges);
  let functionsAt: FunctionsAt = { kind: "none" };

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

      const member = memberName(n);
      if (member) {
        const fn = n.type === "method_definition" ? n : n.childForFieldName("value")!;
        // A member is no module export, its class is.
        addNode(nodes, file, "function", member, n.startPosition.row + 1, n.endPosition.row + 1, contentHash, false, extractFunctionSignature(fn));
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
    type Callee = { name: string; at: SyntaxNode; target?: string };
    // The project callee `n` calls itself, by the name its edge targets, and the node its evidence points at; `members`
    // are the class members `this` reaches here, by name, a `this.m()` to one of them resolved to its node.
    const calleeOf = (n: SyntaxNode, members: Map<string, string> | null): Callee | null => {
      if (n.type === "new_expression") {
        const ctor = n.childForFieldName("constructor");
        return ctor?.type === "identifier" && !isExternalCallee(ctor.text) ? { name: ctor.text, at: ctor } : null;
      }
      if (n.type !== "call_expression") return null;
      const callee = n.childForFieldName("function");
      if (callee?.type === "identifier" && !isExternalCallee(callee.text)) {
        return { name: aliasToOriginal.get(callee.text) ?? callee.text, at: callee };
      }
      if (callee?.type === "member_expression") {
        const obj = callee.childForFieldName("object");
        const prop = callee.childForFieldName("property");
        if (obj?.type === "identifier" && prop?.type === "property_identifier" && namespaceImports.has(obj.text) && !isExternalCallee(obj.text)) {
          return { name: prop.text, at: prop };
        }
        if (obj?.type === "this" && members && prop && MEMBER_NAME_TYPES.has(prop.type)) {
          return { name: prop.text, at: prop, target: members.get(prop.text) };
        }
      }
      return null;
    };
    const callEdge = (source: string, callee: Callee, call: SyntaxNode): GraphEdge => ({
      source,
      target: callee.target ?? unresolvedId(callee.name),
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: callEvidence(callee.at), content_hash: contentHash },
      created_at: Date.now(),
      call_end: callEnd(call),
    });
    type ClassMembers = Record<"static" | "instance", Map<string, string>>;
    const isStatic = (member: SyntaxNode) => member.children.some((c) => c.type === "static");
    /** A class's static and instance members, apart, by their bare name, each to its node; a setter none, as no read runs it. */
    const membersOf = (cls: SyntaxNode): ClassMembers => {
      const sides: ClassMembers = { static: new Map(), instance: new Map() };
      for (const m of cls.childForFieldName("body")?.namedChildren ?? []) {
        const name = memberName(m);
        const bare = m.childForFieldName("name")?.text;
        const setter = m.children.some((c) => c.type === "set");
        if (name && bare && !setter) sides[isStatic(m) ? "static" : "instance"].set(bare, nodeId(file, name, m.startPosition.row + 1));
      }
      return sides;
    };

    // The node `n` files its own calls under when it starts one: a test callback's, a named declaration's, a named arrow's, a member's.
    const ownId = (n: SyntaxNode): string | null => {
      const test = callbackOwners.get(n.startIndex);
      if (test) return test;
      const name = n.childForFieldName("name");
      if (n.type === "function_declaration" && name) return nodeId(file, name.text, n.startPosition.row + 1);
      if (n.type === "variable_declarator" && name?.type === "identifier" && n.childForFieldName("value")?.type === "arrow_function") {
        return nodeId(file, name.text, n.startPosition.row + 1);
      }
      const member = memberName(n);
      return member && nodeId(file, member, n.startPosition.row + 1);
    };

    const held = entryLine === undefined ? [] : innermostFunctionsAt(tree.rootNode, entryLine - 1);
    const entryFn = held.length === 1 ? held[0]! : null;
    const entryEdges: GraphEdge[] = [];
    const pushEntryEdge = edgeSink(entryEdges);
    const entryId = entryFn ? nodeId(file, functionName(entryFn), entryFn.startPosition.row + 1) : "";
    let entryOwner: string | null = null;

    /** `cls` holds the enclosing class's members, `members` the side of them `this` reaches here: a static member's or an instance one's. */
    const visitCalls = (
      n: SyntaxNode,
      currentFunctionId: string | null,
      inEntry: boolean,
      cls: ClassMembers | null,
      members: Map<string, string> | null,
    ): void => {
      const nextFunctionId = ownId(n) ?? currentFunctionId;
      const rebinds = n.type === "class_declaration" || (THIS_BINDERS.has(n.type) && !memberName(n));
      const nextCls = n.type === "class_declaration" ? membersOf(n) : rebinds ? null : cls;
      const nextMembers = rebinds ? null : memberName(n) && nextCls ? nextCls[isStatic(n) ? "static" : "instance"] : members;

      if (entryFn && n.startIndex === entryFn.startIndex && n.type === entryFn.type) {
        entryOwner = nextFunctionId;
        inEntry = true;
      }

      const callee = calleeOf(n, nextMembers);
      if (callee && nextFunctionId) pushEdge(callEdge(nextFunctionId, callee, n));
      // The entry's calls are those the index files under its owner: a nested callback's, not a nested named function's.
      if (callee && inEntry && nextFunctionId === entryOwner) pushEntryEdge(callEdge(entryId, callee, n));

      for (const child of n.namedChildren) visitCalls(child, nextFunctionId, inEntry, nextCls, nextMembers);
    };

    visitCalls(tree.rootNode, null, false, null, null);
    if (entryFn) {
      // A named arrow's node starts at its declarator or field, the arrow's parent.
      const own = ownId(entryFn) ?? (entryFn.parent && /^(variable_declarator|public_field_definition)$/.test(entryFn.parent.type) ? ownId(entryFn.parent) : null);
      const fn: FunctionAt = {
        name: functionName(entryFn),
        startLine: entryFn.startPosition.row + 1,
        ownerId: entryOwner,
        // A test callback with no literal title files its calls under the module, which no function is.
        own: own !== null && own === entryOwner && nodes.some((node) => node.id === own),
        calls: entryEdges,
      };
      functionsAt = { kind: "one", fn };
    } else if (held.length > 1) {
      functionsAt = {
        kind: "several",
        fns: held.map((h) => ({ name: functionName(h), line: h.startPosition.row + 1, column: h.startPosition.column + 1 })),
      };
    }
  } catch {
    // If parser initialization fails, return only the module node; a walk that throws on a recovered tree stays partial.
    return { module: moduleNode, nodes: [], edges: [], partial, functionsAt: { kind: "none" } };
  }

  return { module: moduleNode, nodes, edges, partial, functionsAt };
}

export function extractFile(file: string, content: string): ExtractionResult {
  const { functionsAt: _functionsAt, ...result } = extract(file, content);
  return result;
}

/** The innermost function holding 1-based `line` and the calls it makes, as `extractFile` reads them. */
export function extractFunctionAt(file: string, content: string, line: number): FunctionsAt {
  return extract(file, content, line).functionsAt;
}

// Back-compat with the existing placeholder export test
export const treeSitterIndex = extractFile;
