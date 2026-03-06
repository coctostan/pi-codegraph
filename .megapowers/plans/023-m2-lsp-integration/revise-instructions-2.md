## Task 1: Add `TsServerClient` request API and lifecycle

This task is too broad and its proposed API does not match the spec.

### Required changes

1. **Fix the constructor/API shape**
   - The spec requires lazy location of `tsserver` from the project root, preferring `node_modules/.bin/tsserver` and falling back to a global `tsserver`.
   - Do **not** make callers pass `tsserverPath` positionally.
   - Replace the proposed constructor shape:
     ```ts
     new TsServerClient(tsserverPath, projectRoot)
     ```
     with something like:
     ```ts
     new TsServerClient(projectRoot, {
       idleMs?: number,
       timeoutMs?: number,
       tsserverPath?: string, // optional test override only
     })
     ```
   - `tsserverPath` can exist as an **optional override for tests**, but production code must perform the local-then-global lookup itself.

2. **Make the defaults match the acceptance criteria**
   - Request timeout default must be **5000 ms**, not 15000 ms.
   - Idle timeout default must remain **30000 ms**.

3. **Replace the hard-coded macOS test path**
   - Remove:
     ```ts
     const TSSERVER = process.env.TSSERVER_PATH ?? "/opt/homebrew/bin/tsserver";
     ```
   - This is not portable and will fail on Linux/CI.
   - Instead, make the fixture create or point at a local `node_modules/.bin/tsserver` inside the temp project, or use the optional `tsserverPath` override in a portable way.

4. **Add the missing lifecycle tests explicitly**
   The current tests do not cover these acceptance criteria:
   - AC2/AC3: idle shutdown + respawn after idle
   - AC5: pending requests are rejected if the process crashes
   - AC6: per-request timeout rejects without killing the process
   - AC7: concurrent requests are serialized so only one is in-flight
   - AC8: `shutdown()` cleans up the process and timers

   Add concrete tests for each. For example:
   - Start client with `idleMs: 50`, make one request, wait >50 ms, assert `getPid()` becomes `null`, then issue another request and assert a new pid appears.
   - Trigger a hung request with a fake/stub tsserver process and assert:
     ```ts
     await expect(client.definition("src/api.ts", 1, 17)).rejects.toThrow(
       "TsServer request timed out: definition",
     );
     ```
     then assert the next request still succeeds without respawning.
   - For queueing, issue two requests concurrently and assert the underlying transport never has two in-flight requests at once.

5. **Do not claim queueing without testing it**
   - The current Step 3 implementation has a `pending` map but no actual one-at-a-time request queue.
   - Add a real queue/lock so only one request is written before the prior response resolves.

6. **Keep the task focused**
   - Either split this task into smaller tasks or rewrite it so the RED/GREEN cycle is still executable from the task alone.
   - Right now one task covers nearly the entire client lifecycle plus all three public APIs.

## Task 4: Add eager LSP resolution stage for unresolved and confirmed call edges

This task is missing one acceptance criterion and uses the wrong confidence.

### Required changes

1. **Add coverage for AC20 (confirmed tree-sitter edges to real nodes)**
   - The current tests only exercise unresolved edges.
   - Add a test where the store already contains a real tree-sitter edge:
     ```ts
     store.addEdge({
       source: callerNode.id,
       target: targetNode.id,
       kind: "calls",
       provenance: {
         source: "tree-sitter",
         confidence: 0.5,
         evidence: "target:2:5",
         content_hash: "h",
       },
       created_at: 1000,
     });
     ```
   - Mock `definition("src/a.ts", 2, 5)` to return `{ file: "src/b.ts", line: 1, col: 17 }`.
   - Assert the stage:
     - adds exactly one `lsp` edge to `targetNode.id`
     - deletes the original `tree-sitter` edge

2. **Use the spec’s confidence value**
   - Replace all `0.95` values in this task with `0.9`.

3. **Resolve unresolved edges more safely than `file + start_line` only**
   - The proposed code:
     ```ts
     const targetNode = candidateNodes.find((n) => n.start_line === location.line);
     ```
     is too loose.
   - For unresolved edges, use the parsed evidence name plus the resolved location:
     ```ts
     const targetNode = store
       .getNodesByFile(location.file)
       .find((n) => n.name === parsed.name && n.start_line === location.line);
     ```
   - For AC20 (already-resolved tree-sitter edges), compare the resolved location against the existing target node before upgrading.

4. **Keep the partial-results behavior**
   - The current crash-handling direction is fine: preserve already-written edges and continue/abort gracefully as required.

## Task 5: Run the LSP stage from the indexing pipeline and purge stale LSP edges on file changes

This task breaks the existing test file and still does not address tsserver lookup correctly.

### Required changes

1. **Update the existing tests in `test/indexer-index-project.test.ts` to await the async API**
   The file currently contains synchronous expectations such as:
   ```ts
   const result = indexProject(root, store);
   expect(result).toEqual({ indexed: 2, skipped: 0, removed: 0, errors: 0 });
   ```
   and
   ```ts
   expect(indexProject(root, store)).toEqual({ indexed: 2, skipped: 0, removed: 0, errors: 1 });
   ```
   After making `indexProject` async, these must become:
   ```ts
   const result = await indexProject(root, store);
   expect(result).toEqual({ indexed: 2, skipped: 0, removed: 0, errors: 0 });
   ```
   and
   ```ts
   await expect(indexProject(root, store)).resolves.toEqual({ indexed: 2, skipped: 0, removed: 0, errors: 1 });
   ```
   Apply this throughout the file, not just in the newly appended test.

2. **Construct `TsServerClient` using the Task 1 API, not a raw `"tsserver"` string**
   - Replace:
     ```ts
     const tsserverPath = process.env.TSSERVER_PATH ?? "tsserver";
     const lspClient = new TsServerClient(tsserverPath, projectRoot);
     ```
     with the Task 1-style construction:
     ```ts
     const lspClient = new TsServerClient(projectRoot);
     ```
     or, if tests need it,
     ```ts
     const lspClient = new TsServerClient(projectRoot, { tsserverPath: ... });
     ```

3. **Add one integration assertion that the LSP stage actually runs after tree-sitter**
   - The current new tests only check async return type and stale-edge purging.
   - Add a fixture where tree-sitter creates an unresolved call edge and the pipeline run upgrades it to an `lsp` edge.
   - After `await indexProject(root, store)`, assert that an outbound edge from the caller exists with:
     ```ts
     e.kind === "calls" && e.provenance.source === "lsp"
     ```

## Task 6: Persist missing caller edges from LSP references when `symbol_graph` is invoked

The current cache strategy is incorrect and the tests do not cover the tool wiring.

### Required changes

1. **Do not use “any inbound lsp calls edge exists” as the cache guard**
   - The proposed guard:
     ```ts
     const existingLspCallers = store
       .getNeighbors(node.id, { kind: "calls", direction: "in" })
       .filter((nr) => nr.edge.provenance.source === "lsp");
     if (existingLspCallers.length > 0) return;
     ```
     is wrong.
   - Eager indexing from Task 4 can already create **some** inbound `lsp` caller edges. If you skip `references()` whenever one exists, `symbol_graph` will never discover additional callers tree-sitter missed.
   - Replace this with an **explicit persisted resolution marker** keyed by symbol id + resolver kind (for example, a small metadata table or equivalent persisted store entry). Only skip `references()` after a successful full `references()` pass has marked that symbol as resolved.

2. **Filter out self-references / declaration references**
   - `references()` can include the symbol’s own declaration/definition.
   - Before writing an edge, skip the target node itself:
     ```ts
     if (callerNode.id === node.id) continue;
     ```
   - Add a test where `references()` returns `{ file: node.file, line: node.start_line, col: ... }` and assert no self-call edge is created.

3. **Use confidence `0.9`, not `0.95`**
   - Replace all `0.95` values in this task with `0.9`.

4. **Add a tool-level wiring test**
   - The task currently tests only `resolveMissingCallers()` directly.
   - Also add a test that exercises the `symbol_graph` tool path in `src/index.ts` (similar to `test/extension-auto-index.test.ts`) and proves the handler calls the resolver and persists the edge before rendering.

## Task 7: Persist interface implementation edges from LSP and avoid repeat tool-time queries

This task has the same cache problem as Task 6 and needs a real tool-path test.

### Required changes

1. **Do not use “any inbound lsp implements edge exists” as the cache guard**
   - The proposed guard:
     ```ts
     const existing = store
       .getNeighbors(node.id, { kind: "implements", direction: "in" })
       .filter((nr) => nr.edge.provenance.source === "lsp");
     if (existing.length > 0) return;
     ```
     will incorrectly suppress future `implementations()` calls when only a subset of implementors is already present.
   - Use the same persisted resolution-marker mechanism as Task 6, but keyed for implementation resolution.

2. **Use confidence `0.9`, not `0.95`**
   - Replace all `0.95` values in this task with `0.9`.

3. **Add a tool-path integration test for interfaces**
   - In addition to the resolver unit test and the formatter test, add one test that goes through the `symbol_graph` execution path and proves:
     - an interface node triggers `resolveImplementations()`
     - the persisted `implements` edge is written
     - the rendered output includes the `Implementations` section

4. **Keep the output change focused on interface neighborhoods**
   - The formatter change is reasonable, but the task should explicitly state that non-interface symbols should continue to render exactly as before when no implementations section is supplied.
