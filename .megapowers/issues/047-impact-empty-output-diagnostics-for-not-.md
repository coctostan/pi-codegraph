---
id: 47
type: bugfix
status: done
created: 2026-03-23T12:45:09.942Z
sources: [42, 43]
---
# impact: empty output diagnostics for not-found and addition
Two fixes in src/tools/impact.ts where the tool returns an empty trust header with no explanation:

1. **Not-found symbols (#42)** — `impact(["nonExistent"], "behavior_change")` returns an empty body instead of `Symbol "nonExistent" not found`. The not_found branch at line 148 passes `""` to prependTrustHeader. Agent cannot distinguish "no dependents" from "symbol doesn't exist."

2. **Addition change type (#43)** — `impact(["realSymbol"], "addition")` is hardcoded to return `[]` at line 68. The rendered output is empty with no explanation. Should return a message explaining that addition impact analysis is not yet supported.

Same file, same symptom (silent empty output), same fix pattern (replace empty body with diagnostic text).
