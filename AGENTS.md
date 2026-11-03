# AGENTS.md — pi-codegraph

Symbol-level code intelligence for coding agents: a pi extension that indexes a TypeScript repo into a SQLite symbol graph and serves it through three read-only tools (`symbol_graph`, `impact`, `trace`). It must return anchored, freshness-honest answers an agent reaches for instead of grep→read chains.

## Space
type: dev
kits: core, dev
root: space/
neighbors:
  hashline: coctostan/pi-hashline-readmap
  thinkingSpace: coctostan/thinkingSpace
git: { merge: agent, push: free, main-direct: process-only }

`.megapowers/` holds megapowers's history up to 2026-10-12: read it, never edit it.

## What This Is

A pi extension that builds a symbol-level graph of a TypeScript codebase and exposes it through 3 read-only tools. Not for humans — for coding agents that need to understand cross-file relationships without grep→read chains.

## Architecture

```
Tools → Query Engine → Graph Store (SQLite) → Indexing Pipeline (5 layers)
```

**Graph store:** SQLite with `nodes` and `edges` tables. Nodes are symbols (function, class, interface, module, endpoint, test). Edges carry provenance (source, confidence, evidence, content hash).

**Indexing layers:**
1. tree-sitter — AST parse → nodes + direct call/import edges
2. LSP (tsserver) — resolve references, upgrade edge confidence
3. ast-grep — framework pattern rules (Express routes, React renders, etc.)
4. V8 test coverage — `tested_by` edges, each test's covered functions
5. git co-change — correlated symbol changes from commit history

Incremental: content hashes per file, only re-index what changed.

## Tools

| Tool | Purpose |
|------|---------|
| `symbol_graph` | Given a symbol, return its compact card (signature, tests, key relationships, signals); `include` adds the full neighborhood, contract or anchored source |
| `trace` | Given an entry point (function, endpoint, test), return its call tree in call-site order, or the functions a covering test's coverage report covered, by file and line |
| `impact` | Given changed symbols, return classified dependents (breaking/behavioral) and the tests reached |

A lookup that resolves to no symbol, or to several, returns `isError: true` with the message and any candidate matches. A new capability extends one of the three before it earns a tool of its own ([decision 0001](space/decisions/0001-three-tool-public-surface.md)).

Tool output is hashline-compatible: file paths are rendered as separate context fields next to bare editable `LINE:HASH` anchors. The line hash is the local pi-hashline-compatible 3-hex xxhash value. Whole-file `content_hash` values remain SHA-256 freshness markers.

## Key Design Decisions

- **SQLite over KuzuDB** — simpler, zero deps, sufficient for 1-3 hop traversals. Migrate later if needed.
- **TypeScript only** for v1.
- **No embeddings, no vector search, no external servers.**
- **Read-only public surface.** Static and runtime analysis fill the graph; no tool takes an agent-authored edge, and holes stay explicit in the output as unresolved edges and Trust levels.
- **Output layer** anchors every node to current file content and manages token budgets via ranking/truncation.

## File Layout

```
src/
  index.ts              # pi extension entry
  tools/                # one file per tool
  indexer/              # one file per pipeline stage
  graph/                # store abstraction, SQLite impl, types
  output/               # hashline anchoring, result ranking
  rules/                # bundled framework rule YAMLs
```

## Milestones

M0–M10 are complete: indexing layers, the tools, contracts, ergonomics, then M10's cut of the public surface to the three tools above. History and future work live in [ROADMAP.md](ROADMAP.md).

## Dev Notes

- Bun runtime, TypeScript
- Host packages (`@earendil-works/pi-coding-agent`, `typebox`) are `peerDependencies: "*"` and pinned only in `devDependencies`; never list them in `dependencies`. Import TypeBox from `typebox`, not `@sinclair/typebox`.
- Hashline hashes are exact-line xxhash32 (only a trailing CR is ignored), identical to pi-hashline-readmap. `test/output-hashline-compat.test.ts` also checks against the sibling repo when it is checked out next to this one, as CI does.
- `test/pi-host-load.test.ts` loads the extension through the real pi loader, under Bun and under the `node` on PATH; keep it green when bumping the host. CI runs `Test & Type-check` on Node 22 and the current Node.
- tree-sitter and ast-grep are already in the pi stack
- LSP is spawned as child process (tsserver), not a library dep
- Every edge has: `source`, `confidence`, `evidence`, `content_hash`, `created_at`
- Stale edges detected by content hash mismatch on source files

## Hard rules
- Name an arc or slice by its title each time you mention it, in a reply, a file, a PR or a commit message: a slice as `slice <n> (<Title>)`, an arc as `<slug> (<Title>)`. One cited in passing, as a source or a precedent, is a mention too. In an arc file, `blocked-by` and `From slice` numbers stay bare.
- Runtime code in `src/` runs under both Bun and Node (pi's host): a Bun-only API sits behind a runtime check with a Node fallback, as `openDb` does.

## Prove
- Checks: `bun test test/smoke.test.ts`; `bun run check && bun test`
- Real artifact: `bun install` once, then load it through pi's real loader and call a tool on this repo: `bun -e 'import {discoverAndLoadExtensions as d} from "@earendil-works/pi-coding-agent"; import {mkdtempSync} from "node:fs"; import {tmpdir} from "node:os"; const cwd=process.cwd(); const r=await d([cwd+"/src/index.ts"],cwd,mkdtempSync(tmpdir()+"/cg-")); const t=r.extensions[0].tools.get(process.argv[1]); const o=await (t.definition??t).execute("p",JSON.parse(process.argv[2]),undefined,undefined,{cwd}); console.log(o.content[0].text); process.exit(0)' symbol_graph '{"name":"indexProject"}'`, ready when it prints (about 3 s) · drive `symbol_graph`, `impact` or `trace` the same way with their JSON params, or `/codegraph status` in a live pi session · observe the `Trust:` line, the `path  LINE:HASH` anchors and the signals, with index errors in the output's indexing-failed note · two runs on one checkout share `.codegraph/graph.db`, so use a separate worktree to isolate one.
