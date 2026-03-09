import type { GraphStore } from "../graph/store.js";
import { compileGraphQuery } from "./graph-query-compiler.js";
import { GraphQueryError, parseGraphQuery } from "./graph-query-parser.js";
import { renderGraphQueryRows } from "./graph-query-render.js";

export interface GraphQueryParams {
  query: string;
  store: GraphStore;
  projectRoot: string;
}

export function graphQuery(params: GraphQueryParams): string {
  try {
    if (params.query.trim().length === 0) {
      return "parse_error: query must not be empty\n";
    }

    const ast = parseGraphQuery(params.query);
    const compiled = compileGraphQuery(ast);

    try {
      const rows = params.store.queryRows<Record<string, unknown>>(compiled.sql, compiled.params);
      return renderGraphQueryRows(rows, compiled.columns, params.projectRoot);
    } catch {
      return "execution_error: failed to execute compiled query\n";
    }
  } catch (error) {
    if (error instanceof GraphQueryError) {
      return `${error.kind}: ${error.message}\n`;
    }
    throw error;
  }
}
