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
    const resolveEdge = tools.find((t) => t.name === "resolve_edge");
    const deleteEdge = tools.find((t) => t.name === "delete_edge");
    const deadCode = tools.find((t) => t.name === "dead_code");
    if (!impact || !resolveEdge || !deleteEdge || !deadCode) {
      throw new Error("one or more audited tools not registered");
    }

    check(impact.parameters.properties.changeType.description, "impact.changeType");
    check(resolveEdge.parameters.properties.kind.description, "resolve_edge.kind");
    check(deleteEdge.parameters.properties.kind.description, "delete_edge.kind");
    check(deadCode.parameters.properties.kind.description, "dead_code.kind");
  } finally {
    if (prev === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = prev;
  }
});
