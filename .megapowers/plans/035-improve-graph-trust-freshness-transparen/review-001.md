---
type: plan-review
iteration: 1
verdict: revise
reviewed_tasks:
  - 1
  - 2
  - 3
  - 4
  - 5
  - 6
approved_tasks:
  - 1
  - 2
needs_revision_tasks:
  - 3
  - 4
  - 5
  - 6
---

## Review Summary

Tasks 1 and 2 are solid — correct TDD, correct codebase APIs, existing tests survive the changes.

Tasks 3, 4, 5, and 6 each modify a tool's output format by prepending the trust header, but **fail to update existing tests that use exact matching** (`toBe`, `^`-anchored regex, `toHaveLength`) on that output. This means Step 5 ("bun test — all passing") will fail for each of these tasks.

### Specific breakages:

**Task 3 (impact):**
- `test/extension-impact.test.ts`: `expect(noImpact).toBe("")`, `expect(out.trim().split("\n")).toHaveLength(1)`, `expect(out).toMatch(/^src\/caller/)`
- `test/tool-impact-output-signals.test.ts`: `expect(out.trim().split("\n")).toHaveLength(1)`, `expect(out.trim()).toMatch(/^src\/caller/)`

**Task 4 (trace/coverage):**
- `test/tool-trace-signals.test.ts`: `expect(lines[0]).toBe("mode: coverage [stale]")`

**Task 5 (trace/heuristic):**
- `test/tool-trace-static-mode-header.test.ts`: `expect(lines[0]).toBe("mode: static...")`, `expect(lines).toHaveLength(4)`

**Task 6 (graph_query):**
- `test/tool-graph-query-empty-query.test.ts`: `expect(output).toBe("parse_error: ...")`
- `test/tool-graph-query-execution-error.test.ts`: `expect(output).toBe("execution_error: ...")` AND the `fakeStore` lacks `getStatistics()` causing a runtime TypeError

### Required fix:
Each affected task must add the relevant existing test files to `files_to_modify` and include the specific assertion updates in Step 3. Detailed instructions are in `revise-instructions-1.md`.
