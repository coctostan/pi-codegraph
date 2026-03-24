---
id: 55
type: feature
status: open
created: 2026-03-24T18:17:44.921Z
priority: 3
---
# Token savings tracking in tool response metadata
Inspired by jCodeMunch's token savings tracker. Every tool response should include a `_meta.tokens_saved` estimate comparing "what the agent would have had to read without codegraph" vs "what we actually returned."

Approach:
- For `symbol_graph`: estimate = sum of file sizes for all files containing returned symbols. Actual = response size.
- For `symbol_card` / `symbol_contract`: estimate = full file size(s). Actual = card/contract size.
- For `trace`: estimate = sum of all files in the traced path. Actual = trace output size.
- For `impact`: estimate = sum of all downstream files. Actual = impact summary size.

Track per-call and accumulate session totals. Add a `get_session_stats` utility or include running totals in each response's `_meta` block. Use ~4 bytes/token as the conversion factor.

Low effort, high signal — proves the tool's value on every call.
