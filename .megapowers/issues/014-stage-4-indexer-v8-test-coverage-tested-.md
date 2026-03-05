---
id: 14
type: feature
status: open
created: 2026-03-04T23:16:49.695Z
milestone: M4
priority: 4
---
# Stage 4 indexer: V8 test coverage → `tested_by` edges
Parse V8 coverage JSON output. Map coverage function ranges back to graph nodes. Create `tested_by` edges linking production symbols to the tests that exercise them. Build ordered execution traces per test for the trace tool.
