/* Finds desk texts with no French entry. Preloaded into any browser scenario, it records every string
   i18n.js reports (shown in English, missing from i18n/fr-desk.js) into MX_COLLECT (a TSV file):
     MX_COLLECT=/tmp/missing.tsv E2E_PORT=8794 node -r ./dev/i18n-collect.js dev/e2e-exit.js out/
   Players' own text (justifications, pledges, communiqués) shows up too: ignore it. */
const Module = require('module'), fs = require('fs');
const OUT = process.env.MX_COLLECT || '/tmp/mx-collect.tsv';
const seen = new Set();
const load = Module._load;
Module._load = function (req, parent, isMain) {
  const m = load.apply(this, arguments);
  if (req === 'playwright' && !m.__patched) {
    m.__patched = true;
    const launch = m.chromium.launch.bind(m.chromium);
    m.chromium.launch = async (...a) => {
      const b = await launch(...a); const nc = b.newContext.bind(b);
      b.newContext = async (...o) => { const c = await nc(...o);
        await c.exposeBinding('__mxCollect', (src, kind, s) => { const page = (src.page.url().match(/\/(\w+)\.html/) || [])[1] || '?'; const k = page + '\t' + kind + '\t' + s; if (!seen.has(k)) { seen.add(k); fs.appendFileSync(OUT, k + '\n'); } });
        return c; };
      return b; };
  }
  return m;
};
