## Task 1: Add deterministic V8 coverage parser

1) Add explicit AC mapping in the task body.
Include a line like:
`**ACs covered:** 1, 2, 3, 4`

2) Split the overloaded test into a single primary behavior for this task.
Right now the test validates parsing + filtering + deterministic ordering + malformed-entry skipping in one test case. Keep Task 1 focused on parser normalization/deterministic ordering and move filtering/malformed-entry specifics to Task 2 or a new task.

Example narrower Step 1 assertion target:
```ts
expect(records.map(r => [r.file, r.functionName, r.startLine, r.endLine])).toEqual([
  ["src/app.test.ts", "prodTest", 1, 4],
  ["src/app.ts", "helper", 5, 8],
  ["src/app.ts", "prod", 1, 4],
]);
```

## Task 4: Index coverage artifacts into tested_by edges and stored traces

1) Fix `tested_by` edge direction to match the spec/AGENTS wording (production -> test).
Current Step 3 code does:
```ts
source: testRecord.node.id,
target: prod.node.id,
```
Change to:
```ts
source: prod.node.id,
target: testRecord.node.id,
```

2) Update Step 1 assertions accordingly.
Current assertion checks inbound tested_by on prod. With correct direction, assert outbound:
```ts
const testedBy = store.getNeighbors(prodNode.id, { direction: "out", kind: "tested_by" });
expect(testedBy).toHaveLength(1);
expect(testedBy[0]!.node.id).toBe(testNode.id);
expect(testedBy[0]!.edge.provenance.source).toBe("coverage");
```

3) Add explicit AC mapping in the task body.
`**ACs covered:** 6, 7, 8, 9, 10, 11`

## Task 5: Return coverage-backed traces for tests and production symbols

Because Task 4 edge direction must be production -> test, update coverage-trace selection logic.

Current code:
```ts
.getNeighbors(nodeId, { direction: "in", kind: "tested_by" })
```

Should be:
```ts
.getNeighbors(nodeId, { direction: "out", kind: "tested_by" })
```

This applies when selecting a coverage trace for production symbols.

Also add AC mapping:
`**ACs covered:** 12, 13, 17, 19`

## Task 6: Resolve endpoint entries to coverage-backed traces

This task depends on Task 5 tested_by lookup behavior. Ensure it reuses the corrected production-symbol selection logic (with tested_by out from production symbol).

Add AC mapping:
`**ACs covered:** 14`

## Task 8: Mark stale and unresolved trace steps without failing the trace

This task also reuses tested_by lookup behavior and must stay consistent with Task 5 (tested_by out from production symbol).

Add AC mapping:
`**ACs covered:** 16, 18`

## Task 9: Wire the trace tool into the extension

1) Granularity issue: Step 1 currently adds multiple tests across two files. Keep this task to one test + one implementation.

Keep only one failing test in this task (trace tool registration schema) in `test/extension-wiring.test.ts`.
Move placeholder-export assertion (`test/tool-placeholders.test.ts`) to a separate task if needed.

2) Add AC mapping:
`**ACs covered:** 19 (wiring only; behavior ACs covered in prior tasks)`

3) Keep Step 2 failure message specific to the single retained test, e.g.:
`Expected: FAIL — expect(received).toBeDefined() for missing trace registration`
