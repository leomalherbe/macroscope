/* End-to-end (repeg): a floating union in a currency crisis votes to peg the euro again, at a voted parity.
   Built on the opening of e2e-v13.js. Original header: scenario for OPEN-MU v1.3 (capital flows, exchange-rate regimes, market pressure) through the real pages
   against the mock backend: class on model v1.3 → year 1 floating with a sudden stop → run → union row 'float', depreciation
   → year 2: currency-crisis card → vote (open / cast from the page / close: defend) → run with the rate raised → publish
   → year 3 back to a fixed rate with no backstop → shocks editor shows the v1.3 rows. Mock server: PORT env (default 8787). */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:' + (process.env.E2E_PORT || 8787);
const API = BASE + '/api';
const OUT = process.argv[2] || '/tmp/shots-repeg';
fs.mkdirSync(OUT, { recursive: true });
async function api(params) { const r = await fetch(API, { method: 'POST', body: JSON.stringify(params) }); return r.json(); }
const runClick = async (pg) => { await pg.click('#runBtn'); await pg.waitForSelector('#runBtn:not([disabled])'); };
function must(cond, msg) { if (!cond) { throw new Error('ASSERTION FAILED: ' + msg); } console.log('ok -', msg); }
const KEY = 'TESTKEY';

(async () => {
  await api({ action: '__reset' });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const admin = await ctx.newPage();
  admin.on('pageerror', e => errors.push('admin: ' + e.message));
  admin.on('dialog', d => d.accept(d.type() === 'prompt' ? 'Repeg class' : undefined));

  /* class on model v1.3 */
  await admin.goto(BASE + '/admin.html?api=' + encodeURIComponent(API));
  await admin.waitForSelector('input[type=password]');
  await admin.fill('input[type=url]', API);
  await admin.fill('input[type=password]', KEY);
  await admin.click('button:has-text("Connect")');
  await admin.waitForSelector('text=No class yet');
  await admin.click('button:has-text("+ New class")');
  await admin.waitForSelector('#statusGrid');
  const dump = await api({ action: '__dump' });
  const cid = JSON.parse(dump.dump.config.classes)[0].id;
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { sim: { model: 'v1.3' } } });
  await admin.click('#tabs button:has-text("Groups")');
  await admin.click('button:has-text("Add 7 default groups")');
  await admin.click('button:has-text("Save groups")');
  await admin.waitForSelector('.toast.show:has-text("Groups saved")');
  await admin.waitForFunction(() => document.querySelectorAll('#view tbody tr').length === 7);
  const groups = (await api({ action: '__dump' })).dump.groups;
  const pins = {}; groups.forEach(g => { pins[g.country] = g.pin; });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('summary:has-text("Parameters")');
  must(await admin.inputValue('#modelSel') === 'v2' && !(await admin.isChecked('#climateOn')), 'a class created as v1.3 shows as v2 · Finance (same engine), climate off');
  await admin.click('button:has-text("Start the game")');
  await admin.waitForSelector('text=game · year 1');

  /* year 1: floating regime with a sudden stop (shocks editor shows the v1.3 rows) */
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  const rows = await admin.evaluate(() => [...document.querySelectorAll('#view table.resgrid tbody tr td:first-child')].map(td => td.textContent.trim().split('\n')[0]));
  must(rows.some(r => /Exchange-rate regime/.test(r)) && rows.some(r => /Capital flows/.test(r)) && rows.some(r => /World interest rate/.test(r)) && rows.some(r => /Central-bank backstop/.test(r)), 'shocks editor shows the v1.3 rows (regime, capital flows, world rate, backstop)');
  must(await admin.isChecked('input[data-y="1"][data-f="backstop"]'), 'backstop checkbox on by default');
  await admin.selectOption('select[data-y="1"][data-f="regime"]', 'float');
  await admin.fill('input[data-y="1"][data-f="flows"]', '-20');
  await admin.click('button:has-text("Save shocks")');
  await admin.waitForTimeout(500);
  const sh1 = (await api({ action: 'admin.overview', key: KEY, classId: cid })).state.shocks.g1;
  must(sh1.regime === 'float' && sh1.flows === -20 && sh1.backstop === true, 'year-1 shocks saved: float, sudden stop −20 %, backstop on');
  await admin.screenshot({ path: OUT + '/v13-a1-shocks.png', fullPage: true });
  /* decisions */
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'open' } });
  const sub = (c, levers, votes, round) => api({ action: 'submit', pin: pins[c], phase: 'game', round: round || 1, payload: { years: [{ levers, tariffs: {}, euro: 'none', tfp: 0 }], text: ('Decision of ' + c + '.').padEnd(120, ' .').trim(), votes: votes || {} } });
  must((await sub('FRA', { pubdem: 5 }, { rate: 'hold' })).ok && (await sub('DEU', { pubdem: 0 }, { rate: 'hold' })).ok, 'France and Germany submit year 1');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'closed' } });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  await runClick(admin);
  await admin.waitForSelector('#runPreview table');
  const y1 = await admin.textContent('#runPreview');
  must(/floating/.test(y1) && /over the year/.test(y1) && /No currency crisis this year/.test(y1), 'year-1 preview: floating regime, exchange-rate change shown, no crisis');
  await admin.click('button:has-text("Save and publish all")');
  await admin.waitForTimeout(700);
  let s = await api({ action: 'state', pin: pins.FRA });
  const u1 = s.union.filter(r => r.phase === 'game' && r.year === 1)[0].detail.extra;
  must(u1.regime === 'float' && u1.dxr > 10 && Math.abs(u1.R - u1.R0) < 1e-6, 'published union row: regime float, depreciation ' + u1.dxr.toFixed(1) + ' %, reserves frozen at R0');
  must(typeof s.myResults[0].detail.extra.foreign === 'number' && typeof s.myResults[0].detail.extra.spread === 'number', 'country rows carry foreign bills and spread');
  /* student page */
  const stu = await ctx.newPage();
  stu.on('pageerror', e => errors.push('student: ' + e.message));
  await stu.goto(BASE + '/desk.html?api=' + encodeURIComponent(API) + '&pin=' + pins.FRA);
  await stu.waitForSelector('#app');
  const st1 = await stu.textContent('#app');
  must(/floating/.test(st1) && /Change of the exchange rate over the year/.test(st1) && /foreign bills held by households/.test(st1) && /risk premium on public debt/.test(st1), 'student page: regime line, exchange-rate change, foreign bills and spread in the ratios line');
  must(/Key indicators · France/.test(st1) && /Current account/.test(st1) && /Public debt/.test(st1) && /Risk premium/.test(st1) && /€ per world unit/.test(st1), 'student page: fact sheet (current account, debt, risk premium, exchange rate)');
  await stu.screenshot({ path: OUT + '/v13-s1-float.png', fullPage: true });

  /* year 2: currency crisis (depreciation > 10 % in year 1, regime still float) */
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('button:has-text("Next year")');
  await admin.waitForSelector('text=game · year 2');
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  must(await admin.inputValue('select[data-y="2"][data-f="regime"]') === 'float', 'year 2: the regime editor starts from last year\'s regime (float)');
  await admin.selectOption('select[data-y="2"][data-f="regime"]', 'float');
  await admin.click('button:has-text("Save shocks")');
  await admin.waitForTimeout(500);
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);
  await admin.click('#tabs button:has-text("Control")');
  await admin.waitForSelector('text=Currency crisis · year 2');
  must(/The currency fell by/.test(await admin.textContent('#view')), 'Control shows the currency-crisis card');
  await admin.click('button:has-text("Open the vote")');
  await admin.waitForSelector('text=Vote in progress');
  await admin.screenshot({ path: OUT + '/v13-a2-currency-crisis.png', fullPage: true });
  await stu.reload(); await stu.waitForSelector('#crisisBtn');
  must(/Currency crisis · year 2 — vote/.test(await stu.textContent('#form')) && (await stu.$$('#form input[name="C_vote"]')).length === 3, 'student page: currency-crisis vote card (defend / peg / let it float)');
  await stu.screenshot({ path: OUT + '/v13-s2-currency-vote.png', fullPage: true });
  /* votes: France peg at a devaluation of 10 %, Germany peg at 5 %, Italy let it float → median = peg, parity = median of 5 and 10 → 5 */
  await stu.click('#form input[name="C_vote"][value="peg"]');
  await stu.selectOption('#C_parity', '10');
  await stu.click('#crisisBtn');
  await stu.waitForSelector('text=Vote received');
  must((await api({ action: 'submit', pin: pins.DEU, phase: 'crisis', round: 2, payload: { crisis: 'peg', parity: 5 } })).ok && (await api({ action: 'submit', pin: pins.ITA, phase: 'crisis', round: 2, payload: { crisis: 'devaluation' } })).ok, 'Germany votes peg (5 %), Italy let it float');
  must(!(await api({ action: 'submit', pin: pins.ESP, phase: 'crisis', round: 2, payload: { crisis: 'peg', parity: 7 } })).ok, 'a parity outside the list is refused');
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);
  await admin.click('#tabs button:has-text("Control")');
  await admin.waitForSelector('text=3 of 7 countries have voted');
  must(/France: peg \(\+10 %\)/.test(await admin.textContent('#view')), 'console: the vote of France with its parity');
  await admin.click('button:has-text("Close the vote and announce")');
  await admin.waitForSelector('text=Vote closed');
  const ov2 = (await api({ action: 'admin.overview', key: KEY, classId: cid })).state, rec = ov2.crisis['2'];
  must(rec.outcome === 'peg' && rec.parity === 5 && rec.austerity === 0 && rec.peg === 2 && rec.devaluation === 1 && ov2.shocks.g2.regime === 'fixed', 'closed: 0 defend · 2 peg · 1 let it float → peg at a devaluation of 5 %; year-2 regime set to fixed');
  must(/pegged to the rest of the world/.test(await admin.textContent('#view')), 'console: the peg is announced');
  await admin.screenshot({ path: OUT + '/r1-closed.png', fullPage: true });
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'open' } });
  await stu.reload(); await stu.waitForSelector('#submitBtn');
  must(/2 peg · 1 let it float → peg, devaluation of 5 %/.test(await stu.textContent('#form')), 'desk: the outcome is announced');
  must((await sub('FRA', { pubdem: 2 }, { rate: 'hold' }, 2)).ok, 'France submits year 2');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'closed' } });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  must(await admin.inputValue('select[data-y="2"][data-f="regime"]') === 'fixed', 'shocks editor: year 2 is fixed');
  await runClick(admin);
  await admin.waitForSelector('#runPreview table');
  const y2 = await admin.textContent('#runPreview');
  must(/0 defend · 2 peg · 1 let it float → peg, devaluation of 5 %/.test(y2), 'run preview: the peg');
  await admin.click('button:has-text("Save and publish all")');
  await admin.waitForTimeout(700);
  s = await api({ action: 'state', pin: pins.FRA });
  const u2 = s.union.filter(r => r.phase === 'game' && r.year === 2)[0].detail.extra;
  must(u2.regime === 'fixed' && Math.abs(u2.xr / u1.xr - 1.05) < 1e-6 && Math.abs(u2.R - u1.R) > 1e-6 && u2.votes.crisis.outcome === 'peg', 'published year 2: fixed regime, the euro 5 % lower than at the end of year 1 (' + u1.xr.toFixed(3) + ' → ' + u2.xr.toFixed(3) + '), the reserves move again');
  /* year 3: the regime stays fixed */
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('button:has-text("Next year")');
  await admin.waitForSelector('text=game · year 3');
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  must(await admin.inputValue('select[data-y="3"][data-f="regime"]') === 'fixed', 'year 3: the regime editor starts fixed');
  /* the desk: who holds the debt, and the union panel */
  await stu.reload(); await stu.waitForSelector('.dbar');
  const deskT = await stu.textContent('#app');
  must(/Your public debt: who holds it, what it costs/.test(deskT) && /Households/.test(deskT) && /Rest of the world/.test(deskT) && /Average rate paid on the debt this year/.test(deskT) && /Interest bill/.test(deskT) && /2 peg · 1 let it float/.test(deskT), 'desk: the public-debt card (holders, rate, interest bill) and the vote in the union panel');
  await stu.screenshot({ path: OUT + '/r2-desk.png', fullPage: true });
  await stu.goto(BASE + '/desk.html?lang=fr&api=' + encodeURIComponent(API) + '&pin=' + pins.FRA); await stu.waitForSelector('.dbar'); await stu.waitForTimeout(400);
  const fr = await stu.textContent('#app');
  must(/Votre dette publique/.test(fr) && /Reste du monde/.test(fr) && /Charge d’intérêts/.test(fr), 'French desk: the public-debt card');
  await stu.screenshot({ path: OUT + '/r3-desk-fr.png', fullPage: true });
  must(errors.length === 0, 'no page errors (' + errors.join(' | ') + ')');
  await browser.close();
  console.log('\nREPEG E2E ALL GOOD');
})().catch(e => { console.error(e); process.exit(1); });
