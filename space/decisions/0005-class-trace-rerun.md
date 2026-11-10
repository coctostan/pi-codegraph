---
from: space:arcs/class-trace.md
---
# The class-trace (Agents trace through classes) re-run reads keep

On 2026-11-10, 72 cells in `bench/results/rerun-3/` (decision 0002's 6 tasks × codegraph on and off × `anthropic-cc/claude-opus-5-5` and `openai-codex/gpt-6.1-sol` × 3 repeats, pi 1.5.0, codegraph at `dfbcfdf1`, pi-claude-header at `263ba7e8`) were all answered correctly. Codegraph at `dfbcfdf1` holds every code change of class-trace (Agents trace through classes): class members as symbols, unresolved calls no longer `[leaf]`, and `trace`'s description steering to `file` + `line`. `bun bench/verdict.ts --results bench/results/rerun-3` prints `wins 9/12` and `keep`, with `pooled wins 5/6 keep` beside it. Decision 0002's keep stands and this record supersedes nothing.

`bun bench/verdict.ts --results bench/results/rerun-3`, exit 0:

```
cc-headers-tests  anthropic-cc/claude-opus-5-5  correct on 3 off 3  tokens on 10841 off 194296 cut 94%  turns on 2 off 10 cut 80%  picks 3/3  lines 0/3  win
cc-headers-tests  openai-codex/gpt-6.1-sol  correct on 3 off 3  tokens on 5161 off 34215 cut 85%  turns on 2 off 4 cut 50%  picks 3/3  lines 0/3  win
cc-payload-trace  anthropic-cc/claude-opus-5-5  correct on 3 off 3  tokens on 387109 off 445278 cut 13%  turns on 15 off 13 cut -15%  picks 2/3  lines 1/3  -
cc-payload-trace  openai-codex/gpt-6.1-sol  correct on 3 off 3  tokens on 75109 off 124608 cut 40%  turns on 8 off 8 cut 0%  picks 3/3  lines 3/3  win
compact-diff-impact  anthropic-cc/claude-opus-5-5  correct on 3 off 3  tokens on 18016 off 46301 cut 61%  turns on 3 off 7 cut 57%  picks 3/3  lines 0/3  win
compact-diff-impact  openai-codex/gpt-6.1-sol  correct on 3 off 3  tokens on 12114 off 32264 cut 62%  turns on 3 off 5 cut 40%  picks 3/3  lines 0/3  win
enclosing-sg-symbols-tests  anthropic-cc/claude-opus-5-5  correct on 3 off 3  tokens on 15087 off 37391 cut 60%  turns on 3 off 6 cut 50%  picks 3/3  lines 0/3  win
enclosing-sg-symbols-tests  openai-codex/gpt-6.1-sol  correct on 3 off 3  tokens on 4920 off 15231 cut 68%  turns on 2 off 4 cut 50%  picks 3/3  lines 0/3  win
source-snippet-impact  anthropic-cc/claude-opus-5-5  correct on 3 off 3  tokens on 16327 off 67222 cut 76%  turns on 3 off 8 cut 63%  picks 3/3  lines 0/3  win
source-snippet-impact  openai-codex/gpt-6.1-sol  correct on 3 off 3  tokens on 5346 off 37998 cut 86%  turns on 2 off 8 cut 75%  picks 3/3  lines 0/3  win
tool-call-path  anthropic-cc/claude-opus-5-5  correct on 3 off 3  tokens on 55769 off 47510 cut -17%  turns on 5 off 5 cut 0%  picks 3/3  lines 0/3  -
tool-call-path  openai-codex/gpt-6.1-sol  correct on 3 off 3  tokens on 84855 off 96564 cut 12%  turns on 9 off 9 cut 0%  picks 3/3  lines 3/3  -
pooled  cc-headers-tests  correct on 6 off 6  tokens on 7729.5 off 68941.5 cut 89%  turns on 2 off 5.5 cut 64%  picks 6/6  lines 0/6  win
pooled  cc-payload-trace  correct on 6 off 6  tokens on 149705.5 off 226093.5 cut 34%  turns on 10 off 11 cut 9%  picks 5/6  lines 4/6  win
pooled  compact-diff-impact  correct on 6 off 6  tokens on 15686 off 41329 cut 62%  turns on 3 off 6 cut 50%  picks 6/6  lines 0/6  win
pooled  enclosing-sg-symbols-tests  correct on 6 off 6  tokens on 9980 off 24610 cut 59%  turns on 2.5 off 5.5 cut 55%  picks 6/6  lines 0/6  win
pooled  source-snippet-impact  correct on 6 off 6  tokens on 10769.5 off 52619.5 cut 80%  turns on 2.5 off 8 cut 69%  picks 6/6  lines 0/6  win
pooled  tool-call-path  correct on 6 off 6  tokens on 76742.5 off 64673.5 cut -19%  turns on 7.5 off 6.5 cut -15%  picks 6/6  lines 3/6  -
pooled wins 5/6 keep
wins 9/12
keep
```

## Verdicts
- Per pair: 9 of 12 pairs win against `keepWinFraction` 0.5, and the on arm is correct 36 of 36 against the off arm's 36 of 36: `keep`. The three losses: Opus cc-payload-trace at 13% tokens and -15% turns, Opus tool-call-path at -17% tokens and 0% turns, and GPT tool-call-path at 12% tokens and 0% turns.
- Pooled: 5 of 6 tasks win, tool-call-path the one loss at -19% tokens and -15% turns: `keep`.
- Against decision 0004's `wins 10/12`, Opus's cc-payload-trace lost its win: its cut fell from 28% to 13%. Both arms' medians moved between the two runs: the off arm, which loads no codegraph, went from 308730 to 445278 tokens. A 3-cell median moves that far without any change to codegraph, so the lost win is not attributed to this arc (inferred).

## Opus pick and `line`
- Pick, target met: Opus called a codegraph tool on 5 of its 6 on-arm trace cells, against the target of 5. tool-call-path 3 of 3, cc-payload-trace 2 of 3 (r1, r2). Decision 0004 counted 3 of 6.
- `line`, target missed: Opus passed `line` to `trace` on 1 of its 6 on-arm trace cells, against the target of 3. tool-call-path 0 of 3, cc-payload-trace 1 of 3 (r2). Decision 0004 counted 0 of 6.
  - tool-call-path, all 3 cells: Opus read `src/index.ts` from line 1 through line 540 or 560, then called `trace` by `entry: "indexProject"` with `file`. r1 also traced `entry: "prepare"`.
  - cc-payload-trace: r1 called `symbol_graph` once, on `buildAnthropicCcRequestFromContext`, and no `trace`. r2 called `trace {file: "src/anthropic-cc/stream.ts", line: 56}` once, after 8 reads and greps. r3 called no codegraph tool (10 `bash`, 8 `read`).
  - The callbacks hint slice 7 (Steer agents to trace by line) added, `→ callbacks inside: …`, appears in none of these 6 transcripts.
  - GPT called `trace` 5 to 13 times in each of its 6 trace cells and passed `line` in all 6.
- This miss is a finding, not a stop, by the arc's shape: `NOW.md` routes it. Whether `line` saves tokens on these tasks is open. The cell that started from `line`, cc-payload-trace r2, spent the fewest tokens of its three: 210745 against 387109 and 465459. That rests on one cell (guess).

## Spend
- $8.59 and 5,399,052 `tokens.total` over the 72 cells: on arm $3.18 (1,992,602 tokens), off arm $5.41 (3,406,450). Opus $7.13, GPT $1.46. 2,515 s of `pi` wall time. `costUsd` is pi's price-table estimate per message, the openai-codex cells' included, not a billed amount.
- That run is the arc's whole recorded bench spend, under its $15 cap. One more cell, killed before it wrote when slice 8 (Run both arms on the new code)'s first session ended, spent an amount no record holds (unmeasured).

## Limits
- Compare rows within this run only. Decision 0004's run used pi-claude-header `decd5acd`, not `263ba7e8`, and its off-arm medians differ from this run's by as much as 44%.
- Each pair's medians rest on 3 on and 3 off cells, so one cell can move a cut.
- One run cannot tell apart the changes class-trace (Agents trace through classes) made: class members as symbols, the `[leaf]` fix, and `trace`'s description.
