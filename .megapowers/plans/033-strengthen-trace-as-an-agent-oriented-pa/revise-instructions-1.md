## Task 1: Make trace mode headers explicit and compact

This task is too broad for the project's plan quality bar. It currently combines three distinct observable behaviors in one test:
- coverage header rendering
- static fallback header rendering
- stale coverage header rendering

The review bar for this repository is **one test + one implementation per task**. Split Task 1 into smaller tasks so each task has a single focused failing test.

Recommended split:

### Replacement Task 1A: Make static trace headers explicitly heuristic
Keep this task focused on AC2, AC3, and AC8.

The failing test should only exercise the static fallback path and verify:
```ts
const output = trace({ entry: "entry", file: "src/app.ts", store, projectRoot });
const lines = output.trim().split("\n");
expect(lines[0]).toBe("mode: static (heuristic, no runtime evidence)");
expect(lines[1]).toContain("src/app.ts:1:");
expect(lines[1]).toContain("entry  function");
expect(lines).toHaveLength(4);
```

The failure in Step 2 should stay specific to the current behavior:
- `Expected: "mode: static (heuristic, no runtime evidence)"`
- `Received: "mode: static"`

The implementation in Step 3 can still introduce the helper in `src/tools/trace.ts`:
```ts
function formatModeHeader(mode: "coverage" | "static", stale = false): string {
  const base = mode === "coverage"
    ? "mode: coverage"
    : "mode: static (heuristic, no runtime evidence)";
  return `${base}${stale ? " [stale]" : ""}`;
}
```

Then update the static return site to use it.

### Replacement Task 1B: Keep stale coverage headers tagged as stale
Create a second task for AC1 and AC4 that uses a coverage-backed trace with a stale stored content hash and verifies:
```ts
const output = trace({ entry: "prodTest", file: "src/app.test.ts", store, projectRoot });
expect(output.trim().split("\n")[0]).toBe("mode: coverage [stale]");
```

This task should not also test static fallback. Keep it focused on stale coverage header behavior.

Also add a short acceptance-criteria mapping line to each replacement task description, for example:
- `**Covers:** AC2, AC3, AC8`
- `**Covers:** AC1, AC4`

## Task 2: Rewrite trace tool description for agent usage

The implementation is realistic, but the task should explicitly state which acceptance criteria it covers.
Add a short line near the top of the task description:
- `**Covers:** AC5, AC6, AC7`

No other changes are required for Task 2.