## Files Reviewed
- `src/index.ts` — added `suppressTrustHeader` to the three public read-only tool schemas and threaded the flag through `finalizeReadOnlyOutput(...)`.
- `src/output/read-only-ceremony.ts` — added the shared `stripTrustHeader(text: string): string` helper.
- `test/output-strip-trust-header.test.ts` — new helper-level tests for removal, idempotence, and malformed/no-header no-op behavior.
- `test/extension-suppress-trust-header-symbol-graph.test.ts` — schema exposure and stale `symbol_graph` suppression coverage.
- `test/extension-suppress-trust-header-impact.test.ts` — schema exposure and stale `impact` suppression coverage.
- `test/extension-suppress-trust-header-trace.test.ts` — schema exposure and non-fresh `trace` suppression coverage.
- `test/extension-suppress-trust-header-interactions.test.ts` — interaction coverage for indexing-failed note, `_meta` footer, fresh/stale body preservation, and omitted-vs-false compatibility.

## Strengths
- `src/index.ts:165-185` keeps the new behavior centralized in `finalizeReadOnlyOutput(...)`, so the flag only affects the shared read-only output ceremony and still preserves `indexingFailedNote()` and `appendTokenMetaIfEnabled(...)` wrapping.
- `src/index.ts:33-38`, `src/index.ts:61-66`, and `src/index.ts:72-77` add `suppressTrustHeader` as an optional boolean to all three public schemas without changing required fields, which preserves backward compatibility for existing callers.
- `src/index.ts:233-240`, `src/index.ts:262-269`, and `src/index.ts:285-292` use `params.suppressTrustHeader === true`, which keeps omitted, `undefined`, and `false` on the exact legacy path.
- `src/output/read-only-ceremony.ts:10-17` keeps `stripTrustHeader(...)` minimal and idempotent, with clear shape checks before stripping.
- `test/extension-suppress-trust-header-interactions.test.ts:32-225` covers the risky integration points: stale readonly indexing failures, dev-meta footer retention, fresh/stale body preservation, and baseline byte-identity when the flag is false.
- `test/output-strip-trust-header.test.ts:4-56` gives the helper focused unit coverage for all trust statuses plus malformed input and idempotence.

## Findings

### Critical
None.

### Important
None.

### Minor
None.

## Recommendations
- Keep the current centralized pattern for future read-only output changes. This issue stayed low-risk because the new behavior is confined to `finalizeReadOnlyOutput(...)` instead of being duplicated across tool bodies.
- Restore the external Codex review path before the next review session. `codex review --base main` could not complete in this environment because the Codex CLI authentication was expired, and `/codex-adversarial-review` is not installed here, so there were no external advisory findings to adopt or reject for this issue.
- Optional follow-up: if you want `stripTrustHeader(...)` to mirror `formatTrustHeader(...)` more literally, tighten the third-line guard to require the `stale-files:` segment as well. The current call path only feeds canonical trust headers, so this is not a merge blocker.

## Assessment
ready
The change is correct, backward-compatible, and proportionate to the problem. `symbol_graph(include:["contract"])` on `finalizeReadOnlyOutput(...)` shows the relevant guards and wrapping behavior at `src/index.ts:165-185`, and the changed public surface has no unhandled breaking dependents from the `impact(..., changeType: "signature_change")` checks beyond the updated test registration helpers. I also re-ran the full suite with `bun test`; it passed cleanly (`401 pass, 0 fail`).
