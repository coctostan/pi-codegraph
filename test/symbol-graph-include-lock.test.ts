import { test } from "bun:test";

test("symbol_graph.include wording and literal set from #066 are unchanged", async () => {
  const registeredTools: Array<{ name: string; description: string; parameters?: any }> = [];
  const mockPi = {
    registerTool(tool: { name: string; description: string; parameters?: any }) {
      registeredTools.push(tool);
    },
    on() {},
  };
  const mod = await import("../src/index.js");
  if (typeof (mod as any).resetStoreForTesting === "function") (mod as any).resetStoreForTesting();
  (mod as any).default(mockPi as any);

  const sg = registeredTools.find((t) => t.name === "symbol_graph");
  if (!sg) throw new Error("symbol_graph not registered");

  const include = sg.parameters?.properties?.include;
  if (!include) throw new Error("symbol_graph.include schema missing");

  const expectedDescription =
    'Optional extra sections. Allowed values: "neighborhood", "contract", "source". "tests" is not a valid include value.';
  if (include.description !== expectedDescription) {
    throw new Error(`symbol_graph.include description drifted: ${include.description}`);
  }

  const items = include.items;
  const literals: unknown[] = Array.isArray(items?.anyOf) ? items.anyOf.map((x: any) => x.const) : [];
  const expectedLiterals = ["neighborhood", "contract", "source"];
  if (JSON.stringify(literals) !== JSON.stringify(expectedLiterals)) {
    throw new Error(`symbol_graph.include item literals drifted: ${JSON.stringify(literals)}`);
  }
});
