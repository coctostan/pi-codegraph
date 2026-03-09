export type GraphQueryErrorKind =
  | "parse_error"
  | "validation_error"
  | "unsupported_error";

export class GraphQueryError extends Error {
  constructor(public kind: GraphQueryErrorKind, message: string) {
    super(message);
    this.name = "GraphQueryError";
  }
}

export interface NodePattern {
  alias: string;
  filters: Partial<Record<"kind" | "name", string>>;
}

export interface EdgePattern {
  alias?: string;
  kind?: string;
  direction: "out" | "in";
}

export interface WhereClause {
  alias: string;
  property: string;
  value: string;
}

export type ReturnProjection =
  | { kind: "alias"; alias: string }
  | { kind: "property"; alias: string; property: string };

export interface GraphQueryAst {
  match: {
    left: NodePattern;
    edge?: EdgePattern;
    right?: NodePattern;
  };
  where: WhereClause[];
  returns: ReturnProjection[];
  limit?: number;
}

const NODE_FILTER_PROPERTIES = new Set(["kind", "name"]);
const NODE_RETURN_PROPERTIES = new Set(["id", "kind", "name", "file", "start_line", "end_line", "content_hash"]);
const EDGE_RETURN_PROPERTIES = new Set(["source", "target", "kind", "provenance_source", "confidence", "evidence", "content_hash", "created_at"]);

function parseNodePattern(input: string): NodePattern {
  const match = input.trim().match(/^\(([A-Za-z_][A-Za-z0-9_]*)\s*(\{[^\}]+\})?\)$/);
  if (!match) throw new GraphQueryError("parse_error", `invalid node pattern: ${input}`);

  const [, alias, rawFilters] = match;
  const filters: Partial<Record<"kind" | "name", string>> = {};

  if (rawFilters) {
    const inner = rawFilters.slice(1, -1).trim();
    for (const part of inner.split(",")) {
      const propMatch = part.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*"([^"]+)"$/);
      if (!propMatch) throw new GraphQueryError("parse_error", `invalid inline filter: ${part.trim()}`);

      const property = propMatch[1]!;
      if (!NODE_FILTER_PROPERTIES.has(property)) {
        throw new GraphQueryError("validation_error", `property "${property}" is not allowed on node alias "${alias}"`);
      }

      filters[property as "kind" | "name"] = propMatch[2]!;
    }
  }

  return { alias: alias!, filters };
}

function parseEdgePattern(input: string): EdgePattern {
  const trimmed = input.trim();
  const out = trimmed.match(/^\[([^:\]]+)?(?::([^\]]+))?\]->$/);
  if (out) {
    return {
      alias: out[1] || undefined,
      kind: out[2] || undefined,
      direction: "out",
    };
  }

  const incoming = trimmed.match(/^<-\[([^:\]]+)?(?::([^\]]+))?\]$/);
  if (incoming) {
    return {
      alias: incoming[1] || undefined,
      kind: incoming[2] || undefined,
      direction: "in",
    };
  }

  throw new GraphQueryError("parse_error", `invalid edge pattern: ${input}`);
}

function splitClauses(query: string): { matchClause: string; whereClause?: string; returnClause: string; limitClause?: string } {
  const normalized = query.trim();

  if ((normalized.match(/\bMATCH\b/gi) ?? []).length !== 1) {
    throw new GraphQueryError("parse_error", "query must contain exactly one MATCH clause");
  }

  if ((normalized.match(/\bRETURN\b/gi) ?? []).length !== 1 || /\bRETURN\s*$/i.test(normalized)) {
    throw new GraphQueryError("parse_error", "query must contain exactly one RETURN clause");
  }

  const match = normalized.match(/^MATCH\s+([\s\S]+?)\s+RETURN\s+([\s\S]+?)(?:\s+LIMIT\s+(-?\d+))?$/i);
  if (!match) {
    throw new GraphQueryError("parse_error", "expected MATCH ... RETURN ...");
  }

  let matchClause = match[1]!.trim();
  const returnClause = match[2]!.trim();
  const limitClause = match[3];
  let whereClause: string | undefined;

  const whereSplit = matchClause.match(/^([\s\S]+?)\s+WHERE\s+([\s\S]+)$/i);
  if (whereSplit) {
    matchClause = whereSplit[1]!.trim();
    whereClause = whereSplit[2]!.trim();
  }

  return { matchClause, whereClause, returnClause, limitClause };
}

function rejectUnsupported(query: string): void {
  if (/\bOPTIONAL\s+MATCH\b/i.test(query)) {
    throw new GraphQueryError("unsupported_error", "OPTIONAL MATCH is not supported");
  }
  if (/\bCOUNT\s*\(/i.test(query)) {
    throw new GraphQueryError("unsupported_error", "aggregation is not supported");
  }
  if (/\bORDER\s+BY\b/i.test(query)) {
    throw new GraphQueryError("unsupported_error", "ORDER BY is not supported");
  }
  const queryWithoutStrings = query.replace(/"[^"]*"/g, '""');
  if (/\bCREATE\b|\bMERGE\b|\bDELETE\b|\bSET\b/i.test(queryWithoutStrings)) {
    throw new GraphQueryError("unsupported_error", "mutating queries are not supported");
  }
  if (/\[\s*\*[^\]]*\]/.test(query)) {
    throw new GraphQueryError("unsupported_error", "variable-length paths are not supported");
  }
}

function parseWhere(whereClause?: string): WhereClause[] {
  if (!whereClause) return [];

  if (/\s+OR\s+/i.test(whereClause)) {
    throw new GraphQueryError("unsupported_error", "OR is not supported");
  }

  return whereClause.split(/\s+AND\s+/i).map((piece) => {
    const match = piece.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"([^"]+)"$/);
    if (!match) throw new GraphQueryError("parse_error", `invalid WHERE predicate: ${piece.trim()}`);
    return {
      alias: match[1]!,
      property: match[2]!,
      value: match[3]!,
    };
  });
}

function parseReturns(returnClause: string, nodeAliases: Set<string>, edgeAliases: Set<string>): ReturnProjection[] {
  return returnClause.split(",").map((piece) => {
    const trimmed = piece.trim();
    const prop = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/);

    if (!prop) {
      if (!nodeAliases.has(trimmed) && !edgeAliases.has(trimmed)) {
        throw new GraphQueryError("validation_error", `alias "${trimmed}" is not bound`);
      }
      return { kind: "alias" as const, alias: trimmed };
    }

    const alias = prop[1]!;
    const property = prop[2]!;

    if (!nodeAliases.has(alias) && !edgeAliases.has(alias)) {
      throw new GraphQueryError("validation_error", `alias "${alias}" is not bound`);
    }

    if (nodeAliases.has(alias) && !NODE_RETURN_PROPERTIES.has(property)) {
      throw new GraphQueryError("validation_error", `property "${property}" is not allowed on alias "${alias}"`);
    }

    if (edgeAliases.has(alias) && !EDGE_RETURN_PROPERTIES.has(property)) {
      throw new GraphQueryError("validation_error", `property "${property}" is not allowed on alias "${alias}"`);
    }

    return { kind: "property" as const, alias, property };
  });
}

export function parseGraphQuery(query: string): GraphQueryAst {
  rejectUnsupported(query);
  const { matchClause, whereClause, returnClause, limitClause } = splitClauses(query);
  const limit = limitClause ? Number(limitClause) : undefined;
  if (limit !== undefined && limit <= 0) {
    throw new GraphQueryError("parse_error", "LIMIT must be a positive integer");
  }

  const traversalMatch = matchClause.match(
    /^(\([^\)]+\))\s*(?:-(\[[^\]]*\])->|<-(\[[^\]]*\])-)(\([^\)]+\))$/,
  );

  if (traversalMatch) {
    const left = parseNodePattern(traversalMatch[1]!);
    const outgoingEdge = traversalMatch[2];
    const incomingEdge = traversalMatch[3];
    const right = parseNodePattern(traversalMatch[4]!);
    const edge = parseEdgePattern(outgoingEdge ? `${outgoingEdge}->` : `<-${incomingEdge!}`);

    const nodeAliases = new Set([left.alias, right.alias]);
    const edgeAliases = new Set<string>();
    if (edge.alias) edgeAliases.add(edge.alias);

    const where = parseWhere(whereClause);
    for (const predicate of where) {
      if (!nodeAliases.has(predicate.alias) && !edgeAliases.has(predicate.alias)) {
        throw new GraphQueryError("validation_error", `alias "${predicate.alias}" is not bound`);
      }
    }

    return {
      match: { left, edge, right },
      where,
      returns: parseReturns(returnClause, nodeAliases, edgeAliases),
      limit,
    };
  }

  const left = parseNodePattern(matchClause);
  const nodeAliases = new Set([left.alias]);

  const where = parseWhere(whereClause);
  for (const predicate of where) {
    if (!nodeAliases.has(predicate.alias)) {
      throw new GraphQueryError("validation_error", `alias "${predicate.alias}" is not bound`);
    }
  }

  return {
    match: { left },
    where,
    returns: parseReturns(returnClause, nodeAliases, new Set<string>()),
    limit,
  };
}
