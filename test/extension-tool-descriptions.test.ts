import { test } from "bun:test";

test("pi extension registers the approved descriptions for the default public tools", async () => {
  const expected = new Map([
    ["symbol_graph", "Summarize a symbol: who calls it, which tests call it, what it calls, and key metadata."],
    ["impact", "Classify blast radius for changed symbols, then list the tests calling them directly before those reached through other callers."],
    ["trace", "Return the call tree below an entry point or the function holding a file line, or, when coverage has one, the functions a covering test's report covered."],
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
  for (const re of absent) if (re.test(text)) throw new Error(`${label} still says ${re}: ${text}`);
  for (const re of present) if (!re.test(text)) throw new Error(`${label} does not say ${re}: ${text}`);
}

test("trace's metadata names the call tree's call-site order, its depth cap and what coverage mode prints", async () => {
  const trace = await registeredTool("trace");
  expectClaims(
    "trace",
    trace.claims,
    [/call tree/, /call-site order/, /3 calls deep/, /\(see above\)/, /\? name \(unresolved, file:line\)/, /more omitted beyond depth 3/, /mode: coverage/, /report covered/, /by file and line, not call order/, /same list/],
    [/execution path/, /call path/, /recorded/, /\bpath\b/],
  );
  expectClaims("trace.entry", trace.parameters.properties.entry.description, [/test case/]);
});

test("impact's metadata names callers reached directly or indirectly, the default maxDepth and the tests list", async () => {
  const impact = await registeredTool("impact");
  expectClaims(
    "impact",
    impact.claims,
    [/directly (or|and) indirectly/, /entry points/, /`maxDepth`[^\n]*default 5/, /breaking/, /behavioral/, /`Tests reached directly`[^\n]*`Tests reached through other callers`/],
    [/\bsafe\b/, /one `Tests reached` list/],
  );
  expectClaims("impact.maxDepth", impact.parameters.properties.maxDepth.description, [/default 5/]);
});

test("symbol_graph's metadata names test cases among the callers and claims no edit without a read", async () => {
  const symbolGraph = await registeredTool("symbol_graph");
  expectClaims("symbol_graph", symbolGraph.claims, [/callers[^\n]*test cases|test cases[^\n]*callers/], [/without re-reading/]);
});

// The questions each tool answers, worded against decision 0003's transcripts: Opus skipped trace on "what runs"
// questions starting at an unnamed handler, and pruned impact's full test list on "which tests" questions.
test("each tool's metadata names the questions it answers", async () => {
  const [trace, impact, symbolGraph] = await Promise.all([registeredTool("trace"), registeredTool("impact"), registeredTool("symbol_graph")]);
  expectClaims("trace", trace.claims, [/what runs/, /in what order/, /handler or callback/, /`file` (\+|and) `line`/, /innermost function holding that line/]);
  expectClaims("trace.promptSnippet", trace.promptSnippet, [/what runs/, /`file` \+ `line`/]);
  expectClaims("trace.description", trace.description, [/file line/]);
  expectClaims("impact", impact.claims, [/which tests exercise/, /answer from `Tests reached directly`/, /not a list to prune by hand/]);
  expectClaims("impact.promptSnippet", impact.promptSnippet, [/tests calling it directly, before those reached through other callers/], [/then the tests reached$/]);
  expectClaims("symbol_graph", symbolGraph.claims, [/which tests exercise or cover/, /which to rerun/, /`Test callers \(<n> in <m> files\)`/, /10 files at most/]);
  expectClaims("symbol_graph.promptSnippet", symbolGraph.promptSnippet, [/which tests call it/]);
});

// Worded against decision 0004's transcripts: each Opus trace cell grepped first, its hits carrying file:line, then read
// whole files, and its 3 trace calls all passed `entry`.
test("trace's metadata puts file + line from a grep hit or a read first, and each tool's name parameter takes a method", async () => {
  const [trace, impact, symbolGraph] = await Promise.all([registeredTool("trace"), registeredTool("impact"), registeredTool("symbol_graph")]);
  expectClaims("trace", trace.claims, [/grep hit or a read/, /before reading the file/, /`→ callbacks`/], [/the index names no symbol for/]);
  expectClaims("trace.promptSnippet", trace.promptSnippet, [/^Trace what runs from a `file` \+ `line`/, /`Class\.method`/]);
  expectClaims("trace.line", trace.parameters.properties.line.description, [/grep hit or read/]);
  for (const [label, description] of [
    ["trace.entry", trace.parameters.properties.entry.description],
    ["symbol_graph.name", symbolGraph.parameters.properties.name.description],
    ["impact.symbols", impact.parameters.properties.symbols.items.description],
  ]) {
    expectClaims(label, description, [/`Class\.method` or its bare name/]);
  }
});
