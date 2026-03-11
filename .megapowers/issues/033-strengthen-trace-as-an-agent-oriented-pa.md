---
id: 33
type: feature
status: open
created: 2026-03-11T14:27:08.981Z
priority: 2
---
# Strengthen trace as an agent-oriented path tool with clearer semantics and richer backing data
## Goal
Make `trace` more genuinely useful for coding agents, not just technically functional.

## Motivation
Current testing shows `trace` is useful in two modes:
- coverage-backed traces are valuable
- deterministic static fallback is stable

But even when fully functional, the tool remains limited because static fallback can look more authoritative than it is, and the output does not always communicate whether it is a heuristic path vs a runtime-backed path.

## Desired outcomes
- Make trace output explicitly communicate confidence/source of truth
- Deepen runtime-backed traces where coverage/test evidence exists
- Improve utility for endpoint/test/symbol exploration
- Reduce risk of users/agents over-trusting heuristic static traces

## Candidate scope
- richer trace metadata (coverage-backed vs heuristic vs mixed)
- clearer rendering of fallback/static paths
- broader endpoint→handler→callee behavior capture when runtime evidence exists
- ranking/selection policies that optimize usefulness to agents rather than arbitrary determinism
- better stale-state communication in trace output

## Success criteria
An agent can use `trace` to answer:
- "what is one credible execution path from this entry point?"
- "is this path runtime-backed or heuristic?"
- "how much should I trust this output?"

without confusing a static guess for an execution fact.

