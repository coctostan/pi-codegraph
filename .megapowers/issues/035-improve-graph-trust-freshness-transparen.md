---
id: 35
type: feature
status: open
created: 2026-03-11T14:27:08.983Z
priority: 2
---
# Improve graph trust, freshness transparency, and persisted-session ergonomics
## Goal
Make persisted graph state a strength rather than a source of hidden risk.

## Motivation
Persistent graph state is valuable for speed and agent-written edges, but it also risks stale or surprising outputs across sessions. Even after fixing immediate freshness bugs, the product needs clearer trust semantics around persisted state.

## Candidate scope
- explicit freshness/trust signals in tool output
- clearer handling of persisted agent-authored edges across repo evolution
- better visibility into what was indexed when and from which evidence sources
- ergonomics for distinguishing live/current facts from cached historical graph state
- workflows that keep session reuse fast without making stale data easy to misinterpret

## Success criteria
An agent using the tool over multiple sessions should be able to quickly tell:
- whether graph data is current
- which results are inferred vs verified vs stale
- when persisted state is helping vs when it should be refreshed or treated cautiously

The graph should become more trustworthy in long-lived use, not less.

