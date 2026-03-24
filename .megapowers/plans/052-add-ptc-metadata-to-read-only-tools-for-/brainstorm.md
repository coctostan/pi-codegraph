# Brainstorm: Add PTC metadata to read-only tools for code_execution exposure

## Goal
pi-codegraph's read-only tools aren't exposed inside PTC's `code_execution` runtime because their tool registrations lack `ptc` metadata. Adding this metadata to the 6 read-only tools will enable them for programmatic use inside `code_execution` while keeping the 2 mutating tools (`resolve_edge`, `delete_edge`) direct-only.

## Mode
Direct requirements — the issue specifies exact tools, exact metadata shape, exact file target, and acceptance criteria. No design exploration needed.

## Must-Have Requirements
- **R1:** `symbol_graph`, `impact`, `trace`, `graph_query`, `symbol_card`, and `symbol_contract` tool registrations include `ptc` metadata with `callable: true`, `enabled: true`, `policy: "read-only"`, `readOnly: true`, `pythonName` matching the tool name, and `defaultExposure: "opt-in"`.
- **R2:** `resolve_edge` and `delete_edge` must NOT have `ptc` metadata (remain direct-only).
- **R3:** A reusable helper/constant (e.g., `readOnlyPtc(name)`) avoids duplicating the metadata literal 6 times.
- **R4:** Type safety is maintained — use type assertions (`as const`, spread, or explicit casting) since `ToolDefinition` doesn't natively include a `ptc` field.
- **R5:** No behavioral changes — parameters, descriptions, execution logic, and output format stay identical.
- **R6:** `bun test` passes with no regressions.
- **R7:** Type checking passes (`bun run check` or equivalent).

## Optional / Nice-to-Have
- **O1:** Add a registration-level test verifying the `ptc` metadata is present on read-only tool definitions and absent on mutating ones.

## Explicitly Deferred
- **D1:** Exposing `resolve_edge` / `delete_edge` as PTC-callable mutating tools (would need `policy: "mutating"` and mutation-posture gating).

## Constraints
- **C1:** The `ToolDefinition` interface from `@mariozechner/pi-coding-agent` does not have a `ptc` field — the implementation must use type assertions or spread patterns to bypass excess property checking.
- **C2:** The full tool registration object is stored as-is by `pi.registerTool()` (confirmed: `definition: tool`), so extra properties like `ptc` are preserved at runtime.
- **C3:** Single file change: `src/index.ts`.

## Open Questions
None.

## Recommended Direction
Define a helper function `readOnlyPtc(name: string)` that returns the `ptc` metadata object for a given tool name. Spread this into each read-only tool's registration object, using a type assertion (e.g., `as any`) on the registration literal to satisfy TypeScript since `ToolDefinition` doesn't declare `ptc`.

The 6 read-only tools get the metadata; the 2 mutating tools are left untouched. The helper keeps the code DRY and makes it trivial to update the metadata shape later.

If O1 is pursued, a test can import the extension, run it against a mock `pi` object, and inspect the registered tool objects for the presence/absence of `ptc`.

## Testing Implications
- Existing test suite must pass unchanged (no behavioral changes).
- Type checking must pass.
- If O1 is implemented: a unit test asserts `ptc` metadata is present on the 6 read-only tools and absent on the 2 mutating tools by inspecting what `pi.registerTool` received.
