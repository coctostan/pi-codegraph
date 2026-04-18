import { test } from "bun:test";
import { readFileSync } from "node:fs";

const readme = readFileSync("README.md", "utf8");

// Extract a tool's section body: from "#### `<tool>`" up to the next "####" or "###".
function section(tool: string): string {
  const header = "#### `" + tool + "`";
  const startIdx = readme.indexOf(header);
  if (startIdx < 0) throw new Error(`README section not found for ${tool}`);
  const rest = readme.slice(startIdx + header.length);
  const nextIdx = rest.search(/\n####\s|\n###\s/);
  return nextIdx < 0 ? rest : rest.slice(0, nextIdx);
}

test("README impact section mentions every changeType value", () => {
  const body = section("impact");
  for (const v of ["signature_change", "removal", "behavior_change", "addition"]) {
    if (!body.includes(v)) {
      throw new Error(`README impact section missing changeType value "${v}"`);
    }
  }
});

const EDGE_KINDS = [
  "calls",
  "imports",
  "implements",
  "extends",
  "tested_by",
  "co_changes_with",
  "renders",
  "routes_to",
] as const;

test("README resolve_edge section lists all 8 edge kinds", () => {
  const body = section("resolve_edge");
  for (const k of EDGE_KINDS) {
    if (!body.includes(k)) {
      throw new Error(`README resolve_edge section missing edge kind "${k}"`);
    }
  }
});

test("README resolve_edge section examples use only valid edge kinds", () => {
  const body = section("resolve_edge");
  // Find every `kind: "..."` occurrence in the section body.
  const re = /kind:\s*["']([^"']+)["']/g;
  const kinds = [...body.matchAll(re)].map((m) => m[1]);
  for (const k of kinds) {
    if (!(EDGE_KINDS as readonly string[]).includes(k!)) {
      throw new Error(`README resolve_edge example uses invalid kind "${k}"`);
    }
  }
});

test("README delete_edge section lists all 8 edge kinds", () => {
  const body = section("delete_edge");
  for (const k of EDGE_KINDS) {
    if (!body.includes(k)) {
      throw new Error(`README delete_edge section missing edge kind "${k}"`);
    }
  }
});

test("README delete_edge section examples use only valid edge kinds", () => {
  const body = section("delete_edge");
  const re = /kind:\s*["']([^"']+)["']/g;
  const kinds = [...body.matchAll(re)].map((m) => m[1]);
  for (const k of kinds) {
    if (!(EDGE_KINDS as readonly string[]).includes(k!)) {
      throw new Error(`README delete_edge example uses invalid kind "${k}"`);
    }
  }
});

const NODE_KINDS = ["function", "class", "interface", "module", "endpoint", "test"] as const;

test("README dead_code section references every NodeKind filter value", () => {
  const body = section("dead_code");
  for (const k of NODE_KINDS) {
    // These are very common English words; require them to appear inside a backtick-quoted
    // literal or a JS string literal ("..." or '...') so we don't match prose.
    const quoted = new RegExp("[\\\"`']" + k + "[\\\"`']");
    if (!quoted.test(body)) {
      throw new Error(`README dead_code section missing quoted NodeKind "${k}"`);
    }
  }
});

test("README dead_code section examples use only valid NodeKind filter values", () => {
  const body = section("dead_code");
  // Find every `kind: "..."` occurrence.
  const re = /kind:\s*["']([^"']+)["']/g;
  const kinds = [...body.matchAll(re)].map((m) => m[1]);
  for (const k of kinds) {
    if (!(NODE_KINDS as readonly string[]).includes(k!)) {
      throw new Error(`README dead_code example uses invalid kind "${k}"`);
    }
  }
});