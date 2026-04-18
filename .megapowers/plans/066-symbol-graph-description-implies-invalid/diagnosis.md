# Diagnosis

## Root Cause
The bug is not in `symbolGraph()` execution. The bad value is rejected before execution at the tool validation boundary because the registered schema only allows `"neighborhood"`, `"contract"`, and `"source"`.

The root cause is an incomplete surface-contract migration in `piCodegraph()` after symbol lookup was unified onto `symbol_graph` in commit `3fbd3ca5`.

Specifically:
- `src/index.ts` expanded `SymbolGraphParams.include` to three literals, but left the parameter description generic: `Optional extra sections to append to the response` (`23:137-36:d86`).
- The same registration kept the old top-level description `Return a symbol's callers, callees, tests, and key signals.` (`176:ddb-179:20d`).
- In the actual renderer, `tests` are part of the default compact symbol card, not an include section: `renderSymbolCardBody()` always renders `### Covering Tests` from `tested_by` edges when present (`src/tools/symbol-card.ts:81:33f-89:b18`).
- `symbolGraph()` only branches on `include` for `"neighborhood"`, `"contract"`, and `"source"` (`src/tools/symbol-graph.ts:175:cf9-205:fa3`).

So the surface contract mixes two different concepts:
1. default output contents (`tests` are shown by default), and
2. optional include sections (`neighborhood`, `contract`, `source`).

That mismatch makes `include: ["tests"]` look plausible even though it can never be valid.

This drift was then reinforced by repo-owned docs and tests that hardcode the stale wording:
- `README.md:68:3da-76:219`
- `docs/tool-descriptions.md:13:cab-16:cbf`
- `test/extension-tool-descriptions.test.ts:3:aac-9:e01`

## Trace
1. **Symptom appears at tool validation**
   - Reproduced call: `symbol_graph({ name: "symbolGraph", file: "src/tools/symbol-graph.ts", include: ["tests"] })`
   - Exact failure:
     ```text
     Validation failed for tool "symbol_graph":
       - include/0: must be equal to constant
       - include/0: must be equal to constant
       - include/0: must be equal to constant
       - include/0: must match a schema in anyOf
     ```
   - This shows the failure happens before tool execution.

2. **Trace the runtime entry that registers the surface**
   - `trace({ entry: "piCodegraph", file: "src/index.ts" })` shows the tool-entry function is `piCodegraph` at `src/index.ts:173:07cd`.
   - `symbol_graph({ name: "piCodegraph", file: "src/index.ts" })` shows `piCodegraph` is the registration hub and calls `symbolGraph` on successful executions.

3. **Find where the invalid expectation is introduced**
   - `piCodegraph()` registers `symbol_graph` with:
     - stale top-level description: `src/index.ts:178:baf`
     - generic `include` parameter description: `src/index.ts:33:096`
     - actual allowed literals only: `src/index.ts:29:36b-31:c25`

4. **Confirm the execute path does not support `tests` as an include**
   - `symbolGraph()` only checks for `include.includes("neighborhood")`, `include.includes("contract")`, and `include.includes("source")` (`src/tools/symbol-graph.ts:175:cf9-205:fa3`).
   - There is no `tests` include branch.

5. **Trace backward to why the wording stayed stale**
   - `git show 801e702d:src/index.ts` shows the pre-unification version already used the same top-level description while `include` only exposed `"contract"`.
   - `git diff 801e702d 3fbd3ca5 -- src/index.ts README.md` shows commit `3fbd3ca5 feat: unify symbol lookup on symbol_graph (#41)`:
     - removed separate `symbol_card` / `symbol_contract` tools,
     - expanded `include` to `"neighborhood" | "contract" | "source"`,
     - kept the old `symbol_graph` description and generic include wording.

**Confirmed root cause claim:** commit `3fbd3ca5` changed the meaning of `symbol_graph`'s optional sections but did not update the agent-facing contract to distinguish default card contents from valid include sections. Existing docs/tests then preserved the stale wording.

## Affected Code
### Registration / schema source of truth
- `src/index.ts:23:137-36:d86` — `SymbolGraphParams`
  - allowed literals are only `"neighborhood"`, `"contract"`, `"source"`
  - include description is generic and non-enumerating
- `src/index.ts:173:c9c-209:f73` — `piCodegraph()`
  - registers `symbol_graph`
  - line `178:baf` contains the misleading description
  - line `204:76d` passes only `Array<"neighborhood" | "contract" | "source">`

### Actual renderer semantics
- `src/tools/symbol-graph.ts:171:dbb-205:fa3` — `symbolGraph(params)`
  - optional sections are only `neighborhood`, `contract`, `source`
- `src/tools/symbol-card.ts:49:9b6-118:b18` — `renderSymbolCardBody(params)`
  - tests are default card content, not an include value
  - lines `81:33f-89:b18` render `### Covering Tests`

### Repo-owned docs and tests preserving the mismatch
- `README.md:68:3da-76:219` — public docs still say `callers, callees, tests, and key signals`
- `docs/tool-descriptions.md:14:dd9-15:7a6` — style-guide “good” example repeats the same wording
- `test/extension-tool-descriptions.test.ts:3:aac-9:e01` — exact-string assertion locks in the stale description
- `test/docs-symbol-graph-unified-surface.test.ts:6:ac7-24:d86` — checks unified surface examples, but not explicit allowed include values or rejection of `"tests"`

## Pattern Analysis
### Working behavior
The implementation is internally consistent about actual include semantics:
- type/schema allows only `"neighborhood" | "contract" | "source"`
- renderer only recognizes those three values
- tests are rendered by default in the compact card

### Broken behavior
The agent-facing contract is inconsistent with that implementation:
- top-level description lists `tests` alongside other output concepts
- include parameter description does not enumerate valid literals
- README examples show valid includes, but never states that `"tests"` is invalid
- style guide and exact-match tests preserve the stale wording

### Specific differences between working code and broken docs
1. **Implementation distinguishes default body vs optional sections**
   - default body: `renderSymbolCardBody()` includes tests automatically
   - optional sections: `symbolGraph()` appends only `neighborhood`, `contract`, `source`
2. **Docs collapse those categories together**
   - description mentions `tests`
   - parameter docs do not say what include actually accepts
3. **Tests protect the wrong contract**
   - exact-string description tests enforce the stale sentence
   - doc tests check presence of valid examples but not explicit allowed-value guidance

### Violated assumption
The broken code assumes agents will infer that `tests` is descriptive output, not an include literal. That assumption is violated because the only explicit include documentation is generic, while the headline description prominently names `tests`.

## Risk Assessment
`impact({ symbols: ["symbolGraph"], changeType: "behavior_change" })` points to `piCodegraph` as the direct dependent, and `impact({ symbols: ["piCodegraph"], changeType: "behavior_change" })` shows the immediate risk surface is mainly registration/tests (`registerTools` helpers in extension tests).

Practical risk if this is changed later:
- **Low runtime risk**: no graph indexing, query logic, or symbol rendering semantics need to change for the bug itself.
- **Moderate doc/test churn risk**: any fix must update all places that currently hardcode the stale wording, or exact-string tests will fail.
- **Related bug risk**: other agent-facing surfaces can drift the same way when tool capabilities are consolidated but docs/tests are only partially updated. `docs/tool-descriptions.md` and exact-description tests are the propagation points to check.

## Fixed When
1. `symbol_graph`'s registered schema/docs explicitly enumerate the valid include literals: `"neighborhood"`, `"contract"`, and `"source"`.
2. Agent-facing docs explicitly distinguish default card contents (including test signals / covering tests) from optional include sections, so `"tests"` is no longer implied to be a valid include value.
3. Repo-owned documentation and exact-string tests are updated together so the stale wording cannot be reintroduced silently.
