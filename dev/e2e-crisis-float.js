/* End-to-end scenario: reserves crisis in a v1.3 class, vote → austerity, then the central bank lets the currency float instead.
   year 1 fixed with a capital outflow → alert → year 2 crisis vote (austerity) → "The central bank lets the currency float instead"
   → no austerity cap, regime float from year 2 (and kept in year 3), the desk and the run preview say so (also in French).
   Mock server: PORT env (default 8787). */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:' + (process.env.E2E_PORT || 8787);
const API = BASE + '/api';
const OUT = process.argv[2] || '/tmp/shots-crisis-float';
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
  admin.on('dialog', d => d.accept(d.type() === 'prompt' ? 'Float class' : undefined));
  await admin.goto(BASE + '/admin.html?lang=en&api=' + encodeURIComponent(API));
  await admin.waitForSelector('input[type=password]');
  await admin.fill('input[type=url]', API);
  await admin.fill('input[type=password]', KEY);
  await admin.click('button:has-text("Connect")');
  await admin.waitForSelector('text=No class yet');
  await admin.click('button:has-text("+ New class")');
  await admin.waitForSelector('#statusGrid');
  const cid = JSON.parse((await api({ action: '__dump' })).dump.config.classes)[0].id;
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { sim: { model: 'v1.3' } } });
  await admin.click('#tabs button:has-text("Groups")');
  await admin.click('button:has-text("Add 7 default groups")');
  await admin.click('button:has-text("Save groups")');
  await admin.waitForSelector('.toast.show:has-text("Groups saved")');
  const pins = {}; (await api({ action: '__dump' })).dump.groups.forEach(g => { pins[g.country] = g.pin; });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('button:has-text("Start the game")');
  await admin.waitForSelector('text=game · year 1');

  /* year 1: fixed, capital outflow that drains the reserves below the alert line */
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  await admin.fill('input[data-y="1"][data-f="flows"]', '-20');
  await admin.click('button:has-text("Save shocks")');
  await admin.waitForTimeout(500);
  await runClick(admin);
  await admin.waitForSelector('#runPreview table');
  await admin.click('button:has-text("Save and publish all")');
  await admin.waitForTimeout(700);
  let s = await api({ action: 'state', pin: pins.FRA });
  const u1 = s.union.filter(r => r.phase === 'game' && r.year === 1)[0].detail.extra;
  must(u1.regime === 'fixed' && u1.R > 0 && u1.R < 0.25 * u1.R0, 'year 1: fixed regime, reserves at ' + Math.round(100 * u1.R / u1.R0) + ' % of the initial stock (alert)');

  /* year 2: reserves-crisis vote → austerity */
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('button:has-text("Next year")');
  await admin.waitForSelector('text=game · year 2');
  await admin.waitForSelector('text=Reserves crisis · year 2');
  must(!(await admin.$('button:has-text("lets the currency float instead")')), 'no float button before the vote is closed');
  await admin.click('button:has-text("Open the crisis vote")');
  await admin.waitForSelector('text=Vote in progress');
  await api({ action: 'submit', pin: pins.DEU, phase: 'crisis', round: 2, payload: { crisis: 'austerity' } });
  await api({ action: 'submit', pin: pins.FRA, phase: 'crisis', round: 2, payload: { crisis: 'austerity' } });
  await api({ action: 'submit', pin: pins.ITA, phase: 'crisis', round: 2, payload: { crisis: 'devaluation' } });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('button:has-text("Close the crisis vote and announce")');
  await admin.waitForSelector('text=Vote closed');
  let rec = (await api({ action: 'admin.overview', key: KEY, classId: cid })).state.crisis['2'];
  must(rec.status === 'closed' && rec.outcome === 'austerity', 'vote closed: 2 austerity · 1 devaluation → austerity');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'open' } });
  let refused = await api({ action: 'submit', pin: pins.FRA, phase: 'game', round: 2, payload: { years: [{ levers: { pubdem: 3 }, tariffs: {}, euro: 'none', tfp: 0 }], text: 'France stimulates despite the crisis.'.padEnd(120, ' .'), votes: { rate: 'hold' } } });
  must(!refused.ok, 'under austerity, public demand +3 is refused');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'closed' } });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);
  await admin.click('#tabs button:has-text("Control")');

  /* the central bank floats instead */
  await admin.click('button:has-text("The central bank lets the currency float instead")');
  await admin.waitForSelector('text=floating instead of austerity');
  const ov = (await api({ action: 'admin.overview', key: KEY, classId: cid })).state;
  rec = ov.crisis['2'];
  must(rec.status === 'closed' && rec.outcome === 'float' && rec.austerity === 2 && rec.devaluation === 1, 'crisis record: outcome float, tally kept (2 · 1)');
  must(ov.shocks.g2 && ov.shocks.g2.regime === 'float' && ov.shocks.g1.flows === -20 && ov.shocks.g1.regime !== 'float', 'year-2 shocks: regime float; year 1 untouched');
  must(!(await admin.$('button:has-text("lets the currency float instead")')), 'the float button is gone once used');
  await admin.screenshot({ path: OUT + '/cf-a1-card.png', fullPage: true });
  const adminFr = await ctx.newPage();
  adminFr.on('pageerror', e => errors.push('admin fr: ' + e.message));
  await adminFr.goto(BASE + '/admin.html?lang=fr&api=' + encodeURIComponent(API));
  await adminFr.waitForSelector('#statusGrid'); await adminFr.waitForTimeout(500);
  const cardFr = await adminFr.evaluate(() => { const h = [...document.querySelectorAll('#view h2')].filter(x => /2/.test(x.textContent) && x.closest('.card.tint'))[0]; return h ? h.closest('.card').textContent : ''; });
  must(/flottement au lieu de l’austérité/.test(cardFr) && /au lieu d’imposer l’austérité/.test(cardFr), 'console in French: the crisis card is translated (' + cardFr.slice(0, 160) + ')');
  await adminFr.screenshot({ path: OUT + '/cf-a2-card-fr.png', fullPage: true });
  await adminFr.close();

  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'open' } });
  const ok = await api({ action: 'submit', pin: pins.FRA, phase: 'game', round: 2, payload: { years: [{ levers: { pubdem: 3 }, tariffs: {}, euro: 'none', tfp: 0 }], text: 'France stimulates despite the crisis.'.padEnd(120, ' .'), votes: { rate: 'hold' } } });
  must(ok.ok, 'no austerity cap any more: public demand +3 accepted (' + (ok.errors || []).join('; ') + ')');
  const stu = await ctx.newPage();
  stu.on('pageerror', e => errors.push('student: ' + e.message));
  await stu.goto(BASE + '/desk.html?lang=en&api=' + encodeURIComponent(API) + '&pin=' + pins.DEU);
  await stu.waitForSelector('#submitBtn');
  const f2 = await stu.textContent('#form');
  must(/floating instead of austerity/.test(f2) && /instead of imposing austerity/.test(f2) && !/capped at/.test(f2), 'desk: the year note announces floating instead of austerity, no cap');
  await stu.screenshot({ path: OUT + '/cf-s1-desk.png', fullPage: true });
  await stu.goto(BASE + '/desk.html?lang=fr&api=' + encodeURIComponent(API) + '&pin=' + pins.DEU);
  await stu.waitForSelector('#submitBtn'); await stu.waitForTimeout(300);
  const f2fr = await stu.textContent('#form');
  must(/flottement au lieu de l’austérité/.test(f2fr) && /au lieu d’imposer l’austérité/.test(f2fr), 'desk in French: the note is translated');
  await stu.screenshot({ path: OUT + '/cf-s2-desk-fr.png', fullPage: true });
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'closed' } });

  /* run year 2 */
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  must(await admin.inputValue('select[data-y="2"][data-f="regime"]') === 'float', 'shocks editor: year 2 shows floating');
  await runClick(admin);
  await admin.waitForSelector('#runPreview table');
  const y2 = await admin.textContent('#runPreview');
  must(/2 austerity · 1 devaluation → floating instead of austerity \(no cap; floating regime from this year\)/.test(y2), 'run preview: floating instead of austerity, no cap');
  await admin.click('button:has-text("Save and publish all")');
  await admin.waitForTimeout(700);
  s = await api({ action: 'state', pin: pins.FRA });
  const u2 = s.union.filter(r => r.phase === 'game' && r.year === 2)[0].detail.extra;
  must(u2.regime === 'float' && Math.abs(u2.R - u1.R) < 1e-6 && u2.votes.crisis.outcome === 'float', 'published year 2: floating, reserves frozen, outcome float stored');
  const fr2 = s.myResults.filter(r => r.year === 2)[0];
  must(fr2 && fr2.detail, 'France has its year-2 results');
  await stu.goto(BASE + '/desk.html?lang=en&api=' + encodeURIComponent(API) + '&pin=' + pins.DEU);
  await stu.waitForSelector('#app');
  must(/floating instead of austerity/.test(await stu.textContent('#app')), 'desk: union panel and history show the outcome');

  /* year 3: the floating regime carries over, no reserves crisis */
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('button:has-text("Next year")');
  await admin.waitForSelector('text=game · year 3');
  must(!(await admin.$('text=Reserves crisis · year 3')), 'year 3: no reserves-crisis card (floating)');
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  must(await admin.inputValue('select[data-y="3"][data-f="regime"]') === 'float', 'year 3: the regime stays floating');

  must(errors.length === 0, 'no page errors (' + errors.join(' | ') + ')');
  await browser.close();
  console.log('\nCRISIS-FLOAT E2E ALL GOOD');
})().catch(e => { console.error(e); process.exit(1); });
