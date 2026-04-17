---
id: 6
title: Reconcile public, dev-mode, and internal docs
status: approved
depends_on:
  - 3
  - 5
no_test: true
files_to_modify:
  - README.md
  - ARCHITECTURE.md
  - docs/tool-descriptions.md
files_to_create: []
---

### Task 6: Reconcile public, dev-mode, and internal docs [depends: 3, 5] [no-test]

**Justification:** Documentation-only reconciliation of the registered tool surface and the new `symbol_graph.include` option.

**Files:**
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `docs/tool-descriptions.md`

**Step 1 — Make the change**
Update the docs to match the implementation exactly:

- In `README.md`:
  - change the top-level tool count and any "11 tools" wording to the new default public surface
  - split the tool catalog into **Public**, **Dev-mode**, and **Internal** sections
  - keep `symbol_contract` listed as a public tool in this phase
  - document `CODEGRAPH_DEVMODE=1` as the only supported switch for re-exposing `graph_query`, `graph_overview`, and `dead_code`
  - remove `symbol_search` from the public list and note that it remains internal-only
  - mention `symbol_graph({ name, include: ["contract"] })` in the `symbol_graph` section

- In `ARCHITECTURE.md`:
  - update the ASCII tool list and file-layout comments to reflect the new default registered set
  - add a short note near the tool/output-layer overview that `graph_query`, `graph_overview`, and `dead_code` are dev-mode-only behind `CODEGRAPH_DEVMODE`
  - mark `symbol_search` as internal-only

- In `docs/tool-descriptions.md`:
  - keep the style-guide rules intact
  - update the maintenance note so it explicitly calls out the default-vs-dev-mode split and the internal-only `symbol_search`
  - if you mention `symbol_graph.include`, keep it short and style-guide-compliant

**Step 2 — Verify**
Run: `bun test && bun run check`
Expected: all tests passing and type-check clean
