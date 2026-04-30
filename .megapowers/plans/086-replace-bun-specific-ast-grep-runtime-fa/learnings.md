# Learnings — Issue 086

- Runtime portability bugs can hide behind tests that run under Bun; simulating the Node path with `readRuleFile(file, {})` was the key repro for the YAML parser divergence.
- A narrow hand-rolled YAML parser was more dangerous than an explicit dependency because it accepted corrupted data as valid once truthiness checks passed.
- Regression tests should assert the exact preserved scalar value, not just that a rule file loads or returns a rule name.
- Subprocess tests are cleaner when behavior is verified through an injected `ExecFn`; this avoids mutating runtime globals and keeps the production launcher portable.
- Graph tools did not resolve `readRuleFile`/`runScan` for this file, so LSP references plus anchored source reads were the reliable fallback for dependency and evidence gathering.
- The PR description should call out both parts of the portability fix: portable YAML parsing and Node child-process execution, plus the verification commands and pass counts.
