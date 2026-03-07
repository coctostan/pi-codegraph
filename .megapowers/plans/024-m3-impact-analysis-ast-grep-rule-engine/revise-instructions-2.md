## Task 2: Add anchored impact output and register the impact tool

Step 3 is not self-contained and will not compile as written.

### Fix the `src/tools/impact.ts` snippet
- Restore the missing type declarations from Task 1 instead of pasting a partial fragment.
- The code block currently has undeclared identifiers (`queue`, `inbound`, `classification`) and is missing the `ChangeType` / `CollectImpactParams` declarations.
- Keep the production API aligned with the existing codebase:
  - `computeAnchor(node, projectRoot)` returns `{ anchor, stale }` from `src/output/anchoring.ts`
  - `GraphStore` comes from `src/graph/store.ts`

Use a complete snippet shaped like this:

```ts
import type { GraphStore } from "../graph/store.js";
import { computeAnchor } from "../output/anchoring.js";

export type ChangeType = "signature_change" | "removal" | "behavior_change" | "addition";
export type ImpactClassification = "breaking" | "behavioral";

export interface CollectImpactParams {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  maxDepth?: number;
}

export interface ImpactItem {
  nodeId: string;
  name: string;
  file: string;
  depth: number;
  classification: ImpactClassification;
}

function classify(changeType: ChangeType, depth: number): ImpactClassification | null {
  if (changeType === "addition") return null;
  if (changeType === "behavior_change") return "behavioral";
  if (changeType === "signature_change" || changeType === "removal") {
    return depth === 1 ? "breaking" : "behavioral";
  }
  return null;
}

export function collectImpact(params: CollectImpactParams): ImpactItem[] {
  const { symbols, changeType, store, maxDepth = 5 } = params;
  if (changeType === "addition") return [];

  const queue: Array<{ id: string; depth: number }> = [];
  const seen = new Set<string>();
  const results: ImpactItem[] = [];

  for (const symbol of symbols) {
    for (const node of store.findNodes(symbol)) {
      queue.push({ id: node.id, depth: 0 });
      seen.add(node.id);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;

    const inbound = store.getNeighbors(current.id, { direction: "in", kind: "calls" });
    for (const neighbor of inbound) {
      if (seen.has(neighbor.node.id)) continue;
      const depth = current.depth + 1;
      seen.add(neighbor.node.id);
      queue.push({ id: neighbor.node.id, depth });

      const classification = classify(changeType, depth);
      if (!classification) continue;
      results.push({
        nodeId: neighbor.node.id,
        name: neighbor.node.name,
        file: neighbor.node.file,
        depth,
        classification,
      });
    }
  }

  return results.sort((a, b) => a.depth - b.depth || a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
}
```

### Fix the `impact()` output contract
The current fallback `"No downstream impact detected.\n"` is human prose and conflicts with the spec’s structured-output intent. Return an empty string instead, or another deliberately structured empty result, but do not introduce prose-only output.

Also preserve existing anchor formatting semantics by honoring the `stale` flag from `computeAnchor()`:

```ts
const { anchor, stale } = computeAnchor(node, params.projectRoot);
const staleMarker = stale ? " [stale]" : "";
return `${anchor}  ${hit.name}  ${hit.classification}  depth:${hit.depth}${staleMarker}`;
```

### Fix the `src/index.ts` snippet
The execute body currently drops the `impact()` call. Use the existing helpers already present in `src/index.ts` (`getOrCreateStore()` and `ensureIndexed()`):

```ts
const text = impact({
  symbols: params.symbols,
  changeType: params.changeType,
  store,
  projectRoot,
  maxDepth: params.maxDepth,
});
return { content: [{ type: "text", text }], details: undefined };
```

## Task 4: Load and validate bundled and project-local ast-grep rules

The validation logic is too hard-coded to the bundled Express/React rules. AC 18–21 describe a rule engine contract, not two special cases.

### Change the rule schema/validation
Do not validate by `edge_kind === "routes_to"` or `edge_kind === "renders"` for source/target strategy selection.

Instead validate:
- exactly one source selector: `from_capture` XOR `from_context`
- exactly one target selector: `to_capture` XOR `to_template`
- `from_context`, when present, must equal `"enclosing_function"`

Use logic shaped like this:

```ts
const hasFromCapture = typeof rule.produces.from_capture === "string";
const hasFromContext = typeof rule.produces.from_context === "string";
if (hasFromCapture === hasFromContext) {
  throw new Error(`Invalid rule file ${filePath}: specify exactly one of produces.from_capture or produces.from_context`);
}

const hasToCapture = typeof rule.produces.to_capture === "string";
const hasToTemplate = typeof rule.produces.to_template === "string";
if (hasToCapture === hasToTemplate) {
  throw new Error(`Invalid rule file ${filePath}: specify exactly one of produces.to_capture or produces.to_template`);
}

if (hasFromContext && rule.produces.from_context !== "enclosing_function") {
  throw new Error(`Invalid rule file ${filePath}: unsupported produces.from_context ${rule.produces.from_context}`);
}
```

### Update Step 1 tests
Add at least one success case proving the loader accepts the source/target strategies generically instead of only the bundled pairings.

For example, add a rule file with:

```yaml
- name: generic-context-template
  pattern: foo()
  lang: typescript
  produces:
    edge_kind: routes_to
    from_context: enclosing_function
    to_template: endpoint:{NAME}
    confidence: 0.5
```

and assert `loadRules()` accepts it.

## Task 5: Add the sg subprocess scan wrapper

Step 3 is incomplete: `cmd` is never defined, so the code will not run.

### Define the actual subprocess command
Use the real ast-grep CLI contract (`sg run --json --lang ... --pattern ... <files...>`). The implementation should be:

```ts
export async function runScan(
  projectRoot: string,
  rule: AstGrepRule,
  files: string[],
  execFn: ExecFn = defaultExec,
): Promise<SgMatch[]> {
  if (files.length === 0) return [];

  const cmd = [
    "sg",
    "run",
    "--json",
    "--lang",
    rule.lang,
    "--pattern",
    rule.pattern,
    ...files,
  ];

  const stdout = await execFn(cmd, { cwd: projectRoot });
  // existing JSON parse / validation follows
}
```

Keep the command exactly aligned with the test expectation, or update the test and implementation together if you intentionally choose `--json=compact`.

## Task 6: Create endpoint nodes and routes_to edges from Express matches

Both the test and implementation snippets are currently broken.

### Fix the Step 1 test code
The test references undeclared variables `endpoint` and `aRoutes`. Declare them explicitly:

```ts
const endpoint = store.getNode("endpoint:GET:/users")!;
const aRoutes = store.getNeighbors("src/api.ts::handlerA:3", { direction: "out", kind: "routes_to" });
const bRoutes = store.getNeighbors("src/api.ts::handlerB:7", { direction: "out", kind: "routes_to" });
```

### Stop hard-coding the template expansion
The current implementation ignores `rule.produces.to_template` and builds the endpoint id manually. That does not satisfy AC 21.

Add a small helper and use the rule’s template value:

```ts
function renderTemplate(template: string, meta: Record<string, string | string[]>): string {
  return template.replace(/\{([A-Z_]+)\}/g, (_, key: string) => {
    const value = meta[key];
    if (typeof value === "string") return value;
    if (Array.isArray(value) && value.length > 0) return String(value[0]);
    return "";
  });
}
```

Then, before rendering, normalize the Express method capture so AC 28 is met:

```ts
const method = rawMethod.toUpperCase();
const meta = { ...match.metaVariables, METHOD: method, PATH: path };
const endpointId = renderTemplate(rule.produces.to_template!, meta);
```

Use the existing same-file lookup API from `src/graph/store.ts`:

```ts
const handlerNode = store.findNodes(handlerName, match.file)[0];
```

## Task 7: Create renders edges from React matches with enclosing function lookup

Step 3 is not executable as written: `sourceNode` and `targetNode` are used without being defined.

### Complete the `applyRendersMatches()` implementation
Use the real store APIs already present in `src/graph/store.ts`:
- `store.getNodesByFile(file)`
- `store.findNodes(name, file?)`

The missing core should look like this:

```ts
function applyRendersMatches(store: GraphStore, rule: AstGrepRule, matches: SgMatch[]): void {
  for (const match of matches) {
    const targetName = metaValue(match.metaVariables, rule.produces.to_capture ?? "");
    if (!targetName) continue;

    const sourceNode = smallestContainingFunction(store.getNodesByFile(match.file), match.line);
    if (!sourceNode) continue;

    const targetNode = store.findNodes(targetName, match.file)[0];
    if (!targetNode) continue;

    store.addEdge({
      source: sourceNode.id,
      target: targetNode.id,
      kind: "renders",
      provenance: {
        source: "ast-grep",
        confidence: rule.produces.confidence,
        evidence: `${rule.name}@${match.file}:${match.line}:${match.column}`,
        content_hash: sourceNode.content_hash,
      },
      created_at: Date.now(),
    });
  }
}
```

### Keep Task 7 same-file only
Do not add cross-file fallback here. AC 31 only requires same-file `enclosing_function` resolution, and same-file target lookup keeps the incremental story consistent with changed-file-only Stage 3 scanning.

## Task 9: Index React renders from a real TSX fixture

This task is over-scoped and introduces a real incremental-indexing hazard.

### Remove the cross-file render lookup work from this task
The current Step 3 fallback:

```ts
store.findNodes(targetName).find((node) => node.kind === "function" || node.kind === "class")
```

should not be added.

Why: the pipeline only scans changed files (`changedFiles` in `src/indexer/pipeline.ts`). With cross-file targets, changing `src/components/Button.tsx` would delete the old `Button` node via `store.deleteFile(rel)`, which also drops `renders` edges pointing at that node. Because `src/App.tsx` is unchanged, Stage 3 will not rescan it, so the `App -> Button` edge disappears. That invalidation expansion is outside this milestone.

### Rewrite Task 9 as integration-only coverage for the same-file React rule
Keep the task, but make it a real pipeline integration test for the Task 7 behavior using a same-file TSX fixture, for example:

```tsx
export function Button() { return <button/>; }
export function App() {
  return <Button />;
}
```

Then assert:

```ts
const app = store.findNodes("App", "src/App.tsx")[0]!;
const renders = store.getNeighbors(app.id, { direction: "out", kind: "renders" });
expect(renders).toHaveLength(1);
expect(renders[0]!.node.name).toBe("Button");
expect(renders[0]!.node.file).toBe("src/App.tsx");
```

If you make Task 9 integration-only, remove `src/indexer/ast-grep.ts` from `files_to_modify` for this task.

## Task 10: Confirm changed-file reindex replacement without Stage 3 deleteFile helpers

This task breaks the plan’s TDD flow: Step 2 is already GREEN because Task 8 implements the behavior first.

### Do not keep this as a standalone task
Fold its assertions into Task 8 instead of carrying a post-hoc regression-only task.

Specifically:
- Move the removed-file cleanup assertion into Task 8’s Stage 3 integration test.
- Delete Task 10 from the plan, or convert its coverage into Task 8 and update Task 8’s description accordingly.

Do **not** keep a task whose Step 2 says:

```text
PASS — Task 8 already replaces changed-file artifacts ...
```

That is not a valid RED step under the required workflow.
