---
id: 3
title: Thread suppressTrustHeader flag through impact
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - src/index.ts
files_to_create:
  - test/extension-suppress-trust-header-impact.test.ts
---

Extend `ImpactParams` with an optional boolean `suppressTrustHeader` and update the `impact` execute call site to forward the flag into `finalizeReadOnlyOutput`. Covers AC 1 (impact), AC 2 (impact), AC 4, AC 6 (impact).

**Files:**
- Modify: `src/index.ts` (ImpactParams schema + impact execute call site)
- Test: `test/extension-suppress-trust-header-impact.test.ts` (create)

**Step 1 — Write the failing test**

Create `test/extension-suppress-trust-header-impact.test.ts`:

```ts
import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { extractFile, sha256Hex } from "../src/indexer/tree-sitter.js";
function register(): ToolDefinition<any>[] {
  const tools: ToolDefinition<any>[] = [];
  const mockPi: ExtensionAPI = {
    registerTool(tool: ToolDefinition<any>) {
      tools.push(tool);
    },
  } as any;
  resetStoreForTesting();
  piCodegraph(mockPi);
  return tools;
}
test("impact schema advertises suppressTrustHeader as an optional boolean", () => {
  const tools = register();
  const tool = tools.find((candidate) => candidate.name === "impact");
  if (!tool) throw new Error("impact was not registered");
  const schema = tool.parameters as any;
  const prop = schema.properties.suppressTrustHeader;
  if (!prop) throw new Error("impact schema is missing suppressTrustHeader");
  expect(prop.type).toBe("boolean");
  const required: string[] = schema.required ?? [];
  expect(required.includes("suppressTrustHeader")).toBe(false);
});

test("impact with suppressTrustHeader:true omits the Trust header on a stale graph", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-impact-suppress-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const sharedOrig = "export function shared() { return 1; }\n";
  const callerOrig = "import { shared } from './shared';\nexport function caller() { return shared(); }\n";
  writeFileSync(join(projectRoot, "src", "shared.ts"), sharedOrig);
  writeFileSync(join(projectRoot, "src", "caller.ts"), callerOrig);

  const dbDir = join(projectRoot, ".codegraph");
  mkdirSync(dbDir, { recursive: true });
  const dbPath = join(dbDir, "graph.db");
  const seed = new SqliteGraphStore(dbPath);
  for (const rel of ["src/shared.ts", "src/caller.ts"] as const) {
    const content = rel === "src/shared.ts" ? sharedOrig : callerOrig;
    const extracted = extractFile(rel, content);
    seed.addNode(extracted.module);
    for (const node of extracted.nodes) seed.addNode(node);
    for (const edge of extracted.edges) seed.addEdge(edge);
    seed.setFileHash(rel, sha256Hex(content));
  }
  // Manually add the resolved caller → shared calls edge so impact can traverse it.
  // (extractFile alone produces only unresolved cross-file edges.)
  seed.addEdge({
    source: "src/caller.ts::caller:2",
    target: "src/shared.ts::shared:1",
    kind: "calls",
    provenance: {
      source: "tree-sitter",
      confidence: 0.8,
      evidence: "shared:2",
      content_hash: sha256Hex(callerOrig),
    },
    created_at: 1,
  });
  seed.close();

  // Mutate shared to make files stale, then lock DB readonly.
  writeFileSync(join(projectRoot, "src", "shared.ts"), "export function shared() { return 2; }\n");
  chmodSync(dbPath, 0o444);

  const tools = register();
  const tool = tools.find((candidate) => candidate.name === "impact");
  if (!tool) throw new Error("impact was not registered");

  try {
    const baseline = await (tool as any).execute(
      "baseline",
      { symbols: ["shared"], changeType: "signature_change" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const baselineText = (baseline.content[0] as any).text as string;
    expect(baselineText).toContain("## Trust\nstatus: stale");
    expect(baselineText).toContain("caller");
    const suppressed = await (tool as any).execute(
      "suppressed",
      { symbols: ["shared"], changeType: "signature_change", suppressTrustHeader: true },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const suppressedText = (suppressed.content[0] as any).text as string;
    expect(suppressedText.includes("## Trust")).toBe(false);
    expect(suppressedText).toContain("caller");
  } finally {
    chmodSync(dbPath, 0o644);
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/extension-suppress-trust-header-impact.test.ts`

Expected: FAIL — the first test throws `Error: impact schema is missing suppressTrustHeader`. After that is fixed, the second test also fails because the flag is ignored: `expect(received).toBe(expected)` with `Expected: false` / `Received: true` on `suppressedText.includes("## Trust")`.

**Step 3 — Write minimal implementation**

Edit `src/index.ts`.

(a) Extend `ImpactParams` (currently defined around the top of the file). Append a property inside `Type.Object({...})`:

```ts
const ImpactParams = Type.Object({
  symbols: Type.Array(Type.String({ description: "Changed symbol name" }), {
    description: "One or more symbol names that changed",
  }),
  changeType: Type.Union(
    [
      Type.Literal("signature_change"),
      Type.Literal("removal"),
      Type.Literal("behavior_change"),
      Type.Literal("addition"),
    ],
    {
      description:
        'Kind of change. Allowed values: "signature_change", "removal", "behavior_change", "addition".',
    },
  ),
  maxDepth: Type.Optional(
    Type.Number({ description: "Maximum traversal depth (default 5)" }),
  ),
  suppressTrustHeader: Type.Optional(
    Type.Boolean({
      description:
        "When true, omit the ## Trust header from tool output. Useful after the first call in a multi-call session.",
    }),
  ),
});
```

(b) Update the `impact` execute call site. Find:

```ts
const output = finalizeReadOnlyOutput("impact", { symbols: params.symbols }, text, store, projectRoot);
```

Replace with:

```ts
const output = finalizeReadOnlyOutput(
  "impact",
  { symbols: params.symbols },
  text,
  store,
  projectRoot,
  params.suppressTrustHeader === true,
);
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/extension-suppress-trust-header-impact.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test`
Expected: all passing (including `test/extension-impact.test.ts` and `test/tool-impact-trust-header.test.ts`).
