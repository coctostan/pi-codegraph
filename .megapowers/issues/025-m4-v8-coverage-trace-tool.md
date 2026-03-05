---
id: 25
type: feature
status: open
milestone: M4
priority: 4
created: 2026-03-05T00:48:16.734Z
sources: [14, 15]
---
# M4: V8 coverage + trace tool
Parse V8 coverage JSON to create tested_by edges and ordered execution traces (#014), then expose those traces via the trace tool with hashline anchors and a static call-graph fallback when coverage data isn't available (#015).
