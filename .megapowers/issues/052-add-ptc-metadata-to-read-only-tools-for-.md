---
id: 52
type: feature
status: in-progress
created: 2026-03-24T14:10:16.149Z
priority: 1
---
# Add PTC metadata to read-only tools for code_execution exposure
## Problem

pi-codegraph's read-only tools (`symbol_graph`, `impact`, `trace`, `graph_query`, `symbol_card`, `symbol_contract`) are not appearing inside PTC's `code_execution` runtime because their tool registrations lack `ptc` metadata. PTC only exposes extension tools to `code_execution` if they opt in with metadata indicating they are callable/enabled and classifiable as read-only or mutating.

## Root Cause

- Tool registrations currently have **no `ptc` metadata**
- PTC requires explicit opt-in: tools without `ptc` remain direct-only
- Downstream allowlists like `PTC_CALLABLE_TOOLS` are not sufficient alone
- Under read-only posture (`PTC_ALLOW_MUTATIONS=false`), tools must be classifiable as read-only

## Solution

Add first-class `ptc` metadata to tool registrations in `src/index.ts`.

### Tools to add PTC metadata (read-only):
- `symbol_graph`
- `impact`
- `trace`
- `graph_query`
- `symbol_card`
- `symbol_contract`

### Tools to leave WITHOUT PTC metadata (mutating, direct-only):
- `resolve_edge`
- `delete_edge`

### Metadata shape per tool:
```ts
{
  callable: true,
  enabled: true,
  policy: "read-only",
  readOnly: true,
  pythonName: "<tool_name>",
  defaultExposure: "opt-in",
}
```

### Implementation approach:
- Define a reusable helper/constant (e.g. `READ_ONLY_PTC(name)`) to avoid duplicating the literal 6 times
- Attach `ptc` to each read-only tool's registration object
- Maintain type safety (use `as const` assertions, `satisfies` pattern if appropriate)
- **No behavioral changes** — parameters, descriptions, execution logic, output format all stay identical

## Acceptance Criteria

1. Read-only tools carry explicit PTC-callable metadata (`callable: true`, `policy: "read-only"`, `defaultExposure: "opt-in"`)
2. Mutating tools (`resolve_edge`, `delete_edge`) are NOT exposed
3. No behavioral regression in direct tool usage
4. Typecheck passes (`npm run check`)
5. Tests pass (`bun test`)
6. Downstream PTC does not need hardcoded compatibility shims for these tools

## Files

- **Primary target:** `src/index.ts`
- Tests if registration-level test coverage exists
