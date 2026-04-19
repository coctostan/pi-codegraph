import { test } from "bun:test";

async function registered(): Promise<Array<{ name: string; description: string; parameters?: any }>> {
  const tools: Array<{ name: string; description: string; parameters?: any }> = [];
  const mockPi = {
    registerTool(tool: { name: string; description: string; parameters?: any }) {
      tools.push(tool);
    },
    on() {},
  };
  const mod = await import("../src/index.js");
  if (typeof (mod as any).resetStoreForTesting === "function") (mod as any).resetStoreForTesting();
  (mod as any).default(mockPi as any);
  return tools;
}

function check(desc: string, label: string) {
  if (desc.includes("...")) {
    throw new Error(`${label} description contains "...": ${desc}`);
  }
  // Match "etc." as a token (avoid false positives on future "etcetera", etc.)
  if (/\betc\.\B|\betc\./.test(desc) || desc.includes(" etc.") || desc.endsWith("etc.")) {
    throw new Error(`${label} description contains "etc.": ${desc}`);
  }
}

test("audited closed-value parameter descriptions contain no open-ended suffixes", async () => {
  const prev = process.env.CODEGRAPH_DEVMODE;
  process.env.CODEGRAPH_DEVMODE = "1";
  try {
    const tools = await registered();

    const impact = tools.find((t) => t.name === "impact");
    if (!impact) {
      throw new Error("impact tool not registered");
    }
    check(impact.parameters.properties.changeType.description, "impact.changeType");
  } finally {
    if (prev === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = prev;
  }
});
