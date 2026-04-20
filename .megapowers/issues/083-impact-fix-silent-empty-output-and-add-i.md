---
id: 83
type: bugfix
status: open
created: 2026-04-20T10:33:24.202Z
sources: [73, 74]
---
# impact: fix silent empty output and add implements-edge traversal
Two tightly coupled P0 fixes to `src/tools/impact.ts` that should be implemented together.

**#73** fixes silent empty output when impact finds no `calls`-inbound edges — adds diagnostic messages distinguishing entry-points, interfaces, and genuinely isolated symbols.

**#74** adds traversal of `implements` edges so that interface changes (e.g. `GraphStore`) correctly propagate blast radius through implementors and then continue via `calls`. Fixing #74 will resolve the GraphStore silent-empty case from #73, but #73 still needs the entry-point and isolated-symbol messages.

Implement in order: #74 first (implements traversal), then #73 (empty-result messages), since the latter needs to handle the post-traversal empty case correctly.
