import { test } from "bun:test";

async function registered() {
  const tools: Array<{ name: string; description: string }> = [];
  const mockPi = {
    registerTool(tool: { name: string; description: string }) {
      tools.push({ name: tool.name, description: tool.description });
    },
    on() {},
  };
  const mod = await import("../src/index.js");
  if (typeof (mod as any).resetStoreForTesting === "function") (mod as any).resetStoreForTesting();
  (mod as any).default(mockPi as any);
  return tools;
}

test("registration surface is exactly the three public tools", async () => {
  const names = (await registered()).map((t) => t.name).sort();
  const expected = ["impact", "symbol_graph", "trace"];
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(`surface drifted: ${JSON.stringify(names)}`);
  }
});

test("audited tool top-level descriptions contain no inline examples or enumerations", async () => {
  const tools = await registered();
  const audited = new Set(["impact"]);
  for (const t of tools) {
    if (!audited.has(t.name)) continue;
    const d = t.description;
    // No enumerated-literal phrasing in the top-level description (those belong in parameter description).
    if (/Allowed values:/.test(d)) {
      throw new Error(`${t.name} top-level description contains "Allowed values:" — move to parameter description: ${d}`);
    }
    // No inline code-example markers.
    if (d.includes("```") || /\bexample:/i.test(d)) {
      throw new Error(`${t.name} top-level description contains an inline example: ${d}`);
    }
  }
});
