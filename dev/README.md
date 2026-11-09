# Development tooling

- `node dev/build.js` — bundles `Code.gs` (core.js + service.js + gas-adapter.js).
- `node dev/engine-test.js` — engine tests (stationarity, SFC identities, regressions between versions, properties, the matrices of the model page); prints the magnitudes quoted in the docs. Ends with `ENGINE OK`.
- `node dev/gas-fake-test.js` — backend against a fake SpreadsheetApp. Ends with `GAS adapter OK`.
- Browser scenarios (Playwright): `PORT=8794 node dev/mock-server.js &` then `E2E_PORT=8794 node dev/e2e.js out/` (union v1.1), `e2e-v13.js`, `e2e-v20.js`, `e2e-duel.js`, `e2e-exit.js` (leaving the union, §12), `e2e-members.js` (a union of four set from the Groups tab, fixed after year 1). The mock serves the repository as the site (`/desk.html`, `/admin.html`…) and the API at `/api`. Admin key `TESTKEY`. End with `ALL GOOD`.

Setup: Node ≥ 18; `cd dev && npm install`; Playwright: `npm i playwright` with the browser version installed (`npx playwright install chromium` if none).
See `docs/HANDOVER.md` and `docs/openmu-spec.md`.
