const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto(process.argv[2]); await p.waitForSelector('.dbar'); await p.waitForTimeout(300);
  const c = await p.$('.dbar'); const card = await c.evaluateHandle(e => e.closest('.card')); await card.asElement().screenshot({ path: '/tmp/claude-0/debt-card.png' });
  await b.close();
})();
