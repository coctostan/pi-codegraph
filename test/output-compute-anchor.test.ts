import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeAnchor } from "../src/output/anchoring.js";

function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

test("computeAnchor returns file:line:hash format with stale=false for fresh file", () => {
  const projectRoot = join(tmpdir(), `pi-cg-anchor-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "line one\nexport function foo() {}\nline three";
  const filePath = "src/a.ts";
  writeFileSync(join(projectRoot, filePath), fileContent);

  const contentHash = sha256Hex(fileContent);
  const lineContent = "export function foo() {}";
  const lineHash = sha256Hex(lineContent.trim()).slice(0, 4);

  const node = {
    id: "src/a.ts::foo:2",
    kind: "function" as const,
    name: "foo",
    file: filePath,
    start_line: 2,
    end_line: 2,
    content_hash: contentHash,
  };

  const result = computeAnchor(node, projectRoot);

  expect(result.anchor).toBe(`src/a.ts:2:${lineHash}`);
  expect(result.stale).toBe(false);

  rmSync(projectRoot, { recursive: true, force: true });
});


test("computeAnchor returns stale=true when file content hash differs from node", () => {
  const projectRoot = join(tmpdir(), `pi-cg-anchor-stale-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const originalContent = "line one\nexport function foo() {}\nline three";
  const modifiedContent = "line one\nexport function foo() { return 1; }\nline three";
  const filePath = "src/a.ts";

  // Write the modified file but use hash of original
  writeFileSync(join(projectRoot, filePath), modifiedContent);

  const node = {
    id: "src/a.ts::foo:2",
    kind: "function" as const,
    name: "foo",
    file: filePath,
    start_line: 2,
    end_line: 2,
    content_hash: sha256Hex(originalContent), // hash of original, not current
  };

  const result = computeAnchor(node, projectRoot);

  // Still produces an anchor from the current file content
  const currentLine = "export function foo() { return 1; }";
  const expectedLineHash = sha256Hex(currentLine.trim()).slice(0, 4);
  expect(result.anchor).toBe(`src/a.ts:2:${expectedLineHash}`);
  expect(result.stale).toBe(true);

  rmSync(projectRoot, { recursive: true, force: true });
});


test("computeAnchor returns stale=true with ? hash when file does not exist", () => {
  const projectRoot = join(tmpdir(), `pi-cg-anchor-missing-${Date.now()}`);
  mkdirSync(projectRoot, { recursive: true });

  const node = {
    id: "src/gone.ts::foo:5",
    kind: "function" as const,
    name: "foo",
    file: "src/gone.ts",
    start_line: 5,
    end_line: 7,
    content_hash: "doesnotmatter",
  };

  const result = computeAnchor(node, projectRoot);

  expect(result.anchor).toBe("src/gone.ts:5:?");
  expect(result.stale).toBe(true);

  rmSync(projectRoot, { recursive: true, force: true });
});
