---
id: 27
type: feature
status: open
created: 2026-03-05T00:48:16.736Z
sources: [17, 18]
---
# M5: Git co-change analysis + hardening
Add the Stage 5 git co-change indexer to create co_changed edges from commit history (#017), then harden the full system: barrel files, re-exports, aliased imports, dynamic imports, performance profiling on 1000+ file projects, and staleness reporting (#018). Closes out M5.
