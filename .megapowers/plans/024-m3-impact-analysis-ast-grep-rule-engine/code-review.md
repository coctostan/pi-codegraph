# Code Review Report — M3 Impact Tool + ast-grep Rule Engine

**Final test result:** 126 pass / 0 fail. `bun run check` exits 0.

---

## Strengths

The implementation is clean and technically sound across both components:

- **BFS cycle prevention** in `collectImpact` is textbook-correct: seed nodes are pre-added to `seen` so changed symbols never appear as their own dependents, and the visited set gates every enqueue.
- **`classify()` as a pure function** separate from the traversal makes the classification matrix readable and independently testable.
- **No shell injection surface** — `Bun.spawn` receives an argument array, so rule patterns and file paths with special characters cannot escape into shell interpretation.
- **`ExecFn` injection point** makes subprocess logic fully testable without spawning a process — the right abstraction.
- **`smallestContainingFunction` tie-breaking** is fully deterministic (span → start\_line → id lexicographic), preventing sort-order flakiness in React render edge resolution.
- **Integration tests** skip gracefully when `sg` is absent (CI-safe), cover the full lifecycle: first index, route change, unchanged re-run (no duplicate edges), and file deletion.

---

## Findings

### Critical — None

### Important (both fixed in this session)

#### 1. `validateRuleFile` accepted any `edge_kind` string — silent no-op for invalid user rules *(fixed)*

**`src/indexer/ast-grep.ts:41` (original)**

The existence check `if (!rule.produces?.edge_kind)` only verified presence, not validity. A user YAML with `edge_kind: "route_to"` (typo) or `edge_kind: "my_custom"` passed validation and was loaded into the rules list. `applyRuleMatches` then silently matched neither branch and produced nothing. The user got no feedback.

**Fix:** Added allowlist check immediately after the existence check:
```typescript
const allowedEdgeKinds = ["routes_to", "renders"];
if (!allowedEdgeKinds.includes(rule.produces.edge_kind)) {
  throw new Error(`Invalid rule file ${filePath}: unsupported produces.edge_kind ${rule.produces.edge_kind}`);
}
```
New test added in `test/indexer-ast-grep-rules.test.ts` (RED→GREEN verified).

#### 2. Two `expect().rejects.toThrow()` assertions missing `await` — vacuous tests *(fixed)*

**`test/indexer-ast-grep-scan.test.ts:55,65`**

Both async tests called `expect(promise).rejects.toThrow(...)` without `await`. The Promise floated unobserved and the test function returned before the assertion settled — these tests passed regardless of whether the error message matched. A regression changing the error text would have passed silently.

**Fix:** Added `await` to both assertions.

---

### Minor

**3. `classify()` has a structurally unreachable `return null` at line 28** (`src/tools/impact.ts:28`) — All four `ChangeType` members are handled above it; TypeScript can't prove exhaustiveness because the return type includes `| null`. A `const _exhaustive: never = changeType` guard would make this compile-time enforced.

**4. React rule only matches self-closing JSX — not documented** (`src/rules/react.yaml:2`) — `<Component>children</Component>` is not covered. Significant real-world gap. A comment or a second pattern for the children form would help.

**5. `readRuleFile` checks `Bun.YAML.parse` availability on every file** (`src/indexer/ast-grep.ts:61`) — Idempotent guard re-evaluated per file; could be hoisted to `loadRules`.

**6. Endpoint node `name` equals `id`** (`src/indexer/ast-grep.ts:196`) — `name: "endpoint:GET:/users"` is redundant with `id`. A human-readable `"GET /users"` in `name` would improve `symbol_graph` and `impact` output.

**7. `loadRules` doesn't deduplicate rules by name** (`src/indexer/ast-grep.ts:77`) — A user rule with the same name as a bundled rule runs twice, paying the subprocess cost twice. User-wins deduplication with a warning would be cleaner.

---

### Nit

**8.** `pipeline.ts` swallows file-level errors without logging (pre-existing, not M3-introduced).  
**9.** The `bundled rules path resolves` test lives in the Express integration file rather than the rules unit test file — minor organization issue.

---

## Assessment: **ready**

The core logic is correct, the security boundary is sound, and the spec criteria are all met. The two important issues (silent `edge_kind` validation gap, unawaited test assertions) were fixed in this session and are now part of the codebase (126 tests pass). The remaining minors are quality-of-life improvements that do not affect correctness or safety.
