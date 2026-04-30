---
id: 1
title: Use portable YAML parser for ast-grep rules
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/indexer/ast-grep.ts
  - package.json
  - bun.lock
files_to_create:
  - test/repro-086-ast-grep-node-yaml-fallback.test.ts
---

**Files:**
- Create: `test/repro-086-ast-grep-node-yaml-fallback.test.ts`
- Modify: `src/indexer/ast-grep.ts`
- Modify: `package.json`
- Modify: `bun.lock`

**Step 1 — Write the failing test**
Create or overwrite `test/repro-086-ast-grep-node-yaml-fallback.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRuleFile } from "../src/indexer/ast-grep.js";

test("Node runtime YAML fallback preserves quoted # characters in project-local ast-grep rules", () => {
  const root = join(tmpdir(), `pi-cg-repro-086-${Date.now()}`);
  const file = join(root, "rule.yaml");
  mkdirSync(root, { recursive: true });
  const pattern = "$APP.get('/api # not a yaml comment', $HANDLER)";
  writeFileSync(
    file,
    `- name: quoted-comment-pattern\n  pattern: "${pattern}"\n  lang: typescript\n  produces:\n    edge_kind: routes_to\n    from_capture: HANDLER\n    to_template: endpoint:{PATH}\n    confidence: 0.9\n`,
  );

  try {
    expect(readRuleFile(file, {})[0]?.pattern).toBe(pattern);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/repro-086-ast-grep-node-yaml-fallback.test.ts`

Expected: FAIL —

```text
error: expect(received).toBe(expected)

Expected: "$APP.get('/api # not a yaml comment', $HANDLER)"
Received: "$APP.get('/api"
```

**Step 3 — Write minimal implementation**
Run `bun add yaml` to update `package.json` and `bun.lock`.

In `src/indexer/ast-grep.ts`, add:

```ts
import { parse as parseYaml } from "yaml";
```

Delete `parseRuleValue` and `parseSimpleRuleYaml` completely. Replace `readRuleFile` with:

```ts
export function readRuleFile(filePath: string, _runtime?: unknown): AstGrepRule[] {
  let raw: unknown;
  try {
    const content = readFileSync(filePath, "utf8");
    raw = parseYaml(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid rule file ${filePath}: ${message}`);
  }
  return validateRuleFile(filePath, raw);
}
```

Do not change `validateRuleFile`, `loadRules`, or `AstGrepRule`.

**Step 4 — Run test, verify it passes**
Run: `bun test test/repro-086-ast-grep-node-yaml-fallback.test.ts`
Expected: PASS.

**Step 5 — Verify no regressions**
Run: `bun test && bun run check`
Expected: all tests pass and `tsc --noEmit` completes with no TypeScript errors.
