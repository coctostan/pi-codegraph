# Revise Instructions — Iteration 1

Overall: Tasks 1 and 3 are solid. Task 2 has one self-inconsistency that prevents its third test (`sha256Hex` → isolated fallback) from passing against its own proposed implementation.

## Task 2: Add diagnostic empty-hits message to `impact()`

### Issue: entry-point classifier will fire for unexported leaves, contradicting the third test case

**Current Step 3 branches:**

```ts
if (node.kind === "interface") { ...interface message... }
else if (fanIn === 0)          { ...entry-point message... }
else                            { ...isolated message... }
```

**Why it's wrong:** the third test you wrote in Step 1 creates `sha256Hex` with `is_exported: false` and no inbound edges. That node has `fanIn === 0`. Your current Step 3 will fire the *entry-point* branch (`else if (fanIn === 0)`), emitting `"No dependents found — 'sha256Hex' is an entry point with no callers."`, while your assertion requires `"No dependents found for 'sha256Hex' within depth 5."`. The test fails Step 4.

This also aligns with the existing role semantic in the codebase. `src/output/signals.ts:144` defines the `"entry-point"` role as:

```ts
if (isExported && node.kind !== "module" && fanIn === 0) roles.push("entry-point");
```

The diagnosis's FW3 bullet says "Entry point — chosen when the seed node's `fanIn === 0`" — but that wording is incomplete; the actual discriminator must also require `isExported` (otherwise every no-inbound utility is an "entry point", which is not what #073 means by the term). An unexported leaf like `sha256Hex` is, by the issue's own taxonomy, "genuinely isolated".

### Required change (Step 3)

Use the `roles` array from the signal computer to drive the entry-point branch. It already encodes the correct condition.

Replace the `buildEmptyImpactDiagnostic` body with:

```ts
function buildEmptyImpactDiagnostic(
  symbols: string[],
  store: GraphStore,
  signalComputer: SignalComputer,
  maxDepth: number,
): string {
  const lines: string[] = [];
  for (const symbol of symbols) {
    const matches = store.findNodes(symbol);
    const node = matches.length === 1 ? matches[0]! : null;
    if (!node) {
      lines.push(`No dependents found for '${symbol}' within depth ${maxDepth}.`);
      continue;
    }
    const signals = signalComputer.compute(node.id, []);
    if (node.kind === "interface") {
      lines.push(
        `No call-edge dependents found for interface '${node.name}'. Consider checking implementors via symbol_graph.`,
      );
    } else if (signals.roles.includes("entry-point")) {
      lines.push(`No dependents found — '${node.name}' is an entry point with no callers.`);
    } else {
      lines.push(`No dependents found for '${node.name}' within depth ${maxDepth}.`);
    }
  }
  return `${lines.join("\n")}\n`;
}
```

The `NodeRole` type (`src/output/signals.ts:4`) is already exported as `type NodeRole = "entry-point" | "hub" | "leaf" | "framework-mediated"`, and `NodeSignals.roles` (line 7) is already public — no new exports required.

Key points:
- `signals.roles.includes("entry-point")` folds in `isExported && kind !== "module" && fanIn === 0` — the exact predicate the codebase already uses.
- The interface check still runs first, so an interface with `fanIn === 0` never falls into the entry-point branch.
- The unexported `sha256Hex` case now falls through to the isolated message, satisfying the third test's `toContain("No dependents found for 'sha256Hex' within depth 5.")`.

### Required change (Step 1) — test `entryPoint`

Your first test for `entryPoint` already uses `is_exported: true`, so it will correctly hit the `entry-point` role branch after the fix. No test change needed there.

### Required change (Step 3) — update the prose note

Replace this line:

> The fanIn calculation uses `signalComputer.compute(node.id, []).fanIn`, which — per `src/output/signals.ts:137` — counts inbound `calls` edges only; this is the correct signal for "entry point with no callers" as specified in the issue. Interfaces are caught by their `kind` before the fanIn branch so they won't be misreported as entry points when `fanIn === 0`.

with:

> The entry-point check uses `signals.roles.includes("entry-point")` rather than raw `fanIn === 0`, because the `entry-point` role (`src/output/signals.ts:144`) requires `isExported && kind !== "module" && fanIn === 0`. This prevents unexported utilities with no callers from being misreported as entry points — they fall through to the "genuinely isolated" fallback. Interfaces are caught by their `kind` before the role branch so they won't be misreported as entry points when they have no implementors.

## Tasks 1 and 3 — no changes required

Task 1 is correct: `dedupeInboundByStrongestEdge` keys on `neighbor.node.id` and will collapse the dual-edge case. The merge at the top of the BFS-loop body does not duplicate work because each visited node is still guarded by the existing `seen` map.

Task 3 is correct: the tightened assertions line up with the final contract from Tasks 1 (implements traversal) + Task 2 (diagnostic messages), and the removal of `console.log` instrumentation is appropriate cleanup.
