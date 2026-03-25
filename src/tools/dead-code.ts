import type { GraphStore } from "../graph/store.js";
import { prependTrustHeader } from "../output/trust.js";
import { resolveUniqueSymbol } from "./symbol-resolution.js";

export interface DeadCodeParams {
  name?: string;
  file?: string;
  kind?: string;
  glob?: string;
  store: GraphStore;
  projectRoot: string;
}

export function deadCode(params: DeadCodeParams): string {
  const { name, file, kind, glob, store, projectRoot } = params;
  const stats = store.getStatistics(projectRoot);
  if (name) {
    return singleSymbolMode({ name, file, store, projectRoot, stats });
  }
  return sweepMode({ kind, glob, store, projectRoot, stats });
}

function singleSymbolMode(params: {
  name: string;
  file?: string;
  store: GraphStore;
  projectRoot: string;
  stats: ReturnType<GraphStore["getStatistics"]>;
}): string {
  const { name, file, store, projectRoot, stats } = params;

  const resolved = resolveUniqueSymbol({
    name,
    file,
    store,
    projectRoot,
    notFoundLabel: "Symbol",
  });

  if (resolved.kind === "not_found") {
    return prependTrustHeader(resolved.text, { stats });
  }
  if (resolved.kind === "ambiguous") {
    return prependTrustHeader(resolved.text, { stats });
  }

  const node = resolved.node;
  const inbound = store.getNeighbors(node.id, { direction: "in" })
    .filter((nr) => !nr.node.file.startsWith("__meta__") && !nr.node.file.startsWith("__unresolved__"));

  const lines: string[] = [];
  lines.push(`## ${node.name} (${node.kind})`);
  lines.push(`file: ${node.file}`);
  lines.push(`referenced: ${inbound.length > 0 ? "yes" : "no"}`);
  lines.push(`references: ${inbound.length}`);

  if (inbound.length > 0) {
    lines.push("");
    for (const nr of inbound) {
      lines.push(`  ${nr.node.name}  ${nr.node.kind}  ${nr.node.file}  ${nr.edge.kind}`);
    }
  }

  return prependTrustHeader(lines.join("\n") + "\n", { stats });
}

function sweepMode(params: {
  kind?: string;
  glob?: string;
  store: GraphStore;
  projectRoot: string;
  stats: ReturnType<GraphStore["getStatistics"]>;
}): string {
  const { kind, glob, store, stats } = params;

  let sql = `
    SELECT n.id, n.name, n.kind, n.file
    FROM nodes n
    WHERE n.is_exported = 1
      AND NOT n.file LIKE '__meta__%'
      AND NOT n.file LIKE '__unresolved__%'
      AND NOT EXISTS (
        SELECT 1 FROM edges e
        WHERE e.target = n.id
          AND e.source NOT LIKE '__meta__%'
          AND e.source NOT LIKE '__unresolved__%'
      )
  `;

  const sqlParams: unknown[] = [];

  if (kind) {
    sql += " AND n.kind = ?";
    sqlParams.push(kind);
  }

  if (glob) {
    const likePattern = glob.replace(/\*/g, "%");
    sql += " AND n.file LIKE ?";
    sqlParams.push(likePattern);
  }

  sql += " ORDER BY n.file ASC, n.name ASC";

  const rows = store.queryRows<{ id: string; name: string; kind: string; file: string }>(sql, sqlParams);

  if (rows.length === 0) {
    return prependTrustHeader("No unreferenced exported symbols found.\n", { stats });
  }

  const lines: string[] = [];
  lines.push(`## Unreferenced Exported Symbols (${rows.length})`);
  lines.push("");
  for (const row of rows) {
    lines.push(`${row.name}  ${row.kind}  ${row.file}`);
  }

  return prependTrustHeader(lines.join("\n") + "\n", { stats });
}
