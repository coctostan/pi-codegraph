---
id: 9
title: Reconcile README and ARCHITECTURE with the final Phase 5 surface
status: approved
depends_on:
  - 2
  - 4
  - 5
  - 6
  - 7
  - 8
no_test: true
files_to_modify:
  - .megapowers/plans/063-m10-phase-5-dead-code-cut-remove-zero-us/summary.md
  - README.md
  - ARCHITECTURE.md
files_to_create: []
---

### Task 9: Reconcile README and ARCHITECTURE with the final Phase 5 surface [no-test] [depends: 2, 4, 5, 6, 7, 8]

**Covers:** AC8

**Justification:** documentation-only reconciliation. This task runs after the zero-usage keep/delete tasks so the saved summary, README, and ARCHITECTURE reflect the final observed surface instead of the pre-cut baseline.

**Files:**
- Modify: `.megapowers/plans/063-m10-phase-5-dead-code-cut-remove-zero-us/summary.md`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`

**Step 1 — Make the change**
1. Update the tool-count bullets, tool tables, examples, and file-layout sections in `README.md` so they exactly match the final Task 2 decision matrix.
   - If a tool is deleted, remove its top-level listing, dedicated subsection, and example call.
   - If a tool is kept, leave its documentation intact.
   - Update the visible count text so it matches the final surface, not the pre-Phase-5 baseline.
2. Update the public/dev/internal surface descriptions in `ARCHITECTURE.md` to match the same final tool set.
3. Append a `## Final surface` section to `summary.md` that lists:
   - final default public tools
   - final dev-mode tools
   - every deleted tool with its observed call count and a short evidence note
   - every kept tool with its observed call count and a short evidence note

**Step 2 — Verify**
Run:
```bash
bun -e 'import { expectedDefaultPublicTools, expectedDevModeTools, phase5ToolDecisions } from "./test/phase5-decision-matrix.ts"; import { readFileSync } from "node:fs"; const readme = readFileSync("README.md", "utf8"); const architecture = readFileSync("ARCHITECTURE.md", "utf8"); const docs = `${readme}\n${architecture}`; const removed = Object.entries(phase5ToolDecisions).filter(([, decision]) => decision.decision === "delete").map(([name]) => name); for (const name of removed) { if (docs.includes(`\`${name}\``)) throw new Error(`documentation still lists removed tool: ${name}`); } for (const name of expectedDefaultPublicTools) { if (!docs.includes(`\`${name}\``)) throw new Error(`documentation is missing public tool: ${name}`); } for (const name of expectedDevModeTools) { if (!docs.includes(`\`${name}\``)) throw new Error(`documentation is missing dev tool: ${name}`); } if (!readme.includes(`${expectedDefaultPublicTools.length} public tools by default`)) throw new Error("README public-tool count mismatch"); if (!readme.includes(`${expectedDevModeTools.length} dev-mode`)) throw new Error("README dev-mode count mismatch"); if (!architecture.includes(`Default registration exposes ${expectedDefaultPublicTools.length} public tools.`)) throw new Error("ARCHITECTURE public-tool count mismatch"); console.log("documentation matches final surface");' && bun test
```
Expected: `documentation matches final surface`, then the full Bun suite passes.
