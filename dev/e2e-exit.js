/* End-to-end scenario for leaving the union (spec §12) through the real pages against the mock backend:
   class on model v1.3 → Parameters: leaving allowed → year 1: France announces its exit from its page, the administrator
   adds a deposit run on France → run (announcement shown) → publish (exit recorded in the state) → year 2: council on
   retaliation (opened in Control, votes cast from the members' pages and the API, closed: median outcome) → France's form
   (policy rate, currency, no council vote) → run → publish → France's currency panel, the union panel, everyone's decisions,
   the board → year 3: France pegs and devalues by 5 %. Mock server: PORT env (default 8787). */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:' + (process.env.E2E_PORT || 8787);
const API = BASE + '/api';
const OUT = process.argv[2] || '/tmp/shots-exit';
fs.mkdirSync(OUT, { recursive: true });
async function api(params) { const r = await fetch(API, { method: 'POST', body: JSON.stringify(params) }); return r.json(); }
const runClick = async (pg) => { await pg.click('#runBtn'); await pg.waitForSelector('#runBtn:not([disabled])'); };
function must(cond, msg) { if (!cond) { throw new Error('ASSERTION FAILED: ' + msg); } console.log('ok -', msg); }
const KEY = 'TESTKEY';
const TEXT = 'We announce our decisions for the year and explain them to the council, with the mechanisms we expect to work.';

(async () => {
  await api({ action: '__reset' });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const admin = await ctx.newPage();
  admin.on('pageerror', e => errors.push('admin: ' + e.message));
  admin.on('dialog', d => d.accept(d.type() === 'prompt' ? 'Exit class' : undefined));

  /* class on model v1.3, leaving allowed through Parameters */
  await admin.goto(BASE + '/admin.html?api=' + encodeURIComponent(API));
  await admin.waitForSelector('input[type=password]');
  await admin.fill('input[type=url]', API);
  await admin.fill('input[type=password]', KEY);
  await admin.click('button:has-text("Connect")');
  await admin.waitForSelector('text=No class yet');
  await admin.click('button:has-text("+ New class")');
  await admin.waitForSelector('#statusGrid');
  must(/backend v1\.9/.test(await admin.textContent('#footTime')), 'backend reports v1.9');
  const cid = JSON.parse((await api({ action: '__dump' })).dump.config.classes)[0].id;
  await admin.click('#tabs button:has-text("Groups")');
  await admin.click('button:has-text("Add 7 default groups")');
  await admin.click('button:has-text("Save groups")');
  await admin.waitForFunction(() => document.querySelectorAll('#view tbody tr').length === 7);
  const pins = {}; (await api({ action: '__dump' })).dump.groups.forEach(g => { pins[g.country] = g.pin; });
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('summary:has-text("Parameters")');
  await admin.selectOption('#modelSel', 'v1.3');
  await admin.check('#exitAllowed');
  await admin.click('button:has-text("Save parameters")');
  await admin.waitForTimeout(600);
  let ovw = await api({ action: 'admin.overview', key: KEY, classId: cid });
  must(ovw.state.sim.model === 'v1.3' && ovw.state.sim.exit === true && ovw.state.game.allowEuro === false, 'Parameters: model v1.3, leaving the union allowed (sim.exit), the old euro option off');
  await admin.click('button:has-text("Start the game")');
  await admin.waitForSelector('text=game · year 1');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'open' } });

  /* year 1: France announces its exit from its page */
  const fra = await ctx.newPage();
  fra.on('pageerror', e => errors.push('france: ' + e.message));
  fra.on('dialog', d => d.accept());
  await fra.goto(BASE + '/index.html?api=' + encodeURIComponent(API) + '&pin=' + pins.FRA);
  await fra.waitForSelector('#exitSel');
  must(/Leave the monetary union/.test(await fra.textContent('#form')), 'France′s form offers to leave the union');
  await fra.selectOption('#exitSel', 'leave');
  await fra.fill('#form [name="L_pubdem_0"]', '2');
  await fra.fill('#decisionText', TEXT);
  await fra.click('#form input[name="V_rate"][value="hold"]');
  await fra.screenshot({ path: OUT + '/x-s1-announce.png', fullPage: true });
  await fra.click('#submitBtn');
  await fra.waitForTimeout(800);
  let sF = await api({ action: 'state', pin: pins.FRA });
  must(sF.myDecisions.some(d => d.phase === 'game' && d.round === 1 && d.payload.years[0].euro === 'leave'), 'France′s exit announcement stored with its decisions');
  const sub = (c, y, votes, round) => api({ action: 'submit', pin: pins[c], phase: 'game', round: round, payload: { years: [Object.assign({ levers: {}, tariffs: {}, tfp: 0 }, y)], text: TEXT, votes: votes || { rate: 'hold' } } });
  must((await sub('DEU', { levers: { pubdem: 1 } }, { rate: 'hold' }, 1)).ok, 'Germany submits year 1');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'closed' } });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  must(/Shocks on France/.test(await admin.textContent('#view')) && /announced its exit this year/.test(await admin.textContent('#view')), 'shocks editor: rows for France (exit announced this year)');
  await admin.fill('input[data-y="1"][data-f="exit:FRA:run"]', '1');
  await admin.click('button:has-text("Save shocks")');
  await admin.waitForTimeout(500);
  ovw = await api({ action: 'admin.overview', key: KEY, classId: cid });
  must(ovw.state.shocks.g1.exitShocks && ovw.state.shocks.g1.exitShocks.FRA.run === 1, 'exit shock saved: deposit run of 1 pt of wealth in France, year 1');
  await runClick(admin);
  await admin.waitForSelector('#runPreview table');
  const y1 = await admin.textContent('#runPreview');
  must(/France announces its exit/.test(y1) && /out of the union from year 2/.test(y1), 'year-1 preview: France′s announcement');
  await admin.screenshot({ path: OUT + '/x-a1-run.png', fullPage: true });
  await admin.click('button:has-text("Save and publish all")');
  await admin.waitForTimeout(900);
  ovw = await api({ action: 'admin.overview', key: KEY, classId: cid });
  must(ovw.state.exits && ovw.state.exits.FRA === 2, 'publication records the exit in the class state: France out from year 2');
  sF = await api({ action: 'state', pin: pins.FRA });
  const u1 = sF.union.filter(r => r.phase === 'game' && r.year === 1)[0].detail.extra;
  must(u1.announced && u1.announced[0] === 'FRA' && u1.R < u1.R0 * 0.95, 'union row of year 1: France announced; the deposit run drained the common reserves (' + (100 * u1.R / u1.R0).toFixed(0) + ' % of R0)');

  /* year 2: the council on retaliation */
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('button:has-text("Next year")');
  await admin.waitForSelector('text=game · year 2');
  await admin.waitForSelector('text=Council on retaliation against France');
  await admin.screenshot({ path: OUT + '/x-a2-council-card.png', fullPage: true });
  await admin.click('button:has-text("Open the council on retaliation")');
  await admin.waitForSelector('text=members have voted');
  must((await api({ action: 'admin.overview', key: KEY, classId: cid })).state.retaliation['2'].FRA.status === 'open', 'council on retaliation open');
  const deu = await ctx.newPage();
  deu.on('pageerror', e => errors.push('germany: ' + e.message));
  await deu.goto(BASE + '/index.html?api=' + encodeURIComponent(API) + '&pin=' + pins.DEU);
  await deu.waitForSelector('#retalBtn');
  must(/Council on retaliation against France/.test(await deu.textContent('#form')) && (await deu.$$('#form input[name="R_tariff"]')).length === 4, 'Germany′s page: the council card (tariff 0/5/10/20, sale 0/25/50/100)');
  await deu.click('#form input[name="R_tariff"][value="10"]');
  await deu.click('#form input[name="R_sale"][value="50"]');
  await deu.screenshot({ path: OUT + '/x-s2-council-vote.png', fullPage: true });
  await deu.click('#retalBtn');
  await deu.waitForSelector('text=voted');
  const rv = (c, t, sl) => api({ action: 'submit', pin: pins[c], phase: 'retaliation', round: 2, payload: { target: 'FRA', tariff: t, sale: sl } });
  must((await rv('ITA', 20, 50)).ok && (await rv('ESP', 10, 50)).ok && (await rv('NLD', 10, 50)).ok, 'Italy, Spain, the Netherlands vote');
  must(!(await rv('FRA', 0, 0)).ok, 'France cannot vote on measures against itself');
  await fra.reload(); await fra.waitForSelector('#form');
  must(/remaining members are voting on measures against your country/.test(await fra.textContent('#form')), 'France′s page: the council is deciding, its decisions wait');
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);
  await admin.click('#tabs button:has-text("Control")');
  await admin.waitForSelector('text=4 of 6 members have voted');
  await admin.click('button:has-text("Close the council and announce")');
  await admin.waitForSelector('text=Decided (median');
  const rec = (await api({ action: 'admin.overview', key: KEY, classId: cid })).state.retaliation['2'].FRA;
  must(rec.status === 'closed' && rec.outcome.tariff === 10 && rec.outcome.sale === 50, 'council closed: median of 6 members (2 absent = 0) → tariff 10 %, sale 50 %');

  /* France's form out of the union */
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'open' } });
  await fra.reload(); await fra.waitForSelector('#submitBtn');
  const ff = await fra.textContent('#form');
  must(/is out of the union/.test(ff) && /tariff/.test(ff) && /Policy rate/.test(ff) && /Your currency/.test(ff) && !(await fra.$('#form input[name="V_rate"]')) && !(await fra.$('#exitSel')), 'France′s form: out of the union, measures in force, policy rate, currency block, no council vote, no exit option');
  await fra.fill('#form [name="L_rate_0"]', '-1');
  await fra.selectOption('#fxSel', 'float');
  await fra.fill('#decisionText', TEXT);
  await fra.screenshot({ path: OUT + '/x-s3-out-form.png', fullPage: true });
  await fra.click('#submitBtn');
  await fra.waitForTimeout(800);
  sF = await api({ action: 'state', pin: pins.FRA });
  const d2 = sF.myDecisions.filter(d => d.phase === 'game' && d.round === 2)[0];
  must(d2 && d2.payload.years[0].levers.rate === -1 && d2.payload.years[0].fx === 'float' && !d2.payload.votes.rate, 'France′s year-2 decision: rate −1, floating, no vote');
  must((await sub('DEU', { levers: { pubdem: 1 } }, { rate: 'hold' }, 2)).ok, 'Germany submits year 2');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'closed' } });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  await runClick(admin);
  await admin.waitForSelector('#runPreview table');
  const y2 = await admin.textContent('#runPreview');
  must(/France \(out of the union\): float/.test(y2) && /union tariff 10 %/.test(y2) && /bills sold by the union/.test(y2) && /Out of the union/.test(y2), 'year-2 preview: France floating with the union′s tariff and sale; union panel lists it out');
  await admin.screenshot({ path: OUT + '/x-a3-run-out.png', fullPage: true });
  await admin.click('button:has-text("Save and publish all")');
  await admin.waitForTimeout(900);
  sF = await api({ action: 'state', pin: pins.FRA });
  const x2 = sF.myResults.filter(r => r.phase === 'game' && r.year === 2)[0].detail.extra;
  must(x2.exited && x2.fx > 1.1 && x2.tariff === 10 && x2.sold > 0 && Math.abs(x2.rate - 2) < 1e-9, 'France′s row of year 2: out, currency depreciated by ' + (100 * (x2.fx - 1)).toFixed(1) + ' %, tariff 10 %, bills sold, policy rate 2 %');
  const u2 = sF.union.filter(r => r.phase === 'game' && r.year === 2)[0].detail.extra;
  must(u2.exited[0] === 'FRA' && u2.members.length === 6 && u2.retaliation.FRA.tariff === 10, 'union row of year 2: six members, measures against France stored');
  await fra.reload(); await fra.waitForSelector('#app');
  const fa = await fra.textContent('#app');
  must(/Key indicators · France/.test(fa) && / per €/.test(fa) && /floating ·/.test(fa), 'France′s fact sheet: exchange rate in its currency per euro, floating');
  must(/Your currency/.test(fa) && /Price of one euro in your currency/.test(fa) && /TARGET balance/.test(fa) && /Union tariff on your exports/.test(fa), 'France′s page: currency panel (price of the euro, TARGET, union tariff)');
  await fra.screenshot({ path: OUT + '/x-s4-currency.png', fullPage: true });
  await deu.reload(); await deu.waitForSelector('#app');
  const da = await deu.textContent('#app');
  must(/Out of the union \(own currency\)/.test(da) && /Union measures against France/.test(da) && /Council on retaliation against France · year 2/.test(da) && /Leaves the union/.test(da), 'Germany′s page: union panel (France out, measures), the council′s votes and France′s announcement in everyone′s decisions');

  /* board */
  const board = await ctx.newPage();
  board.on('pageerror', e => errors.push('board: ' + e.message));
  await board.goto(BASE + '/board.html?class=' + cid + '&api=' + encodeURIComponent(API));
  await board.waitForSelector('text=Ranking');
  must(/Out of the union/.test(await board.textContent('#app')), 'board: France out of the union');
  await board.screenshot({ path: OUT + '/x-b1-board.png', fullPage: true });

  /* year 3: France pegs and devalues by 5 % */
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('button:has-text("Next year")');
  await admin.waitForSelector('text=game · year 3');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'open' } });
  must((await sub('FRA', { levers: { rate: 0 }, fx: 'peg', pegChange: 5 }, {}, 3)).ok, 'France pegs to the euro and devalues by 5 % (year 3)');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'closed' } });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);
  must(!/Open the council on retaliation/.test(await admin.textContent('#view')), 'no automatic council the year after the exit (a new one can be convened)');
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  await runClick(admin);
  await admin.waitForSelector('#runPreview table');
  must(/France \(out of the union\): peg/.test(await admin.textContent('#runPreview')), 'year-3 preview: France pegged');
  await admin.click('button:has-text("Save and publish all")');
  await admin.waitForTimeout(900);
  sF = await api({ action: 'state', pin: pins.FRA });
  const x3 = sF.myResults.filter(r => r.phase === 'game' && r.year === 3)[0].detail.extra;
  must(x3.peg && Math.abs(x3.fx / x2.fx - 1.05) < 1e-3, 'France′s row of year 3: peg at the year-2 rate devalued by 5 % (' + x2.fx.toFixed(3) + ' → ' + x3.fx.toFixed(3) + ')');

  must(errors.length === 0, 'no page errors (' + errors.join(' | ') + ')');
  await browser.close();
  console.log('\nEXIT E2E ALL GOOD');
})().catch(e => { console.error(e); process.exit(1); });
