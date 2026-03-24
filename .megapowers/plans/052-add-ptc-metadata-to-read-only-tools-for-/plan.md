# Plan

### Task 1: Add PTC metadata helper and attach to read-only tool registrations

## What
Add a `readOnlyPtc(name)` helper function in `src/index.ts` and spread its output into each of the 6 read-only tool registrations. Use `as any` on the registration object to bypass `ToolDefinition`'s lack of a `ptc` field.

## Steps

### RED
Write a test in a new file `tests/ptc-metadata.test.ts` that:
1. Imports `piCodegraph` from `src/index.ts`
2. Creates a mock `pi` object that captures `registerTool` calls
3. Calls `piCodegraph(mockPi)`
4. Asserts the 6 read-only tools (`symbol_graph`, `impact`, `trace`, `graph_query`, `symbol_card`, `symbol_contract`) each have `ptc` with `{ callable: true, enabled: true, policy: "read-only", readOnly: true, pythonName: "<name>", defaultExposure: "opt-in" }`
5. Asserts `resolve_edge` and `delete_edge` do NOT have a `ptc` property

### GREEN
1. In `src/index.ts`, add helper:
```ts
function readOnlyPtc(name: string) {
  return {
    ptc: {
      callable: true,
      enabled: true,
      policy: "read-only" as const,
      readOnly: true,
      pythonName: name,
      defaultExposure: "opt-in" as const,
    },
  };
}
```

2. For each read-only tool registration, change:
```ts
pi.registerTool({
  name: "symbol_graph",
  ...
});
```
to:
```ts
pi.registerTool({
  name: "symbol_graph",
  ...readOnlyPtc("symbol_graph"),
  ...
} as any);
```

3. Leave `resolve_edge` and `delete_edge` untouched.

### REFACTOR
Verify no duplication — all 6 tools use the helper. Run `bun run check` for type safety.

## Acceptance Criteria
AC 1, AC 2, AC 3, AC 4, AC 5, AC 6
