# Feature — Issue #075: `suppressTrustHeader` opt-out flag

## Summary
Adds an optional, caller-controlled boolean parameter `suppressTrustHeader` to the three registered read-only pi-codegraph tools (`symbol_graph`, `impact`, `trace`). When `true`, the `## Trust` header block is stripped from the tool's output. Default behavior (flag omitted / `undefined` / `false`) is byte-identical to the pre-change baseline.

This lets agents skip the ~80-token Trust header on follow-up calls within a multi-call session against non-fresh graphs, without changing any existing integration.

## Why
The Trust header is valuable on the first call of a session (it surfaces freshness, evidence sources, and stale-file counts), but it adds a recurring token cost on every subsequent call. A caller-controlled opt-out is the minimum viable change that lets agents reclaim that cost without giving up default visibility.

## API surface

All three affected tools gain the same optional field. Tool parameter types live in `src/index.ts`:

```ts
// SymbolGraphParams, ImpactParams, TraceParams (src/index.ts)
suppressTrustHeader: Type.Optional(
  Type.Boolean({
    description:
      "When true, omit the ## Trust header from tool output. Useful after the first call in a multi-call session.",
  }),
),
```

The tool-registration surface (`piCodegraph` in `src/index.ts`) exposes the updated schemas directly:

- `symbol_graph` → `parameters: SymbolGraphParams`
- `impact` → `parameters: ImpactParams`
- `trace` → `parameters: TraceParams`

### Shared helper

A single helper was added to `src/output/read-only-ceremony.ts`:

```
stripTrustHeader(text: string) => string
  src/output/read-only-ceremony.ts:10
```

Contract (verified via `symbol_graph(include:["contract"])`):

- **Takes:** `text: string`
- **Returns:** `string`
- **Guards:** returns input unchanged when any of the following are true
  - `lines.length < 3`
  - `lines[0] !== "## Trust"`
  - `!lines[1].startsWith("status: ")`
  - `!lines[2].startsWith("evidence: ")`
- Idempotent: `stripTrustHeader(stripTrustHeader(x)) === stripTrustHeader(x)`

### Centralized wiring

All suppression happens inside `finalizeReadOnlyOutput` (`src/index.ts:165`). Tool functions in `src/tools/` do not read the new flag directly:

```
finalizeReadOnlyOutput(
  toolName: string,
  params: Record<string, unknown>,
  toolOutput: string,
  store: GraphStore,
  projectRoot: string,
  suppressTrustHeader: boolean = false,
) => string
  src/index.ts:165
```

Pipeline order (unchanged except for the new optional step):

1. `suppressFreshTrustHeader` — strips the Trust header only when `status: fresh` (default behavior preserved).
2. Optional `stripTrustHeader` — runs only when the caller passed `suppressTrustHeader: true`.
3. `indexingFailedNote()` — prepends the `indexing-failed (<N>s ago): …` note unchanged.
4. `appendTokenMetaIfEnabled` — still appends the `_meta: tokens_saved` footer when `CODEGRAPH_DEVMETA=1`.

## Behavior matrix

| Flag value                          | Fresh graph                                      | Non-fresh graph (`stale`/`mixed`/`heuristic`/`runtime-backed`) |
|-------------------------------------|--------------------------------------------------|----------------------------------------------------------------|
| absent / `undefined` / `false`      | Byte-identical to baseline (header already stripped by `suppressFreshTrustHeader`) | Byte-identical to baseline (full Trust header rendered) |
| `true`                              | Byte-identical to the baseline fresh path (idempotent with `suppressFreshTrustHeader`) | `## Trust` block removed; `indexing-failed` note, `_meta` footer, anchors, and signals unchanged |

## What did NOT change

- The Trust header's own wording and fields.
- `suppressFreshTrustHeader` behavior and its unconditional invocation in `finalizeReadOnlyOutput`.
- Anchors, edge provenance labels (e.g. `[source: lsp]`), and signal badges (e.g. `[hub]`, `[tested]`).
- `_meta: tokens_saved` output when `CODEGRAPH_DEVMETA=1`.
- The `indexing-failed (<N>s ago): …` note when `lastIndexError` is set.
- Any write-capable or dev-mode-only tool.

## Files changed

- `src/index.ts` — added `suppressTrustHeader` to `SymbolGraphParams` / `ImpactParams` / `TraceParams`; extended `finalizeReadOnlyOutput` with a defaulted flag; updated the three tool execute sites to forward `params.suppressTrustHeader === true`.
- `src/output/read-only-ceremony.ts` — added exported `stripTrustHeader` helper.
- `test/output-strip-trust-header.test.ts` — helper unit coverage (removal across statuses, idempotence, malformed no-op).
- `test/extension-suppress-trust-header-symbol-graph.test.ts` — schema exposure + stale-graph suppression on `symbol_graph`.
- `test/extension-suppress-trust-header-impact.test.ts` — schema exposure + stale-graph suppression on `impact`.
- `test/extension-suppress-trust-header-trace.test.ts` — schema exposure + non-fresh suppression on `trace`.
- `test/extension-suppress-trust-header-interactions.test.ts` — interaction guarantees (indexing-failed note, dev-meta footer, fresh/stale body preservation, omitted-vs-`false` byte-identity).

## Verification

- `bun test` → `401 pass, 0 fail` (see `.megapowers/plans/075-trust-header-add-opt-out-flag-to-suppres/verify.md`).
- Direct stale-graph reproduction with `suppressTrustHeader: true` no longer contains `## Trust`.
- `impact({ symbols: ["finalizeReadOnlyOutput"], changeType: "behavior_change" })` surfaced dependents are all covered by the new tests.
