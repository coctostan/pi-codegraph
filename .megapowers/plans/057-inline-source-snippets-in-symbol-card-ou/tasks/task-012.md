---
id: 12
title: Typebox schema — add maxSourceLines parameter to index.ts
status: approved
depends_on:
  - 6
no_test: true
files_to_modify:
  - src/index.ts
files_to_create: []
---

### Task 12: Typebox schema — add maxSourceLines parameter to index.ts [depends: 6] [no-test]

**Justification:** Schema-only change in `index.ts` — the Typebox param definition and its wiring to the `symbolCard` function call. Behavioral correctness is covered by the integration tests in Tasks 6–10 via the `symbolCard` function directly.

**Files:**
- Modify: `src/index.ts`

**Step 1 — Make the change**

In `src/index.ts`, update the `SymbolCardParams` Typebox schema (around line 71):

```typescript
const SymbolCardParams = Type.Object({
  name: Type.String({ description: "Symbol name to look up" }),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
  maxSourceLines: Type.Optional(Type.Number({ description: "Maximum lines of source to inline (default: 50)" })),
});
```

And update the `execute` handler (around line 313) to pass through the param:

```typescript
      let output = symbolCard({ name: params.name, file: params.file, maxSourceLines: params.maxSourceLines, store, projectRoot });
```

**Step 2 — Verify**
Run: `bun build src/index.ts --no-bundle 2>&1 | head -20`
Expected: no type errors

Run: `bun test`
Expected: all tests passing
