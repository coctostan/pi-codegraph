## Task 6: Extract `calls` edges for bare calls + constructors (ignore method calls)

Step 3 is not executable as written. It currently says:

> "Implement the scope-aware traversal and `calls` edges as described previously in this task"

That is too vague for implementation and fails the TDD requirement for full implementation code.

Replace Step 3 with a concrete code patch for `src/indexer/tree-sitter.ts` that includes **all** call-edge logic, not a prose reference.

Use this exact pattern (compatible with the APIs already introduced in Tasks 3–5):

```ts
// after: const tree = parser.parse(content);
if (tree.rootNode.hasError()) {
  return { module: moduleNode, nodes: [], edges: [] };
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
          evidence: callee.text,
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
          evidence: ctor.text,
          content_hash: contentHash,
        },
        created_at: Date.now(),
      });
    }
  }

  for (const child of n.namedChildren) visitCalls(child, nextFunctionId);
};

visitCalls(tree.rootNode, null);
```

This ensures:
- `foo()` edges come from the containing function node (AC15)
- `new MyClass()` creates a `calls` edge (AC16)
- `obj.method()` / `this.method()` are excluded by `identifier` check (AC17–18)
- `tree-sitter` provenance with `confidence: 0.5` is explicit in code (AC19)
- parse-error behavior is explicit and testable (AC27)

Also update Step 2 expected failure text to include the concrete assertion mismatch line from Bun output (not only "fooCall undefined").