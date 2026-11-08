/* End-to-end scenario for the arcade duel mode through the real pages against the mock backend: a duel class with two pairs
   (created through the console's kind prompt) → PIN slips → year 1: decisions from the page for pair 1 A (rate +1, public
   demand +5) and via the API for the others → close → Run year 1 (every pair) → publish → student page: duel card, partner's
   decisions and table, pair panel → year 2: floating regime + demand shock in A → run → e moved → board grid with the two pairs,
   ranking with four players → backend guards (rate bound, rate refused on a union class). Mock server: PORT env (default 8787). */
const { chromium } = require('playwright');
const fs = require('fs');
const MS = require('../macroscope/core.js');
const BASE = 'http://localhost:' + (process.env.E2E_PORT || 8787);
const API = BASE + '/api';
const OUT = process.argv[2] || '/tmp/shots-duel';
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
  admin.on('dialog', d => d.accept(d.type() === 'prompt' ? (/Kind of class/.test(d.message()) ? 'duel' : 'Duel class') : undefined));

  /* class of kind duel */
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
  let ov = await api({ action: 'admin.overview', key: KEY, classId: cid });
  must(ov.state.kind === 'duel' && ov.state.phase === 'game' && ov.state.round === 1 && ov.state.sim.model === 'v2.0' && ov.state.sim.votes === false, 'a duel class starts at game year 1 on the v2.0 engine, votes off');
  must(/backend v1\.10/.test(await admin.textContent('#footTime')), 'backend reports v1.10');
  must(/Duels · year 1/.test(await admin.textContent('#strip')) && !(await admin.$('button:has-text("back to warm-up")')) && !(await admin.$('button:has-text("Convene the council")')), 'Control: duel label, no warm-up, no council');

  /* groups: two pairs */
  await admin.click('#tabs button:has-text("Groups")');
  await admin.waitForSelector('button:has-text("Add N pairs")');
  await admin.fill('#view input[type=number]', '2');
  await admin.click('button:has-text("Add N pairs")');
  await admin.click('button:has-text("Save groups")');
  await admin.waitForSelector('.toast.show:has-text("Groups saved")');
  await admin.waitForFunction(() => document.querySelectorAll('#view tbody tr').length === 4 && [...document.querySelectorAll('#view tbody tr input.mono')].every(i => /^\d{4}$/.test(i.value)));
  const groups = (await api({ action: '__dump' })).dump.groups;
  const pins = {}; groups.forEach(g => { pins[g.country] = g.pin; });
  must(['p1:A', 'p1:B', 'p2:A', 'p2:B'].every(k => pins[k]), 'four groups: Pair 1 · A/B, Pair 2 · A/B with PINs');
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);

  /* Run tab: duel shock rows, engine line */
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  const rows = await admin.evaluate(() => [...document.querySelectorAll('#view table.resgrid tbody tr td:first-child')].map(td => td.textContent.trim().split('\n')[0]));
  must(rows.some(r => /Demand shock in A/.test(r)) && rows.some(r => /Devaluation of B/.test(r)) && rows.some(r => /Exchange-rate regime/.test(r)) && !rows.some(r => /World demand/.test(r)), 'shocks editor shows the duel rows (demand A/B, devaluations, regime, backstop, disaster), no world demand');
  must(/duel mode/.test(await admin.textContent('#view')) && /2 pair/.test(await admin.textContent('#view')), 'engine line names the duel mode and counts the pairs');
  await admin.screenshot({ path: OUT + '/duel-a1-run.png', fullPage: true });

  /* year 1: open, decisions */
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'open' } });
  const stu = await ctx.newPage();
  stu.on('pageerror', e => errors.push('student: ' + e.message));
  await stu.goto(BASE + '/desk.html?api=' + encodeURIComponent(API) + '&pin=' + pins['p1:A']);
  await stu.waitForSelector('#submitBtn');
  const leverNames = await stu.evaluate(() => [...document.querySelectorAll('#form input[name$="_0"]')].map(i => i.name));
  must(leverNames.length === 7 && leverNames.indexOf('L_rate_0') >= 0 && (await stu.getAttribute('#form input[name="L_rate_0"]', 'max')) === '2' && !(await stu.$('#form input[name="V_rate"]')), 'student form: seven levers incl. the policy rate (±2), no votes');
  must(/Pair 1 · Country A/.test(await stu.textContent('#who')), 'student header names the pair and the side');
  await stu.fill('#form input[name="L_pubdem_0"]', '5');
  await stu.fill('#form input[name="L_rate_0"]', '1');
  await stu.fill('#decisionText', 'Country A stimulates and raises its rate to attract capital.'.padEnd(60, ' .').trim());
  await stu.click('#submitBtn');
  await stu.waitForSelector('text=Decisions received');
  await stu.screenshot({ path: OUT + '/duel-s0-form.png', fullPage: true });
  const sub = (k, levers, text) => api({ action: 'submit', pin: pins[k], phase: 'game', round: 1, payload: { years: [{ levers, tariffs: {}, euro: 'none', tfp: 0 }], text: text.padEnd(60, ' .').trim() } });
  must((await sub('p1:B', { ctax: 5 }, 'B taxes carbon.')).ok && (await sub('p2:A', { benefits: 5 }, 'A2 raises benefits.')).ok && (await sub('p2:B', { rate: -1 }, 'B2 cuts its rate.')).ok, 'the three other players decide via the API');
  const tooBig = await sub('p2:B', { rate: 3 }, 'too high');
  must(!tooBig.ok && (tooBig.errors || []).some(e => /within ±2 points/.test(e)), 'policy rate 3 refused by the backend (bound ±2)');
  const s1 = await api({ action: 'state', pin: pins['p1:A'] });
  must(s1.partner && s1.partner.country === 'p1:B' && s1.partner.side === 'B', 'state exposes the partner of the pair');
  must(!(await stu.$('#council .card')) && !(await stu.$('#alldecisions table')), 'no council; the partner\'s decisions stay hidden while the round is open');

  /* close, run, publish */
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'closed' } });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  await admin.click('#runBtn'); await admin.waitForSelector('#runBtn:not([disabled])');
  await admin.waitForSelector('#runPreview table');
  const prevTxt = await admin.textContent('#runPreview');
  must((await admin.$$('#runPreview table')).length === 2 && /Pair 1 · year 1/.test(prevTxt) && /Pair 2 · year 1/.test(prevTxt) && /reserves A/.test(prevTxt), 'preview: one compact table per pair with the pair line');
  await admin.screenshot({ path: OUT + '/duel-a2-preview.png', fullPage: true });
  await admin.click('button:has-text("Save and publish all")');
  await admin.waitForTimeout(800);
  ov = await api({ action: 'admin.overview', key: KEY, classId: cid });
  const res1 = ov.results.filter(r => r.phase === 'game' && r.year === 1);
  const p1A = res1.find(r => r.key === 'p1:A'), p1B = res1.find(r => r.key === 'p1:B'), pr1 = res1.find(r => r.key === 'DUEL:p1'), pr2 = res1.find(r => r.key === 'DUEL:p2');
  must(res1.length === 6 && p1A && p1B && pr1 && pr2, 'six rows published: four players and two pair rows');
  must(p1A.gdp > 1 && p1B.detail.gdp.foreign > 0 && p1A.detail.gdp.climate !== undefined && p1A.detail.extra.rate === 1 && pr1.detail.extra.regime === 'fixed' && pr1.detail.extra.e === 1, 'A1 grows (own stimulus), B1 gains from A1\'s demand (partner part > 0); four-part split stored; pair row carries the regime and e = 1');
  must(Math.abs(p1A.R - MS.scoreR(p1A, ov.state.weights)) < 1e-6 && typeof p1A.emis === 'number', 'R computed with six dimensions (emissions at weight 0)');

  /* student page after the run */
  await stu.reload(); await stu.waitForSelector('#app');
  const stuTxt = await stu.textContent('#app');
  must(/Your duel · pair 1/.test(stuTxt) && /Reserves of Country A \(you\)/.test(stuTxt) && /Reserves of Country B \(your partner\)/.test(stuTxt), 'student page: the duel panel with both reserves, you and your partner');
  must(/Your partner · Pair 1 · Country B/.test(stuTxt) && /of which your partner’s policy/.test(stuTxt), 'student page: the partner\'s results table and the « of which your partner » line');
  must(/Your duel’s decisions · year 1/.test(stuTxt) && /Carbon tax/.test(stuTxt) && !/Pair 2/.test((await stu.textContent('#alldecisions'))), 'student page: the partner\'s decisions once the round is closed, not the other pairs\'');
  must((await stu.$$('.trajgrid svg.traj')).length === 2 && (await stu.$$('tr.partner')).length === 1 && (await stu.$$('tr.me')).length >= 1, 'student page: both charts side by side; ranking highlights you and your partner');
  must(/Key indicators · Pair 1 · Country A/.test(stuTxt) && /per partner unit/.test(stuTxt) && /Current account/.test(stuTxt), 'student page (duel): fact sheet with the bilateral exchange rate');
  await stu.screenshot({ path: OUT + '/duel-s1-results.png', fullPage: true });

  /* year 2: float + demand shock in A */
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('button:has-text("Next year")');
  await admin.waitForSelector('text=Duels · year 2');
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  await admin.selectOption('select[data-y="2"][data-f="regime"]', 'float');
  await admin.fill('input[data-y="2"][data-f="demandA"]', '-5');
  await admin.click('button:has-text("Save shocks")');
  await admin.waitForTimeout(600);
  ov = await api({ action: 'admin.overview', key: KEY, classId: cid });
  must(ov.state.shocks.g2 && ov.state.shocks.g2.regime === 'float' && ov.state.shocks.g2.demandA === -5, 'year-2 shocks saved (float, demand shock in A)');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'open' } });
  must((await api({ action: 'submit', pin: pins['p1:A'], phase: 'game', round: 2, payload: { years: [{ levers: { pubdem: 5, rate: 1 }, tariffs: {}, euro: 'none', tfp: 0 }], text: 'A keeps going.'.padEnd(60, ' .').trim() } })).ok, 'A1 decides for year 2');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'closed' } });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  await admin.click('#runBtn'); await admin.waitForSelector('#runBtn:not([disabled])');
  await admin.waitForSelector('#runPreview table');
  await admin.click('button:has-text("Save and publish all")');
  await admin.waitForTimeout(800);
  ov = await api({ action: 'admin.overview', key: KEY, classId: cid });
  const pr1y2 = ov.results.find(r => r.key === 'DUEL:p1' && r.year === 2), pr2y2 = ov.results.find(r => r.key === 'DUEL:p2' && r.year === 2);
  must(pr1y2 && pr1y2.detail.extra.regime === 'float' && (Math.abs(pr1y2.detail.extra.e - 1) > 0.005 || Math.abs(pr2y2.detail.extra.e - 1) > 0.005) && pr2y2.detail.extra.regime === 'float', 'year 2 floating: the bilateral rate moved away from 1, the regime is recorded for every pair');
  must(Math.abs(pr1y2.detail.extra.RshareA - ov.results.find(r => r.key === 'DUEL:p1' && r.year === 1).detail.extra.RshareA) < 1e-9, 'reserves frozen while floating');

  /* board */
  const board = await ctx.newPage();
  board.on('pageerror', e => errors.push('board: ' + e.message));
  await board.goto(BASE + '/board.html?class=' + cid + '&api=' + encodeURIComponent(API));
  await board.waitForSelector('text=The duels');
  const bTxt = await board.textContent('#app');
  must(/Pair 1 · /.test(bTxt) && /Pair 2 · /.test(bTxt) && (await board.$$('.rank')).length === 4 && /Every player of every pair/.test(bTxt), 'board: a panel per pair and a ranking of the four players');
  await board.screenshot({ path: OUT + '/duel-b1-board.png', fullPage: true });

  /* guards: the rate lever is refused on a union class */
  const r2 = await api({ action: 'admin.class.create', key: KEY, name: 'Union class' });
  await api({ action: 'admin.state.set', key: KEY, classId: r2.classId, patch: { sim: { model: 'v2.0' }, phase: 'game', round: 1, status: 'open' } });
  const gu = await api({ action: 'admin.groups.set', key: KEY, classId: r2.classId, groups: [{ name: 'G', country: 'FRA' }] });
  const wrongKind = await api({ action: 'submit', pin: gu.groups[0].pin, phase: 'game', round: 1, payload: { years: [{ levers: { rate: 1 }, tariffs: {}, euro: 'none', tfp: 0 }], text: 'x'.repeat(120), votes: {} } });
  must(!wrongKind.ok && (wrongKind.errors || []).some(e => /belongs to the duel mode/.test(e)), 'policy rate refused on a union class');

  must(errors.length === 0, 'no page errors (' + errors.join(' | ') + ')');
  await browser.close();
  console.log('\nDUEL E2E ALL GOOD');
})().catch(e => { console.error(e); process.exit(1); });
