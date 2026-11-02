# Now

## Next
- Exercise what CI skips, from pi-1-4-current (Current with pi 1.4.0)'s retro: `test/pi-host-load.test.ts` loads the extension and calls a tool under `node` as well as Bun; `Test & Type-check` runs the current Node beside 22; CI runs `test/output-hashline-compat.test.ts`'s sibling case against a pi-hashline-readmap clone.
- Return the lookup status from the `symbolGraph`, `impact` and `trace` functions, so `execute()` in `src/index.ts` stops re-querying `findNodes` to set `isError`, the trade-off slice 5 (Flag not-found lookups as errors) accepted.
- Delete `src/config/dev-mode.ts`, `test/dev-mode.test.ts` and README's `CODEGRAPH_DEVMODE` line (no caller since M10 Phase 5, #46), and bring ROADMAP's Principle 6 and README's `[source: agent]` label to the read-only surface.
- Accepted at merge, revisit if one bites: indexing into a read-only `.codegraph/graph.db` fails on its first write; a checkout without coverage indexed reports `untested`; `impact` with `addition` returns its note with `isError: false`; PRD samples keep the old anchor rendering; M10's pick-rate is unmeasured; CI keeps `Install build tools`; the linux-arm64 and win32 prebuilds are unexercised; pi-ptc-next users lose codegraph's `ptc` entries.

## Later
- Custom TUI renderers (`renderCall`/`renderResult`) for the three tools, as an arc of its own if wanted.
