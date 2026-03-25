import type { GraphStore } from "../graph/store.js";
import { prependTrustHeader } from "../output/trust.js";

export interface GraphOverviewParams {
  store: GraphStore;
  projectRoot: string;
}

export function graphOverview(params: GraphOverviewParams): string {
  const { store, projectRoot } = params;
  const stats = store.getStatistics(projectRoot);

  const totalNodes = Object.values(stats.nodes).reduce((sum, n) => sum + n, 0);
  if (totalNodes === 0) {
    return prependTrustHeader("Graph is empty — index a project first.", { stats });
  }

  const lines: string[] = [];

  // Symbols section
  lines.push("## Symbols");
  const kindOrder = ["function", "class", "interface", "module", "endpoint", "test"];
  for (const kind of kindOrder) {
    if (stats.nodes[kind]) {
      lines.push(`${kind}: ${stats.nodes[kind]}`);
    }
  }
  for (const [kind, count] of Object.entries(stats.nodes)) {
    if (!kindOrder.includes(kind)) {
      lines.push(`${kind}: ${count}`);
    }
  }

  // Files section
  lines.push("");
  lines.push("## Files");
  lines.push(`total: ${stats.files.total}  stale: ${stats.files.stale}`);

  // Hub symbols section
  const hubRows = store.queryRows<{ id: string; name: string; kind: string; file: string; degree: number }>(
    `SELECT n.id, n.name, n.kind, n.file,
       (SELECT COUNT(*) FROM edges WHERE source = n.id OR target = n.id) as degree
     FROM nodes n
     WHERE NOT n.file LIKE '__meta__%' AND NOT n.file LIKE '__unresolved__%'
     ORDER BY degree DESC
     LIMIT 10`
  );
  if (hubRows.length > 0) {
    lines.push("");
    lines.push("## Hub Symbols");
    for (const row of hubRows) {
      lines.push(`${row.name}  ${row.kind}  ${row.file}  degree:${row.degree}`);
    }
  }

  // Most-imported files section
  const importRows = store.queryRows<{ file: string; import_count: number }>(
    `SELECT n.file, COUNT(*) as import_count
     FROM edges e
     JOIN nodes n ON e.target = n.id
     WHERE e.kind = 'imports'
       AND NOT n.file LIKE '__meta__%'
       AND NOT n.file LIKE '__unresolved__%'
     GROUP BY n.file
     ORDER BY import_count DESC
     LIMIT 10`
  );
  if (importRows.length > 0) {
    lines.push("");
    lines.push("## Most-Imported Files");
    for (const row of importRows) {
      lines.push(`${row.file}  imports:${row.import_count}`);
    }
  }

  // Suggested Queries section
  const presentEdgeKinds = new Set(Object.keys(stats.edges));
  const recipes: string[] = [];

  recipes.push('MATCH (n {kind: "function"}) RETURN n LIMIT 10');

  if (presentEdgeKinds.has("calls")) {
    recipes.push('MATCH (a)-[r:calls]->(b) RETURN a.name, b.name LIMIT 10');
  }
  if (presentEdgeKinds.has("imports")) {
    recipes.push('MATCH (a)-[r:imports]->(b) RETURN a.name, b.name LIMIT 10');
  }
  if (presentEdgeKinds.has("tested_by")) {
    recipes.push('MATCH (a)-[r:tested_by]->(t) RETURN a.name, t.name LIMIT 10');
  }
  if (presentEdgeKinds.has("implements")) {
    recipes.push('MATCH (a)-[r:implements]->(b) RETURN a.name, b.name LIMIT 10');
  }
  if (presentEdgeKinds.has("routes_to")) {
    recipes.push('MATCH (a)-[r:routes_to]->(b) RETURN a.name, b.name LIMIT 10');
  }
  if (presentEdgeKinds.has("renders")) {
    recipes.push('MATCH (a)-[r:renders]->(b) RETURN a.name, b.name LIMIT 10');
  }
  if (presentEdgeKinds.has("co_changes_with")) {
    recipes.push('MATCH (a)-[r:co_changes_with]->(b) RETURN a.name, b.name LIMIT 10');
  }

  if (recipes.length > 0) {
    lines.push("");
    lines.push("## Suggested Queries");
    for (const recipe of recipes) {
      lines.push(recipe);
    }
  }

  const body = lines.join("\n") + "\n";
  return prependTrustHeader(body, { stats });
}
