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
    expect(a).toHaveLength(1); // INSERT OR REPLACE deduplicates same (source,target,kind,provenance_source)
    expect(b).toHaveLength(0);
  } finally { store.close(); }
});
