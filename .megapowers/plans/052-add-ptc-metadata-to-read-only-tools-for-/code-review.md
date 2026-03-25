# Code Review

## Files Reviewed
- `src/index.ts` — added `registerReadOnlyTool` wrapper, changed 6 call sites from `pi.registerTool` to `registerReadOnlyTool`
- `tests/ptc-metadata.test.ts` — new test file verifying ptc presence/absence on all 8 tools

## Strengths
- `src/index.ts:118-129` — `registerReadOnlyTool` cleanly separates the ptc concern from tool definitions. Full type safety preserved for execute params via the generic `ToolDefinition<TParams>` parameter. The `(tool as any).ptc = ptc` mutation is the minimal type escape needed.
- `src/index.ts:124` — `pythonName: tool.name` derives the name from the tool object itself, eliminating the possibility of name/pythonName mismatch.
- `tests/ptc-metadata.test.ts` — concise, loop-driven, covers all 8 tools with exact shape assertion and exclusion assertion. Good use of mock pi object.

## Findings

### Critical
None.

### Important
None.

### Minor
None.

## Assessment
**ready** — Minimal, focused change. Type safety preserved. Test coverage thorough. No behavioral changes to existing code.
