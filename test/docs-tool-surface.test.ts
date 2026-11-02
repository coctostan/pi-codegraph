import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { phase5ToolDecisions } from "./phase5-decision-matrix";

const read = (path: string) => readFileSync(path, "utf8");
const publicTools = ["symbol_graph", "impact", "trace"];
const removedTools = [...Object.keys(phase5ToolDecisions), "symbol_card", "symbol_contract"];

// Body of a "## " section, up to the next "## " heading.
function section(doc: string, heading: string): string {
  const start = doc.indexOf(`\n${heading}\n`);
  if (start < 0) throw new Error(`section not found: ${heading}`);
  const rest = doc.slice(start + heading.length + 2);
  const next = rest.search(/\n## /);
  return next < 0 ? rest : rest.slice(0, next);
}

test("AGENTS.md Tools table lists exactly the three public tools", () => {
  const rows = [...section(read("AGENTS.md"), "## Tools").matchAll(/^\| `([a-z_]+)` \|/gm)].map((m) => m[1]);
  expect(rows.sort()).toEqual([...publicTools].sort());
});

test("AGENTS.md, PRD.md and README.md name no removed tool", () => {
  for (const doc of ["AGENTS.md", "PRD.md", "README.md"]) {
    const text = read(doc);
    expect({ doc, named: removedTools.filter((tool) => text.includes(tool)) }).toEqual({ doc, named: [] });
  }
});

test("AGENTS.md and PRD.md count three tools", () => {
  expect(read("AGENTS.md")).toContain("exposes it through 3 read-only tools");
  expect(read("PRD.md")).toContain("It is a pi extension providing 3 read-only tools: `symbol_graph`, `impact` and `trace`.");
});

test("ROADMAP.md records M10 complete with no open items", () => {
  const roadmap = read("ROADMAP.md");
  expect(roadmap).toContain("## M10: Public-surface refocus — ✅ COMPLETE");
  expect(roadmap).not.toContain("IN PROGRESS");
  expect(roadmap).not.toContain("- [ ]");
});

test("ROADMAP.md names a removed tool only as completed-milestone history or marked removed", () => {
  const stray = read("ROADMAP.md")
    .split(/\n(?=## )/)
    .filter((section) => !/^## M\d+: .* — ✅ COMPLETE\n/.test(section))
    .flatMap((section) => section.split("\n"))
    .filter((line) => removedTools.some((tool) => line.includes(tool)) && !line.includes("removed in M10"));
  expect(stray).toEqual([]);
});

test("README.md names pi 1.4.0 as the tested host", () => {
  expect(read("README.md")).toContain("tested against pi 1.4.0");
});

// Built by concatenation so this file does not name them itself.
const devModeNames = ["CODEGRAPH_" + "DEVMODE", "devMode" + "Enabled"];

test("README.md names neither the dev-mode toggle nor the agent provenance label", () => {
  const readme = read("README.md");
  expect(readme).not.toContain(devModeNames[0]);
  expect(readme).not.toContain("[source: agent]");
});

test("ROADMAP.md Principle 6 describes the read-only surface", () => {
  const roadmap = read("ROADMAP.md");
  expect(roadmap).toMatch(/^6\. \*\*Read-only surface\.\*\* /m);
  expect(roadmap).not.toContain("The agent is a collaborator");
});

test("no file under src/ or test/ names the dev-mode toggle", () => {
  expect(existsSync("src/config/dev-mode.ts")).toBe(false);
  const files = ["src", "test"].flatMap((dir) =>
    readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name)),
  );
  const named = files.filter((file) => devModeNames.some((name) => read(file).includes(name)));
  expect(named).toEqual([]);
});
