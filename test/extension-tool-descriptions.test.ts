import { test } from "bun:test";

test("pi extension registers the approved descriptions for the default public tools", async () => {
  const expected = new Map([
    ["symbol_graph", "Summarize a symbol with relationships, tests, and key metadata."],
    ["impact", "Classify blast radius for changed symbols."],
    ["trace", "Return the call tree below an entry point, or a covering test's recorded path when coverage has one."],
  ]);
  const expectedIncludeDescription = "Extra sections to include.";
  const registeredTools: Array<{ name: string; description: string; parameters?: any }> = [];
  const mockPi = {
    registerTool(tool: { name: string; description: string; parameters?: any }) {
      registeredTools.push(tool);
    },
    on() {},
  };
  const mod = await import("../src/index.js");
  if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();
  mod.default(mockPi as any);
  const names = registeredTools.map((tool) => tool.name).sort();
  const expectedNames = [...expected.keys()].sort();
  if (JSON.stringify(names) !== JSON.stringify(expectedNames)) {
    throw new Error(`registered tool list mismatch: ${names.join(",")}`);
  }
  for (const tool of registeredTools) {
    if (!tool.description.trim()) throw new Error(`empty description for ${tool.name}`);
    const wanted = expected.get(tool.name);
    if (!wanted) throw new Error(`unexpected tool registered: ${tool.name}`);
    if (tool.description !== wanted) {
      throw new Error(`description mismatch for ${tool.name}: ${tool.description}`);
    }
  }
  const symbolGraph = registeredTools.find((tool) => tool.name === "symbol_graph");
  if (!symbolGraph) throw new Error("symbol_graph was not registered");
  const includeDescription = symbolGraph.parameters?.properties?.include?.description;
  if (includeDescription !== expectedIncludeDescription) {
    throw new Error(`symbol_graph include description mismatch: ${includeDescription}`);
  }
});

type Registered = { name: string; description: string; promptSnippet: string; promptGuidelines: string[]; parameters?: any };

async function registeredTool(name: string): Promise<Registered & { claims: string }> {
  const tools: Registered[] = [];
  const mod = await import("../src/index.js");
  if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();
  mod.default({ registerTool: (tool: Registered) => tools.push(tool), on() {} } as any);
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`${name} was not registered`);
  return { ...tool, claims: [tool.description, tool.promptSnippet, ...tool.promptGuidelines].join("\n") };
}

function expectClaims(label: string, text: string, present: RegExp[], absent: RegExp[] = []): void {
  for (const re of present) if (!re.test(text)) throw new Error(`${label} does not say ${re}: ${text}`);
  for (const re of absent) if (re.test(text)) throw new Error(`${label} still says ${re}: ${text}`);
}

test("trace's metadata names the call tree's call-site order, its depth cap and the coverage path", async () => {
  const trace = await registeredTool("trace");
  expectClaims(
    "trace",
    trace.claims,
    [/call tree/, /call-site order/, /3 calls deep/, /\(see above\)/, /\? name \(unresolved, file:line\)/, /more omitted beyond depth 3/, /coverage/],
    [/execution path/, /call path/],
  );
  expectClaims("trace.entry", trace.parameters.properties.entry.description, [/test case/]);
});

test("impact's metadata names callers reached directly or indirectly, the default maxDepth and the tests list", async () => {
  const impact = await registeredTool("impact");
  expectClaims(
    "impact",
    impact.claims,
    [/directly (or|and) indirectly/, /entry points/, /`maxDepth`[^\n]*default 5/, /breaking/, /behavioral/, /Tests reached/],
    [/\bsafe\b/],
  );
  expectClaims("impact.maxDepth", impact.parameters.properties.maxDepth.description, [/default 5/]);
});

test("symbol_graph's metadata names test cases among the callers and claims no edit without a read", async () => {
  const symbolGraph = await registeredTool("symbol_graph");
  expectClaims("symbol_graph", symbolGraph.claims, [/callers[^\n]*test cases|test cases[^\n]*callers/], [/without re-reading/]);
});
