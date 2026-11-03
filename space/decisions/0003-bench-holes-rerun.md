---
from: space:arcs/bench-holes.md
---
# The on-arm re-run reads freeze

On 2026-11-02, 36 on-arm cells in `bench/results/rerun-1/` (decision 0002's 6 tasks, 2 models and 3 repeats, codegraph at `5821256b`, pi 1.5.0) were measured against the 36 off-arm cells stored for decision 0002, and `bun bench/verdict.ts --on-results bench/results/rerun-1` prints `wins 3/6` and `freeze`. The same three tasks win as in 0002, but one on cell answered wrong, so the on arm is correct less often than the off arm. bench-holes (Close the holes the bench exposed) set three targets for this run and misses all three. This record does not overturn decision 0002's `keep` on its own: whether a freeze by one cell supersedes it is the owner's ruling, routed in NOW.md, and 0002 stands until then.

| Task | Repo | Kind | Correct on / off | Median tokens on / off | Cut | Median turns on / off | Cut | |
|---|---|---|---|---|---|---|---|---|
| cc-headers-tests | pi-claude-header | test-mapping | 6 / 6 | 58192 / 120531 | 52% | 4.5 / 7.5 | 40% | win |
| cc-payload-trace | pi-claude-header | trace | 6 / 6 | 140572.5 / 152037.5 | 8% | 9.5 / 8.5 | -12% | - |
| compact-diff-impact | pi-hashline-readmap | impact | 6 / 6 | 16705.5 / 44772 | 63% | 4.5 / 6 | 25% | win |
| enclosing-sg-symbols-tests | pi-hashline-readmap | test-mapping | 5 / 6 | 41375 / 26579.5 | -56% | 6 / 6 | 0% | - |
| source-snippet-impact | pi-codegraph | impact | 6 / 6 | 11921.5 / 48077 | 75% | 4 / 8 | 50% | win |
| tool-call-path | pi-codegraph | trace | 6 / 6 | 68539.5 / 57405 | -19% | 7.5 / 6 | -25% | - |

Each task pools both models, 12 cells; wins 3/6 meets `keepWinFraction` 0.5, but 35 cells correct on against 36 off gives `freeze`.

## The three targets
- Every cell correct: missed, 35 of 36. enclosing-sg-symbols-tests opus r1 named 3 of the key's 4 test files, dropping `tests/issue-242-sql-boundary-consumers.test.ts`. Its `impact` call listed that file among `Tests reached (25 cases in 12 files)`, and the model pruned the 12 to the ones it judged to run `findEnclosingSgSymbols` with `PI_CONTEXT_HYGIENE_DEBUG` set. A model miss on a list three times the key's size, not a missing edge; this one cell is the difference between `keep` and `freeze`.
- A ≥25% median token or turn cut on at least 2 of tool-call-path, cc-payload-trace, enclosing-sg-symbols-tests and cc-headers-tests: missed, 1 of 4 (cc-headers-tests).
- `keep`: missed, `freeze`.

## Why the four named tasks did not cut
- Opus answers test-mapping with `impact` now: all 6 Opus test-mapping cells called `impact` and no other codegraph tool, where in 0002's run all 6 called `symbol_graph` alone. `impact`'s `Tests reached` is every test the change reaches through any caller: 31 files on cc-headers-tests, whose key holds 5, and 12 on enclosing-sg-symbols-tests, whose key holds 4. Opus then prunes with grep and bash: median 155241 tokens on cc-headers-tests (58006 in 0002's run) and 77471 on enclosing-sg-symbols-tests (48684). Slice 10 (Make the tool descriptions match the output)'s `impact` snippet naming "the tests reached" is the likely cause (inferred, not measured).
- GPT calls `symbol_graph` first on all 6 test-mapping cells, gets `Test callers (5 in 5 files)` and `(4 in 4 files)`, the keys' sizes, and answers with a median 7478 tokens on cc-headers-tests and 3994 on enclosing-sg-symbols-tests, against 65012 and 19945 off.
- On the trace tasks, Opus skipped codegraph in 5 of 6 cells (below), so those cells measure grep and read; GPT called `trace` in all 6 and still made 8 to 12 `read` calls per cell.
- With 3 cells per model and the models apart, the pooled median is the mean of the cheaper model's dearest cell and the dearer model's cheapest. On tool-call-path, each model's on cells use fewer median tokens than its off cells (Opus 36815 against 43724, GPT 74783 against 89878), yet the pooled row reads -19%: its median averages Opus r2, the one Opus cell that called `trace`, at 68826, with GPT r1 at 68253.

## Pick rate, cost and spend
- Pick rate: 5 of 36 on cells called no codegraph tool, all Opus: cc-payload-trace 3 of 3 and tool-call-path 2 of 3. 0002 also counted 5, cc-payload-trace 2 and tool-call-path 3.
- Cost: median cost cuts are 5% (cc-headers-tests), 29% (cc-payload-trace), 46% (compact-diff-impact), -43% (enclosing-sg-symbols-tests), 59% (source-snippet-impact) and 16% (tool-call-path). Cost is no verdict metric, so cc-payload-trace's 29% changes no win.
- Spend: $4.37 and 2,356,470 tokens over the 36 on cells, against $4.20 and 2,272,811 for 0002's on arm; the off arm was not re-run, both arms being on pi 1.5.0.
