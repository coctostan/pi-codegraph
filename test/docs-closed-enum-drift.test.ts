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
