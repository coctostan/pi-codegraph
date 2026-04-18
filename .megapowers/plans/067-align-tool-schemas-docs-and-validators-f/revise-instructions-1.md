# Revision Instructions — Iteration 1

The plan is almost approvable. The only issue is that **Tasks 2 and 3 introduce a new module file** (`src/graph/edge-kinds.ts`) that violates the spec's explicit scope boundary for shared-constant extraction (**Out of Scope O1**: "may be done opportunistically … only if it stays within existing files").

The spec's wording also anchors the canonical location of `VALID_EDGE_KINDS` inside each tool file:

- **AC 2**: "the exact set exported as `VALID_EDGE_KINDS` in `src/tools/resolve-edge.ts`"
- **AC 4**: "matching `VALID_EDGE_KINDS` in `src/tools/delete-edge.ts`"
- **AC 7**: "The runtime validators `isValidEdgeKind` in `src/tools/resolve-edge.ts` and `src/tools/delete-edge.ts` remain in place"

Rework Tasks 2 and 3 so each tool file keeps its own `VALID_EDGE_KINDS` array and `isValidEdgeKind` validator (just add `export` to what's already there), and `src/index.ts` imports each one directly. No new files. No shared `edge-kinds.ts` module.

Leave all other tasks (1, 4, 5, 6, 7, 8, 9, 10, 11) as-is. They pass review.

---

## Task 2: Upgrade resolve_edge.kind schema to 8-literal union and enumerate description

### What to change

1. **Do not create `src/graph/edge-kinds.ts`.** Remove all references to it in the task body (test import, Step 3(a), Step 3(b), Step 3(c)).

2. **Update the `files_to_modify` frontmatter** to:
   ```yaml
   files_to_modify:
     - src/index.ts
     - src/tools/resolve-edge.ts
     - test/closed-enum-schemas.test.ts
   files_to_create: []
   ```

3. **Step 1 — Rewrite the test import line** so it imports `VALID_EDGE_KINDS` directly from the existing tool file:

   ```ts
   import { VALID_EDGE_KINDS } from "../src/tools/resolve-edge.js";
   ```

   (Replace the old `import { VALID_EDGE_KINDS } from "../src/graph/edge-kinds.js";` line. Also delete the note "Note: this test imports `VALID_EDGE_KINDS` from a new module path …" — it's now imported from the existing module.)

4. **Step 2 — Rewrite the expected failure.** Since the module already exists, the test will fail on the schema shape, not on a missing module:

   ```
   Expected: FAIL — `resolve_edge.kind description mismatch: Edge kind (calls, imports, implements, extends, ...)`
   (current schema is `Type.String` with the open-set description; no `anyOf` literal union yet.)
   ```

   Also note: `VALID_EDGE_KINDS` is currently declared without `export` in `src/tools/resolve-edge.ts`, so the test import itself may fail first with something like `Export named 'VALID_EDGE_KINDS' not found`. Either expected failure is acceptable — the point is the test fails until Step 3 makes both the export and the schema conform.

5. **Step 3 — Replace the three-part implementation with a two-part one:**

   **(a) In `src/tools/resolve-edge.ts`**, add `export` to the existing array (≈ line 5) so `src/index.ts` and the test can import it. Also export `isValidEdgeKind` (it is already used only in this file, so behavior is unchanged):

   ```ts
   export const VALID_EDGE_KINDS: EdgeKind[] = [
     "calls",
     "imports",
     "implements",
     "extends",
     "tested_by",
     "co_changes_with",
     "renders",
     "routes_to",
   ];

   export function isValidEdgeKind(kind: string): kind is EdgeKind {
     return VALID_EDGE_KINDS.includes(kind as EdgeKind);
   }
   ```

   Do **not** delete the array, do **not** move it to another file, do **not** change its contents or order. Only add the `export` keywords. The existing call site `VALID_EDGE_KINDS.join(", ")` at the bottom of `resolveEdge` stays untouched, preserving AC 7's error-message wording.

   **(b) In `src/index.ts`**, add an import near the other `./tools/...` imports (around lines 11–12):

   ```ts
   import { VALID_EDGE_KINDS as RESOLVE_EDGE_KINDS } from "./tools/resolve-edge.js";
   ```

   (Alias is optional — a plain `VALID_EDGE_KINDS` import is fine too, since Task 3 will import the delete-edge copy under a different alias to avoid a name collision. If you prefer plain names, reuse one import for both schemas since the values are equal; see Task 3 below for that alternative.)

   Then replace `ResolveEdgeParams.kind` (≈ line 44):

   ```ts
     kind: Type.String({ description: "Edge kind (calls, imports, implements, extends, ...)" }),
   ```

   with:

   ```ts
     kind: Type.Union(
       RESOLVE_EDGE_KINDS.map((k) => Type.Literal(k)),
       {
         description:
           'Edge kind. Allowed values: "calls", "imports", "implements", "extends", "tested_by", "co_changes_with", "renders", "routes_to".',
       },
     ),
   ```

   Do not touch `DeleteEdgeParams.kind` — Task 3 owns that.

---

## Task 3: Upgrade delete_edge.kind schema to 8-literal union and enumerate description

### What to change

1. **Do not introduce any shared module.** Remove the bullet "In `src/tools/delete-edge.ts`, replace the local `VALID_EDGE_KINDS` + `isValidEdgeKind` block … with the shared import added in Task 2".

2. **Step 3(a) — Add `export` to the existing definitions in `src/tools/delete-edge.ts`** (≈ lines 5 and 16), mirroring Task 2's change to `resolve-edge.ts`:

   ```ts
   export const VALID_EDGE_KINDS: EdgeKind[] = [
     "calls",
     "imports",
     "implements",
     "extends",
     "tested_by",
     "co_changes_with",
     "renders",
     "routes_to",
   ];

   export function isValidEdgeKind(kind: string): kind is EdgeKind {
     return VALID_EDGE_KINDS.includes(kind as EdgeKind);
   }
   ```

   Do not delete or relocate the array. Only add `export`. The internal `VALID_EDGE_KINDS.join(", ")` usage inside `deleteEdge` stays put, preserving AC 7.

3. **Step 3(b) — Update the `src/index.ts` import** added in Task 2 so both schemas have a source of truth. Either:

   **Option A (two aliased imports, one per tool file):**
   ```ts
   import { VALID_EDGE_KINDS as RESOLVE_EDGE_KINDS } from "./tools/resolve-edge.js";
   import { VALID_EDGE_KINDS as DELETE_EDGE_KINDS } from "./tools/delete-edge.js";
   ```
   Then use `DELETE_EDGE_KINDS.map((k) => Type.Literal(k))` in the new `DeleteEdgeParams.kind` union.

   **Option B (one import, reused for both):** Since Task 1+2 also need a `VALID_EDGE_KINDS` value in `src/index.ts`, you may import once from `./tools/resolve-edge.js` under the plain name and reuse it for both unions. This keeps `src/index.ts` identical to the existing convention of importing one name per thing, and does not move the canonical definitions. Task 2's revision should align with whichever option you pick.

   Either option is fine. Pick one and apply it consistently across Task 2 and Task 3.

4. **Step 3(c) — Replace `DeleteEdgeParams.kind`** (≈ line 80 in `src/index.ts`) exactly as the current task body describes:

   ```ts
     kind: Type.Union(
       DELETE_EDGE_KINDS.map((k) => Type.Literal(k)),  // or the chosen alias from Option B
       {
         description:
           'Edge kind. Allowed values: "calls", "imports", "implements", "extends", "tested_by", "co_changes_with", "renders", "routes_to".',
       },
     ),
   ```

5. **Step 1 — Leave the test as-is.** The test in Task 3 references `VALID_EDGE_KINDS` which is already imported at the top of `test/closed-enum-schemas.test.ts` by Task 2. Just make sure the Task 2 revision points that import at `../src/tools/resolve-edge.js`, which is the canonical source for the shared constant value (the delete-edge copy is identical, so the test assertion `literals match VALID_EDGE_KINDS` holds for both tools).

6. **Step 2 expected failure** stays correct as written — the failure mode is still the description mismatch / open-set schema on `delete_edge.kind`.

---

## Everything else

Tasks 1, 4, 5, 6, 7, 8, 9, 10, and 11 are unchanged and approved as drafted. Do not modify them.

No new tests or ACs need to be added — the existing Task 2 / Task 3 assertions on "literals match `VALID_EDGE_KINDS`" remain valid because the array value is identical regardless of which tool file hosts it.
