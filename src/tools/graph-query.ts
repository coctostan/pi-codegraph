import type { GraphStore } from "../graph/store.js";
import { prependTrustHeader } from "../output/trust.js";
import { compileGraphQuery } from "./graph-query-compiler.js";
import { GraphQueryError, parseGraphQuery } from "./graph-query-parser.js";
import { renderGraphQueryResult } from "./graph-query-render.js";

export interface GraphQueryParams {
  query: string;
  store: GraphStore;
  projectRoot: string;
}

export function graphQuery(params: GraphQueryParams): string {
  const stats = params.store.getStatistics(params.projectRoot);

  try {
    if (params.query.trim().length === 0) {
      return prependTrustHeader("parse_error: query must not be empty\n", { stats });
    }

    const ast = parseGraphQuery(params.query);
    const compiled = compileGraphQuery(ast);

    try {
      const rows = params.store.queryRows<Record<string, unknown>>(compiled.sql, compiled.params);
      const rendered = renderGraphQueryResult(rows, compiled.columns, params.projectRoot);
      return prependTrustHeader(rendered.text, {
        stats,
        hasLocalExceptions: rendered.hasLocalExceptions,
      });
    } catch {
      return prependTrustHeader("execution_error: failed to execute compiled query\n", { stats });
    }
  } catch (error) {
    if (error instanceof GraphQueryError) {
      return prependTrustHeader(`${error.kind}: ${error.message}\n`, { stats });
    }
    throw error;
  }
}
