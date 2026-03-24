import Parser from "tree-sitter";
import ts from "tree-sitter-typescript";

type SyntaxNode = Parser.SyntaxNode;

function getParser(file: string = "input.ts"): Parser {
  const parser = new Parser();
  const mod = ts as unknown as { typescript: unknown; tsx: unknown };
  const lang = file.endsWith(".tsx") ? mod.tsx : mod.typescript;
  parser.setLanguage(lang as never);
  return parser;
}

function walk(node: SyntaxNode, visit: (n: SyntaxNode) => void): void {
  visit(node);
  for (const child of node.namedChildren) walk(child, visit);
}

function extractBodyLines(content: string, startLine: number, endLine: number): string {
  const lines = content.split(/\r?\n/);
  // startLine and endLine are 1-indexed
  return lines.slice(startLine - 1, endLine).join("\n");
}

export function extractThrows(fileContent: string, startLine: number, endLine: number): string[] {
  const bodyText = extractBodyLines(fileContent, startLine, endLine);
  const parser = getParser();
  const tree = parser.parse(bodyText);
  const throws: string[] = [];

  walk(tree.rootNode, (n) => {
    if (n.type !== "throw_statement") return;

    const expr = n.namedChildren[0];
    if (!expr) {
      throws.push("throw");
      return;
    }

    // throw new Error("msg") or throw new SomeError(...)
    if (expr.type === "new_expression") {
      const ctor = expr.childForFieldName("constructor");
      const args = expr.childForFieldName("arguments");
      const ctorName = ctor?.text ?? "Error";

      // If it's Error with a string argument, extract the message
      if (ctorName === "Error" && args) {
        const firstArg = args.namedChildren[0];
        if (firstArg?.type === "string" || firstArg?.type === "template_string") {
          const msg = firstArg.text.replace(/^['"`]|['"`]$/g, "");
          throws.push(msg);
          return;
        }
      }

      // Otherwise show the class name
      throws.push(ctorName);
      return;
    }

    // Plain throw expression
    const text = expr.text;
    throws.push(text.length > 80 ? text.slice(0, 77) + "..." : text);
  });

  return throws;
}

export function extractGuards(fileContent: string, startLine: number, endLine: number): string[] {
  const bodyText = extractBodyLines(fileContent, startLine, endLine);
  const parser = getParser();
  const tree = parser.parse(bodyText);
  const guards: string[] = [];

  walk(tree.rootNode, (n) => {
    if (n.type !== "if_statement") return;

    const consequence = n.childForFieldName("consequence");
    if (!consequence) return;

    // Check if the body is a return statement (or block with just a return)
    let isGuard = false;
    if (consequence.type === "return_statement") {
      isGuard = true;
    } else if (consequence.type === "statement_block") {
      const stmts = consequence.namedChildren.filter((c) => c.type !== "comment");
      if (stmts.length === 1 && stmts[0]?.type === "return_statement") {
        isGuard = true;
      }
    }

    if (!isGuard) return;

    const condition = n.childForFieldName("condition");
    if (!condition) return;

    // Extract the condition text, stripping outer parens
    let condText = condition.text;
    if (condText.startsWith("(") && condText.endsWith(")")) {
      condText = condText.slice(1, -1);
    }
    guards.push(condText.length > 80 ? condText.slice(0, 77) + "..." : condText);
  });

  return guards;
}

export interface TestBehavior {
  testName: string;
  assertions: string[];
}

const SUPPORTED_MATCHERS = new Set(["toBe", "toThrow", "toContain", "toHaveLength"]);

export function extractTestAssertions(fileContent: string): TestBehavior[] {
  const parser = getParser();
  const tree = parser.parse(fileContent);
  const behaviors: TestBehavior[] = [];

  // Find test() or it() call expressions at top level
  walk(tree.rootNode, (n) => {
    if (n.type !== "call_expression") return;
    const fn = n.childForFieldName("function");
    if (!fn || (fn.text !== "test" && fn.text !== "it")) return;

    const args = n.childForFieldName("arguments");
    if (!args) return;

    // First arg is the test name string
    const nameArg = args.namedChildren[0];
    if (!nameArg || (nameArg.type !== "string" && nameArg.type !== "template_string")) return;
    const testName = nameArg.text.replace(/^['"`]|['"`]$/g, "");

    // Second arg is the callback — find expect() calls in it
    const callback = args.namedChildren[1];
    if (!callback) {
      behaviors.push({ testName, assertions: [] });
      return;
    }

    const assertions: string[] = [];
    walk(callback, (inner) => {
      if (inner.type !== "call_expression") return;
      const innerFn = inner.childForFieldName("function");
      if (!innerFn || innerFn.type !== "member_expression") return;

      const prop = innerFn.childForFieldName("property");
      if (!prop || !SUPPORTED_MATCHERS.has(prop.text)) return;

      // Check that the chain starts with expect()
      const obj = innerFn.childForFieldName("object");
      if (!obj) return;

      let hasExpect = false;
      walk(obj, (e) => {
        if (e.type === "call_expression") {
          const eFn = e.childForFieldName("function");
          if (eFn?.text === "expect") hasExpect = true;
        }
      });
      if (!hasExpect) return;

      // Build assertion string
      const matcherArgs = inner.childForFieldName("arguments");
      const argText = matcherArgs?.namedChildren.map((c) => {
        const t = c.text;
        return t.length > 40 ? t.slice(0, 37) + "..." : t;
      }).join(", ") ?? "";
      assertions.push(`${prop.text}(${argText})`);
    });

    behaviors.push({ testName, assertions });
  });

  return behaviors;
}