## Task 1: Refresh stale persisted graph before serving tool results

Step 3 is incomplete for the actual root cause. `store.getStatistics(projectRoot)` only detects hash drift for files already present in `file_hashes` (`src/graph/sqlite.ts:getStatistics`). It does **not** detect:
- newly added `.ts` / `.tsx` files
- deleted tracked files when no existing tracked file hash changed

Because `indexProject()` is already incremental (`src/indexer/pipeline.ts:73-104`), the safest minimal plan here is to call it on every tool invocation instead of trying to pre-detect freshness from `getStatistics()`.

Replace the planned Step 3 implementation with this exact `ensureIndexed()` body in `src/index.ts`:

```ts
async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  await indexProject(projectRoot, store);
}
```

Also update the Step 3 explanation to say that the fix relies on `indexProject()` being incremental, so unchanged files are skipped and changed/removed/new files are reconciled correctly.

Keep the regression test from Step 1, but strengthen the task description so it explicitly says this covers AC 1 and AC 2 by re-running indexing before serving `symbol_graph` and `trace`.

## Task 3: Make impact reject ambiguous symbol seeds

Step 3 currently changes the exported `collectImpact()` API from:

```ts
collectImpact({ symbols, changeType, store, maxDepth })
```

to:

```ts
collectImpact({ nodeIds, changeType, store, maxDepth })
```

That breaks existing tests and callers. `test/tool-impact.test.ts` already calls `collectImpact({ symbols: [...] ... })` multiple times, so this plan would fail the full-suite run in Step 5 even if the new ambiguity test passed.

Do **not** change `collectImpact`’s public signature in this task.

Instead, keep `collectImpact()` exactly on the existing `symbols: string[]` contract and scope the ambiguity behavior to the `impact()` formatter wrapper, since the new regression test in Step 1 only exercises `impact()`.

Revise Step 3 so `src/tools/impact.ts` keeps:
- `CollectImpactParams.symbols: string[]`
- `collectImpact(params)` seeding from `store.findNodes(symbol)` exactly as today

and only changes `impact()` to resolve each requested symbol first using the helper from Task 2.

The `impact()` body should look like this:

```ts
export function impact(params: {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  projectRoot: string;
  maxDepth?: number;
}): string {
  for (const symbol of params.symbols) {
    const resolved = resolveUniqueSymbol({
      name: symbol,
      store: params.store,
      projectRoot: params.projectRoot,
      notFoundLabel: "Symbol",
    });
    if (resolved.kind === "ambiguous") return resolved.text;
    if (resolved.kind === "not_found") return "";
  }

  const hits = collectImpact({
    symbols: params.symbols,
    changeType: params.changeType,
    store: params.store,
    maxDepth: params.maxDepth,
  });
  if (hits.length === 0) return "";

  const lines = hits.flatMap((hit) => {
    const node = params.store.getNode(hit.nodeId);
    if (!node) return [];
    const { anchor, stale } = computeAnchor(node, params.projectRoot);
    return [`${anchor}  ${hit.name}  ${hit.classification}  depth:${hit.depth}${stale ? " [stale]" : ""}`];
  });
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}
```

Update the task text to explicitly say why `collectImpact()` is left unchanged: it is already part of the tested surface in `test/tool-impact.test.ts`, and this task is only about user-facing ambiguity semantics in `impact()`.
