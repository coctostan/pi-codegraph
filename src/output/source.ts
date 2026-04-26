import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GraphNode } from "../graph/types.js";

const DEFAULT_MAX_SOURCE_LINES = 50;

function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export interface SourceSnippetResult {
  /** The hashlined source text */
  text: string;
  /** Whether the file content hash mismatches the node */
  stale: boolean;
  /** Number of lines truncated (0 if not truncated) */
  truncated: number;
}

export function readSourceSnippet(
  node: GraphNode,
  projectRoot: string,
  maxLines?: number,
): SourceSnippetResult | null {
  if (node.end_line == null) return null;

  const fullPath = join(projectRoot, node.file);
  if (!existsSync(fullPath)) return null;

  const fileContent = readFileSync(fullPath, "utf-8");
  const currentHash = sha256Hex(fileContent);
  const stale = currentHash !== node.content_hash;

  const allLines = fileContent.split(/\r?\n/);
  const startIdx = node.start_line - 1;
  const endIdx = node.end_line - 1;

  if (startIdx < 0 || endIdx >= allLines.length || startIdx > endIdx) return null;

  const sourceLines = allLines.slice(startIdx, endIdx + 1);
  const limit = maxLines ?? DEFAULT_MAX_SOURCE_LINES;
  const truncated = sourceLines.length > limit ? sourceLines.length - limit : 0;
  const displayLines = truncated > 0 ? sourceLines.slice(0, limit) : sourceLines;

  const hashlined = displayLines.map((content, i) => {
    const lineNum = node.start_line + i;
    const lineHash = sha256Hex(content.trim()).slice(0, 4);
    return `${lineNum}:${lineHash}|${content}`;
  });

  let text = hashlined.join("\n");
  if (truncated > 0) {
    const nextOffset = node.start_line + displayLines.length;
    text += `\n(${truncated} more lines — use read("${node.file}", offset: ${nextOffset}, limit: ${truncated}) to see the rest)`;
  }

  return { text, stale, truncated };
}
