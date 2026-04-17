---
id: 6
title: Append source sections from the shared source renderer
status: approved
depends_on:
  - 1
  - 3
  - 4
no_test: false
files_to_modify:
  - src/tools/symbol-card.ts
  - src/tools/symbol-graph.ts
files_to_create:
  - test/tool-symbol-graph-source-include.test.ts
---

### Task 6: Append source sections from the shared source renderer [depends: 1, 3, 4]

Covers AC 2, AC 14, AC 15, AC 16, AC 17, AC 18, AC 22.
**Files:**
- Modify: `src/tools/symbol-card.ts`
- Modify: `src/tools/symbol-graph.ts`
- Create: `test/tool-symbol-graph-source-include.test.ts`
**Step 1 — Write the failing test**
Create `test/tool-symbol-graph-source-include.test.ts`:
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { suppressFreshTrustHeader } from "../src/output/read-only-ceremony.js";
import { renderLegacyNeighborhoodBody, symbolGraph } from "../src/tools/symbol-graph.js";
import { renderSymbolSourceSection, symbolCard } from "../src/tools/symbol-card.js";
function setupSourceFixture(): { projectRoot: string; store: SqliteGraphStore; cleanup: () => void } {
  const projectRoot = join(tmpdir(), `pi-cg-sg-source-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const srcContent = "export function foo() {\n  return 1;\n}\n";
  writeFileSync(join(projectRoot, "src/foo.ts"), srcContent);


  const store = new SqliteGraphStore();
  const srcHash = sha256Hex(srcContent);
  store.addNode({ id: "src/foo.ts::foo:1", kind: "function", name: "foo", file: "src/foo.ts", start_line: 1, end_line: 3, content_hash: srcHash, is_exported: true, signature: "() => number" });
  return {
    projectRoot,
    store,
    cleanup: () => {
      store.close();
      rmSync(projectRoot, { recursive: true, force: true });
    },
  };
}
test("include:['source'] appends the shared source section to the compact card base", () => {
  const { projectRoot, store, cleanup } = setupSourceFixture();
  try {
    const base = symbolGraph({ name: "foo", store, projectRoot });
    const source = renderSymbolSourceSection({ name: "foo", store, projectRoot });
    const withSource = symbolGraph({ name: "foo", include: ["source"] as any, store, projectRoot });


    expect(withSource.startsWith(base)).toBe(true);
    expect(withSource.slice(base.length)).toBe(`\n${source.body}`);
    expect(withSource).not.toContain("### Source\n### Source");
  } finally {
    cleanup();
  }
});
test("include:['neighborhood','source'] keeps neighborhood as the active base and appends source after it", () => {
  const { projectRoot, store, cleanup } = setupSourceFixture();
  try {
    const neighborhoodBody = renderLegacyNeighborhoodBody({ name: "foo", store, projectRoot }).body;
    const source = renderSymbolSourceSection({ name: "foo", store, projectRoot });
    const withSource = suppressFreshTrustHeader(symbolGraph({ name: "foo", include: ["neighborhood", "source"] as any, store, projectRoot }));


    expect(withSource.startsWith(neighborhoodBody)).toBe(true);
    expect(withSource.slice(neighborhoodBody.length)).toBe(`\n${source.body}`);
  } finally {
    cleanup();
  }
});
test("include:['contract','source'] appends contract then source after the active base", () => {
  const { projectRoot, store, cleanup } = setupSourceFixture();
  try {
    const withBoth = symbolGraph({ name: "foo", include: ["contract", "source"] as any, store, projectRoot });
    const contractIdx = withBoth.indexOf("## Contract: foo");
    const sourceIdx = withBoth.indexOf("### Source");


    expect(contractIdx).toBeGreaterThan(-1);
    expect(sourceIdx).toBeGreaterThan(contractIdx);
  } finally {
    cleanup();
  }
});

test("include:['source'] returns explicit not-found output", () => {
  const { projectRoot, store, cleanup } = setupSourceFixture();
  try {
    const missing = symbolGraph({ name: "doesNotExist", include: ["source"] as any, store, projectRoot });
    expect(missing).toContain('Symbol "doesNotExist" not found');
  } finally {
    cleanup();
  }
});

test("include:['source'] returns explicit ambiguity output", () => {
  const { projectRoot, store, cleanup } = setupSourceFixture();
  try {
    const dupContent = "export class foo {}\n";
    writeFileSync(join(projectRoot, "src/dup.ts"), dupContent);
    const dupHash = sha256Hex(dupContent);
    store.addNode({
      id: "src/dup.ts::foo:1",
      kind: "class",
      name: "foo",
      file: "src/dup.ts",
      start_line: 1,
      end_line: 1,
      content_hash: dupHash,
    });

    const ambiguous = symbolGraph({ name: "foo", include: ["source"] as any, store, projectRoot });
    expect(ambiguous).toContain('Multiple matches for "foo"');
    expect(ambiguous).toContain("src/foo.ts");
    expect(ambiguous).toContain("src/dup.ts");
  } finally {
    cleanup();
  }
});

test("symbolCard routes its Source section through renderSymbolSourceSection for AC 15", () => {
  const { projectRoot, store, cleanup } = setupSourceFixture();
  try {
    const standalone = symbolCard({ name: "foo", store, projectRoot });
    const source = renderSymbolSourceSection({ name: "foo", store, projectRoot });

    // The shared helper body (e.g. `### Source\n<snippet>\n`) must appear inside the
    // standalone card output, proving symbolCard() now reuses the shared renderer.
    expect(standalone).toContain(source.body.trimEnd());
  } finally {
    cleanup();
  }
});
```
**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-graph-source-include.test.ts`
Expected: FAIL — `SyntaxError: Export named 'renderSymbolSourceSection' not found in module '.../src/tools/symbol-card.ts'`
**Step 3 — Write minimal implementation**
In `src/tools/symbol-card.ts`, export a shared source-section renderer that reuses `readSourceSnippet()`, and **refactor `symbolCard()` to route its existing `### Source` block through this helper** so the standalone card output and the new `include: ["source"]` path share the same rendering code (AC 15):

```ts
export interface RenderedSymbolSection {
  body: string;
  hasLocalExceptions: boolean;
}
export function renderSymbolSourceSection(params: SymbolCardParams): RenderedSymbolSection {
  const { name, file, store, projectRoot, maxSourceLines } = params;
  const nodes = store.findNodes(name, file);
  if (nodes.length === 0) {
    return { body: `Symbol "${name}" not found`, hasLocalExceptions: false };
  }
  if (nodes.length > 1) {
    const lines: string[] = [`Multiple matches for "${name}":\n`];
    for (const node of nodes) {
      const anchor = computeAnchor(node, projectRoot);
      const staleMarker = anchor.stale ? " [stale]" : "";
      lines.push(`  ${anchor.anchor}  ${node.name} (${node.kind})  ${node.file}${staleMarker}`);
    }
    return { body: `${lines.join("\n")}\n`, hasLocalExceptions: lines.some((line) => line.includes("[stale]")) };
  }
  const node = nodes[0]!;
  const snippet = readSourceSnippet(node, projectRoot, maxSourceLines);
  const heading = snippet?.stale ? "### Source [stale]" : "### Source";
  return {
    body: `${heading}\n${snippet ? snippet.text : "source unavailable"}\n`,
    hasLocalExceptions: snippet?.stale ?? false,
  };
}
```

Then update the existing `symbolCard()` function in the same file so its current inline source block at `src/tools/symbol-card.ts:50-61` is replaced by a call to `renderSymbolSourceSection({ name, file, store, projectRoot, maxSourceLines })` and the returned `body` is spliced into the `lines` array at the same position. This preserves the standalone card output shape (so `test/tool-symbol-card-happy.test.ts`, `test/tool-symbol-card-source.test.ts`, etc. stay green) while routing the actual source rendering through the shared helper.

Then in `src/tools/symbol-graph.ts`, append the shared source section after the active base and after any contract section:

```ts
import { renderSymbolCardBody, renderSymbolSourceSection } from "./symbol-card.js";


if ((include ?? []).includes("source")) {
  const rendered = renderSymbolSourceSection({
    name: params.name,
    file: params.file,
    store: params.store,
    projectRoot: params.projectRoot,
  });
  body = `${body}${body.endsWith("\n") ? "\n" : "\n\n"}${rendered.body}`;
  hasLocalExceptions = hasLocalExceptions || rendered.hasLocalExceptions;
}
```

Do not inline source into the default base; it must remain opt-in.
**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-graph-source-include.test.ts`
Expected: PASS
**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing (existing `test/tool-symbol-card-source.test.ts` and other standalone card tests still green because the standalone `### Source` / `### Source [stale]` shape is preserved).
