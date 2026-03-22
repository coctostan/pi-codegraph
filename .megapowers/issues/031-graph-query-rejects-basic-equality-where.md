---
id: 31
type: bugfix
status: done
created: 2026-03-11T14:15:39.158Z
priority: 3
---
# graph_query rejects basic equality WHERE predicates despite Cypher-subset interface
## Summary
Real tool-call testing found that `graph_query` works for simple traversals but rejects intuitive equality filters that users are likely to expect from a Cypher-like subset.

## Reproduction
Call:

```text
graph_query(query: "MATCH (n) WHERE n.name = 'GraphStore' RETURN n.name")
```

## Actual
Returns:

```text
parse_error: invalid WHERE predicate: n.name = 'GraphStore'
```

## Control / contrast
This query works:

```text
MATCH (n)-[e]->(m) RETURN n.name, e.kind, m.name LIMIT 10
```

So the tool is functional, but the supported subset is narrower than an agent or user would reasonably infer from the tool contract.

## Expected
Either:
1. support basic equality predicates like `n.name = 'GraphStore'`, or
2. make the supported subset much more explicit in the tool contract/output so this does not feel like a parser defect.

## Impact
Medium. The tool has real value, but this restriction makes ad hoc graph inspection less ergonomic and more failure-prone for agents using natural Cypher instincts.

