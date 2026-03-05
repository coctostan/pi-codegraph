---
id: 17
type: feature
status: open
created: 2026-03-04T23:16:59.993Z
milestone: M5
priority: 4
---
# Stage 5 indexer: git co-change analysis
Analyze git log to find files/symbols that frequently change together. Create co_changed edges at file level (with symbol-level as stretch goal). Use commit history windowing to weight recent changes higher. Edges carry evidence: commit count, recency score.
