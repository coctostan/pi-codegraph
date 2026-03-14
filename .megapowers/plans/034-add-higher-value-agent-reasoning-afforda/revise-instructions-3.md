# Revise Instructions (Iteration 3)

## Task 5: Append always-on impact why annotations — fix stale marker in regex

The existing `test/extension-impact.test.ts` creates nodes with `content_hash: "h"` (lines 37-38) while writing real files to disk (line 34). Since `"h"` ≠ `sha256(real_file_content)`, `computeAnchor` reports `stale: true`, and the impact output includes ` [stale]` between `depth:1` and the new annotation suffix.

The actual output line will be:
```
src/caller.ts:2:XXXX  caller  breaking  depth:1 [stale]  [fan-in:0, untested, co-change:0, chain-confidence:0.80]
```

The plan's proposed regexes on lines 944-945 of plan.md:
```ts
expect(out.trim()).toMatch(/^src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1  \[fan-in:0, untested, co-change:0, chain-confidence:0\.80\]$/);
expect(out).toMatch(/^src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1  \[fan-in:0, untested, co-change:0, chain-confidence:0\.80\]\n$/);
```

These will FAIL because they don't match the ` [stale]` that appears in the output.

**Fix:** Restore the optional `( \[stale\])?` group from the original regex, placed between `depth:1` and `  \[fan-in:`:

```ts
expect(out.trim()).toMatch(/^src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1( \[stale\])?  \[fan-in:0, untested, co-change:0, chain-confidence:0\.80\]$/);
expect(out).toMatch(/^src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1( \[stale\])?  \[fan-in:0, untested, co-change:0, chain-confidence:0\.80\]\n$/);
```

This is the only change needed. All other tasks pass review.
