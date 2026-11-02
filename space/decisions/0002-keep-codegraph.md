---
from: space:arcs/earns-its-keep.md
---
# Codegraph is kept

On 2026-11-02, 72 cells in `bench/results/` (6 read-only questions over pi-codegraph, pi-hashline-readmap and pi-claude-header × codegraph on and off × `anthropic-cc/claude-opus-5-5` and `openai-codex/gpt-6.1-sol` × 3 repeats) were all answered correctly, and the on arm cut median tokens or turns by at least 25% on 3 of 6 tasks, so `bun bench/verdict.ts` prints `keep` by `bench/thresholds.json`. Codegraph stays installed and maintained, and earns-its-keep (Whether codegraph earns its keep) runs its slice 7 (Exercise what CI skips). The keep is the narrowest the rule allows and rests on efficiency alone: one more lost task gives `freeze`, correctness never separated the arms, and both trace tasks lost.

| Task | Repo | Kind | Median tokens on / off | Cut | Median turns on / off | Cut | |
|---|---|---|---|---|---|---|---|
| cc-headers-tests | pi-claude-header | test-mapping | 37939 / 120531 | 69% | 4 / 7.5 | 47% | win |
| cc-payload-trace | pi-claude-header | trace | 160494 / 152037.5 | -6% | 9.5 / 8.5 | -12% | - |
| compact-diff-impact | pi-hashline-readmap | impact | 17627.5 / 44772 | 61% | 4.5 / 6 | 25% | win |
| enclosing-sg-symbols-tests | pi-hashline-readmap | test-mapping | 41988 / 26579.5 | -58% | 6.5 / 6 | -8% | - |
| source-snippet-impact | pi-codegraph | impact | 12521 / 48077 | 74% | 4 / 8 | 50% | win |
| tool-call-path | pi-codegraph | trace | 69529.5 / 57405 | -21% | 6.5 / 6 | -8% | - |

Each task pools both models, 12 cells, every one correct; wins 3/6 against `keepWinFraction` 0.5.

- Pick rate: 5 of 36 on-arm cells called no codegraph tool, all Opus: tool-call-path 3 of 3 and cc-payload-trace 2 of 3.
- Tokens: `tokens.total` counts cache reads. Median cost points the same way as median tokens on 4 of 6 tasks; on cc-payload-trace ($0.253 on, $0.301 off) and tool-call-path ($0.133 on, $0.142 off) the on arm costs less where it spends more tokens, a cost cut under 25% on both, so no win changes.
- Spend: $9.63 and 5,525,446 tokens over the 72 cells, the on arm $4.20, the off arm $5.43.
