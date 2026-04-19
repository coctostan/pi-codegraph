import { test } from "bun:test";

async function registeredWith(devMode: boolean) {
  const prev = process.env.CODEGRAPH_DEVMODE;
  if (devMode) process.env.CODEGRAPH_DEVMODE = "1";
  else delete process.env.CODEGRAPH_DEVMODE;
  try {
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
  } finally {
    if (prev === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = prev;
  }
}

test("registration surface gated on CODEGRAPH_DEVMODE", async () => {
  const def = (await registeredWith(false)).map((t) => t.name).sort();
  const expectedDefault = ["impact", "symbol_graph", "trace"];
  if (JSON.stringify(def) !== JSON.stringify(expectedDefault)) {
    throw new Error(`default surface drifted: ${JSON.stringify(def)}`);
  }

  const dev = (await registeredWith(true)).map((t) => t.name).sort();
  const expectedDev = ["impact", "symbol_graph", "trace"];
  if (JSON.stringify(dev) !== JSON.stringify(expectedDev)) {
    throw new Error(`dev surface drifted: ${JSON.stringify(dev)}`);
  }
});

test("audited tool top-level descriptions contain no inline examples or enumerations", async () => {
  const tools = await registeredWith(true);
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
