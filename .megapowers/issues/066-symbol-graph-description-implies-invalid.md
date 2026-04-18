---
id: 66
type: bugfix
status: in-progress
created: 2026-04-18T18:07:04.578Z
priority: 3
---
# symbol_graph description implies invalid include value "tests"
`symbol_graph` validates `include` correctly, but its agent-facing wording makes `include: ["tests"]` look valid and causes avoidable first-call validation failures.

Problem:
- In `src/index.ts`, `SymbolGraphParams.include` only allows the literals `"neighborhood"`, `"contract"`, and `"source"`.
- The tool description currently says: `Return a symbol's callers, callees, tests, and key signals.`
- The `include` parameter description currently says only: `Optional extra sections to append to the response.`
- This combination makes `include: ["tests"]` appear plausible to an agent, even though it is invalid.

Observed symptom:
Agents sometimes first call:
```json
{
  "name": "isFdAvailable",
  "file": "src/find.ts",
  "include": ["tests"]
}
```
This fails validation, then the agent retries with a valid include and succeeds.

Scope of this issue:
This issue is about fixing `pi-codegraph`'s wording so the tool contract is clearer. The separate loss of enum literals in the model-facing tool surface belongs upstream in prompt assembly.

Required changes:
1. Update the `symbol_graph` tool description in `src/index.ts` to avoid implying that `tests` is an include section.
2. Update the `include` parameter description in `src/index.ts` to explicitly enumerate allowed values.
3. Update `README.md` `symbol_graph` docs to explicitly list valid include values.
4. Explicitly state that `"tests"` is not a valid include value.

Suggested wording:
- Tool description: `Return a compact symbol summary with relationships, test signals, and key metadata.`
- Include description: `Optional extra sections. Allowed values: "neighborhood", "contract", "source". "tests" is not a valid include value.`

Acceptance criteria:
- No agent-facing `symbol_graph` docs imply that `tests` is a valid `include` value.
- `src/index.ts` explicitly lists valid include literals.
- `README.md` explicitly lists valid include literals.
- README examples only use valid include values.
- An agent reading the tool docs has materially less reason to attempt `include: ["tests"]`.
