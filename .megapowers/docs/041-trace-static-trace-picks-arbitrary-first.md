# Bugfix: trace static mode picks arbitrary first callee instead of covering all branches

## Root Cause
`buildStaticTrace()` in `src/tools/trace.ts` used a linear `while` loop that picked only `[0]` from sorted callees at each step. It followed a single chain and silently discarded all sibling branches. For a function calling N other functions, only 1 appeared in the trace — the rest were dropped with no indication.

## Fix Approach
Replaced the linear chain follower with **iterative DFS** using an explicit stack. All outgoing `calls` neighbors are pushed onto the stack (in reverse sort order so the first-in-sort is popped first), preserving deterministic ordering while visiting every reachable node.

## Files Changed
| File | Change |
|------|--------|
| `src/tools/trace.ts` | Rewrote `buildStaticTrace` from linear `while` + `[0]` pick to stack-based iterative DFS |
| `src/index.ts` | Updated trace tool description: "follow one path" → "follow all reachable branches" |
| `test/extension-trace-description.test.ts` | Updated description assertion to match |
| `test/repro-041-trace-static-arbitrary-first.test.ts` | Regression test: function with 3 callees, all must appear |
| `test/tool-trace-static-cycle.test.ts` | Cycle handling test: alpha→beta→alpha cycle + sibling gamma |

## How to Verify
```bash
bun test test/repro-041-trace-static-arbitrary-first.test.ts  # regression test
bun test test/tool-trace-static-cycle.test.ts                  # cycle handling
bun test                                                        # full suite (248 pass)
```
