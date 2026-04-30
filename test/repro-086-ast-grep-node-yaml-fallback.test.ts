import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRuleFile } from "../src/indexer/ast-grep.js";

test("Node runtime YAML fallback preserves quoted # characters in project-local ast-grep rules", () => {
  const root = join(tmpdir(), `pi-cg-repro-086-${Date.now()}`);
  const file = join(root, "rule.yaml");
  mkdirSync(root, { recursive: true });
  const pattern = "$APP.get('/api # not a yaml comment', $HANDLER)";
  writeFileSync(
    file,
    `- name: quoted-comment-pattern\n  pattern: "${pattern}"\n  lang: typescript\n  produces:\n    edge_kind: routes_to\n    from_capture: HANDLER\n    to_template: endpoint:{PATH}\n    confidence: 0.9\n`,
  );

  try {
    expect(readRuleFile(file, {})[0]?.pattern).toBe(pattern);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
