## Task 12: Extension auto-indexes when store is empty and shares singleton store

Step 3 execute handlers return `{ content: [{ type: "text", text: output }] }` without `details`. This is a TypeScript error because `AgentToolResult<unknown>` requires `details: unknown`. Add `details: undefined` to both return statements:

```ts
// In symbol_graph execute:
return { content: [{ type: "text", text: output }], details: undefined };

// In resolve_edge execute:
return { content: [{ type: "text", text: output }], details: undefined };
```

This also covers AC19, making Task 13 unnecessary.

---

## Task 13: Extension tool execute returns AgentToolResult with text content

**Remove this task entirely.** The RED state is impossible: Bun's `toEqual` treats missing properties as equivalent to `undefined`. Experimentally verified:

```ts
expect({ content: [{ type: "text", text: "x" }] })
  .toEqual({ content: [{ type: "text", text: "x" }], details: undefined });
// → PASS (no implementation needed)
```

Once Task 12 includes `details: undefined` (per the fix above), AC19 is fully covered. There is no remaining behavior to test.

Delete `task-013.md`.
