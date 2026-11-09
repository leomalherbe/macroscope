/* The old /macsim/ addresses forward to /macroscope/, keeping the query string and the anchor (8 Nov 2026 move).
   Mock server: PORT env (default 8787). */
const { chromium } = require('playwright');
const BASE = 'http://localhost:' + (process.env.E2E_PORT || 8787);
function must(cond, msg) { if (!cond) { throw new Error('ASSERTION FAILED: ' + msg); } console.log('ok -', msg); }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const cases = [
    ['/macsim/index.html?pin=1234&api=x#results', '/macroscope/desk.html?pin=1234&api=x#results'],
    ['/macsim/?pin=5678', '/macroscope/desk.html?pin=5678'],
    ['/macsim/admin.html', '/macroscope/admin.html'],
    ['/macsim/board.html?class=c_abc', '/macroscope/board.html?class=c_abc'],
    ['/macsim/model.html#exit', '/macroscope/model.html#exit']
  ];
  for (const [from, to] of cases) {
    await page.goto(BASE + from);
    await page.waitForURL(u => u.pathname.indexOf('/macroscope/') === 0, { timeout: 5000 });
    const u = new URL(page.url());
    must(u.pathname + u.search + u.hash === to, from + ' → ' + u.pathname + u.search + u.hash);
  }
  /* the course page and the presentation page point to the new addresses */
  await page.goto(BASE + '/macroscope/index.html');
  must(await page.$('a[href$="/macroscope/model.html"], a[href^="https://leomalherbe.github.io/internationalfinancialmacro/macroscope/model.html"]') && !(await page.$('a[href*="macsim"]')), 'presentation page: links to the model page (absolute address, by Léo’s choice), none to macsim');
  const course = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');   /* the course page lives at the site root (not served by the mock) */
  must(/href="macroscope\/desk\.html"/.test(course) && !/macsim\//.test(course), 'course page: the game links go to macroscope/desk.html, none to macsim/');
  await page.goto(BASE + '/macroscope/model.html');
  must(!!(await page.$('a[href="desk.html"]')), 'model page: back link to the desk');
  await browser.close();
  console.log('\nREDIRECTS ALL GOOD');
})().catch(e => { console.error(e); process.exit(1); });
