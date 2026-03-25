---
id: 46
type: feature
status: done
created: 2026-03-23T12:36:16.153Z
sources: [39, 40, 41, 42, 43, 44, 45]
---
# Tool output quality and agent edge lifecycle improvements
Address the 7 concrete shortcomings identified in live tool testing:

1. **symbol_graph dedup** (#39) — self-referential edges render duplicate lines
2. **symbol_graph all edge kinds** (#40) — only calls/imports shown, all others silently dropped
3. **trace branching** (#41) — static trace follows one arbitrary callee instead of representing full execution
4. **impact not-found diagnostic** (#42) — non-existent symbols return empty output instead of error message
5. **impact addition explanation** (#43) — addition changeType silently returns empty
6. **delete_edge tool** (#44) — no mechanism to retract incorrect agent edges
7. **graph_query error messages** (#45) — execution errors are opaque

These fixes collectively improve output accuracy, completeness, and the agent's ability to self-correct.
