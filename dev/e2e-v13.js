/* End-to-end scenario for OPEN-MU v1.3 (capital flows, exchange-rate regimes, market pressure) through the real pages
   against the mock backend: class on model v1.3 → year 1 floating with a sudden stop → run → union row 'float', depreciation
   → year 2: currency-crisis card → vote (open / cast from the page / close: defend) → run with the rate raised → publish
   → year 3 back to a fixed rate with no backstop → shocks editor shows the v1.3 rows. Mock server: PORT env (default 8787). */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:' + (process.env.E2E_PORT || 8787);
const API = BASE + '/api';
const OUT = process.argv[2] || '/tmp/shots-v13';
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
  admin.on('dialog', d => d.accept(d.type() === 'prompt' ? 'V13 class' : undefined));

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
  await admin.waitForFunction(() => document.querySelectorAll('#view tbody tr').length === 7);
  const groups = (await api({ action: '__dump' })).dump.groups;
  const pins = {}; groups.forEach(g => { pins[g.country] = g.pin; });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('summary:has-text("Parameters")');
  must(await admin.inputValue('#view select >> nth=-1') === 'v1.3' || (await admin.evaluate(() => [...document.querySelectorAll('#view select')].some(s => s.value === 'v1.3'))), 'Parameters select shows model v1.3');
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
  await stu.goto(BASE + '/index.html?api=' + encodeURIComponent(API) + '&pin=' + pins.FRA);
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
  must(/Currency crisis · year 2 — vote/.test(await stu.textContent('#form')) && (await stu.$$('#form input[name="C_vote"]')).length === 2, 'student page: currency-crisis vote card (defend / let it float)');
  await stu.screenshot({ path: OUT + '/v13-s2-currency-vote.png', fullPage: true });
  await stu.click('#form input[name="C_vote"][value="austerity"]');
  await stu.click('#crisisBtn');
  await stu.waitForSelector('text=Vote received');
  await api({ action: 'submit', pin: pins.DEU, phase: 'crisis', round: 2, payload: { crisis: 'devaluation' } });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);
  await admin.click('#tabs button:has-text("Control")');
  await admin.waitForSelector('text=2 of 7 countries have voted');
  await admin.click('button:has-text("Close the vote and announce")');
  await admin.waitForSelector('text=Vote closed');
  const rec = (await api({ action: 'admin.overview', key: KEY, classId: cid })).state.crisis['2'];
  must(rec.kind === 'currency' && rec.status === 'closed' && rec.austerity === 1 && rec.devaluation === 1 && rec.outcome === 'defend', 'currency-crisis vote: 1 defend · 1 let it float of 2 voters → defend (no majority to float)');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'open' } });
  await stu.reload(); await stu.waitForSelector('#submitBtn');
  must(/Currency-crisis vote of year 2/.test(await stu.textContent('#form')) && /defend/.test(await stu.textContent('#form')), 'student form announces the outcome: defend');
  const r2 = await sub('FRA', { pubdem: 5 }, { rate: 'hold' }, 2); must(r2.ok, 'France submits year 2 (' + (r2.error || '') + ' ' + ((r2.errors || []).join('; ')) + ')');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'closed' } });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  await runClick(admin);
  await admin.waitForSelector('#runPreview table');
  const y2 = await admin.textContent('#runPreview');
  must(/Currency crisis \(depreciation over year 1\): 1 defend · 1 let it float → defend: rate \+1\.0 pt this year/.test(y2), 'year-2 preview: the recorded defend outcome raises the rate by 1 pt');
  must(/effective rate 4\.00 %/.test(y2), 'effective rate 4.00 % (3 % + 1 pt defend)');
  await admin.click('button:has-text("Save and publish all")');
  await admin.waitForTimeout(700);
  s = await api({ action: 'state', pin: pins.FRA });
  const u2 = s.union.filter(r => r.phase === 'game' && r.year === 2)[0].detail.extra;
  must(u2.regime === 'float' && u2.votes.crisis.kind === 'currency' && u2.votes.crisis.outcome === 'defend' && u2.dxr < u1.dxr, 'published union row of year 2: currency tally stored, the currency recovered (' + u2.dxr.toFixed(1) + ' % vs ' + u1.dxr.toFixed(1) + ' %)');
  await stu.reload(); await stu.waitForSelector('#app');
  must(/Currency crisis · vote/.test(await stu.textContent('#app')), 'student page shows the currency-crisis tally in the union panel');

  /* year 3: back to a fixed rate, backstop off */
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('button:has-text("Next year")');
  await admin.waitForSelector('text=game · year 3');
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  await admin.selectOption('select[data-y="3"][data-f="regime"]', 'fixed');
  await admin.uncheck('input[data-y="3"][data-f="backstop"]');
  await admin.click('button:has-text("Save shocks")');
  await admin.waitForTimeout(500);
  const sh3 = (await api({ action: 'admin.overview', key: KEY, classId: cid })).state.shocks.g3;
  must(sh3.regime === 'fixed' && sh3.backstop === false, 'year-3 shocks saved: fixed, backstop off');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'closed' } });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  await runClick(admin);
  await admin.waitForSelector('#runPreview table');
  const y3 = await admin.textContent('#runPreview');
  must(/fixed/.test(y3) && /no backstop/.test(y3) && /No reserves crisis this year/.test(y3), 'year-3 preview: fixed regime, no backstop flagged, reserves rules back');
  await admin.click('button:has-text("Save and publish all")');
  await admin.waitForTimeout(700);
  s = await api({ action: 'state', pin: pins.FRA });
  const u3 = s.union.filter(r => r.phase === 'game' && r.year === 3)[0].detail.extra;
  must(u3.regime === 'fixed' && u3.backstop === false && Math.abs(u3.xr - u2.xr) < 1e-9, 'year 3: parity = last floating value, backstop flag stored');

  /* board */
  const board = await ctx.newPage();
  board.on('pageerror', e => errors.push('board: ' + e.message));
  await board.goto(BASE + '/board.html?class=' + cid + '&api=' + encodeURIComponent(API));
  await board.waitForSelector('text=Ranking');
  const bt = await board.textContent('#app');
  must(/Exchange-rate regime/.test(bt) && /Risk premium/.test(bt), 'board: regime line and risk-premium column');
  must(/Key indicators · end of year 3/.test(bt) && (await board.$$('table.facttable tbody tr')).length >= 2 && /the change since year 2/.test(bt), 'board: one fact sheet per country with the change since year 2');
  const order = await board.evaluate(() => [...document.querySelectorAll('#app > .card > h2, #app > .card > .cardhead h2')].map(h => h.textContent));
  must(await board.$('#app > .grid2 .union') && /Ranking/.test(order[0]) && /Everyone’s decisions/.test(order[1]) && order.some(t => /Key indicators/.test(t)) && /The objective, year by year/.test(order[order.length - 1]), 'board layout: union and submissions side by side, then full width: ranking, everyone′s decisions, …, the objective (' + order.join(' · ') + ')');
  must((await board.$$('svg.race polyline')).length === 7 && /The race · cumulative R/.test(await board.textContent('#app')), 'board: the race chart (cumulative R, one line per country)');
  await board.screenshot({ path: OUT + '/v13-b1-board.png', fullPage: true });

  must(errors.length === 0, 'no page errors (' + errors.join(' | ') + ')');
  await browser.close();
  console.log('\nV1.3 E2E ALL GOOD');
})().catch(e => { console.error(e); process.exit(1); });
