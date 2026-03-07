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

test("loadRules rejects unsupported edge_kind values with offending file path", () => {
  const root = join(tmpdir(), `pi-cg-rules-bad-edgekind-${Date.now()}`);
  const bundledDir = join(root, "bundled");
  const badFile = join(bundledDir, "bad-edgekind.yaml");
  mkdirSync(bundledDir, { recursive: true });
  writeFileSync(
    badFile,
    `- name: bad-edgekind\n  pattern: foo()\n  lang: typescript\n  produces:\n    edge_kind: unknown_edge\n    from_capture: X\n    to_template: endpoint:{X}\n    confidence: 0.9\n`,
  );
  try {
    expect(() => loadRules({ bundledDir, projectRoot: root })).toThrow(
      `Invalid rule file ${badFile}: unsupported produces.edge_kind unknown_edge`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
