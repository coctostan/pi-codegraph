# Learnings: 001-project-scaffolding-typescript-bun-test-

- **Published package version matters.** The plan specified `@mariozechner/pi-coding-agent@^1.20.0` but the highest published version is `0.56.0`. Future plans should check `npm view <pkg> version` before committing a version range, or use `"latest"` for devDependencies that are known to stay stable.

- **`cat` is silently swallowed by Bun's build machinery in some shell contexts.** Several `cat` / inline shell commands produced `✓ Build successful (0 units compiled)` instead of file output. Using the `read` tool or `bun -e` is more reliable for inspecting file contents in this environment.

- **`moduleResolution: "bundler"` is the correct Bun setting.** `"node16"` or `"nodenext"` requires `.js` extensions on all local imports; `"bundler"` is more permissive and matches how Bun resolves modules natively. Worth documenting in AGENTS.md for contributors.

- **The `.typecheck.ts` / `.test.ts` convention is worth formalising early.** Compile-time-only assertions (e.g., interface shape checks) belong in `.typecheck.ts` files; runtime assertions in `.test.ts`. Mixing them would cause `bun test` to pick up type-only files and confuse the test count.

- **TDD gate requires an explicit `tests_failed` signal before writing production code.** Even when the test-write step is clear, the workflow gate must be explicitly unlocked. Documenting this in AGENTS.md would help future agents avoid confusion.

- **`SqliteGraphStore implements GraphStore` at scaffold time pays forward.** Wiring the class to the interface now means the TypeScript compiler acts as a free regression gate when methods are added to `GraphStore` later — no extra test needed to catch the drift.

- **`existsSync("src/rules")` in tests is CWD-sensitive.** It works reliably when `bun test` is run from the repo root (standard), but would silently fail from other directories. Prefer `path.join(import.meta.dir, "../../src/rules")` in future tests that check filesystem state.
