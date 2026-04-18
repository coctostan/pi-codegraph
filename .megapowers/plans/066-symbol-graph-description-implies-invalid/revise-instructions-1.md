## Task 2: Document valid symbol_graph include values in public docs

Step 1 currently replaces `test/docs-symbol-graph-unified-surface.test.ts` but drops two existing README assertions from the current regression test:

```ts
expect(readme).not.toContain("#### `symbol_card`");
expect(readme).not.toContain("#### `symbol_contract`");
```

Keep equivalent assertions in the new test so this task does not weaken the existing unified-surface regression while adding the new include-guidance checks.

Step 3's README replacement block is malformed. The task file currently closes the outer markdown fence before opening the example code fence, then has an extra trailing fence. Rewrite Step 3 so the exact replacement block is unambiguous and copy-pastable. Use a single Markdown snippet that includes both the prose and the example code fence, for example:

````md
#### `symbol_graph`
Return a compact symbol summary with relationships, test signals, and key metadata.

By default, `symbol_graph({ name: "validateToken" })` already includes test signals in the compact card.
Allowed include values: `"neighborhood"`, `"contract"`, `"source"`. `"tests"` is not a valid include value.

```
symbol_graph({ name: "validateToken" })
symbol_graph({ name: "validateToken", file: "src/auth.ts" })
symbol_graph({ name: "validateToken", include: ["neighborhood"] })
symbol_graph({ name: "validateToken", include: ["contract"] })
symbol_graph({ name: "validateToken", include: ["source"] })
symbol_graph({ name: "validateToken", include: ["neighborhood", "contract", "source"] })
```
````

Do not change the intended wording. The correction here is to make the replacement block syntactically valid and preserve the prior README coverage while adding the new assertions.
