---
type: brief
from: space:arcs/earns-its-keep.md
to: hashline
status: open
---
# pi-codegraph's CI now checks its line hash against pi-hashline-readmap's `main`

Since slice 7 (Exercise what CI skips) of earns-its-keep (Whether codegraph earns its keep), every pi-codegraph CI run clones `coctostan/pi-hashline-readmap` at `main`, unpinned, beside its checkout and runs `npm ci --omit=dev --omit=peer --omit=optional --ignore-scripts` there. `test/output-hashline-compat.test.ts` then imports `../pi-hashline-readmap/src/hashline.ts`, calls its `ensureHashInit()` and compares its `computeLineHash(1, line)` with pi-codegraph's for each line.

So pi-codegraph's CI goes red when pi-hashline-readmap changes any of these:
- the line-hash algorithm (exact-line xxhash32, only a trailing CR ignored, 3 hex);
- the path `src/hashline.ts` or the export names `computeLineHash` and `ensureHashInit`;
- its lockfile, in a way that breaks `npm ci` (`npm ci --prefix` already misreads it under npm 11.20, so the step `cd`s in).

A deliberate change to any of them is welcome. Please announce it with a handoff to pi-codegraph, so both hashes move together.
