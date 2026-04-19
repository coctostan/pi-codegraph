## Task 2: Record the telemetry window and materialize the decision matrix

Add an explicit coverage line for the task, e.g.:

`**Covers:** AC3, AC4`

Right now Step 2 only greps for placeholders. That does not verify that `test/phase5-decision-matrix.ts` is valid TypeScript or that the helper exports load correctly. Replace the verification step with a two-part check:

```bash
if grep -R "real count\|real decision\|real note\|<real" \
  .megapowers/plans/063-m10-phase-5-dead-code-cut-remove-zero-us/summary.md \
  test/phase5-decision-matrix.ts; then
  echo 'placeholders remain'
  exit 1
fi
bun -e 'import { phase5ToolDecisions, expectedDefaultPublicTools, removedMutatingTools, removedDevTools } from "./test/phase5-decision-matrix.ts"; if (Object.keys(phase5ToolDecisions).length !== 5) throw new Error("phase5ToolDecisions must contain 5 tools"); console.log(expectedDefaultPublicTools.length, removedMutatingTools.length, removedDevTools.length);'
```

Keep the requirement that the matrix contain the real telemetry-backed counts and decisions. Do not leave placeholder comments in the committed file.

## Task 3: Record the keep-branch regression checks for non-zero tools

Add an explicit coverage line for the task, e.g.:

`**Covers:** AC4, AC7`

The current keep commands are not sufficient for AC7. They miss the existing direct regression suites that enforce the guarantees in the real code:

- `src/tools/resolve-edge.ts` guarantees are covered by:
  - `test/tool-resolve-edge.test.ts`
  - `test/tool-resolve-edge-empty-evidence.test.ts`
  - `test/tool-resolve-edge-self-ref.test.ts`
- `src/tools/delete-edge.ts` guarantees are covered by:
  - `test/tool-delete-edge.test.ts`
- kept dev-mode tool runtime behavior is covered by direct tool suites:
  - `test/tool-graph-query-*.test.ts`
  - `test/tool-graph-overview-*.test.ts`
  - `test/tool-dead-code-*.test.ts`

Update the keep-branch section so each kept tool runs the direct regression suite that matches its actual guarantees, not just extension wiring tests. For example, if `resolve_edge` is kept, the command needs to include the three `tool-resolve-edge*` files above; if `delete_edge` is kept, include `test/tool-delete-edge.test.ts`.

## Task 4: Apply the mutating-tool deletions from the decision matrix

Add an explicit coverage line for the task, e.g.:

`**Covers:** AC5, AC8`

This task is too broad as written. The current `removedMutatingTools` loop makes one test cover two separate behaviors (`resolve_edge` removal and `delete_edge` removal), which violates the one-test/one-implementation granularity rule. Split the current task into one task per removed public mutating tool.

For the `resolve_edge` removal branch, the task must also remove or stop asserting the direct tool tests that currently exist in the repo:

- `test/tool-resolve-edge.test.ts`
- `test/tool-resolve-edge-empty-evidence.test.ts`
- `test/tool-resolve-edge-self-ref.test.ts`

For the `delete_edge` removal branch, the task must also remove or stop asserting:

- `test/tool-delete-edge.test.ts`

Do not leave those tests in place if the corresponding tool is removed from the registered surface. AC8 says no removed tool remains asserted anywhere.

Keep the `test/extension-auto-index.test.ts` singleton rewrite only on the `resolve_edge` branch, because that file currently depends on `resolve_edge` specifically. Keep the readonly test adjustment only on the `resolve_edge` branch for the same reason.

Each split task should have its own failing test command and its own passing/regression commands.

## Task 5: Apply the dev-mode tool deletions from the decision matrix

Add an explicit coverage line for the task, e.g.:

`**Covers:** AC6, AC8`

This task is also too broad. The current `removedDevTools` loop makes one test cover up to three different removals (`graph_query`, `graph_overview`, `dead_code`). Split the current task into one task per removed dev-mode tool.

The rewritten tasks must cover the existing direct tool tests, not just extension registration tests.

If `graph_query` is removed, address these existing surface assertions too:

- `test/tool-graph-query-*.test.ts`
- `test/extension-graph-query-description.test.ts`
- `test/extension-graph-query.test.ts`
- `test/extension-readonly-trust-gating.test.ts`
- `test/readonly-graceful-degradation.test.ts`
- `test/extension-devmode-tools.test.ts`

If `graph_overview` is removed, address these too:

- `test/tool-graph-overview-*.test.ts`
- `test/token-tracker-all-tools.test.ts`
- `test/token-tracker-naive-files.test.ts`
- `test/extension-devmode-tools.test.ts`

If `dead_code` is removed, address these too:

- `test/tool-dead-code-*.test.ts`
- `test/token-tracker-all-tools.test.ts`
- `test/extension-devmode-tools.test.ts`

Do not solve AC8 by leaving removed-tool assertions in place behind broad helper gates. If a test file is purely about a removed tool, delete it or rewrite it so it no longer asserts that removed surface at all.

## Task 6: Reconcile README and ARCHITECTURE with the final Phase 5 surface

Add an explicit coverage line for the task, e.g.:

`**Covers:** AC8`

The dependency list is wrong. This task currently depends only on Task 2, but docs cannot be reconciled until the zero-usage removal tasks have either been applied or explicitly skipped. Update `depends_on` so this task runs after the relevant removal tasks.

Also strengthen Step 2. The current verification only checks that removed tool names are absent from `README.md` and `ARCHITECTURE.md`. That will miss stale count text like `5 public tools by default` or `3 dev-mode tools` after the final surface changes.

Replace the verification with a helper-driven check that imports the real decision matrix and validates both:

- removed tools are absent from the docs
- the documented public/dev counts and tool listings match the final helper-derived surface

At minimum, the script should import `expectedDefaultPublicTools` and `phase5ToolDecisions` from `./test/phase5-decision-matrix.ts` and verify the docs reflect those final sets rather than only checking for name absence.
