# pi-codegraph — Vision

## The Problem

Every code intelligence tool today was built for humans. They return prose, confidence labels, formatted tables. When an agent needs to understand cross-file relationships, it plays a guessing game: grep → read → grep → read → hope you found the right connection. Five tool calls to answer a question the codebase already knows the answer to.

The existing tools (KotaDB, GitNexus, stakgraph) improve on this, but they share a fundamental flaw: **they output human-readable descriptions of code relationships instead of machine-actionable data.** An agent doesn't need "this change has HIGH impact on the authentication flow." It needs the exact symbols, the exact lines, and the exact edges — anchored and ready to act on.

## The Idea

**A code intelligence layer designed for agents, not humans.** A graph of every symbol in a codebase — every function, class, type, interface — and the relationships between them. Every query returns hashline-anchored results the agent can edit immediately. No re-reading. No fishing.

The graph is built from multiple sources, each with different strengths:

- **Static analysis** (tree-sitter + LSP) for direct calls, imports, type hierarchies
- **Test execution coverage** for real runtime paths — the test suite is a dynamic trace you already have
- **Framework pattern rules** (ast-grep) for Express routes, React renders, NestJS decorators
- **Agent-resolved edges** for everything static analysis can't see — the agent reads DI configs, factory patterns, runtime wiring and teaches the graph what it found
- **Git co-change signals** for correlations nothing else catches

The graph starts partial and gets smarter as the agent works. Every task makes it sharper for the next task.

## What Makes This Different

**1. Agent-native output.** Every node in every response carries `file:line:hash`. The agent can edit any result immediately. No translation layer between "understanding" and "acting."

**2. The agent builds the graph.** No other tool does this. When static analysis hits a wall (interface with 3 implementations, DI-injected service, framework-mediated routing), the graph shows the hole explicitly and the agent fills it. The graph learns.

**3. Multi-layer provenance.** Every edge carries how it was discovered and how much to trust it. A test-observed edge is stronger than an LSP-resolved edge is stronger than a co-change correlation. The agent sees confidence, not false certainty.

**4. `trace` — the tool nobody has.** "Show me every function that executes when `POST /api/login` is called, in order." Not inferred from static analysis. Observed from test coverage. An ordered, anchored execution path through the system.

## Who It's For

Coding agents operating inside pi. The tools are pi extensions, same as hashline-readmap's read/edit/grep. First-party, native, no MCP indirection.

If it works, an MCP adapter for the broader agentic coding ecosystem is a thin layer on top. But the primary user is the agent sitting in pi, working on code, needing to understand what connects to what — fast.

## Success Criteria

- Agent uses fewer tool calls per task (measured: grep→read chains replaced by single graph queries)
- Impact analysis is symbol-level, not file-level
- `trace` returns real execution paths for endpoints covered by tests
- Graph improves over the course of a session (agent-resolved edges persist and help future queries)
- Output is always structured, anchored, and actionable — never prose
- Smart swarms: pi-megapowers + pi-teams integration uses codegraph for safe parallel pipeline execution (see [integration design](../thinkingSpace/explorations/smart-swarms-integration.md))
