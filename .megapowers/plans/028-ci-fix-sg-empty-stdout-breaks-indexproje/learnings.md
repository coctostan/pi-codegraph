# Learnings — 028: CI `sg` empty stdout fix

- **Subprocess contracts have two halves.** Exit-code handling and output-shape handling must be consistent. Treating exit `1` as a normal "no match" but then assuming the output is always `[]` is a split-brain contract — both sides of the boundary need to agree.

- **`stdout.trim()` is the right guard, not `stdout === "`.** Different environments (including CI runners and different builds of the same CLI) may return whitespace-only strings for empty output. The trim guard catches all of them cheaply.

- **Empty string is not malformed JSON.** `JSON.parse("")` throws, but `""` is a perfectly valid "no output" response from a CLI that behaves like grep. The two cases must be distinguished at the normalization layer, not lumped together as "parse errors".

- **High blast radius from a shared pipeline entrypoint.** `indexProject()` is called by `ensureIndexed()` which is called by every tool. A single uncaught throw from Stage 3 silently kills every tool entrypoint on an empty store. When a pipeline has this kind of fan-out, each stage should be hardened independently.

- **Regression tests at two levels are worth it.** A unit test at the subprocess boundary (`runScan()` with injected `ExecFn`) shows exactly which input triggers the bug. An integration test (`indexProject` with patched `Bun.spawn`) proves the fix holds end-to-end and guards against future re-introduction at any level of the call stack.

- **Diagnosis-first bugfix workflow works well.** Having the root cause, trace, and acceptance criteria written before writing any test made the regression tests straightforward — each test maps 1:1 to a criterion.
