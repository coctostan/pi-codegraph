---
type: plan-review
iteration: 3
verdict: revise
reviewed_tasks:
  - 2
  - 3
  - 5
  - 1
  - 4
  - 6
  - 7
approved_tasks:
  - 2
  - 3
  - 5
needs_revision_tasks:
  - 1
  - 4
  - 6
  - 7
---

Four tasks have correctness bugs that will cause compile/runtime failures:

**Task 1 — two bugs:**
- Step 1: `let projectRoot: string;` never declared at module scope; `beforeEach`/`afterEach` reference it as an undeclared variable
- Step 3: `request<T>` method has a syntax error — `this.pending.set(seq, { resolve, reject, timer })` is missing entirely; the code has orphaned property assignments after the `setTimeout` block that will not parse

**Task 4 — one bug:**
- Step 3: `if (!parsed) continue;` references `parsed` which is never declared/assigned in scope — the `const parsed = parseEvidence(edge.provenance.evidence);` line is absent

**Task 6 — two bugs:**
- Step 1: `SqliteGraphStore` is used throughout the test but the import `{ SqliteGraphStore } from "../src/graph/sqlite.js"` is missing
- Step 3: `hasMarker` checks only node existence, not edge existence. After `deleteFile`, the marker node survives (stored under `file: "__meta__/resolver"`) but its outbound edge is deleted. This causes `hasMarker` to permanently block re-resolution for changed files, violating AC25 for the tool-time lazy path. Fix: check `store.getEdgesBySource(markerId).some(e => e.target === symbol.id)`.

**Task 7 — one bug:**
- Step 1: `import { resolveImplementations } from "..."` appears inside the file body in the appended code. ES module imports must be at the top of the file. Instruction must say to extend the existing import line instead.

Tasks 2, 3, 5 pass all criteria.
