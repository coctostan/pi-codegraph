## Task 2: Add anchored impact output and register the impact tool

### Step 3 `collectImpact` is missing the `for (const symbol of symbols)` loop

In the Step 3 code block, lines after `const results: ImpactItem[] = [];` jump directly to `for (const node of store.findNodes(symbol))` — but `symbol` is undefined because the enclosing `for (const symbol of symbols) {` loop is missing.

The code currently reads:
```ts
  const results: ImpactItem[] = [];
    for (const node of store.findNodes(symbol)) {
```

It should read:
```ts
  const results: ImpactItem[] = [];
  for (const symbol of symbols) {
    for (const node of store.findNodes(symbol)) {
```

This is a single missing line. Add `for (const symbol of symbols) {` between `const results: ImpactItem[] = [];` and `for (const node of store.findNodes(symbol)) {`.

This is the only change needed — everything else in Task 2 is correct.
