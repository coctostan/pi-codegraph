# Learnings — #045 graph_query error surfacing

- Parameterless `catch {}` is a code smell in user-facing code paths — it silently discards diagnostic information. Acceptable in infrastructure/graceful-degradation contexts, but never in tool output that agents or users see.
- When a codebase has two catch blocks in the same function with different patterns (one captures, one doesn't), that's a strong signal the silent one is a bug, not a design choice.
- Pre-existing tests that assert on hardcoded error strings become regression failures when the fix surfaces real error messages — always check for and update those tests.
- Single-line bugfixes can still require updating multiple test files if old tests asserted on the broken behavior.
