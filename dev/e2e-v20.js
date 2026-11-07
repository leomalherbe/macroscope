/* End-to-end scenario for OPEN-MU v2.0 (emissions, damage function, carbon tax and green investment) through the real pages
   against the mock backend: class on model v2.0 (via Parameters) → warm-up plan with ctax 5 and green 4 submitted from the
   student page → run → student results show the climate line and the lever chips → game year 1 with a disaster → run →
   union row carries D → bounds and model checks on the backend. Mock server: PORT env (default 8787). */
const { chromium } = require('playwright');
const fs = require('fs');
const MS = require('../macsim/core.js');
const BASE = 'http://localhost:' + (process.env.E2E_PORT || 8787);
const API = BASE + '/api';
const OUT = process.argv[2] || '/tmp/shots-v20';
fs.mkdirSync(OUT, { recursive: true });
async function api(params) { const r = await fetch(API, { method: 'POST', body: JSON.stringify(params) }); return r.json(); }
function must(cond, msg) { if (!cond) { throw new Error('ASSERTION FAILED: ' + msg); } console.log('ok -', msg); }
const KEY = 'TESTKEY';

(async () => {
  await api({ action: '__reset' });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const admin = await ctx.newPage();
  admin.on('pageerror', e => errors.push('admin: ' + e.message));
  admin.on('dialog', d => d.accept(d.type() === 'prompt' ? 'V20 class' : undefined));

  /* class, groups, model v2.0 through the Parameters card (adds the two levers to the warm-up) */
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
  await admin.click('#tabs button:has-text("Groups")');
  await admin.click('button:has-text("Add 7 default groups")');
  await admin.click('button:has-text("Save groups")');
  await admin.waitForFunction(() => document.querySelectorAll('#view tbody tr').length === 7);
  const groups = (await api({ action: '__dump' })).dump.groups;
  const pins = {}; groups.forEach(g => { pins[g.country] = g.pin; });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('summary:has-text("Parameters")');
  await admin.selectOption('#modelSel', 'v2.0');
  await admin.click('button:has-text("Save parameters")');
  await admin.waitForTimeout(700);
  let ov = await api({ action: 'admin.overview', key: KEY, classId: cid });
  must(ov.state.sim.model === 'v2.0' && ov.state.warmup.allowed.indexOf('ctax') >= 0 && ov.state.warmup.allowed.indexOf('green') >= 0 && ov.state.bounds.eco === 10, 'class switched to v2.0: the carbon tax and green investment join the warm-up levers, eco bound 10');
  must(/backend v1\.8/.test(await admin.textContent('#footTime')), 'backend reports v1.8');

  /* warm-up: shocks editor shows the v2.0 rows; open submissions */
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('text=Run all submitted plans');
  const rows = await admin.evaluate(() => [...document.querySelectorAll('#view table.resgrid tbody tr td:first-child')].map(td => td.textContent.trim().split('\n')[0]));
  must(rows.some(r => /World emissions/.test(r)) && rows.some(r => /Climate disaster/.test(r)) && rows.some(r => /Exchange-rate regime/.test(r)), 'shocks editor shows the v2.0 rows (world emissions, climate disaster) next to the v1.3 ones');
  must(/model v2\.0/.test(await admin.textContent('#view')), 'engine line names model v2.0');
  await admin.screenshot({ path: OUT + '/v20-a1-run.png', fullPage: true });
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'open' } });

  /* student: the form has six levers, the eco ones bounded 0–10 */
  const stu = await ctx.newPage();
  stu.on('pageerror', e => errors.push('student: ' + e.message));
  await stu.goto(BASE + '/index.html?api=' + encodeURIComponent(API) + '&pin=' + pins.FRA);
  await stu.waitForSelector('#submitBtn');
  const leverNames = await stu.evaluate(() => [...document.querySelectorAll('#form input[name$="_0"]')].map(i => i.name));
  must(leverNames.indexOf('L_ctax_0') >= 0 && leverNames.indexOf('L_green_0') >= 0 && (await stu.getAttribute('#form input[name="L_ctax_0"]', 'min')) === '0' && (await stu.getAttribute('#form input[name="L_green_0"]', 'max')) === '10', 'student form shows the carbon tax and green investment, bounded 0–10');
  must((await stu.textContent('#form')).indexOf('carbon tax and green investment are levels') >= 0, 'rules line explains the two ecological levers');
  for (let y = 0; y < 3; y++) { await stu.fill('#form input[name="L_ctax_' + y + '"]', '5'); await stu.fill('#form input[name="L_green_' + y + '"]', '4'); }
  await stu.fill('#decisionText', 'France taxes carbon and invests green for three years: lower emissions at the cost of some inflation and a wider deficit.'.padEnd(160, ' .').trim());
  await stu.click('#submitBtn');
  await stu.waitForSelector('text=Decisions received');
  let s = await api({ action: 'state', pin: pins.FRA });
  const plan = s.myDecisions.filter(d => d.phase === 'warmup')[0];
  must(plan && plan.payload.years.every(y => y.levers.ctax === 5 && y.levers.green === 4), 'warm-up plan stored with ctax 5 and green 4 for the three years');
  await stu.screenshot({ path: OUT + '/v20-s0-form.png', fullPage: true });

  /* backend bounds and model guard */
  const tooBig = await api({ action: 'submit', pin: pins.DEU, phase: 'warmup', round: 1, payload: { years: [{ levers: { ctax: 12 } }, {}, {}], text: 'x'.repeat(160) } });
  must(!tooBig.ok && (tooBig.errors || []).some(e => /between 0 and 10/.test(e)), 'carbon tax 12 refused by the backend (bound 0–10)');
  const negative = await api({ action: 'submit', pin: pins.DEU, phase: 'warmup', round: 1, payload: { years: [{ levers: { green: -3 } }, {}, {}], text: 'x'.repeat(160) } });
  must(!negative.ok && (negative.errors || []).some(e => /between 0 and 10/.test(e)), 'negative green investment refused');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { sim: { model: 'v1.2' } } });
  const wrongModel = await api({ action: 'submit', pin: pins.DEU, phase: 'warmup', round: 1, payload: { years: [{ levers: { ctax: 3 } }, {}, {}], text: 'x'.repeat(160) } });
  must(!wrongModel.ok && (wrongModel.errors || []).some(e => /belongs to model v2\.0/.test(e)), 'carbon tax refused on a v1.2 class');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { sim: { model: 'v2.0' } } });

  /* run the warm-up, publish */
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'closed' } });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('text=Run all submitted plans');
  await admin.click('button:has-text("Run all submitted plans")');
  await admin.waitForSelector('#runPreview table');
  const pv = await admin.textContent('#runPreview');
  must(/Climate/.test(pv) && /damage/.test(pv) && /union emissions/.test(pv), 'warm-up preview carries the climate line');
  await admin.screenshot({ path: OUT + '/v20-a2-preview.png', fullPage: true });
  await admin.click('button:has-text("Save and publish all")');
  await admin.waitForTimeout(700);
  s = await api({ action: 'state', pin: pins.FRA });
  const r3 = s.myResults.filter(r => r.phase === 'warmup' && r.year === 3)[0], r1 = s.myResults.filter(r => r.phase === 'warmup' && r.year === 1)[0];
  must(r3 && r3.detail.extra.E < -30 && r3.detail.extra.ci < 0.7 && r3.detail.extra.ctax === 5 && r3.detail.extra.green === 4, 'published France rows: emissions ' + r3.detail.extra.E.toFixed(0) + ' % in year 3, carbon intensity ' + (100 * r3.detail.extra.ci).toFixed(0) + ' %, levers stored');
  must(r1.detail.gdp.nat !== 0 && r1.infl > 0.3, 'year 1: green demand and the carbon tax show in France’s own-policy part, inflation up (' + r1.infl.toFixed(2) + ' pt)');
  const u3 = s.union.filter(r => r.phase === 'warmup' && r.year === 3)[0].detail.extra;
  must(typeof u3.D === 'number' && u3.D > 1 && u3.Sshare > 1.03 && u3.Erel < 0, 'published union row: damage ' + u3.D.toFixed(1) + ' % in year 3, pollution stock ' + (100 * u3.Sshare).toFixed(1) + ', union emissions ' + u3.Erel.toFixed(0) + ' %');
  await stu.reload(); await stu.waitForSelector('#commentText');
  const stuTxt = await stu.textContent('#app');
  must(/Climate:/.test(stuTxt) && /carbon intensity/.test(stuTxt) && /Climate damage this year/.test(stuTxt) && /of which the climate/.test(stuTxt) && !/shocks and the climate/.test(stuTxt), 'student results: climate line, union climate block, fourth breakdown line "of which the climate"');
  must(/Carbon tax \+5\.00 pt/.test(stuTxt) || /Carbon tax/.test(stuTxt), 'lever chips name the carbon tax');
  /* sixth dimension: emissions, weight 0 by default */
  const heads = await stu.evaluate(() => [...document.querySelectorAll('#results table thead th')].map(th => th.textContent.trim()));
  must(heads.filter(h => /^Emissions/.test(h)).length >= 1 && heads.filter(h => /^GDP|^Unemployment|^Inflation|^Public|^Trade|^Emissions/.test(h)).length === 6, 'student results table has six indicator columns incl. Emissions');
  must(typeof r3.emis === 'number' && r3.emis < -30 && Math.abs(r3.emis - r3.detail.extra.E) < 2e-3, 'emis stored as an indicator (' + r3.emis.toFixed(1) + ' % vs reference) and equals the extra E');
  must(Math.abs(r3.R - MS.scoreR({ gdp: r3.gdp, unemp: r3.unemp, infl: r3.infl, pubbal: r3.pubbal, tradebal: r3.tradebal }, ov.state.weights)) < 1e-6 && MS.num(ov.state.weights.emis) === 0, 'weight 0 by default: R unchanged by the emissions column');
  const bars = await stu.evaluate(() => [...document.querySelectorAll('#trajectory svg rect title')].map(t => t.textContent).filter(t => /^Emissions/.test(t)).length);
  must(bars === 0, 'stacked bars: no emissions segment while its weight is 0');
  await stu.screenshot({ path: OUT + '/v20-s1-results.png', fullPage: true });

  /* game year 1 with a disaster */
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('button:has-text("Start the game")');
  await admin.waitForSelector('text=game · year 1');
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  await admin.fill('input[data-y="1"][data-f="disaster"]', '3');
  await admin.click('button:has-text("Save shocks")');
  await admin.waitForTimeout(500);
  must((await api({ action: 'admin.overview', key: KEY, classId: cid })).state.shocks.g1.disaster === 3, 'disaster shock saved for game year 1');
  /* a Green election for France from year 1 (preset: emissions 0.40, the five others 0.12) */
  const g1 = (await api({ action: 'admin.overview', key: KEY, classId: cid })).state.shocks.g1;
  const greenPreset = MS.ELECTION_PRESETS.filter(pz => pz.id === 'green')[0];
  must(greenPreset && greenPreset.eco && greenPreset.weights.emis === 0.4, 'the Green preset exists and is flagged eco');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { shocks: { g1: Object.assign({}, g1, { elections: [{ scope: 'FRA', weights: greenPreset.weights, label: greenPreset.label }] }) } } });
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'open' } });
  const sub = (c, levers) => api({ action: 'submit', pin: pins[c], phase: 'game', round: 1, payload: { years: [{ levers, tariffs: {}, euro: 'none', tfp: 0 }], text: ('Decision of ' + c + ' for year 1.').padEnd(120, ' .').trim(), votes: { rate: 'hold' } } });
  must((await sub('FRA', { ctax: 8 })).ok && (await sub('DEU', { pubdem: 5 })).ok, 'France (carbon tax 8) and Germany (stimulus) submit year 1');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'closed' } });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  await admin.click('#runBtn'); await admin.waitForSelector('#runBtn:not([disabled])');
  await admin.waitForSelector('#runPreview table');
  await admin.click('button:has-text("Save and publish all")');
  await admin.waitForTimeout(700);
  s = await api({ action: 'state', pin: pins.FRA });
  const ug = s.union.filter(r => r.phase === 'game' && r.year === 1)[0].detail.extra;
  must(Math.abs(ug.D - 3) < 1e-6, 'game year 1 with a disaster of 3: union row damage ' + ug.D.toFixed(1) + ' % (no stock damage yet + 3)');
  const fr = s.myResults.filter(r => r.phase === 'game' && r.year === 1)[0];
  must(fr.unemp > 1 && fr.infl > 0.5 && fr.detail.unemp.climate > 1 && Math.abs(fr.detail.gdp.shock + fr.detail.gdp.nat + fr.detail.gdp.foreign + fr.detail.gdp.climate - fr.gdp) < 1e-3 && typeof fr.detail.R.climate === 'number', 'France year 1: unemployment +' + fr.unemp.toFixed(2) + ' pt, inflation +' + fr.infl.toFixed(2) + ' pt; climate part of the split stored (u ' + fr.detail.unemp.climate.toFixed(2) + ', R ' + fr.detail.R.climate.toFixed(3) + ')');

  const de = (await api({ action: 'state', pin: pins.DEU })).myResults.filter(r => r.phase === 'game' && r.year === 1)[0];
  const wFR = fr.detail.weights, devFR = { gdp: fr.gdp, unemp: fr.unemp, infl: fr.infl, pubbal: fr.pubbal, tradebal: fr.tradebal, emis: fr.emis };
  must(wFR && wFR.emis === 0.4 && Math.abs(fr.R - MS.scoreR(devFR, wFR)) < 1e-6 && Math.abs(fr.R - MS.scoreR(devFR, ov.state.weights)) > 1e-3, 'France (Green election): R includes −0.4 × emissions deviation (R = ' + fr.R + ', emis ' + fr.emis.toFixed(1) + ' %)');
  must(!de.detail.weights && Math.abs(de.R - MS.scoreR({ gdp: de.gdp, unemp: de.unemp, infl: de.infl, pubbal: de.pubbal, tradebal: de.tradebal, emis: de.emis }, ov.state.weights)) < 1e-6, 'Germany: class weights, emissions weight 0');
  must(typeof fr.detail.R.climate === 'number' && typeof fr.detail.emis.nat === 'number', 'the emissions indicator carries its own four-part split');
  await stu.reload(); await stu.waitForSelector('#app');
  const stuG = await stu.textContent('#app');
  must(/Your objective this year/.test(stuG) && /Green: emissions first/.test(stuG) && /emissions/.test(stuG), 'student page: objective line names the Green election and the emissions weight');
  const barsG = await stu.evaluate(() => [...document.querySelectorAll('#trajectory svg rect title')].map(t => t.textContent).filter(t => /^Emissions/.test(t)).length);
  must(barsG >= 1, 'stacked bars: an emissions segment appears once its weight is positive');

  /* board */
  const board = await ctx.newPage();
  board.on('pageerror', e => errors.push('board: ' + e.message));
  await board.goto(BASE + '/board.html?class=' + cid + '&api=' + encodeURIComponent(API));
  await board.waitForSelector('text=Ranking');
  const bt = await board.textContent('#app');
  must(/Climate damage this year/.test(bt) && /Emissions/.test(bt), 'board: climate block in the union card, emissions column in the detail table');
  const bHeads = await board.evaluate(() => [...document.querySelectorAll('table thead th')].map(th => th.textContent.trim()));
  must(bHeads.some(h => /^Emissions/.test(h)) && /Green: emissions first/.test(bt), 'board: Emissions column in the year detail and the Green election listed');
  await board.screenshot({ path: OUT + '/v20-b1-board.png', fullPage: true });

  must(errors.length === 0, 'no page errors (' + errors.join(' | ') + ')');
  await browser.close();
  console.log('\nV2.0 E2E ALL GOOD');
})().catch(e => { console.error(e); process.exit(1); });
