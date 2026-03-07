---
id: 4
title: Load and validate bundled and project-local ast-grep rules
status: approved
depends_on:
  - 3
no_test: false
files_to_modify: []
files_to_create:
  - src/indexer/ast-grep.ts
  - test/indexer-ast-grep-rules.test.ts
---

### Task 4: Load and validate bundled and project-local ast-grep rules [depends: 3]
**Files:**
- Create: `src/indexer/ast-grep.ts`
- Test: `test/indexer-ast-grep-rules.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRules } from "../src/indexer/ast-grep.js";
test("Bun.YAML.parse API is available", () => {
  expect(typeof Bun).toBe("object");
  expect(typeof Bun.YAML.parse).toBe("function");
});


test("loadRules reports explicit runtime error when Bun.YAML.parse is unavailable", () => {
  const root = join(tmpdir(), `pi-cg-rules-no-yaml-${Date.now()}`);
  const bundledDir = join(root, "bundled");
  mkdirSync(bundledDir, { recursive: true });
  writeFileSync(join(bundledDir, "r.yaml"), `- name: r\n  pattern: foo()\n  lang: typescript\n  produces:\n    edge_kind: routes_to\n    from_capture: X\n    to_template: endpoint:{X}\n    confidence: 0.9\n`);

  const prev = (Bun as any).YAML;
  try {
    (Bun as any).YAML = undefined;
    expect(() => loadRules({ bundledDir, projectRoot: root })).toThrow("Bun.YAML.parse is unavailable in this runtime");
  } finally {
    (Bun as any).YAML = prev;
    rmSync(root, { recursive: true, force: true });
  }
});

test("loadRules merges bundled + project-local rules and accepts generic selectors", () => {
  const root = join(tmpdir(), `pi-cg-rules-${Date.now()}`);
  const bundledDir = join(root, "bundled");
  const userDir = join(root, ".codegraph", "rules");
  mkdirSync(bundledDir, { recursive: true });
  mkdirSync(userDir, { recursive: true });
  writeFileSync(join(bundledDir, "express.yaml"), `- name: express-route\n  pattern: $APP.$METHOD($PATH, $$$HANDLERS)\n  lang: typescript\n  produces:\n    edge_kind: routes_to\n    from_capture: HANDLERS\n    to_template: endpoint:{METHOD}:{PATH}\n    confidence: 0.9\n`);
  writeFileSync(join(userDir, "generic.yaml"), `- name: generic-context-template\n  pattern: foo()\n  lang: typescript\n  produces:\n    edge_kind: routes_to\n    from_context: enclosing_function\n    to_template: endpoint:{NAME}\n    confidence: 0.5\n`);

  try {
    const rules = loadRules({ bundledDir, projectRoot: root });
    expect(rules.map((r) => r.name).sort()).toEqual(["express-route", "generic-context-template"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("loadRules enforces exactly one from_* and one to_* selector", () => {
  const root = join(tmpdir(), `pi-cg-rules-invalid-${Date.now()}`);
  const bundledDir = join(root, "bundled");
  const badFile = join(bundledDir, "bad.yaml");
  mkdirSync(bundledDir, { recursive: true });
  writeFileSync(badFile, `- name: bad\n  pattern: foo()\n  lang: typescript\n  produces:\n    edge_kind: routes_to\n    from_capture: A\n    from_context: enclosing_function\n    to_template: endpoint:{A}\n    confidence: 0.9\n`);

  try {
    expect(() => loadRules({ bundledDir, projectRoot: root })).toThrow(
      `Invalid rule file ${badFile}: specify exactly one of produces.from_capture or produces.from_context`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


test("loadRules rejects rules that specify both to_capture and to_template", () => {
  const root = join(tmpdir(), `pi-cg-rules-bad-target-${Date.now()}`);
  const bundledDir = join(root, "bundled");
  const badFile = join(bundledDir, "bad-target.yaml");
  mkdirSync(bundledDir, { recursive: true });
  writeFileSync(badFile, `- name: bad-target\n  pattern: foo()\n  lang: typescript\n  produces:\n    edge_kind: routes_to\n    from_capture: FN\n    to_capture: T\n    to_template: endpoint:{T}\n    confidence: 0.9\n`);
  try {
    expect(() => loadRules({ bundledDir, projectRoot: root })).toThrow(
      `Invalid rule file ${badFile}: specify exactly one of produces.to_capture or produces.to_template`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


test("loadRules rejects rules that specify neither from_capture nor from_context", () => {
  const root = join(tmpdir(), `pi-cg-rules-missing-source-${Date.now()}`);
  const bundledDir = join(root, "bundled");
  const badFile = join(bundledDir, "missing-source.yaml");
  mkdirSync(bundledDir, { recursive: true });
  writeFileSync(badFile, `- name: missing-source\n  pattern: foo()\n  lang: typescript\n  produces:\n    edge_kind: routes_to\n    to_template: endpoint:{NAME}\n    confidence: 0.9\n`);

  try {
    expect(() => loadRules({ bundledDir, projectRoot: root })).toThrow(
      `Invalid rule file ${badFile}: specify exactly one of produces.from_capture or produces.from_context`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


test("loadRules rejects invalid from_context values with offending file path", () => {
  const root = join(tmpdir(), `pi-cg-rules-bad-context-${Date.now()}`);
  const bundledDir = join(root, "bundled");
  const badFile = join(bundledDir, "bad-context.yaml");
  mkdirSync(bundledDir, { recursive: true });
  writeFileSync(badFile, `- name: bad-context\n  pattern: foo()\n  lang: typescript\n  produces:\n    edge_kind: routes_to\n    from_context: invalid_value\n    to_template: endpoint:{NAME}\n    confidence: 0.9\n`);
  try {
    expect(() => loadRules({ bundledDir, projectRoot: root })).toThrow(
      `Invalid rule file ${badFile}: unsupported produces.from_context invalid_value`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("loadRules wraps YAML parse errors with offending file path", () => {
  const root = join(tmpdir(), `pi-cg-rules-parse-${Date.now()}`);
  const bundledDir = join(root, "bundled");
  const badFile = join(bundledDir, "bad-parse.yaml");
  mkdirSync(bundledDir, { recursive: true });
  writeFileSync(badFile, `- name: bad-parse\n  pattern: [\n`);
  try {
    expect(() => loadRules({ bundledDir, projectRoot: root })).toThrow(`Invalid rule file ${badFile}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```
**Step 2 — Run test and confirm RED**
```bash
bun test test/indexer-ast-grep-rules.test.ts
```
Expected: `FAIL — Cannot find module '../src/indexer/ast-grep.js'`

**Step 3 — Implement YAML loading + generic validation**
Path-resolution note: module-relative bundled rules path (`fileURLToPath(new URL("../rules/", import.meta.url))`) is integration-verified in Task 8.
```ts
// src/indexer/ast-grep.ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
export interface AstGrepRule {
  name: string;
  pattern: string;
  lang: string;
  produces: {
    edge_kind: "routes_to" | "renders";
    from_capture?: string;
    from_context?: "enclosing_function";
    to_capture?: string;
    to_template?: string;
    confidence: number;
  };
}
export interface LoadRulesOptions {
  bundledDir: string;
  projectRoot: string;
}
function listRuleFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"))
    .map((name) => join(dir, name));
}
function validateRuleFile(filePath: string, raw: unknown): AstGrepRule[] {
  if (!Array.isArray(raw)) throw new Error(`Invalid rule file ${filePath}: expected YAML array`);
  return raw.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error(`Invalid rule file ${filePath}: expected object item`);
    const rule = entry as any;
    if (!rule.name) throw new Error(`Invalid rule file ${filePath}: missing name`);
    if (!rule.pattern) throw new Error(`Invalid rule file ${filePath}: missing pattern`);
    if (!rule.lang) throw new Error(`Invalid rule file ${filePath}: missing lang`);
    if (!rule.produces?.edge_kind) throw new Error(`Invalid rule file ${filePath}: missing produces.edge_kind`);
    if (typeof rule.produces?.confidence !== "number") throw new Error(`Invalid rule file ${filePath}: missing produces.confidence`);
    const hasFromCapture = typeof rule.produces.from_capture === "string";
    const hasFromContext = typeof rule.produces.from_context === "string";
    if (hasFromCapture === hasFromContext) {
      throw new Error(`Invalid rule file ${filePath}: specify exactly one of produces.from_capture or produces.from_context`);
    }
    const hasToCapture = typeof rule.produces.to_capture === "string";
    const hasToTemplate = typeof rule.produces.to_template === "string";
    if (hasToCapture === hasToTemplate) {
      throw new Error(`Invalid rule file ${filePath}: specify exactly one of produces.to_capture or produces.to_template`);
    }
    if (hasFromContext && rule.produces.from_context !== "enclosing_function") {
      throw new Error(`Invalid rule file ${filePath}: unsupported produces.from_context ${rule.produces.from_context}`);
    }
    return rule as AstGrepRule;
  });
}
function readRuleFile(filePath: string): AstGrepRule[] {
  if (typeof Bun.YAML?.parse !== "function") {
    throw new Error("Bun.YAML.parse is unavailable in this runtime");
  }
  try {
    const raw = Bun.YAML.parse(readFileSync(filePath, "utf8"));
    return validateRuleFile(filePath, raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid rule file ${filePath}: ${message}`);
  }
}
export function loadRules(options: LoadRulesOptions): AstGrepRule[] {
  const userDir = join(options.projectRoot, ".codegraph", "rules");
  const files = [...listRuleFiles(options.bundledDir), ...listRuleFiles(userDir)];
  return files.flatMap(readRuleFile).sort((a, b) => a.name.localeCompare(b.name));
}
```
**Step 4 — Re-run focused test (GREEN)**
```bash
bun test test/indexer-ast-grep-rules.test.ts
```
Expected: PASS

**Step 5 — Verify no regressions**
```bash
bun test
```
Expected: All tests pass.
