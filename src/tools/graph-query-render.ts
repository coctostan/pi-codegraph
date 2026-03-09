import { computeAnchor } from "../output/anchoring.js";
import type { GraphNode } from "../graph/types.js";
import type { CompiledColumn } from "./graph-query-compiler.js";

interface GraphNodeRow {
  id: string;
  kind: GraphNode["kind"];
  name: string;
  file: string;
  start_line: number;
  end_line: number | null;
  content_hash: string;
}

function readNode(row: Record<string, unknown>, prefix: string): GraphNodeRow {
  return {
    id: String(row[`${prefix}__id`]),
    kind: row[`${prefix}__kind`] as GraphNode["kind"],
    name: String(row[`${prefix}__name`]),
    file: String(row[`${prefix}__file`]),
    start_line: Number(row[`${prefix}__start_line`]),
    end_line: row[`${prefix}__end_line`] == null ? null : Number(row[`${prefix}__end_line`]),
    content_hash: String(row[`${prefix}__content_hash`]),
  };
}

export function renderGraphQueryRows(
  rows: Array<Record<string, unknown>>,
  columns: CompiledColumn[],
  projectRoot: string,
): string {
  if (rows.length === 0) {
    return "rows: 0\n";
  }
  const lines: string[] = [`rows: ${rows.length}`];

  rows.forEach((row, index) => {
    lines.push(`row ${index + 1}`);
    for (const column of columns) {
      if (column.kind === "node") {
        const node = readNode(row, column.sqlAliasPrefix);
        const anchor = computeAnchor(node, projectRoot);
        lines.push(`  ${column.key}: ${anchor.anchor}  ${node.name}  ${node.kind}${anchor.stale ? " [stale]" : ""}`);
        continue;
      }
      if (column.kind === "edge") {
        lines.push(
          `  ${column.key}: ${String(row[`${column.sqlAliasPrefix}__kind`])}  source:${String(row[`${column.sqlAliasPrefix}__source`])}  target:${String(row[`${column.sqlAliasPrefix}__target`])}  provenance:${String(row[`${column.sqlAliasPrefix}__provenance_source`])}  confidence:${String(row[`${column.sqlAliasPrefix}__confidence`])}  evidence:${String(row[`${column.sqlAliasPrefix}__evidence`])}`,
        );
        continue;
      }
      if (column.kind === "scalar") {
        lines.push(`  ${column.key}: ${String(row[column.sqlAlias])}`);
      }
    }
  });

  return `${lines.join("\n")}\n`;
}
