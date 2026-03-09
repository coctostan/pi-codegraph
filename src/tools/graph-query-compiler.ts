import type { GraphQueryAst, ReturnProjection } from "./graph-query-parser.js";

export type CompiledColumn =
  | { key: string; kind: "node"; alias: string; sqlAliasPrefix: string }
  | { key: string; kind: "edge"; alias: string; sqlAliasPrefix: string }
  | { key: string; kind: "scalar"; alias: string; property: string; sqlAlias: string };

export interface CompiledGraphQuery {
  sql: string;
  params: Array<string | number>;
  columns: CompiledColumn[];
}

const NODE_FIELDS = ["id", "kind", "name", "file", "start_line", "end_line", "content_hash"] as const;
const EDGE_FIELDS = ["source", "target", "kind", "provenance_source", "confidence", "evidence", "content_hash", "created_at"] as const;

function pushNodeSelect(selects: string[], tableAlias: string, resultAlias: string): void {
  for (const field of NODE_FIELDS) {
    selects.push(`${tableAlias}.${field} AS ${resultAlias}__${field}`);
  }
}

function pushEdgeSelect(selects: string[], tableAlias: string, resultAlias: string): void {
  for (const field of EDGE_FIELDS) {
    selects.push(`${tableAlias}.${field} AS ${resultAlias}__${field}`);
  }
}

function compileReturnProjection(selects: string[], columns: CompiledColumn[], projection: ReturnProjection, nodeAliases: Record<string, string>, edgeAliases: Record<string, string>): void {
  if (projection.kind === "alias") {
    if (nodeAliases[projection.alias]) {
      const prefix = projection.alias;
      pushNodeSelect(selects, nodeAliases[projection.alias]!, prefix);
      columns.push({ key: projection.alias, kind: "node", alias: projection.alias, sqlAliasPrefix: prefix });
      return;
    }

    const prefix = projection.alias;
    pushEdgeSelect(selects, edgeAliases[projection.alias]!, prefix);
    columns.push({ key: projection.alias, kind: "edge", alias: projection.alias, sqlAliasPrefix: prefix });
    return;
  }

  const sqlAlias = `${projection.alias}__${projection.property}__scalar`;
  const tableAlias = nodeAliases[projection.alias] ?? edgeAliases[projection.alias];
  selects.push(`${tableAlias}.${projection.property} AS ${sqlAlias}`);
  columns.push({ key: `${projection.alias}.${projection.property}`, kind: "scalar", alias: projection.alias, property: projection.property, sqlAlias });
}

export function compileGraphQuery(ast: GraphQueryAst): CompiledGraphQuery {
  const params: Array<string | number> = [];
  const selects: string[] = [];
  const wheres: string[] = [];
  const columns: CompiledColumn[] = [];

  const nodeAliases: Record<string, string> = { [ast.match.left.alias]: "n0" };
  const edgeAliases: Record<string, string> = {};

  let from = "FROM nodes n0";
  if (ast.match.edge && ast.match.right) {
    edgeAliases[ast.match.edge.alias ?? "_edge"] = "e0";
    nodeAliases[ast.match.right.alias] = "n1";
    from += ast.match.edge.direction === "out"
      ? " JOIN edges e0 ON e0.source = n0.id JOIN nodes n1 ON n1.id = e0.target"
      : " JOIN edges e0 ON e0.target = n0.id JOIN nodes n1 ON n1.id = e0.source";
  }

  for (const [property, value] of Object.entries(ast.match.left.filters)) {
    wheres.push(`n0.${property} = ?`);
    params.push(value!);
  }

  if (ast.match.edge?.kind) {
    wheres.push("e0.kind = ?");
    params.push(ast.match.edge.kind);
  }

  if (ast.match.right) {
    for (const [property, value] of Object.entries(ast.match.right.filters)) {
      wheres.push(`n1.${property} = ?`);
      params.push(value!);
    }
  }

  for (const predicate of ast.where) {
    const tableAlias = nodeAliases[predicate.alias]!;
    wheres.push(`${tableAlias}.${predicate.property} = ?`);
    params.push(predicate.value);
  }

  const effectiveEdgeAliases = ast.match.edge?.alias ? edgeAliases : {};
  for (const projection of ast.returns) {
    compileReturnProjection(selects, columns, projection, nodeAliases, effectiveEdgeAliases);
  }

  let sql = `SELECT ${selects.join(", ")} ${from}`;
  if (wheres.length > 0) sql += ` WHERE ${wheres.join(" AND ")}`;
  if (ast.limit !== undefined) {
    sql += " LIMIT ?";
    params.push(ast.limit);
  }

  return { sql, params, columns };
}
