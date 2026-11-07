# Development tooling

- `node dev/build.js` — bundles `macsim/Code.gs` (core.js + service.js + gas-adapter.js).
- `node dev/engine-test.js` — engine tests (stationarity, SFC identities, regressions between versions, properties); prints the magnitudes quoted in the docs. Ends with `ENGINE OK`.
- `node dev/gas-fake-test.js` — backend against a fake SpreadsheetApp. Ends with `GAS adapter OK`.
- Browser scenarios (Playwright): `PORT=8794 node dev/mock-server.js &` then `E2E_PORT=8794 node dev/e2e.js out/` (union v1.1), `e2e-v13.js`, `e2e-v20.js`, `e2e-duel.js`. Admin key `TESTKEY`. End with `ALL GOOD`.
- `node dev/shot-deck.js seance7.html out/` — renders a reveal.js deck slide by slide and flags overflows.

Setup: Node ≥ 18; `cd dev && npm install` (reveal.js, chart.js, katex, pdfjs for offline rendering); Playwright: `npm i playwright && npx playwright install chromium` if not present.
See `docs/HANDOVER.md` and `docs/openmu-spec.md`.
