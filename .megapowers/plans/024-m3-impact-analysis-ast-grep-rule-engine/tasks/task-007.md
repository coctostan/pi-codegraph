---
id: 7
title: Create renders edges from React matches with enclosing function lookup
status: approved
depends_on:
  - 3
  - 4
  - 5
no_test: false
files_to_modify:
  - src/indexer/ast-grep.ts
files_to_create:
  - src/rules/react.yaml
  - test/indexer-ast-grep-react.test.ts
---

### Task 7: Create renders edges from React matches with enclosing function lookup [depends: 3, 4, 5]
**Files:**
- Modify: `src/indexer/ast-grep.ts`
- Create: `src/rules/react.yaml`
- Test: `test/indexer-ast-grep-react.test.ts`
Scope: same-file-only target resolution (`store.findNodes(name, match.file)`), no cross-file fallback.
**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { applyRuleMatches, type AstGrepRule, type SgMatch } from "../src/indexer/ast-grep.js";
const reactRule: AstGrepRule = {
  name: "react-render",
  pattern: "<$COMPONENT $$$ATTRS />",
  lang: "tsx",
  produces: { edge_kind: "renders", from_context: "enclosing_function", to_capture: "COMPONENT", confidence: 0.8 },
};
test("applyRuleMatches emits renders from smallest containing function", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/App.tsx::App:1", kind: "function", name: "App", file: "src/App.tsx", start_line: 1, end_line: 12, content_hash: "h" });
    store.addNode({ id: "src/App.tsx::renderPanel:4", kind: "function", name: "renderPanel", file: "src/App.tsx", start_line: 4, end_line: 8, content_hash: "h" });
    store.addNode({ id: "src/App.tsx::Button:20", kind: "function", name: "Button", file: "src/App.tsx", start_line: 20, end_line: 24, content_hash: "h" });
    store.addNode({ id: "src/components/Button.tsx::Button:1", kind: "function", name: "Button", file: "src/components/Button.tsx", start_line: 1, end_line: 3, content_hash: "h2" });
    const matches: SgMatch[] = [{ file: "src/App.tsx", line: 6, column: 5, metaVariables: { COMPONENT: "Button" } }];
    applyRuleMatches(store, reactRule, matches);
    const nested = store.getNeighbors("src/App.tsx::renderPanel:4", { direction: "out", kind: "renders" });
    const outer = store.getNeighbors("src/App.tsx::App:1", { direction: "out", kind: "renders" });
    expect(nested).toHaveLength(1);
    expect(nested[0]!.node.id).toBe("src/App.tsx::Button:20");
    expect(nested[0]!.edge.kind).toBe("renders"); // AC 14
    expect(outer).toHaveLength(0);
  } finally { store.close(); }
});
test("enclosing_function boundaries are inclusive and tie-break is deterministic", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/App.tsx::A:4", kind: "function", name: "A", file: "src/App.tsx", start_line: 4, end_line: 8, content_hash: "h" });
    store.addNode({ id: "src/App.tsx::B:4", kind: "function", name: "B", file: "src/App.tsx", start_line: 4, end_line: 8, content_hash: "h" });
    store.addNode({ id: "src/App.tsx::Button:20", kind: "function", name: "Button", file: "src/App.tsx", start_line: 20, end_line: 24, content_hash: "h" });

    applyRuleMatches(store, reactRule, [
      { file: "src/App.tsx", line: 4, column: 1, metaVariables: { COMPONENT: "Button" } },
      { file: "src/App.tsx", line: 8, column: 1, metaVariables: { COMPONENT: "Button" } },
    ]);
    const a = store.getNeighbors("src/App.tsx::A:4", { direction: "out", kind: "renders" });
    const b = store.getNeighbors("src/App.tsx::B:4", { direction: "out", kind: "renders" });
    // deterministic tie-break on identical span/start_line uses id ordering
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(0);
  } finally { store.close(); }
});
```
**Step 2 — Run test and confirm RED**
```bash
bun test test/indexer-ast-grep-react.test.ts
```
Expected: `FAIL — Expected length: 1, received length: 0`

**Step 3 — Implement same-file renders processing**
```ts
// src/indexer/ast-grep.ts
import type { GraphStore } from "../graph/store.js";
import type { GraphNode } from "../graph/types.js";
// GraphStore contract excerpt: getNodesByFile(file), findNodes(name, file?), addEdge(...).
function metaValue(meta: Record<string, string | string[]>, key: string): string | null {
  const value = meta[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return String(value[0]);
  return null;
}
function smallestContainingFunction(nodes: GraphNode[], line: number): GraphNode | null {
  const candidates = nodes.filter((n) => n.kind === "function" && n.start_line <= line && (n.end_line ?? n.start_line) >= line);
  if (candidates.length === 0) return null;
  const span = (n: GraphNode) => (n.end_line ?? n.start_line) - n.start_line;
  return candidates.sort((a, b) => span(a) - span(b) || a.start_line - b.start_line || a.id.localeCompare(b.id))[0]!;
}
function applyRendersMatches(store: GraphStore, rule: AstGrepRule, matches: SgMatch[]): void {
  for (const match of matches) {
    const targetName = metaValue(match.metaVariables, rule.produces.to_capture ?? "");
    if (!targetName) continue;
    const sourceNode = smallestContainingFunction(store.getNodesByFile(match.file), match.line);
    if (!sourceNode) continue;
    const targetNode = store.findNodes(targetName, match.file)[0];
    if (!targetNode) continue;
    store.addEdge({
      source: sourceNode.id,
      target: targetNode.id,
      kind: "renders",
      provenance: { source: "ast-grep", confidence: rule.produces.confidence, evidence: `${rule.name}@${match.file}:${match.line}:${match.column}`, content_hash: sourceNode.content_hash },
      created_at: Date.now(),
    });
  }
}
export function applyRuleMatches(store: GraphStore, rule: AstGrepRule, matches: SgMatch[]): void {
  if (rule.produces.edge_kind === "routes_to") return applyRoutesToMatches(store, rule, matches);
  if (rule.produces.edge_kind === "renders") return applyRendersMatches(store, rule, matches);
}
```
```yaml
# src/rules/react.yaml
- name: react-render
  pattern: <$COMPONENT $$$ATTRS />
  lang: tsx
  produces:
    edge_kind: renders
    from_context: enclosing_function
    to_capture: COMPONENT
    confidence: 0.8
```
**Step 4 — Re-run focused test (GREEN)**
```bash
bun test test/indexer-ast-grep-react.test.ts
```
Expected: PASS
**Step 5 — Verify no regressions**
```bash
bun test
```
Expected: All tests pass.
