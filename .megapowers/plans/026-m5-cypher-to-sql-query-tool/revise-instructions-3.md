## Task 3: Classify parse validation and unsupported query errors

This task currently packs 13 different behaviors into a single test loop. Under the plan rules, this is too broad for one task (multiple behaviors in one test + mixed parser/validator/unsupported concerns).

### Required changes
1. **Split Task 3 into narrower tasks** so each task has one behavior-focused test + one implementation step.
   - Keep this task focused on **exactly-one-clause parse errors** (AC 3, AC 4, AC 24).
   - Move validation cases (alias/property checks: AC 25–27) into a separate task.
   - Move unsupported syntax cases (AC 28–33) into a separate task.
2. **Keep Step 2 failure messages specific to each narrowed task.**

### Example for the narrowed Task 3 test (single behavior family)
```ts
test("parseGraphQuery returns parse_error for multiple MATCH clauses", () => {
  expect(() =>
    parseGraphQuery('MATCH (a {name: "foo"}) MATCH (b {name: "bar"}) RETURN a'),
  ).toThrowError(/query must contain exactly one MATCH clause/);
});
```

Also add explicit AC mapping in the task body/frontmatter (example: `covers_ac: [3,4,24]`).

---

## Task 5: Render structured graph query rows as anchored output

This task currently tests **node anchors + edge rendering + stale markers + zero rows** in one test. That violates the task granularity rule and makes red/green debugging ambiguous.

### Required changes
1. Split renderer coverage into separate tasks/tests:
   - one task for anchored node output (AC 37)
   - one task for edge output (AC 38)
   - one task for stale marker output (AC 39)
   - one task for zero-row output (AC 40)
2. Keep each task to one behavior-focused test and one implementation step.
3. Ensure each new task references the correct existing API:
   - `renderGraphQueryRows(rows, columns, projectRoot)` from `src/tools/graph-query-render.ts`
   - `computeAnchor(node, projectRoot)` from `src/output/anchoring.ts`

### Example single-behavior assertion (zero rows)
```ts
expect(renderGraphQueryRows([], columns, projectRoot)).toBe("rows: 0\n");
```

Add explicit AC mapping for each split task.

---

## Task 8: Execute traversal queries without edge aliases

This task improves incoming traversal parsing, but the plan still lacks direct tool-level coverage for traversal **edge alias return output** with structural/provenance fields (AC 20, AC 21).

### Required changes
1. Keep this task focused on **no-edge-alias traversal parsing/execution** (AC 8, AC 9, AC 42/43/44/45 as applicable).
2. Add a **new follow-up task** (after Task 8) for traversal with an edge alias in `RETURN`, e.g. `RETURN a, r`.
3. In that new task’s test, assert graphQuery output contains:
   - edge kind (`calls`)
   - provenance source (`provenance:lsp`)
   - confidence (`confidence:0.9`)
   - evidence text (e.g. `evidence:ref`)

### Example query for the new task
```ts
'MATCH (a {name: "foo"})-[r:calls]->(b {name: "bar"}) RETURN a, r LIMIT 1'
```

This is necessary to explicitly satisfy AC 20 and AC 21 at the tool output level.

---

## Task Metadata Update (for revised tasks)

For each revised/split task above, add explicit AC references in the task metadata/body (for example: `covers_ac: [20,21]`).
This review requires AC traceability in the task definitions, not only implicit coverage.