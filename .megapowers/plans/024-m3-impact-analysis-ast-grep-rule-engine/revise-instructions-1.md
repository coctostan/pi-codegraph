## Task 2: Add anchored impact output and register the impact tool

Step 2's expected red is wrong. After Task 1, `../src/tools/impact.js` exists, so the first failure will be the missing named export, not the missing registration assertion.

Use an expected failure like:

`Expected: FAIL — Export named "impact" not found in module '../src/tools/impact.js'`

Step 3 currently self-imports from the file being edited:

```ts
import { collectImpact, type ChangeType } from "./impact.js";
```

Do **not** import `collectImpact` from `./impact.js` inside `src/tools/impact.ts`. Extend the file created in Task 1 in-place and export both APIs from the same module:

```ts
import type { GraphStore } from "../graph/store.js";
import { computeAnchor } from "../output/anchoring.js";

export type ChangeType = "signature_change" | "removal" | "behavior_change" | "addition";
export function collectImpact(...) { ... }

export interface ImpactParams {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  projectRoot: string;
  maxDepth?: number;
}

export function impact(params: ImpactParams): string {
  ...
}
```

Also split Step 1 into two focused tests in `test/extension-impact.test.ts`:
1. one test for `impact()` anchored formatting
2. one test for `pi.registerTool({ name: "impact", ... })`

That matches the style already used in `test/extension-wiring.test.ts` and keeps the task granular.

## Task 4: Load and validate bundled and project-local ast-grep rules

The implementation is parsing `.yaml` files with `JSON.parse(...)`. That does not satisfy the YAML rule-file requirement.

Use Bun's built-in YAML parser instead:

```ts
const raw = Bun.YAML.parse(readFileSync(filePath, "utf8")) as unknown;
```

Keep validation errors file-specific, e.g.:

```ts
throw new Error(`Invalid rule file ${filePath}: missing pattern`);
```

Update Step 1 fixtures so they exercise YAML parsing instead of JSON parsing. Use actual YAML content such as:

```yaml
- name: express-route
  pattern: $APP.$METHOD($PATH, $$$HANDLERS)
  lang: typescript
  produces:
    edge_kind: routes_to
    from_capture: HANDLERS
    to_template: endpoint:{METHOD}:{PATH}
    confidence: 0.9
```

and

```yaml
- name: custom-render
  pattern: <$COMPONENT />
  lang: tsx
  produces:
    edge_kind: renders
    from_context: enclosing_function
    to_capture: COMPONENT
    confidence: 0.8
```

## Task 5: Add the sg subprocess scan wrapper

The proposed `SgMatch` shape does not match real `sg run --json` output. Real ast-grep JSON looks like this shape:

```json
{
  "file": "src/api.ts",
  "range": { "start": { "line": 2, "column": 0 } },
  "metaVariables": {
    "single": {
      "METHOD": { "text": "get" },
      "PATH": { "text": "'/users'" }
    },
    "multi": {
      "HANDLERS": [{ "text": "handler" }]
    }
  }
}
```

So do **not** parse directly into:

```ts
{ file, line, column, metaVariables: Record<string, string | string[]> }
```

Instead, parse a raw shape and normalize it:

```ts
interface RawSgMatch {
  file: string;
  range: { start: { line: number; column: number } };
  metaVariables?: {
    single?: Record<string, { text: string }>;
    multi?: Record<string, Array<{ text: string }>>;
  };
}

export interface SgMatch {
  file: string;
  line: number;   // 1-based
  column: number; // 1-based
  metaVariables: Record<string, string | string[]>;
}
```

Normalize with:

```ts
line: raw.range.start.line + 1,
column: raw.range.start.column + 1,
```

`runScan()` also needs the project root as subprocess `cwd`. The current signature cannot express that, and later integration tasks pass relative file paths.

Change the API to include `projectRoot` and `cwd` support:

```ts
export type ExecFn = (cmd: string[], opts: { cwd: string }) => Promise<string>;

async function defaultExec(cmd: string[], opts: { cwd: string }): Promise<string> {
  const proc = Bun.spawn(cmd, { cwd: opts.cwd, stdout: "pipe", stderr: "pipe" });
  ...
}

export async function runScan(
  projectRoot: string,
  rule: AstGrepRule,
  files: string[],
  execFn: ExecFn = defaultExec,
): Promise<SgMatch[]> {
  ...
}
```

Update Step 1 so the fake exec asserts both the command and `cwd: projectRoot`.

## Task 6: Create endpoint nodes and routes_to edges from Express matches

The endpoint node ID is wrong. AC 28 requires the **node id itself** to be `endpoint:{METHOD}:{path}`.

Do **not** wrap it with `nodeId(file, name, 1)`. Replace:

```ts
function endpointId(file: string, name: string): string {
  return nodeId(file, name, 1);
}
```

with direct ID construction:

```ts
const rawMethod = metaValue(match.metaVariables, "METHOD");
const rawPath = metaValue(match.metaVariables, "PATH");
if (!rawMethod || !rawPath) continue;

const method = rawMethod.toUpperCase();
const path = rawPath.replace(/^['"]|['"]$/g, "");
const endpointId = `endpoint:${method}:${path}`;
```

Then create the node with that ID:

```ts
const endpointNode: GraphNode = {
  id: endpointId,
  kind: "endpoint",
  name: endpointId,
  file: match.file,
  start_line: match.line,
  end_line: match.line,
  content_hash: handlerNode.content_hash,
};
```

This task must consume the normalized `SgMatch` from Task 5. Do not keep assuming `HANDLERS` arrives as `string[]` from raw JSON.

Also note that real ast-grep captures string-literal paths with quotes (`"'/users'"`), so strip quotes before templating or the endpoint ID will be wrong.

## Task 7: Create renders edges from React matches with enclosing function lookup

There is a dependency mismatch: frontmatter lists `depends_on: [3, 4, 5, 6]` but the task header says `[depends: 3, 4, 5]`.

Pick one. This task does **not** need Express-specific Task 6, so remove `6` from frontmatter and keep both places aligned.

Step 3 is not self-contained because it says:

```ts
// existing express branch from Task 6
// keep the Task 6 implementation here unchanged
```

Replace that with concrete code. The easiest way is to factor helpers:

```ts
function applyRoutesToMatches(store: GraphStore, rule: AstGrepRule, matches: SgMatch[]): void {
  ... // full Task 6 implementation
}

function applyRendersMatches(store: GraphStore, rule: AstGrepRule, matches: SgMatch[]): void {
  ... // new Task 7 implementation
}

export function applyRuleMatches(store: GraphStore, rule: AstGrepRule, matches: SgMatch[]): void {
  if (rule.produces.edge_kind === "routes_to") return applyRoutesToMatches(store, rule, matches);
  if (rule.produces.edge_kind === "renders") return applyRendersMatches(store, rule, matches);
}
```

Keep Task 7 scoped to same-file `from_context: enclosing_function` resolution. Do **not** add cross-file fallback here:

```ts
?? store.findNodes(targetName)[0]
```

If you keep that fallback in Task 7, Task 9 will not have a meaningful red phase.

For `enclosing_function`, use `store.getNodesByFile(file)` and pick the smallest containing function range, not the first containing function.

## Task 8: Run the ast-grep stage from the pipeline and avoid duplicate unchanged edges

`runAstGrepIndexStage()` is loading bundled rules from the wrong place. Do **not** use `process.cwd()` and do **not** use `join(projectRoot, "..", "src", "rules")`.

Load bundled rules relative to `src/indexer/ast-grep.ts` itself:

```ts
import { fileURLToPath } from "node:url";

const bundledDir = fileURLToPath(new URL("../rules/", import.meta.url));
const rules = loadRules({ bundledDir, projectRoot });
```

Also remove the dead `changedFiles()` helper from `src/indexer/ast-grep.ts`. `src/indexer/pipeline.ts` already computes the changed file list correctly; just pass that list through.

Update this task's Step 3 to use the Task 5 signature:

```ts
const matches = await runScan(projectRoot, rule, files);
```

Do **not** add any extra file-deletion logic here. `indexProject()` already handles changed files with `store.deleteFile(rel)` before re-indexing.

## Task 9: Index React renders from a real TSX fixture

As written, this task will not go red if Task 7 already includes:

```ts
store.findNodes(targetName, match.file)[0] ?? store.findNodes(targetName)[0]
```

Make Task 7 same-file-only, then use Task 9 to add the cross-file fallback.

Step 3 is too vague right now. Replace it with the concrete refinement:

```ts
const targetNode =
  store.findNodes(targetName, match.file)[0] ??
  store.findNodes(targetName).find((node) => node.kind === "function" || node.kind === "class");
if (!targetNode) continue;
```

That makes the integration test a real red→green step instead of a restatement.

## Task 10: Replace stale ast-grep edges when a changed file is re-indexed

Do **not** implement this helper:

```ts
function deleteAstGrepArtifactsForFile(store: GraphStore, file: string): void {
  ...
  store.deleteFile(node.file);
}
```

`GraphStore` only exposes `deleteEdge(...)` and whole-file `deleteFile(...)` (`src/graph/store.ts`). Calling `store.deleteFile(node.file)` from inside Stage 3 will delete freshly reindexed tree-sitter nodes and remove the file-hash row for the same file.

The red case is also incorrect with the current codebase. `indexProject()` already does this before re-indexing any changed file:

```ts
if (existing !== null) {
  store.deleteFile(rel);
}
```

That means stale same-file endpoint nodes/edges are already removed before Stage 3 runs.

Rewrite this task instead of adding new deletion code. Two valid options:

1. Merge the changed-file replacement integration test into Task 8 and remove Task 10 production changes entirely.
2. Keep Task 10 as a regression-test-only confirmation that Task 8's changed-file flow replaces old matches, but explicitly state that no new Stage 3 deletion helper is added.

If you keep Task 10, its Step 2 and Step 3 must match reality:
- Step 2 cannot claim the test will fail because stale edges remain after a file change unless you first remove the existing `store.deleteFile(rel)` behavior from the plan.
- Step 3 must **not** call `store.deleteFile()` from Stage 3.
