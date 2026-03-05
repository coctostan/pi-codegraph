---
id: 7
type: feature
status: open
created: 2026-03-04T23:16:27.256Z
milestone: M1
priority: 2
---
# Output layer: hashline anchoring and result ranking
Build the output layer that anchors every graph node to current file content (file:line:hash format compatible with pi's edit tool). Implement result ranking: sort by confidence, truncate to token budget, report omission counts. This is shared infrastructure for all tools.
