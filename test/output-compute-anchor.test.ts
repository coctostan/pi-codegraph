import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeAnchor, computeLineHash } from "../src/output/anchoring.js";

function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

test("computeAnchor emits bare editable anchors with separate file context", () => {
  const projectRoot = join(tmpdir(), `pi-cg-anchor-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "line one\nexport function foo() {}\nline three";
  const filePath = "src/a.ts";
  writeFileSync(join(projectRoot, filePath), fileContent);

  const node = {
    id: "src/a.ts::foo:2",
    kind: "function" as const,
    name: "foo",
    file: filePath,
    start_line: 2,
    end_line: 2,
    content_hash: sha256Hex(fileContent),
  };

  try {
    const result = computeAnchor(node, projectRoot);

    expect(result.file).toBe("src/a.ts");
    expect(result.anchor).toBe("2:c27");
    expect(result.anchor).toMatch(/^\d+:[0-9a-f]{3}$/);
    expect(result.anchor).not.toContain("src/a.ts");
    expect(result.stale).toBe(false);

    const match = result.anchor.match(/^(\d+):([0-9a-f]{3})$/);
    expect(match).not.toBeNull();
    const lineNumber = Number(match![1]);
    const emittedHash = match![2];
    const line = fileContent.split("\n")[lineNumber - 1]!;
    expect(emittedHash).toBe(computeLineHash(lineNumber, line));
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("computeAnchor preserves stale status while emitting current bare anchor", () => {
  const projectRoot = join(tmpdir(), `pi-cg-anchor-stale-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const originalContent = "line one\nexport function foo() {}\nline three";
  const modifiedContent = "line one\nexport function foo() { return 1; }\nline three";
  const filePath = "src/a.ts";
  writeFileSync(join(projectRoot, filePath), modifiedContent);

  const node = {
    id: "src/a.ts::foo:2",
    kind: "function" as const,
    name: "foo",
    file: filePath,
    start_line: 2,
    end_line: 2,
    content_hash: sha256Hex(originalContent),
  };

  try {
    const result = computeAnchor(node, projectRoot);

    expect(result.file).toBe("src/a.ts");
    expect(result.anchor).toBe(`2:${computeLineHash(2, "export function foo() { return 1; }")}`);
    expect(result.stale).toBe(true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("computeAnchor returns stale non-editable anchors for unavailable line content", () => {
  const projectRoot = join(tmpdir(), `pi-cg-anchor-unavailable-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/a.ts"), "line one\nline two\n");

  const node = {
    id: "src/a.ts::foo:1",
    kind: "function" as const,
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    content_hash: sha256Hex("line one\nline two\n"),
  };

  try {
    expect(computeAnchor({ ...node, file: "src/gone.ts", start_line: 5 }, projectRoot)).toEqual({
      file: "src/gone.ts",
      anchor: "5:?",
      stale: true,
    });
    expect(computeAnchor({ ...node, start_line: 99 }, projectRoot)).toEqual({
      file: "src/a.ts",
      anchor: "99:?",
      stale: true,
    });
    expect(computeAnchor({ ...node, file: "src" }, projectRoot)).toEqual({
      file: "src",
      anchor: "1:?",
      stale: true,
    });
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
