/* End-to-end scenario: reserves crisis in a v1.3 class with the third choice, floating (median of the votes).
   year 1 fixed with a capital outflow → alert → year 2 crisis vote: austerity · floating · floating → floating
   → no austerity cap, regime float from year 2 (and kept in year 3); the desk, the console and the run preview say so (also in French).
   Also checks the median rule in core (tallyCrisis) and that 'float' is refused in a v1.1 class.
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

  /* median rule (core) */
  const MS = require('../core.js');
  const T = (v) => MS.tallyCrisis(v, v.length).outcome;
  must(T(['austerity', 'devaluation', 'float']) === 'devaluation' && T(['float', 'float', 'austerity']) === 'float' && T(['austerity', 'austerity', 'float']) === 'austerity' && T(['devaluation', 'float']) === 'devaluation' && T(['austerity', 'devaluation']) === 'austerity' && T(['devaluation', 'devaluation', 'austerity']) === 'devaluation' && T([]) === 'austerity', 'tallyCrisis: lower median along austerity < devaluation < float');

  /* year 2: reserves-crisis vote with three choices */
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('button:has-text("Next year")');
  await admin.waitForSelector('text=game · year 2');
  await admin.waitForSelector('text=Reserves crisis · year 2');
  must(/or a floating rate/.test(await admin.textContent('#view')), 'alert card lists the third choice');
  await admin.click('button:has-text("Open the crisis vote")');
  await admin.waitForSelector('text=Vote in progress');
  const stu = await ctx.newPage();
  stu.on('pageerror', e => errors.push('student: ' + e.message));
  await stu.goto(BASE + '/desk.html?lang=en&api=' + encodeURIComponent(API) + '&pin=' + pins.FRA);
  await stu.waitForSelector('#crisisBtn');
  must((await stu.$$('#form input[name="C_vote"]')).length === 3 && /Austerity, devaluation or a floating rate\?/.test(await stu.textContent('#form')) && /median vote wins/.test(await stu.textContent('#form')), 'desk: three choices and the median rule');
  await stu.click('#form input[name="C_vote"][value="float"]');
  await stu.click('#crisisBtn');
  await stu.waitForSelector('text=Vote received');
  must(/floating rate/.test(await stu.textContent('#form')), 'desk: vote received, floating rate');
  await stu.screenshot({ path: OUT + '/cf-s0-vote.png', fullPage: true });
  await stu.goto(BASE + '/desk.html?lang=fr&api=' + encodeURIComponent(API) + '&pin=' + pins.FRA);
  await stu.waitForSelector('#crisisBtn'); await stu.waitForTimeout(300);
  const vfr = await stu.textContent('#form');
  must(/Austérité, dévaluation ou change flottant/.test(vfr) && /le vote médian l’emporte/.test(vfr) && /Change flottant\s:\sla banque centrale/.test(vfr), 'desk in French: the vote card is translated');
  await stu.screenshot({ path: OUT + '/cf-s0-vote-fr.png', fullPage: true });
  await api({ action: 'submit', pin: pins.DEU, phase: 'crisis', round: 2, payload: { crisis: 'austerity' } });
  await api({ action: 'submit', pin: pins.ITA, phase: 'crisis', round: 2, payload: { crisis: 'float' } });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);
  await admin.click('#tabs button:has-text("Control")');
  must(/the median vote wins/.test(await admin.textContent('#view')) && /Italy: floating rate/.test(await admin.textContent('#view')), 'console: median rule and the votes as chips');
  await admin.click('button:has-text("Close the crisis vote and announce")');
  await admin.waitForSelector('text=Vote closed');
  const ov = (await api({ action: 'admin.overview', key: KEY, classId: cid })).state;
  const rec = ov.crisis['2'];
  must(rec.status === 'closed' && rec.outcome === 'float' && rec.austerity === 1 && rec.devaluation === 0 && rec.float === 2, 'crisis record: 1 austerity · 0 devaluation · 2 floating → float');
  must(ov.shocks.g2 && ov.shocks.g2.regime === 'float' && ov.shocks.g1.flows === -20 && ov.shocks.g1.regime !== 'float', 'year-2 shocks: regime float; year 1 untouched');
  must(/1 austerity · 0 devaluation · 2 floating → floating rate/.test(await admin.textContent('#view')), 'console: closed tally');
  await admin.screenshot({ path: OUT + '/cf-a1-card.png', fullPage: true });
  const adminFr = await ctx.newPage();
  adminFr.on('pageerror', e => errors.push('admin fr: ' + e.message));
  await adminFr.goto(BASE + '/admin.html?lang=fr&api=' + encodeURIComponent(API));
  await adminFr.waitForSelector('#statusGrid'); await adminFr.waitForTimeout(500);
  const cardFr = await adminFr.evaluate(() => { const c = document.querySelector('#view .card.tint'); return c ? c.textContent : ''; });
  must(/1 austérité · 0 dévaluation · 2 flottement → change flottant/.test(cardFr) && /La monnaie flotte à partir de cette année/.test(cardFr), 'console in French: the closed crisis card is translated (' + cardFr.slice(0, 200) + ')');
  await adminFr.screenshot({ path: OUT + '/cf-a2-card-fr.png', fullPage: true });
  await adminFr.close();

  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'open' } });
  const ok = await api({ action: 'submit', pin: pins.FRA, phase: 'game', round: 2, payload: { years: [{ levers: { pubdem: 3 }, tariffs: {}, euro: 'none', tfp: 0 }], text: 'France stimulates despite the crisis.'.padEnd(120, ' .'), votes: { rate: 'hold' } } });
  must(ok.ok, 'no austerity cap any more: public demand +3 accepted (' + (ok.errors || []).join('; ') + ')');
  await stu.goto(BASE + '/desk.html?lang=en&api=' + encodeURIComponent(API) + '&pin=' + pins.DEU);
  await stu.waitForSelector('#submitBtn');
  const f2 = await stu.textContent('#form');
  must(/→ floating rate/.test(f2) && /floats from this year on: no cap/.test(f2) && !/capped at/.test(f2), 'desk: the year note announces the floating rate, no cap');
  await stu.screenshot({ path: OUT + '/cf-s1-desk.png', fullPage: true });
  await stu.goto(BASE + '/desk.html?lang=fr&api=' + encodeURIComponent(API) + '&pin=' + pins.DEU);
  await stu.waitForSelector('#submitBtn'); await stu.waitForTimeout(300);
  const f2fr = await stu.textContent('#form');
  must(/→ change flottant/.test(f2fr) && /La monnaie de l’union flotte à partir de cette année/.test(f2fr), 'desk in French: the note is translated');
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
  must(/1 austerity · 0 devaluation · 2 floating → floating rate \(no cap; the currency floats from this year\)/.test(y2), 'run preview: floating rate, no cap');
  await admin.click('button:has-text("Save and publish all")');
  await admin.waitForTimeout(700);
  s = await api({ action: 'state', pin: pins.FRA });
  const u2 = s.union.filter(r => r.phase === 'game' && r.year === 2)[0].detail.extra;
  must(u2.regime === 'float' && Math.abs(u2.R - u1.R) < 1e-6 && u2.votes.crisis.outcome === 'float', 'published year 2: floating, reserves frozen, outcome float stored');
  const fr2 = s.myResults.filter(r => r.year === 2)[0];
  must(fr2 && fr2.detail, 'France has its year-2 results');
  await stu.goto(BASE + '/desk.html?lang=en&api=' + encodeURIComponent(API) + '&pin=' + pins.DEU);
  await stu.waitForSelector('#app');
  must(/2 floating → floating rate/.test(await stu.textContent('#app')), 'desk: union panel and history show the outcome');

  /* a v1.1 class refuses the floating choice */
  must(!MS.validateCrisisVote({ sim: { model: 'v1.1' }, round: 2, crisis: { 2: { status: 'open' } } }, { crisis: 'float' }).ok && MS.validateCrisisVote({ sim: { model: 'v1.3' }, round: 2, crisis: { 2: { status: 'open' } } }, { crisis: 'float' }).ok, 'float vote refused in v1.1, accepted in v1.3');
  must(!MS.validateCrisisVote({ sim: { model: 'v1.3' }, round: 2, crisis: { 2: { status: 'open', kind: 'currency' } } }, { crisis: 'float' }).ok, 'float vote refused in a currency-crisis round');

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
