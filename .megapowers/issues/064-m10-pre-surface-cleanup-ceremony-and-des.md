---
id: 64
type: feature
status: done
created: 2026-04-16T15:05:32.225Z
sources: [59, 60]
---
# M10 pre-surface cleanup: ceremony and descriptions
Group the two M10 phases that are independent of CODI usage data and external telemetry:

1. **#059 Phase 1 — Output ceremony cleanup:** conditional Trust header, dev-gated `_meta: tokens_saved`.
2. **#060 Phase 2 — Description normalization:** tool-description style guide, concrete rewrites, README/code drift reconciliation.

Both are reversible, neither changes the API surface, and they can ship in either order (or together). They are the "pre-surface" cleanup that must land before Phases 3–5 can be meaningfully evaluated.

Phases 3 (demote dev-mode tools), 4 (unify symbol-lookup family), and 5 (dead-code cut) are deliberately NOT batched — each has its own external gate (CODI v0.1 usage, CODI v0.2 usage, long-window telemetry) and will be evaluated standalone.

Plan: `~/pi/workspace/thinkingspace/plans/codegraph-refocus-plan.md`.
