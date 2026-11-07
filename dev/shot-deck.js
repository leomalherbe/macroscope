/* Renders every slide of a reveal.js deck offline (CDN requests routed to local node_modules) and screenshots them. */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const deck = process.argv[2]; const OUT = process.argv[3]; fs.mkdirSync(OUT, { recursive: true });
const NM = path.join(__dirname, 'node_modules');
const MIME = { '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/https:\/\/cdn\.jsdelivr\.net\/npm\/.*/, route => {
    const u = new URL(route.request().url());
    const m = /^\/npm\/([^@\/]+)(?:@[^\/]+)?(\/.*)?$/.exec(u.pathname);
    if (!m) return route.abort();
    let rel = m[2] || '';
    if (m[1] === 'katex' && !rel) rel = '/dist/katex.min.js';
    const f = path.join(NM, m[1], rel);
    if (!fs.existsSync(f)) { console.log('missing', u.pathname); return route.abort(); }
    route.fulfill({ body: fs.readFileSync(f), contentType: MIME[path.extname(f)] || 'application/octet-stream' });
  });
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/, route => route.abort());
  await page.goto('file://' + path.resolve(deck));
  await page.waitForFunction(() => window.Reveal && Reveal.isReady && Reveal.isReady(), null, { timeout: 30000 });
  await page.evaluate(() => Reveal.configure({ transition: 'none', backgroundTransition: 'none' }));
  const n = await page.evaluate(() => Reveal.getTotalSlides());
  console.log('slides:', n);
  for (let i = 0; i < n; i++) {
    await page.evaluate(i => Reveal.slide(i), i);
    await page.evaluate(() => { while (Reveal.nextFragment()) { /* reveal all */ } });
    await page.waitForTimeout(350);
    const over = await page.evaluate(() => { const s = Reveal.getCurrentSlide(); return s.scrollHeight - s.clientHeight; });
    const title = await page.evaluate(() => { const s = Reveal.getCurrentSlide(); const h = s.querySelector('h1,h2'); return h ? h.textContent.trim().slice(0, 60) : ''; });
    await page.screenshot({ path: path.join(OUT, 'slide-' + String(i + 1).padStart(2, '0') + '.png') });
    console.log(String(i + 1).padStart(2, '0'), over > 2 ? 'OVERFLOW +' + over + 'px' : 'ok', '·', title);
  }
  await browser.close();
  if (errors.length) console.log('PAGE ERRORS', errors);
})().catch(e => { console.error(e); process.exit(1); });
