# Downstream audit
## In-repo runtime / public-surface references audited
- `src/index.ts` — standalone `symbol_card` / `symbol_contract` registrations removed in Task 7.
- `test/tool-symbol-card-wiring.test.ts` — updated to assert non-registration.
- `test/tool-symbol-contract-wiring.test.ts` — updated to assert non-registration.
- `test/extension-tool-descriptions.test.ts` — expected default public surface reduced to 5 tools.
- `tests/ptc-metadata.test.ts` — removed from registered read-only tool list.
- `test/token-tracker-wiring-check.test.ts` — removed from expected default registrations.
- `README.md`, `ARCHITECTURE.md`, `docs/tool-descriptions.md` — public docs updated to describe `symbol_graph` as the unified lookup surface.

## Accepted out-of-scope breaks
- External downstream repo `pi-coding-tools` — known `symbol_card` / `symbol_contract` registered-tool references are intentionally not updated in this issue by explicit user direction. This is the accepted out-of-scope break for AC 21.

## Non-runtime historical references intentionally left unchanged
- Historical roadmap / issue / changelog files under `.megapowers/` and `ROADMAP.md` are not active runtime consumers of registered tool names.
