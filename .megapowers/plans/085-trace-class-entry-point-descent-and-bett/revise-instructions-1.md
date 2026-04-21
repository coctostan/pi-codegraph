## Task 1: Repair trace entry handling

### Step 3 implementation has a missing type import

The proposed replacement for `src/tools/trace.ts` uses `NodeRole` in the signatures of `formatNodeLine` and `formatLiveTraceLine`:

```ts
function formatNodeLine(
  node: GraphNode,
  projectRoot: string,
  signalComputer: SignalComputer,
  rolesOverride?: NodeRole[],
): { line: string; stale: boolean }

function formatLiveTraceLine(
  store: GraphStore,
  nodeId: string,
  projectRoot: string,
  signalComputer: SignalComputer,
  rolesOverride?: NodeRole[],
): { line: string; stale: boolean }
```

But the import block does **not** import `NodeRole`:

```ts
import { createSignalComputer, formatRoleTags, type SignalComputer } from "../output/signals.js";
```

It must be:

```ts
import { createSignalComputer, formatRoleTags, type NodeRole, type SignalComputer } from "../output/signals.js";
```

Without this import the file will fail TypeScript type-checking because `NodeRole` is not in scope.

### Granularity note

The task covers two distinct behavioral fixes (class handling + not-found messaging) and references two reproduction test files. Since both fixes are localized to the same file (`src/tools/trace.ts`) and the reproduction tests already exist in the repo, keeping them in one task is acceptable. No split required, but note that the task description should make clear it is fixing both #079 and #080.
