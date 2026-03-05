# Plan

### Task 1: Configure package.json and tsconfig.json [no-test]

### Task 1: Configure package.json and tsconfig.json [no-test]

**Covers:** AC 1, AC 2, AC 3

**Justification:** Config-only setup for runtime, scripts, and TypeScript compiler settings.

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`

**Step 1 — Make the change**

Create `package.json`:

```json
{
  "name": "pi-codegraph",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "test": "bun test",
    "build": "echo \"nothing to build\"",
    "check": "tsc --noEmit"
  },
  "pi": {
    "extensions": [
      "./src/index.ts"
    ]
  },
  "devDependencies": {
    "@mariozechner/pi-coding-agent": "^1.20.0",
    "@types/bun": "latest",
    "typescript": "^5.7.0"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "types": ["bun"],
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 2 — Verify**

Run:

```bash
bun install && bun -e "const p=JSON.parse(await Bun.file('package.json').text()); const t=JSON.parse(await Bun.file('tsconfig.json').text()); if(p.name!=='pi-codegraph') throw new Error('package.json name mismatch'); if(p.type!=='module') throw new Error('package.json type mismatch'); if(p.pi?.extensions?.[0]!=='./src/index.ts') throw new Error('pi.extensions mismatch'); if(p.scripts?.test!=='bun test') throw new Error('test script mismatch'); if(p.scripts?.check!=='tsc --noEmit') throw new Error('check script mismatch'); if(t.compilerOptions?.strict!==true) throw new Error('strict must be true'); if(t.compilerOptions?.module!=='ESNext') throw new Error('module must be ESNext'); if(t.compilerOptions?.types?.[0]!=='bun') throw new Error('types must include bun');"
```

Expected: command exits 0.

### Task 2: Add extension entrypoint and smoke import test [depends: 1]

### Task 2: Add extension entrypoint and smoke import test [depends: 1]

**Covers:** AC 4, AC 14, AC 16

**Files:**
- Create: `test/smoke.test.ts`
- Create: `src/index.ts`

**Step 1 — Write the failing test**

Create `test/smoke.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

describe("scaffold smoke", () => {
  test("src/index.ts loads and exports default function", async () => {
    const mod = await import("../src/index.js");
    expect(typeof mod.default).toBe("function");
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/smoke.test.ts`

Expected: FAIL — `Cannot find module '../src/index.js'`.

**Step 3 — Write minimal implementation**

Create `src/index.ts`:

```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function piCodegraph(_pi: ExtensionAPI): void {}
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/smoke.test.ts`

Expected: PASS.

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing.

### Task 3: Add graph placeholder types with typecheck test [depends: 2]

### Task 3: Add graph placeholder types with typecheck test [depends: 2]

**Covers:** AC 5, AC 15

**Files:**
- Create: `test/graph-types.typecheck.ts`
- Create: `src/graph/types.ts`

**Step 1 — Write the failing test**

Create `test/graph-types.typecheck.ts`:

```ts
import type { GraphEdge, GraphNode, Provenance } from "../src/graph/types.js";

const _node: GraphNode = {
  id: "n1",
  kind: "function",
  name: "run",
  file: "src/run.ts",
  line: 1,
};

const _edge: GraphEdge = {
  source: "n1",
  target: "n2",
  kind: "calls",
};

const _provenance: Provenance = {
  source: "tree-sitter",
  confidence: 0.8,
};

void [_node, _edge, _provenance];
export {};
```

**Step 2 — Run test, verify it fails**

Run: `bun run check`

Expected: FAIL — `TS2307: Cannot find module '../src/graph/types.js' or its corresponding type declarations.`

**Step 3 — Write minimal implementation**

Create `src/graph/types.ts`:

```ts
export interface GraphNode {
  id: string;
  kind: string;
  name: string;
  file: string;
  line: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: string;
}

export interface Provenance {
  source: string;
  confidence: number;
}
```

**Step 4 — Run test, verify it passes**

Run: `bun run check`

Expected: PASS.

**Step 5 — Verify no regressions**

Run: `bun test && bun run check`

Expected: all passing.

### Task 4: Add GraphStore and SqliteGraphStore placeholders [depends: 3]

### Task 4: Add GraphStore and SqliteGraphStore placeholders [depends: 3]

**Covers:** AC 6, AC 7, AC 16

**Files:**
- Create: `test/graph-store.test.ts`
- Create: `src/graph/store.ts`
- Create: `src/graph/sqlite.ts`

**Step 1 — Write the failing test**

Create `test/graph-store.test.ts`:

```ts
import { expect, test } from "bun:test";
import type { GraphStore } from "../src/graph/store.js";

test("graph store modules load", async () => {
  const storeModule = await import("../src/graph/store.js");
  expect(storeModule).toBeDefined();

  const { SqliteGraphStore } = await import("../src/graph/sqlite.js");
  const store: GraphStore = new SqliteGraphStore();
  expect(store).toBeInstanceOf(SqliteGraphStore);
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/graph-store.test.ts`

Expected: FAIL — `Cannot find module '../src/graph/store.js'`.

**Step 3 — Write minimal implementation**

Create `src/graph/store.ts`:

```ts
export interface GraphStore {}
```

Create `src/graph/sqlite.ts`:

```ts
import type { GraphStore } from "./store.js";

export class SqliteGraphStore implements GraphStore {}
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/graph-store.test.ts`

Expected: PASS.

**Step 5 — Verify no regressions**

Run: `bun test && bun run check`

Expected: all passing.

### Task 5: Add indexer placeholder exports [depends: 4]

### Task 5: Add indexer placeholder exports [depends: 4]

**Covers:** AC 8, AC 9, AC 16

**Files:**
- Create: `test/indexer-placeholders.test.ts`
- Create: `src/indexer/pipeline.ts`
- Create: `src/indexer/tree-sitter.ts`

**Step 1 — Write the failing test**

Create `test/indexer-placeholders.test.ts`:

```ts
import { expect, test } from "bun:test";

test("indexer modules export placeholder functions", async () => {
  const { IndexPipeline } = await import("../src/indexer/pipeline.js");
  const { treeSitterIndex } = await import("../src/indexer/tree-sitter.js");

  expect(typeof IndexPipeline).toBe("function");
  expect(typeof treeSitterIndex).toBe("function");
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/indexer-placeholders.test.ts`

Expected: FAIL — `Cannot find module '../src/indexer/pipeline.js'`.

**Step 3 — Write minimal implementation**

Create `src/indexer/pipeline.ts`:

```ts
export function IndexPipeline(): void {}
```

Create `src/indexer/tree-sitter.ts`:

```ts
export function treeSitterIndex(): void {}
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/indexer-placeholders.test.ts`

Expected: PASS.

**Step 5 — Verify no regressions**

Run: `bun test && bun run check`

Expected: all passing.

### Task 6: Add tool placeholder exports [depends: 5]

### Task 6: Add tool placeholder exports [depends: 5]

**Covers:** AC 10, AC 11, AC 16

**Files:**
- Create: `test/tool-placeholders.test.ts`
- Create: `src/tools/symbol-graph.ts`
- Create: `src/tools/resolve-edge.ts`

**Step 1 — Write the failing test**

Create `test/tool-placeholders.test.ts`:

```ts
import { expect, test } from "bun:test";

test("tool modules export placeholder functions", async () => {
  const { symbolGraph } = await import("../src/tools/symbol-graph.js");
  const { resolveEdge } = await import("../src/tools/resolve-edge.js");

  expect(typeof symbolGraph).toBe("function");
  expect(typeof resolveEdge).toBe("function");
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/tool-placeholders.test.ts`

Expected: FAIL — `Cannot find module '../src/tools/symbol-graph.js'`.

**Step 3 — Write minimal implementation**

Create `src/tools/symbol-graph.ts`:

```ts
export function symbolGraph(): void {}
```

Create `src/tools/resolve-edge.ts`:

```ts
export function resolveEdge(): void {}
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/tool-placeholders.test.ts`

Expected: PASS.

**Step 5 — Verify no regressions**

Run: `bun test && bun run check`

Expected: all passing.

### Task 7: Add output placeholder and rules directory [depends: 6]

### Task 7: Add output placeholder and rules directory [depends: 6]

**Covers:** AC 12, AC 13, AC 15, AC 16

**Files:**
- Create: `test/output-anchoring.test.ts`
- Create: `src/output/anchoring.ts`
- Create: `src/rules/.gitkeep`

**Step 1 — Write the failing test**

Create `test/output-anchoring.test.ts`:

```ts
import { existsSync } from "node:fs";
import { expect, test } from "bun:test";

test("output module exports anchorResults and rules directory exists", async () => {
  const { anchorResults } = await import("../src/output/anchoring.js");

  expect(typeof anchorResults).toBe("function");
  expect(existsSync("src/rules")).toBe(true);
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/output-anchoring.test.ts`

Expected: FAIL — `Cannot find module '../src/output/anchoring.js'`.

**Step 3 — Write minimal implementation**

Create `src/output/anchoring.ts`:

```ts
export function anchorResults(): void {}
```

Create `src/rules/.gitkeep` as an empty file.

**Step 4 — Run test, verify it passes**

Run: `bun test test/output-anchoring.test.ts`

Expected: PASS.

**Step 5 — Verify no regressions**

Run: `bun test && bun run check`

Expected: all passing.
