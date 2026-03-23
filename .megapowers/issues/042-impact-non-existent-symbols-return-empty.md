---
id: 42
type: bugfix
status: open
created: 2026-03-23T12:35:50.836Z
priority: 2
---
# impact: non-existent symbols return empty output instead of a diagnostic message

## Observed behavior

`impact(["nonExistentSymbol_ZZZ"], "behavior_change")` returns:
```
## Trust
status: fresh
evidence: agent,git,lsp,tree-sitter  stale-files: 0/136
```

Just a trust header with empty body. No indication the symbol wasn't found.

Compare with `symbol_graph("nonExistentSymbol_ZZZ")` which returns: `Symbol "nonExistentSymbol_ZZZ" not found` — a clear diagnostic.

## Root cause

`src/tools/impact.ts:140-149`:

```typescript
for (const symbol of params.symbols) {
  const resolved = resolveUniqueSymbol({ name: symbol, ... });
  if (resolved.kind === "ambiguous") return prependTrustHeader(resolved.text, { stats });
  if (resolved.kind === "not_found") return prependTrustHeader("", { stats });  // ← empty body
}
```

The `not_found` branch returns an empty string body. The ambiguous case correctly returns diagnostic text, but not_found swallows the message.

## Expected behavior

Return `Symbol "nonExistentSymbol_ZZZ" not found` in the body, consistent with symbol_graph. For multi-symbol calls, could list all not-found symbols.

## Files involved

- `src/tools/impact.ts` — not_found handling (line 148)
