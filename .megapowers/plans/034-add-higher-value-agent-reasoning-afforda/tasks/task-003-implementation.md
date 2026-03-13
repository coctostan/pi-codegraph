# Task 3 Implementation Output

## RED
- Added `test/output-signals.test.ts` covering:
  - distinct call fan-in/fan-out,
  - role tags (`entry-point`, `hub`, `leaf`),
  - tested/untested,
  - framework-mediated,
  - module-based co-change scoring from git co-change evidence,
  - formatting helpers (`formatRoleTags`, `formatImpactWhy`) including `leaf` priority in impact annotation.
- Ran: `bun test test/output-signals.test.ts`
- Observed expected failure: missing module `../src/output/signals.js`.
- Signaled RED with `megapowers_signal({ action: "tests_failed" })`.

## GREEN
- Created `src/output/signals.ts` with:
  - `NodeSignals` type,
  - `SignalComputer` interface,
  - `createSignalComputer(store)` implementation,
  - distinct fan-in/fan-out computation over `calls` edges,
  - tested/untested and framework-mediated detection,
  - module lookup by file,
  - git co-change evidence parsing (`recency_score`, `co_changes`) and module-level co-change scoring,
  - `formatRoleTags(...)`,
  - `formatImpactWhy(...)` (starts with `fan-in`, includes coverage/co-change/optional chain confidence, and prioritizes `leaf` first in role ordering).

## Verification
- Ran: `bun test test/output-signals.test.ts` → PASS.
- Signaled GREEN with `megapowers_signal({ action: "tests_passed" })`.
- Ran: `bun test` → PASS (203 pass, 0 fail).
