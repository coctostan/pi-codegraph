---
id: 85
type: bugfix
status: open
created: 2026-04-20T10:33:24.208Z
sources: [79, 80]
---
# trace: class entry-point descent and better not-found error messages
Two P2 improvements to `src/tools/trace.ts`, both localized to `buildStaticTrace` and the not-found error path.

**#80** (error message distinction) is a small, safe change to the not-found branch — implement first since it's low-risk and doesn't affect trace logic.

**#79** (class entry-point descent) modifies `buildStaticTrace` to handle `kind === "class"` nodes by either expanding into methods or emitting a redirect hint. Implement second — it touches the main trace path and needs its own test coverage.

Both are in the same file, same function neighborhood, and benefit from a shared test fixture with a class-based entry point.
