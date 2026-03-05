---
id: 15
type: feature
status: open
created: 2026-03-04T23:16:49.695Z
milestone: M4
priority: 4
---
# `trace` tool: anchored execution path from entry point
Implement the `trace` tool. Given an entry point (function, endpoint, or test), return the ordered execution path with hashline anchors. Use V8 coverage data when available for real traces. Fall back to static call graph traversal with explicit fork points at interfaces/dynamic dispatch.
