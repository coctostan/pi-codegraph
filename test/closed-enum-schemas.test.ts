import { test } from "bun:test";
import { VALID_EDGE_KINDS as RESOLVE_VALID_EDGE_KINDS } from "../src/tools/resolve-edge.js";
import { VALID_EDGE_KINDS as DELETE_VALID_EDGE_KINDS } from "../src/tools/delete-edge.js";

async function registered(): Promise<Array<{ name: string; description: string; parameters?: any }>> {
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
  return registeredTools;
}

test("impact.changeType schema has the 4 literal set and an enumerating description", async () => {
  const tools = await registered();
  const impact = tools.find((t) => t.name === "impact");
  if (!impact) throw new Error("impact tool not registered");
  const ct = impact.parameters?.properties?.changeType;
  if (!ct) throw new Error("impact.changeType schema missing");

  const expectedDescription =
    'Kind of change. Allowed values: "signature_change", "removal", "behavior_change", "addition".';
  if (ct.description !== expectedDescription) {
    throw new Error(`impact.changeType description mismatch: ${ct.description}`);
  }

  const literals: unknown[] = Array.isArray(ct.anyOf) ? ct.anyOf.map((x: any) => x.const) : [];
  const expected = ["signature_change", "removal", "behavior_change", "addition"];
  if (JSON.stringify(literals) !== JSON.stringify(expected)) {
    throw new Error(`impact.changeType literals mismatch: ${JSON.stringify(literals)}`);
  }
});

test("resolve_edge.kind schema is a union of VALID_EDGE_KINDS with enumerating description", async () => {
  const tools = await registered();
  const resolve = tools.find((t) => t.name === "resolve_edge");
  if (!resolve) throw new Error("resolve_edge tool not registered");
  const kind = resolve.parameters?.properties?.kind;
  if (!kind) throw new Error("resolve_edge.kind schema missing");
  const expectedDescription =
    'Edge kind. Allowed values: "calls", "imports", "implements", "extends", "tested_by", "co_changes_with", "renders", "routes_to".';
  if (kind.description !== expectedDescription) {
    throw new Error(`resolve_edge.kind description mismatch: ${kind.description}`);
  }
  const literals: unknown[] = Array.isArray(kind.anyOf) ? kind.anyOf.map((x: any) => x.const) : [];
  if (JSON.stringify(literals) !== JSON.stringify(RESOLVE_VALID_EDGE_KINDS)) {
    throw new Error(`resolve_edge.kind literals do not match VALID_EDGE_KINDS: ${JSON.stringify(literals)}`);
  }
});


test("delete_edge.kind schema is a union of VALID_EDGE_KINDS with enumerating description", async () => {
  const tools = await registered();
  const del = tools.find((t) => t.name === "delete_edge");
  if (!del) throw new Error("delete_edge tool not registered");
  const kind = del.parameters?.properties?.kind;
  if (!kind) throw new Error("delete_edge.kind schema missing");
  const expectedDescription =
    'Edge kind. Allowed values: "calls", "imports", "implements", "extends", "tested_by", "co_changes_with", "renders", "routes_to".';
  if (kind.description !== expectedDescription) {
    throw new Error(`delete_edge.kind description mismatch: ${kind.description}`);
  }
  const literals: unknown[] = Array.isArray(kind.anyOf) ? kind.anyOf.map((x: any) => x.const) : [];
  if (JSON.stringify(literals) !== JSON.stringify(DELETE_VALID_EDGE_KINDS)) {
    throw new Error(`delete_edge.kind literals do not match VALID_EDGE_KINDS: ${JSON.stringify(literals)}`);
  }
});


test("dead_code.kind description enumerates the 6 NodeKind values (dev mode)", async () => {
  const prev = process.env.CODEGRAPH_DEVMODE;
  process.env.CODEGRAPH_DEVMODE = "1";
  try {
    const tools = await registered();
    const dc = tools.find((t) => t.name === "dead_code");
    if (!dc) throw new Error("dead_code tool not registered (should register under CODEGRAPH_DEVMODE=1)");
    const kind = dc.parameters?.properties?.kind;
    if (!kind) throw new Error("dead_code.kind schema missing");

    const expectedDescription =
      'Filter by node kind. Allowed values: "function", "class", "interface", "module", "endpoint", "test".';
    if (kind.description !== expectedDescription) {
      throw new Error(`dead_code.kind description mismatch: ${kind.description}`);
    }
    // Schema shape stays optional string (spec C4) — verify it's still a plain string type, not a union.
    if (Array.isArray(kind.anyOf)) {
      throw new Error("dead_code.kind schema should remain Type.Optional(Type.String), not a union");
    }
    if (kind.type !== "string") {
      throw new Error(`dead_code.kind should be a string type, got: ${JSON.stringify(kind)}`);
    }
  } finally {
    if (prev === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = prev;
  }
});
