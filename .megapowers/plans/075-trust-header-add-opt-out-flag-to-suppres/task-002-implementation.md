# Task 2 implementation

Threaded `suppressTrustHeader` through the `symbol_graph` tool surface by extending `SymbolGraphParams`, wiring `stripTrustHeader` into `finalizeReadOnlyOutput`, and forwarding the flag from the `symbol_graph` execute path.

## TDD record

- RED: `bun test test/extension-suppress-trust-header-symbol-graph.test.ts`
  - Failed with:
    - `Error: symbol_graph schema is missing suppressTrustHeader`
    - `expect(received).toBe(expected)` with `Expected: false` / `Received: true` on `suppressedText.includes("## Trust")`
- GREEN: `bun test test/extension-suppress-trust-header-symbol-graph.test.ts`
  - Passed: `2 pass, 0 fail`
- Regression check: `bun test`
  - Passed: `392 pass, 0 fail`
