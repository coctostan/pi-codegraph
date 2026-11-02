# Now

## Next
- Accepted at merge, revisit if one bites: indexing into a read-only `.codegraph/graph.db` fails on its first write; a checkout without coverage indexed reports `untested`; `impact` with `addition` returns its note with `isError: false`; PRD samples keep the old anchor rendering; M10's pick-rate is unmeasured; CI keeps `Install build tools`; the linux-arm64 and win32 prebuilds are unexercised; pi-ptc-next users lose codegraph's `ptc` entries.
- Accepted in earns-its-keep (Whether codegraph earns its keep), revisit if one bites: test-mapping keys require only direct-caller test files; `lsp` returned partial references on the sibling repos; `symbolCard` and `symbolContract` have no `src/` caller; compact-diff-impact's turn cut sits exactly at 25%; an invalid `impact` `changeType` stays `isError: false`; `agent` provenance stays in `src/graph/`; ROADMAP's M10 history names `CODEGRAPH_DEVMODE`; README says "3 public tools by default"; CI clones pi-hashline-readmap unpinned, `cd`s for `npm ci` since `--prefix` misreads its lockfile, and `pi-latest` runs Node 22 alone with no sibling; Node `"*"` takes 27 once stable; `bench/run.ts` resolves target repos as siblings (shortcut, trigger: the bench leaves this machine).
- Decision 0002 reads keep, so Python support, out of scope until it, is open to shaping as an arc.
- Codegraph lost both trace tasks and enclosing-sg-symbols-tests in decision 0002, Opus calling no codegraph tool on 5 of its 6 trace cells: a candidate arc on why; `symbol_graph` also lists no caller inside a `test()` callback (`parseTranscript`, slice 1 (Drive one graded cell headless)).
- Cuts: fold `symbolGraph`, `impact` and `trace` into their `*Result` forms, one export per tool; resolve a tool's node once instead of the renderers' repeated `findNodes`; drop the unused `removedDevTools` and the phase5 surface tests the exact-surface test covers.
- Mark `bench/results/**/*.transcript.jsonl` `-diff` in `.gitattributes`: their diff overflowed `independent_review` twice, in slice 3 (Run the 72 cells) and at close.
- For jidoka: a done-when whose wording a Scope line accepts a gap in stopped close twice (checks 1 and 5 of earns-its-keep (Whether codegraph earns its keep)); have `slice`'s record commit rewrite that done-when line, or close read Scope lines before it stops.
- Stub `survey` fired: the closes of pi-1-4-current (Current with pi 1.4.0) and earns-its-keep (Whether codegraph earns its keep) each named a cut in code their own arc didn't add.

## Later
- Custom TUI renderers (`renderCall`/`renderResult`) for the three tools, as an arc of its own if wanted.
