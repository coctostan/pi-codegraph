---
id: 1
title: Add tree-sitter dependencies [no-test]
status: approved
depends_on: []
no_test: true
files_to_modify:
  - package.json
files_to_create: []
---

### Task 1: Add tree-sitter dependencies [no-test]

**Justification:** Adds runtime dependencies only; behavior is exercised by later tasks’ tests.

**Files:**
- Modify: `package.json`

**Step 1 — Make the change**
Update `package.json` to include:
- `dependencies.tree-sitter`
- `dependencies.tree-sitter-typescript`

Example resulting `package.json` (only showing the relevant parts; keep existing fields unchanged):
```json
{
  "dependencies": {
    "tree-sitter": "^0.25.0",
    "tree-sitter-typescript": "^0.23.2"
  }
}
```

**Step 2 — Verify**
Run: `bun install`
Expected: installs succeed

Run: `bun test`
Expected: all passing
