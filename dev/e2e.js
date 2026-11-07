/* End-to-end scenario through the real pages (admin, student, board) against the mock backend, OPEN-MU flow:
   class + groups → warm-up submissions → shocks → Run all plans → publish → student sees 3 years + union panel
   → game: council, submissions + votes, close, Run year 1 (rate vote) → publish → year 2 (replay, reserves alert)
   → year 3 crisis vote (austerity then devaluation) → year 4 forced devaluation → board → delete class.
   The engine is macsim/engine.js when present, else dev/engine-stub.js (served by the mock at /engine.js). */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const MS = require('../macsim/core.js');
const BASE = 'http://localhost:' + (process.env.E2E_PORT || 8787);
const API = BASE + '/api';
const OUT = process.argv[2] || '/tmp/shots';
fs.mkdirSync(OUT, { recursive: true });
async function api(params) { const r = await fetch(API, { method: 'POST', body: JSON.stringify(params) }); return r.json(); }
const runClick = async (pg) => { await pg.click('#runBtn'); await pg.waitForSelector('#runBtn:not([disabled])'); };
function must(cond, msg) { if (!cond) { throw new Error('ASSERTION FAILED: ' + msg); } console.log('ok -', msg); }
const realEngine = fs.existsSync(path.join(__dirname, '..', 'macsim', 'engine.js'));
console.log('engine:', realEngine ? 'macsim/engine.js (real)' : 'dev/engine-stub.js (stub)');

(async () => {
  await api({ action: '__reset' });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const admin = await ctx.newPage();
  const errors = [];
  admin.on('pageerror', e => errors.push('admin: ' + e.message));
  admin.on('dialog', d => d.accept(d.type() === 'prompt' ? 'M1 Finance A' : undefined));

  /* ---- admin login + class ---- */
  await admin.goto(BASE + '/admin.html?api=' + encodeURIComponent(API));
  await admin.waitForSelector('input[type=password]');
  await admin.fill('input[type=url]', API);
  await admin.fill('input[type=password]', 'TESTKEY');
  await admin.click('button:has-text("Connect")');
  await admin.waitForSelector('text=No class yet');
  await admin.click('button:has-text("+ New class")');
  await admin.waitForSelector('#statusGrid');
  must(await admin.textContent('#classbar select') === 'M1 Finance A', 'class created through the console');
  must(/backend v1\.9/.test(await admin.textContent('#footTime')), 'backend reports v1.9');
  /* a class created from the console plays model v1.2; this scenario was written for v1.1, so switch it back through Parameters */
  const ov0 = await api({ action: 'admin.overview', key: 'TESTKEY', classId: JSON.parse((await api({ action: '__dump' })).dump.config.classes)[0].id });
  must(ov0.state.sim && ov0.state.sim.model === 'v1.2', 'a new class is created with model v1.2');
  await admin.click('summary:has-text("Parameters")');
  must(await admin.inputValue('#modelSel') === 'v1.2', 'Parameters shows model v1.2 for the new class');
  await admin.selectOption('#modelSel', 'v1.1');
  await admin.click('button:has-text("Save parameters")');
  await admin.waitForTimeout(500);
  must((await api({ action: 'admin.overview', key: 'TESTKEY', classId: JSON.parse((await api({ action: '__dump' })).dump.config.classes)[0].id })).state.sim.model === 'v1.1', 'model switched back to v1.1 for the rest of the scenario');
  await admin.click('#tabs button:has-text("Control")');

  /* ---- groups ---- */
  await admin.click('#tabs button:has-text("Groups")');
  await admin.click('button:has-text("Add 7 default groups")');
  await admin.click('button:has-text("Save groups")');
  await admin.waitForFunction(() => document.querySelectorAll('#view tbody tr').length === 7 && [...document.querySelectorAll('#view tbody tr input.mono')].every(i => /^\d{4}$/.test(i.value)));
  await admin.screenshot({ path: OUT + '/a1-groups.png', fullPage: true });
  const dump = await api({ action: '__dump' });
  const groups = dump.dump.groups; must(groups.length === 7, '7 groups saved with PINs');
  const pins = {}; groups.forEach(g => { pins[g.name] = g.pin; });
  const cid0 = JSON.parse(dump.dump.config.classes)[0].id;
  const byCountry = {}; groups.forEach(g => { byCountry[g.country] = g.name; });
  must(['DEU', 'FRA', 'ITA', 'ESP', 'NLD', 'BEL', 'AUT'].every(c => byCountry[c]), 'default groups cover the seven union members');

  /* ---- control: communiqué + open with timer ---- */
  await admin.click('#tabs button:has-text("Control")');
  await admin.fill('#view textarea', 'Year 0 shock: world demand −3 %. 12 minutes for your 3-year plan.');
  await admin.click('button:has-text("Publish")');
  await admin.waitForTimeout(400);
  await admin.click('button:has-text("Open with timer")');
  await admin.waitForSelector('#countdown');
  await admin.screenshot({ path: OUT + '/a2-control.png', fullPage: true });

  /* ---- students submit warm-up plans (API) ---- */
  const plans = {
    'Group 1': { years: [{ levers: { pubdem: 5 } }, { levers: { pubdem: 5 } }, { levers: { pubdem: 5 } }], text: 'Pure Keynesian stimulus through public demand for three years to offset the fall in world demand; we accept a worse public balance and expect a mild trade deficit.' },
    'Group 2': { years: [{ levers: { inctax: -5, vat: 3 } }, { levers: { inctax: -5, vat: 3 } }, { levers: { inctax: -3 } }], text: 'Household-income strategy financed by a small consumption-tax rise: lower income tax supports disposable income; the VAT rise limits the budget cost and dampens imports through lower consumption.' },
    'Group 3': { years: [{ levers: { benefits: 4, pubdem: 2 } }, { levers: { benefits: 4 } }, { levers: { pubdem: -2 } }], text: 'Higher benefits support consumption in years 1-2; public demand is raised then cut back in year 3 to repair the public balance before the reserves alert.' }
  };
  for (const [name, payload] of Object.entries(plans)) { const r = await api({ action: 'submit', pin: pins[name], phase: 'warmup', round: 1, payload }); must(r.ok, name + ' warm-up plan accepted'); }
  const rej = await api({ action: 'submit', pin: pins['Group 4'], phase: 'warmup', round: 1, payload: { years: [{ levers: { pubdem: 15 } }, {}, {}], text: 'too big and too short' } });
  must(!rej.ok && rej.errors.length >= 2, 'out-of-bounds plan rejected server-side');
  const rej2 = await api({ action: 'submit', pin: pins['Group 4'], phase: 'warmup', round: 1, payload: { years: [{ levers: { pubemp: 5 } }, {}, {}], text: 'x'.repeat(160) } });
  must(!rej2.ok, 'a lever that is not in OPEN-MU is rejected');

  /* ---- Run tab: shocks + run all plans ---- */
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  must((await admin.textContent('#view')).includes('engine OPEN-MU'), 'Run tab shows the engine');
  await admin.fill('input[data-y="1"][data-f="world"]', '-3');
  await admin.fill('input[data-y="2"][data-f="world"]', '-3');
  await admin.click('button:has-text("Save shocks")');
  await admin.waitForTimeout(500);
  const stAfter = await api({ action: 'admin.overview', key: 'TESTKEY', classId: JSON.parse(dump.dump.config.classes)[0].id });
  must(stAfter.state.shocks['1'].world === -3 && stAfter.state.shocks['2'].world === -3 && (stAfter.state.shocks['3'] || {}).world === 0, 'shocks saved for the three warm-up years');
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  await runClick(admin);
  await admin.waitForSelector('#runPreview table');
  const previewRows = await admin.$$('#runPreview tbody tr');
  must(previewRows.length === 9, 'preview shows 3 rows × 3 submitted groups (' + previewRows.length + ')');
  await admin.screenshot({ path: OUT + '/a3-run-warmup.png', fullPage: true });
  await admin.click('button:has-text("Save and publish all")');
  await admin.waitForTimeout(700);
  let s = await api({ action: 'state', pin: pins['Group 1'] });
  must(s.myResults.length === 3 && s.myResults[0].published && s.myResults[0].detail && s.myResults[0].detail.gdp, 'group 1 sees its 3 published years with the breakdown');
  must(s.union.length === 3 && s.union[0].detail.extra.R0 > 0, 'group 1 receives the union rows of its run');
  must(s.myResults.every(r => typeof r.R === 'number'), 'R computed with the class weights');
  must(s.myResults.every(r => r.detail.R && ['shock', 'nat', 'foreign'].every(p => typeof r.detail.R[p] === 'number') && Math.abs(r.detail.R.shock + r.detail.R.nat + r.detail.R.foreign - r.R) < 0.005), 'R split (own / foreign / shocks) published and adds up to R');
  s = await api({ action: 'state', pin: pins['Group 4'] });
  must(s.myResults.length === 0 && s.union.length === 0, 'group 4 (no plan) sees nothing');
  await api({ action: 'comment', pin: pins['Group 1'], phase: 'warmup', round: 1, text: 'The multiplier is about 1.3 in year 1 and fades as the trade deficit bites.' });

  /* ---- student page in the warm-up ---- */
  const stu = await ctx.newPage();
  stu.on('pageerror', e => errors.push('student: ' + e.message));
  await stu.goto(BASE + '/index.html?api=' + encodeURIComponent(API) + '&pin=' + pins['Group 1']);
  await stu.waitForSelector('#commentText');
  const stuTxt = await stu.textContent('#app');
  must(stuTxt.includes('of which your own policy') && stuTxt.includes('Foreign reserves'), 'student page shows breakdown lines and the union panel');
  must(!/MacSim/.test(await stu.content()), 'no MacSim mention left on the student page');
  const rSplit = await stu.evaluate(() => [...document.querySelectorAll('#results tr.bd')].map(tr => tr.children[tr.children.length - 2].textContent.trim()));
  must(rSplit.length === 9 && rSplit.every(x => /^[+−-]?\d/.test(x)), 'student table shows the R split on every « of which » line (' + rSplit.slice(0, 3).join(' / ') + ')');
  const cumCol = await stu.evaluate(() => [...document.querySelectorAll('#results table tbody tr:not(.bd)')].map(tr => [...tr.children].slice(-2).map(td => td.textContent.trim())));
  const yrR = (await api({ action: 'state', pin: pins['Group 1'] })).myResults.slice().sort((a, b) => a.year - b.year).map(r => r.R);
  const expCum = [yrR[0], yrR[0] + yrR[1], yrR[0] + yrR[1] + yrR[2]].map(x => Math.round(x * 1000) / 1000);
  must(cumCol.length === 3 && cumCol.every((c, i) => Math.abs(parseFloat(c[1].replace('−', '-')) - expCum[i]) < 0.002), 'student table: cumulative R column is the running sum of the yearly scores (' + cumCol.map(c => c[1]).join(' / ') + ')');
  await stu.screenshot({ path: OUT + '/s1-warmup-results.png', fullPage: true });
  const trajBars = await stu.evaluate(() => ({ rects: document.querySelectorAll('#trajectory svg rect').length, lines: document.querySelectorAll('#trajectory svg polyline').length, dots: document.querySelectorAll('#trajectory svg circle').length }));
  must(trajBars.rects >= 15 && trajBars.lines === 1 && trajBars.dots === 3 && (await stu.textContent('#results')).includes('Your objective, year by year'), 'student page: stacked contribution bars (' + trajBars.rects + ' segments) and the dashed R line through 3 years');
  const trajR = await stu.evaluate(() => [...document.querySelectorAll('#trajectory svg circle title')].map(t => parseFloat(t.textContent.split(': ')[1])));
  must(trajR.every((v, i) => Math.abs(v - yrR[i]) < 0.002), 'the dashed line carries the yearly R (' + trajR.join(' / ') + ')');
  const trajEl = await stu.$('#trajectory'); await trajEl.screenshot({ path: OUT + '/s1b-trajectory.png' });

  /* ---- debrief: reveal every group's warm-up results and plans ---- */
  await api({ action: 'admin.state.set', key: 'TESTKEY', classId: cid0, patch: { revealWarmup: true } });
  await stu.reload(); await stu.waitForSelector('#commentText');
  must((await stu.textContent('#app')).includes('All groups · warm-up debrief'), 'student page shows the all-groups debrief table once revealed');
  const boardW = await ctx.newPage();
  boardW.on('pageerror', e => errors.push('board-warmup: ' + e.message));
  await boardW.goto(BASE + '/board.html?class=' + cid0 + '&api=' + encodeURIComponent(API));
  await boardW.waitForSelector('text=Debrief · all groups');
  const boardTxt = await boardW.textContent('#app');
  must(boardTxt.includes('Group 1') && boardTxt.includes('Y1') && /year 3: GDP/.test(boardTxt), 'board debrief lists each group with its plan and final-year indicators');
  await boardW.screenshot({ path: OUT + '/b0-board-warmup-debrief.png', fullPage: true });
  await boardW.close();
  await api({ action: 'admin.state.set', key: 'TESTKEY', classId: cid0, patch: { revealWarmup: false } });

  /* ---- results tab (manual grid still works, no PDF import) ---- */
  await admin.click('#tabs button:has-text("Results")');
  await admin.waitForSelector('.entry');
  must(!(await admin.textContent('#view')).includes('Import MacSim'), 'PDF import gone from the Results tab');
  const g1vals = await admin.evaluate(() => { const b = [...document.querySelectorAll('.entry')].find(e => e.querySelector('b').textContent === 'Group 1'); return [...b.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('input[type=number]')].map(i => i.value)); });
  must(g1vals.length === 3 && g1vals[0][0] !== '' && g1vals[0][5] !== '', 'Results grid filled from the run (group 1: GDP y1 ' + g1vals[0][0] + ', R ' + g1vals[0][5] + ')');
  const g1cum = await admin.evaluate(() => { const b = [...document.querySelectorAll('.entry')].find(e => e.querySelector('b').textContent === 'Group 1'); return [...b.querySelectorAll('tbody tr')].map(tr => tr.lastElementChild.textContent.trim()); });
  must(g1cum.length === 3 && g1cum.every((c, i) => Math.abs(parseFloat(c.replace('−', '-')) - expCum[i]) < 0.002), 'Results grid: Cum. R column matches the running sum (' + g1cum.join(' / ') + ')');

  /* ---- parameters: the votes group is saved in state.sim ---- */
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('summary:has-text("Parameters")');
  const stepInput = await admin.$('label:has-text("Rate step per majority vote") + br + input');
  must(stepInput && (await stepInput.inputValue()) === '0.5', 'Parameters show the vote step (0.5 pt)');
  await stepInput.fill('0.25');
  await admin.click('button:has-text("Save parameters")');
  await admin.waitForTimeout(600);
  const stSim = (await api({ action: 'admin.overview', key: 'TESTKEY', classId: JSON.parse(dump.dump.config.classes)[0].id })).state.sim;
  must(stSim.voteStep === 0.25 && stSim.votes === true && stSim.austerityCap === -5 && stSim.devalSize === 10 && stSim.forcedDeval === 15, 'vote parameters saved in state.sim');
  await api({ action: 'admin.state.set', key: 'TESTKEY', classId: JSON.parse(dump.dump.config.classes)[0].id, patch: { sim: { voteStep: 0.5 } } });
  await admin.click('button:has-text("↻ Refresh")'); await admin.waitForTimeout(500);

  /* ---- start the game ---- */
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('button:has-text("Start the game")');
  await admin.waitForSelector('text=game · year 1');
  await admin.click('button:has-text("Convene the council")');
  await admin.waitForSelector('text=Adjourn the council');
  await admin.click('button:has-text("Open submissions")');
  await admin.waitForSelector('text=Close submissions');
  await api({ action: 'pledge', pin: pins[byCountry.DEU], payload: { text: 'Germany will stimulate by +4 % if France and Italy do the same.', year: { levers: { pubdem: 4 } } } });
  await api({ action: 'pledge', pin: pins[byCountry.FRA], payload: { text: 'France commits to +5 public demand.', year: { levers: { pubdem: 5 } }, votes: { rate: 'cut', crisis: 'bogus' } } });
  await api({ action: 'pledge', pin: pins[byCountry.ITA], payload: { text: 'Italy will vote for a rate hike.', votes: { rate: 'hike' } } });
  const plB = await api({ action: 'board', classId: cid0 });
  const plF = plB.pledges.find(p => p.country === 'FRA'), plI = plB.pledges.find(p => p.country === 'ITA');
  must(plF.payload.votes.rate === 'cut' && plF.payload.votes.crisis === undefined && plI.payload.votes.rate === 'hike' && plI.payload.year.levers.pubdem === 0, 'announced votes kept by the backend (invalid crisis value dropped), numbers optional');
  const sub = (name, levers, text, votes, round) => api({ action: 'submit', pin: pins[name], phase: 'game', round: round || 1, payload: { years: [{ levers, tariffs: {}, euro: 'none', tfp: 0 }], text: text.padEnd(120, ' .').trim(), votes: votes || {} } });
  /* student form: the votes card (no crisis question yet) */
  await stu.goto(BASE + '/index.html?api=' + encodeURIComponent(API) + '&pin=' + pins[byCountry.FRA]);
  await stu.waitForSelector('#submitBtn');
  await stu.click('#council summary'); await stu.waitForTimeout(200);
  must((await stu.$('#PL_vote_rate')) !== null && !(await stu.$('#PL_vote_crisis')), 'pledge form offers an announced rate vote (no crisis announcement yet)');
  await stu.screenshot({ path: OUT + '/s0-student-council.png', fullPage: true });
  must((await stu.$$('#form input[name="V_rate"]')).length === 3 && !(await stu.$('#form input[name="V_crisis"]')), 'student form shows the rate vote (cut / hold / hike) and no crisis question');
  must((await stu.$('#form input[name="V_rate"][value="hold"]:checked')) !== null, 'rate vote defaults to hold');
  await stu.click('#form input[name="V_rate"][value="cut"]');
  await stu.fill('#form input[name="L_pubdem_0"]', '5');
  await stu.fill('#decisionText', 'France keeps its word and stimulates, and votes for a rate cut.'.padEnd(120, ' .').trim());
  await stu.click('#submitBtn');
  await stu.waitForSelector('text=Decisions received');
  let s1 = await api({ action: 'state', pin: pins[byCountry.FRA] });
  must(s1.myDecisions.some(d => d.phase === 'game' && d.round === 1 && d.payload.votes && d.payload.votes.rate === 'cut' && d.payload.votes.crisis === undefined), 'France’s submission from the form carries its rate vote (cut); no crisis vote inside decisions');
  await stu.reload(); await stu.waitForSelector('#submitBtn');
  must((await stu.$('#form input[name="V_rate"][value="cut"]:checked')) !== null, 'vote prefilled from the previous submission');
  must((await sub(byCountry.DEU, { pubdem: 0 }, 'Germany defects: no stimulus, we free-ride on our partners and target a trade surplus.', { rate: 'cut' })).ok, 'all-zero decision accepted in the game (free-riding is a strategy)');
  must((await sub(byCountry.ITA, { pubdem: 2, inctax: -3 }, 'Italy: small stimulus plus an income-tax cut.', { rate: 'cut' })).ok, 'Italy submits');
  must((await sub(byCountry.ESP, { vat: -4 }, 'Spain cuts VAT to support consumption.', { rate: 'cut' })).ok, 'Spain submits');
  must(!(await sub(byCountry.ESP, { vat: -4 }, 'Spain cuts VAT to support consumption.', { rate: 'loosen' })).ok, 'invalid vote rejected');

  /* run refused while open */
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  must(await admin.inputValue('input[data-y="1"][data-f="world"]') === '0', 'game year 1 does not inherit the warm-up shocks');
  await admin.fill('input[data-y="1"][data-f="rate"]', '1');
  await admin.click('button:has-text("Save shocks")');
  await admin.waitForTimeout(500);
  const shG = (await api({ action: 'admin.overview', key: 'TESTKEY', classId: cid0 })).state.shocks;
  must(shG.g1 && shG.g1.rate === 1 && shG['1'].world === -3, 'game shocks saved under their own key, warm-up shocks untouched');
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  await runClick(admin);
  await admin.waitForTimeout(400);
  must(!(await admin.$('#runPreview table')), 'running the year is refused while the round is open');
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('button:has-text("Close submissions")');
  await admin.waitForSelector('text=Open submissions');
  await admin.click('button:has-text("Adjourn the council")');
  await admin.waitForSelector('text=Convene the council');
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  await runClick(admin);
  await admin.waitForSelector('#runPreview table');
  const y1rows = await admin.$$('#runPreview tbody tr');
  must(y1rows.length === 7, 'year-1 preview has one row per playing country');
  const y1txt = await admin.textContent('#runPreview');
  must(y1txt.includes('Foreign reserves'), 'year-1 preview shows the union panel');
  must(y1txt.includes('4 cut · 0 hold · 0 hike → -0.50 pt') && y1txt.includes('effective rate 3.50 %'), 'year-1 tally: 4 cuts of 4 voters → −0.5 pt on top of the administrator’s +1 pt (rate 3.50 %)');
  must(y1txt.includes('No reserves crisis this year'), 'no crisis vote in year 1');
  await admin.screenshot({ path: OUT + '/a4-run-year1.png', fullPage: true });
  await admin.click('button:has-text("Save and publish all")');
  await admin.waitForTimeout(700);
  s = await api({ action: 'state', pin: pins[byCountry.FRA] });
  must(s.myResults.filter(r => r.phase === 'game').length === 1 && s.myResults.some(r => r.key === 'FRA') && s.union.filter(r => r.phase === 'game').length === 1 && s.union.some(r => r.key === 'UNION'), 'France sees year 1 and the union row');
  must(s.gameResults.every(r => r.key !== 'UNION'), 'union row kept out of the ranking data');
  const u1 = s.union.filter(r => r.phase === 'game')[0].detail.extra;
  must(u1.votes && u1.votes.rate.cut === 4 && u1.votes.rate.outcome === -0.5 && Math.abs(u1.votes.rate.level - 3.5) < 1e-9 && u1.votes.crisis.active === false, 'published union row carries the tally (outcome −0.5, rate 3.5 %)');
  await stu.reload(); await stu.waitForSelector('#app');
  const stuY1 = await stu.textContent('#app');
  must(stuY1.includes('Vote on the central bank’s rate') && stuY1.includes('4 cut · 0 hold · 0 hike') && stuY1.includes('Rate: cut'), 'student page shows the tally in the union panel and the vote chips in everyone’s decisions');

  /* ---- next year + reveal ---- */
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('button:has-text("Next year")');
  await admin.waitForSelector('text=game · year 2');
  await admin.click('label:has-text("year 1") input');
  await admin.waitForTimeout(600);
  await admin.click('#tabs button:has-text("Council")');
  await admin.waitForSelector('text=Pledge');
  const council = await admin.textContent('#view');
  must(council.includes('✗ broken') && council.includes('✓ kept'), 'council table shows kept and broken pledges');
  const rowVerdict = await admin.evaluate(() => { const out = {}; [...document.querySelectorAll('#view tbody tr')].forEach(tr => { const tds = tr.querySelectorAll('td'); if (tds.length === 4) out[tds[0].textContent.trim()] = { pledge: tds[1].textContent, decision: tds[2].textContent, verdict: tds[3].textContent.trim() }; }); return out; });
  must(rowVerdict.France && rowVerdict.France.verdict === '✓ kept' && /Will vote: cut/.test(rowVerdict.France.pledge) && /Rate: cut/.test(rowVerdict.France.decision), 'France announced a cut and voted cut: pledge kept, both votes shown');
  must(rowVerdict.Italy && rowVerdict.Italy.verdict === '✗ broken' && /Will vote: hike/.test(rowVerdict.Italy.pledge), 'Italy announced a hike but voted otherwise: pledge broken');
  must(rowVerdict.Germany && /words only|Public demand/.test(rowVerdict.Germany.pledge) && !/no change/.test(rowVerdict.Germany.pledge), 'a pledge without numbers never shows « no change »');

  /* ---- year 2: replay uses year-1 decisions ---- */
  const shocksNow = (await api({ action: 'admin.overview', key: 'TESTKEY', classId: cid0 })).state.shocks;
  await api({ action: 'admin.state.set', key: 'TESTKEY', classId: cid0, patch: { status: 'open', shocks: Object.assign({}, shocksNow, { 'g2': { world: -25 }, 'g3': { world: -30 } }) } });
  await api({ action: 'submit', pin: pins[byCountry.FRA], phase: 'game', round: 2, payload: { years: [{ levers: { pubdem: 5 }, tariffs: {}, euro: 'none', tfp: 0 }], text: 'France continues its stimulus for a second year.'.padEnd(120, ' .').trim() } });
  await api({ action: 'admin.state.set', key: 'TESTKEY', classId: cid0, patch: { status: 'closed' } });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(900);
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  must((await admin.textContent('#runBtn')).includes('year 2'), 'Run button targets year 2');
  /* elections: France turns left from year 2 (through the console card) */
  await admin.waitForSelector('text=Elections · voters’ preferences from year 2');
  await admin.selectOption('#view .card.tint:has(h3:has-text("Elections")) select', 'FRA');
  await admin.click('button:has-text("Left: unemployment first")');
  await admin.click('button:has-text("Add election")');
  await admin.waitForSelector('.chip.vote:has-text("France · Left")');
  const shE = (await api({ action: 'admin.overview', key: 'TESTKEY', classId: cid0 })).state.shocks;
  must(shE.g2 && shE.g2.world === -25 && Array.isArray(shE.g2.elections) && shE.g2.elections[0].scope === 'FRA' && shE.g2.elections[0].weights.unemp === 0.4 && shE.g2.elections[0].label === 'Left: unemployment first', 'election stored under shocks.g2 next to the world shock');
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  await runClick(admin);
  await admin.waitForSelector('#runPreview table');
  const y2txt = await admin.textContent('#runPreview');
  must(y2txt.includes('Objective weights this year') && y2txt.includes('FRA: U 0.40 · others 0.15'), 'preview lists the weights in force after the election');
  must(y2txt.includes('Preview · year 2'), 'year 2 simulated by replaying year 1 + year 2');
  must(y2txt.includes('0 cut · 1 hold · 0 hike → unchanged') && y2txt.includes('effective rate 2.50 %'), 'year 2: France alone submits (hold) → unchanged, the year-1 cut is permanent (rate 2.50 % once the administrator’s year-1 shock is gone)');
  await admin.click('button:has-text("Save and publish all")');
  await admin.waitForTimeout(700);
  s = await api({ action: 'state', pin: pins[byCountry.FRA] });
  must(s.myResults.filter(r => r.phase === 'game').length === 2 && s.union.filter(r => r.phase === 'game').length === 2, 'France now has two years of results and two union rows');
  const fr2 = s.myResults.filter(r => r.phase === 'game' && r.year === 2)[0];
  must(fr2.detail.weights && fr2.detail.weights.unemp === 0.4 && Math.abs(fr2.R - MS.scoreR(fr2, fr2.detail.weights)) < 0.002 && Math.abs(fr2.R - MS.scoreR(fr2, null)) > 0.01, 'France’s year-2 R is computed with the election weights (R = ' + fr2.R + ')');
  const bd2 = (await api({ action: 'board', classId: cid0 })).gameResults.filter(r => r.key === 'DEU' && r.year === 2)[0];
  must(bd2 && !(bd2.detail && bd2.detail.weights) && Math.abs(bd2.R - MS.scoreR(bd2, null)) < 0.002, 'Germany’s year-2 R keeps the class weights');
  const u2 = s.union.filter(r => r.phase === 'game' && r.year === 2)[0].detail.extra;
  must(u2.alert === true && u2.R > 0, 'the world-demand shock drains the reserves below the alert line at the end of year 2 (R = ' + u2.R + ')');

  /* ---- year 3: the reserves crisis is a round of its own, held before the decisions ---- */
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('button:has-text("Next year")');
  await admin.waitForSelector('text=game · year 3');
  await admin.waitForSelector('text=Reserves crisis · year 3');
  must((await admin.textContent('#view')).includes('ALERT'), 'Control shows the crisis card: the union ended year 2 under alert');
  await admin.click('button:has-text("Open the crisis vote")');
  await admin.waitForSelector('text=Vote in progress');
  let ovC = await api({ action: 'admin.overview', key: 'TESTKEY', classId: cid0 });
  must(ovC.state.crisis['3'] && ovC.state.crisis['3'].status === 'open' && ovC.state.status === 'closed', 'crisis vote open; decisions closed');
  await admin.click('button:has-text("Open submissions")');
  await admin.waitForTimeout(400);
  ovC = await api({ action: 'admin.overview', key: 'TESTKEY', classId: cid0 });
  must(ovC.state.status === 'closed', 'opening the decisions is refused while the crisis vote is open');
  /* students: the vote card replaces the decisions form */
  await stu.reload(); await stu.waitForSelector('#crisisBtn');
  must(!(await stu.$('#submitBtn')) && (await stu.textContent('#form')).includes('Reserves crisis · year 3 — vote'), 'student page shows the crisis vote card instead of the decisions form');
  await stu.screenshot({ path: OUT + '/s3-student-crisis-vote.png', fullPage: true });
  const rejD = await sub(byCountry.DEU, { pubdem: 0 }, 'Germany tries to decide during the crisis vote.', { rate: 'hold' }, 3);
  must(!rejD.ok && /crisis vote is in progress/.test(rejD.error), 'decisions are refused while the crisis vote is open');
  await stu.click('#form input[name="C_vote"][value="austerity"]');
  await stu.click('#crisisBtn');
  await stu.waitForSelector('text=Vote received');
  const cvote = (c, v) => api({ action: 'submit', pin: pins[byCountry[c]], phase: 'crisis', round: 3, payload: { crisis: v } });
  must((await cvote('DEU', 'devaluation')).ok && (await cvote('ITA', 'austerity')).ok, 'Germany votes devaluation, Italy austerity (France austerity from the page; four absent do not countsent)');
  await admin.click('button:has-text("Refresh")');
  await admin.click('#tabs button:has-text("Control")');
  await admin.waitForSelector('text=3 of 7 countries have voted');
  await admin.click('button:has-text("Close the crisis vote and announce")');
  await admin.waitForSelector('text=Vote closed');
  ovC = await api({ action: 'admin.overview', key: 'TESTKEY', classId: cid0 });
  must(ovC.state.crisis['3'].status === 'closed' && ovC.state.crisis['3'].austerity === 2 && ovC.state.crisis['3'].devaluation === 1 && ovC.state.crisis['3'].outcome === 'austerity', 'tally: 1 devaluation of 3 voters (absent = austerity) → austerity');
  await admin.screenshot({ path: OUT + '/a5-control-crisis-closed.png', fullPage: true });
  /* decisions under austerity */
  await admin.click('button:has-text("Open submissions")');
  await admin.waitForSelector('text=Close submissions');
  await stu.reload(); await stu.waitForSelector('#submitBtn');
  const stuY3form = await stu.textContent('#form');
  must(stuY3form.includes('Crisis vote of year 3') && stuY3form.includes('austerity') && (await stu.getAttribute('#form input[name="L_pubdem_0"]', 'max')) === '-5', 'student form announces the austerity programme and caps public demand at −5');
  const rejF = await sub(byCountry.FRA, { pubdem: 5 }, 'France tries to stimulate under austerity.', { rate: 'cut' }, 3);
  must(!rejF.ok && (rejF.errors || []).some(e => /Austerity/.test(e)), 'a stimulus is refused under austerity (' + ((rejF.errors || [])[0] || rejF.error) + ')');
  must((await sub(byCountry.FRA, { pubdem: -5, benefits: -5, inctax: -4 }, 'France complies and cuts income tax instead.', { rate: 'cut' }, 3)).ok, 'France decides within the caps');
  must((await sub(byCountry.DEU, { pubdem: -6, benefits: -5 }, 'Germany: austerity.', { rate: 'hold' }, 3)).ok, 'Germany decides within the caps');
  must((await sub(byCountry.ITA, { pubdem: -5, benefits: -5, vat: 2 }, 'Italy: austerity plus a VAT rise.', { rate: 'hike' }, 3)).ok, 'Italy decides within the caps');
  await api({ action: 'admin.state.set', key: 'TESTKEY', classId: cid0, patch: { status: 'closed' } });
  await api({ action: 'admin.state.set', key: 'TESTKEY', classId: cid0, patch: { shocks: { g3: { world: -30, elections: [{ scope: 'ALL', weights: { gdp: 0.15, unemp: 0.15, infl: 0.15, pubbal: 0.4, tradebal: 0.15 }, label: 'Right: public finances first' }] } } } });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(900);
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  must((await admin.textContent('#runBtn')).includes('year 3'), 'Run button targets year 3');
  await runClick(admin);
  await admin.waitForSelector('#runPreview table');
  const y3a = await admin.textContent('#runPreview');
  must(y3a.includes('Reserves crisis (alert at the end of year 2): 2 austerity · 1 devaluation → austerity'), 'run uses the recorded crisis round: austerity');
  must(!y3a.includes('Devaluation applied'), 'no devaluation under austerity');
  must(y3a.includes('1 cut · 1 hold · 1 hike → unchanged'), 'rate vote of year 3: no majority, unchanged');
  await admin.screenshot({ path: OUT + '/a5-run-year3-austerity.png', fullPage: true });
  /* the administrator reopens the vote: France switches → devaluation wins */
  await admin.click('#tabs button:has-text("Control")');
  await admin.waitForSelector('text=Vote closed');
  await admin.click('button:has-text("Reopen the vote")');
  await admin.waitForSelector('text=Vote in progress');
  must((await cvote('FRA', 'devaluation')).ok, 'France switches to devaluation');
  await admin.click('button:has-text("Refresh")'); await admin.click('#tabs button:has-text("Control")'); await admin.waitForSelector('text=Vote in progress');
  await admin.click('button:has-text("Close the crisis vote and announce")');
  await admin.waitForSelector('text=Vote closed');
  ovC = await api({ action: 'admin.overview', key: 'TESTKEY', classId: cid0 });
  must(ovC.state.crisis['3'].outcome === 'devaluation' && ovC.state.crisis['3'].devaluation === 2, 'reopened vote: 2 devaluation of 3 voters → devaluation');
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  await runClick(admin);
  await admin.waitForSelector('#runPreview table');
  const y3b = await admin.textContent('#runPreview');
  must(y3b.includes('1 austerity · 2 devaluation → devaluation') && y3b.includes('Devaluation applied this year: 10.0 %'), 'run uses the new outcome: 10 % devaluation');
  await admin.screenshot({ path: OUT + '/a6-run-year3-devaluation.png', fullPage: true });
  await admin.click('button:has-text("Save and publish all")');
  await admin.waitForTimeout(700);
  s = await api({ action: 'state', pin: pins[byCountry.FRA] });
  const u3 = s.union.filter(r => r.phase === 'game' && r.year === 3)[0].detail.extra;
  must(Math.abs(u3.xr - 1.1) < 1e-6 && u3.votes.crisis.outcome === 'devaluation' && u3.votes.crisis.active === true && u3.votes.crisis.devaluation === 2, 'published union row: exchange rate 1.100 after the voted devaluation, tally stored');
  await stu.reload(); await stu.waitForSelector('#app');
  const fr3 = s.myResults.filter(r => r.phase === 'game' && r.year === 3)[0];
  const de3 = (await api({ action: 'board', classId: cid0 })).gameResults.filter(r => r.key === 'DEU' && r.year === 3)[0];
  must(fr3.detail.weights.unemp === 0.4 && fr3.detail.weights.pubbal === 0.15 && de3.detail.weights && de3.detail.weights.pubbal === 0.4 && de3.detail.weights.unemp === 0.15, 'year 3: Germany follows the union-wide election, France keeps its own (country beats union)');
  const stuY3 = await stu.textContent('#app');
  must(stuY3.includes('Your objective this year') && stuY3.includes('Left: unemployment first') && stuY3.includes('unemployment rate 0.40'), 'student form shows France’s objective after the election');
  must(stuY3.includes('Reserves crisis · vote') && stuY3.includes('Crisis vote · year 3') && stuY3.includes('France: devaluation'), 'student page: crisis tally in the union panel and each country’s crisis vote with everyone’s decisions');

  /* ---- year 4: reserves exhausted → forced devaluation, no vote ---- */
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('button:has-text("Next year")');
  await admin.waitForSelector('text=game · year 4');
  /* board during an open crisis vote */
  await api({ action: 'admin.state.set', key: 'TESTKEY', classId: cid0, patch: { crisis: Object.assign({}, ovC.state.crisis, { '4': { status: 'open' } }) } });
  const boardC = await ctx.newPage(); boardC.on('pageerror', e => errors.push('board-crisis: ' + e.message));
  await boardC.goto(BASE + '/board.html?class=' + cid0 + '&api=' + encodeURIComponent(API));
  await boardC.waitForSelector('text=Crisis vote · year 4');
  must((await boardC.textContent('#app')).includes('0 of 7 countries have voted'), 'board shows the crisis vote in progress');
  await boardC.screenshot({ path: OUT + '/b2-board-crisis-open.png', fullPage: true }); await boardC.close();
  await api({ action: 'admin.state.set', key: 'TESTKEY', classId: cid0, patch: { crisis: { '4': {} } } });   /* one-level merge: a year is cleared with an empty record */
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(900);
  await admin.click('#tabs button:has-text("Control")');
  await admin.waitForSelector('text=Reserves exhausted');
  await admin.click('button:has-text("Record the forced devaluation")');
  await admin.waitForSelector('text=forced devaluation of 15 % is recorded');
  await api({ action: 'admin.state.set', key: 'TESTKEY', classId: cid0, patch: { status: 'open' } });
  await stu.reload(); await stu.waitForSelector('#submitBtn');
  const stuY4form = await stu.textContent('#form');
  must(!(await stu.$('#crisisBtn')) && stuY4form.includes('Reserves exhausted'), 'student form: no crisis vote once the reserves are exhausted, a forced devaluation is announced');
  await api({ action: 'admin.state.set', key: 'TESTKEY', classId: cid0, patch: { status: 'closed' } });
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  await runClick(admin);
  await admin.waitForSelector('#runPreview table');
  const y4 = await admin.textContent('#runPreview');
  must(y4.includes('Reserves exhausted at the end of year 3 with the current account still in deficit: forced devaluation of 15 %') && y4.includes('Devaluation applied this year: 15.0 %'), 'year 4: reserves exhausted → forced devaluation of 15 %, no vote');
  await admin.screenshot({ path: OUT + '/a7-run-year4-forced.png', fullPage: true });
  /* votes disabled: no tally, the forced devaluation still applies */
  await api({ action: 'admin.state.set', key: 'TESTKEY', classId: cid0, patch: { sim: { votes: false } } });
  await runClick(admin);
  const y4off = await admin.textContent('#runPreview');
  must(y4off.includes('Votes disabled') && !y4off.includes(' cut · ') && y4off.includes('forced devaluation of 15 %'), 'votes disabled: no tally shown, forced devaluation still applied');
  await api({ action: 'admin.state.set', key: 'TESTKEY', classId: cid0, patch: { sim: { votes: true } } });

  /* ---- board ---- */
  const board = await ctx.newPage();
  board.on('pageerror', e => errors.push('board: ' + e.message));
  const cid = JSON.parse(dump.dump.config.classes)[0].id;
  await api({ action: 'admin.state.set', key: 'TESTKEY', classId: cid, patch: { status: 'open', deadlineMinutes: 8, communique: 'Year 4: the reserves are gone — the union devalues by 15 %.' } });
  await board.goto(BASE + '/board.html?class=' + cid + '&api=' + encodeURIComponent(API));
  await board.waitForSelector('text=Ranking');
  await board.waitForSelector('.rank');
  const boardTxt2 = await board.textContent('#app');
  must(boardTxt2.includes('Foreign reserves') && !/MacSim/.test(await board.content()), 'board shows the union panel and no MacSim mention');
  must((await board.$$('.trajgrid svg.traj')).length === 7 && boardTxt2.includes('The objective, year by year'), 'board shows one trajectory chart per country');
  must(!boardTxt2.includes('Monetary union</b>'), 'union is not ranked as a country');
  const lbChk = await board.evaluate(() => [...document.querySelectorAll('.rank')].map(td => { const tds = [...td.parentElement.children]; return parseFloat(tds[tds.length - 2].textContent.replace('−', '-')); }));
  must(boardTxt2.includes('Elections') && boardTxt2.includes('Germany · Right: public finances first — PB 0.40 · others 0.15') && boardTxt2.includes('France · Left: unemployment first — U 0.40 · others 0.15'), 'board lists the weights in force after the elections');
  must(lbChk.length >= 2 && lbChk.every((v, i) => i === 0 || v <= lbChk[i - 1] + 1e-9) && boardTxt2.includes('Cumulative R'), 'board ranking ordered by the cumulative R (' + lbChk.join(' ≥ ') + ')');
  await board.screenshot({ path: OUT + '/b1-board.png', fullPage: true });

  must(boardTxt2.includes('Vote on the central bank’s rate') && boardTxt2.includes('Reserves crisis · vote'), 'board shows the tallies of the last published year');

  /* ---- student page in year 4 ---- */
  await stu.goto(BASE + '/index.html?api=' + encodeURIComponent(API) + '&pin=' + pins[byCountry.FRA]);
  await stu.waitForSelector('#submitBtn');
  const stu3 = await stu.textContent('#app');
  must(stu3.includes('Pledges vs decisions · year 1') && stu3.includes('Foreign reserves') && stu3.includes('public debt'), 'student sees the reveal table, the union panel and the ratios line');
  must((await stu.$$('#form input[type=number]')).length === 4, 'student form has exactly the four OPEN-MU levers');
  await stu.screenshot({ path: OUT + '/s2-student-year4.png', fullPage: true });

  /* ---- export ---- */
  await admin.click('#tabs button:has-text("Export")');
  const [dl] = await Promise.all([admin.waitForEvent('download'), admin.click('button:has-text("Decisions (CSV)")')]);
  const csvPath = OUT + '/decisions.csv'; await dl.saveAs(csvPath);
  const csvTxt = fs.readFileSync(csvPath, 'utf8'); must(csvTxt.split('\n').length >= 8, 'decisions CSV exported (' + (csvTxt.split('\n').length - 1) + ' rows)');

  /* ---- delete the class from the console ---- */
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('button:has-text("Delete class")');
  await admin.waitForSelector('text=No class yet', { timeout: 15000 });
  const after = (await api({ action: '__dump' })).dump;
  must(after.groups.length === 0 && after.tables.decisions.length === 0 && after.tables.results.length === 0 && JSON.parse(after.config.classes).length === 0, 'class deleted from the console: groups, decisions and results gone');
  await browser.close();
  if (errors.length) { console.log('PAGE ERRORS:', errors); process.exit(1); }
  console.log('\nALL GOOD');
})().catch(e => { console.error(e); process.exit(1); });
