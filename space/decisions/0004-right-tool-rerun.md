---
from: space:arcs/right-tool.md
---
# The right-tool re-run reads keep

On 2026-11-09, 72 cells in `bench/results/rerun-2/` (decision 0002's 6 tasks × codegraph on and off × `anthropic-cc/claude-opus-5-5` and `openai-codex/gpt-6.1-sol` × 3 repeats, pi 1.5.0, codegraph at `1a7f689a`, pi-claude-header at `decd5acd`) were all answered correctly. `bun bench/verdict.ts --results bench/results/rerun-2` judges each task and model apart and prints `wins 10/12` and `keep`, with `pooled wins 5/6 keep` beside it. Decision 0002's keep stands and this record supersedes nothing. Decision 0003's `freeze` came from one wrong on cell set against decision 0002's stored off arm; this run ran both arms again on one provider commit, since the anthropic-cc provider now refuses the stored arm's, and no cell was wrong.

`bun bench/verdict.ts --results bench/results/rerun-2`, exit 0:

```
cc-headers-tests  anthropic-cc/claude-opus-5-5  correct on 3 off 3  tokens on 10058 off 228857 cut 96%  turns on 2 off 11 cut 82%  picks 3/3  win
cc-headers-tests  openai-codex/gpt-6.1-sol  correct on 3 off 3  tokens on 4919 off 31145 cut 84%  turns on 2 off 4 cut 50%  picks 3/3  win
cc-payload-trace  anthropic-cc/claude-opus-5-5  correct on 3 off 3  tokens on 222694 off 308730 cut 28%  turns on 11 off 11 cut 0%  picks 1/3  win
cc-payload-trace  openai-codex/gpt-6.1-sol  correct on 3 off 3  tokens on 66345 off 117488 cut 44%  turns on 8 off 9 cut 11%  picks 3/3  win
compact-diff-impact  anthropic-cc/claude-opus-5-5  correct on 3 off 3  tokens on 17304 off 46549 cut 63%  turns on 3 off 6 cut 50%  picks 3/3  win
compact-diff-impact  openai-codex/gpt-6.1-sol  correct on 3 off 3  tokens on 15314 off 30328 cut 50%  turns on 4 off 4 cut 0%  picks 3/3  win
enclosing-sg-symbols-tests  anthropic-cc/claude-opus-5-5  correct on 3 off 3  tokens on 14615 off 34759 cut 58%  turns on 3 off 7 cut 57%  picks 3/3  win
enclosing-sg-symbols-tests  openai-codex/gpt-6.1-sol  correct on 3 off 3  tokens on 4672 off 18279 cut 74%  turns on 2 off 5 cut 60%  picks 3/3  win
source-snippet-impact  anthropic-cc/claude-opus-5-5  correct on 3 off 3  tokens on 15808 off 62607 cut 75%  turns on 3 off 8 cut 63%  picks 3/3  win
source-snippet-impact  openai-codex/gpt-6.1-sol  correct on 3 off 3  tokens on 7451 off 42995 cut 83%  turns on 3 off 8 cut 63%  picks 3/3  win
tool-call-path  anthropic-cc/claude-opus-5-5  correct on 3 off 3  tokens on 71017 off 56780 cut -25%  turns on 6 off 6 cut 0%  picks 2/3  -
tool-call-path  openai-codex/gpt-6.1-sol  correct on 3 off 3  tokens on 98161 off 118269 cut 17%  turns on 10 off 9 cut -11%  picks 3/3  -
pooled  cc-headers-tests  correct on 6 off 6  tokens on 7446 off 120042.5 cut 94%  turns on 2 off 7 cut 71%  picks 6/6  win
pooled  cc-payload-trace  correct on 6 off 6  tokens on 140287 off 206877 cut 32%  turns on 9.5 off 10.5 cut 10%  picks 4/6  win
pooled  compact-diff-impact  correct on 6 off 6  tokens on 17302 off 32862 cut 47%  turns on 3 off 4.5 cut 33%  picks 6/6  win
pooled  enclosing-sg-symbols-tests  correct on 6 off 6  tokens on 9606 off 24451.5 cut 61%  turns on 2.5 off 6 cut 58%  picks 6/6  win
pooled  source-snippet-impact  correct on 6 off 6  tokens on 12956.5 off 52851 cut 75%  turns on 3 off 8 cut 63%  picks 6/6  win
pooled  tool-call-path  correct on 6 off 6  tokens on 76823 off 71194 cut -8%  turns on 7 off 6.5 cut -8%  picks 5/6  -
pooled wins 5/6 keep
wins 10/12
keep
```

## Verdicts
- Per pair: 10 of 12 pairs win against `keepWinFraction` 0.5, and the on arm is correct 36 of 36 against the off arm's 36 of 36: `keep`. Both losses are tool-call-path: Opus -25% tokens and 0% turns, GPT 17% tokens and -11% turns.
- Pooled: 5 of 6 tasks win, tool-call-path the one loss at -8% tokens and -8% turns: `keep`.

## Opus pick and cut
- Pick, check 5 missed: Opus called a codegraph tool on 3 of its 6 on-arm trace cells, against the 5 the check asks for: cc-payload-trace 1 of 3 (r3), tool-call-path 2 of 3 (r2, r3). Decisions 0002 and 0003 each counted 1 of 6. Each of the 3 called `trace` once by `entry` (`streamAnthropicCc`, `indexProject`) and never passed `line`; GPT called `trace` in all 6 of its trace cells, passing `file` and `line` in each.
- On tool-call-path the Opus cell that skipped codegraph (r1) spent the fewest tokens, 52727 against 71017 and 71577: on that task one `trace` call by `entry` did not pay for itself (inferred from 3 cells).
- Cut, check 6 met: each Opus test-mapping cell called `impact` once, plus one `grep` on enclosing-sg-symbols-tests, and answered in 2 or 3 turns. Median tokens fell 96% on cc-headers-tests (10058 against 228857) and 58% on enclosing-sg-symbols-tests (14615 against 34759), against the check's 25% on both. In decision 0003's run the same cells read `impact`'s single list and pruned it by hand, at medians of 155241 and 77471 tokens.

## Spend
- $8.09 and 5,048,867 `tokens.total` over the 72 cells: on arm $2.75 (1,638,487 tokens), off arm $5.34 (3,410,380); Opus $6.68, GPT $1.41; 2,263 s of `pi` wall time. `costUsd` is pi's price-table estimate per message, the openai-codex cells' included, not a billed amount.
- That run is the arc's whole bench spend, under its $15 cap; slice 5 (Record the provider in each cell)'s one check cell cost $0.

## Limits
- Compare rows within this run only: decision 0002's off arm, which decision 0003 reused, ran on pi-claude-header `4c15f28`, so its tokens are no baseline here.
- Each pair's medians rest on 3 on and 3 off cells, so one cell can move a cut.
- One run cannot tell apart the changes right-tool (Agents reach for the right tool) made: the descriptions, `trace`'s `line` and `impact`'s direct list.
