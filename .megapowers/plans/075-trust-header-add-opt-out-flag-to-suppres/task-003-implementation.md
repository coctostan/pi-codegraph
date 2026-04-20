# Task 3 implementation

Threaded `suppressTrustHeader` through the `impact` tool surface by extending `ImpactParams` and forwarding the flag from the `impact` execute path into `finalizeReadOnlyOutput`.

## TDD record

- RED: `bun test test/extension-suppress-trust-header-impact.test.ts`
  - Failed with:
    - `Error: impact schema is missing suppressTrustHeader`
    - `expect(received).toBe(expected)` with `Expected: false` / `Received: true` on `suppressedText.includes("## Trust")`
- GREEN: `bun test test/extension-suppress-trust-header-impact.test.ts`
  - Passed: `2 pass, 0 fail`
- Regression check: `bun test`
  - Passed: `394 pass, 0 fail`
