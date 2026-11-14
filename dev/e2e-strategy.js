/* End-to-end scenario: the guided strategy (five parts with forecasts) through the real pages against the mock backend.
   Class in the game, guided strategy on (Control) → France's desk: five parts, an empty submission is refused part by part →
   France fills the parts, its forecasts and priorities, submits → the justification column carries the five parts as one text →
   a published year 1 (row with its split) → « Your forecasts vs what happened » with the score → year 2: last year's project
   comes back, « kept » needs only a line, « revised » needs a reason → export columns → French desk.
   Mock server: PORT env (default 8787). */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:' + (process.env.E2E_PORT || 8787);
const API = BASE + '/api';
const OUT = process.argv[2] || '/tmp/shots-strategy';
fs.mkdirSync(OUT, { recursive: true });
async function api(params) { const r = await fetch(API, { method: 'POST', body: JSON.stringify(params) }); return r.json(); }
function must(cond, msg) { if (!cond) { throw new Error('ASSERTION FAILED: ' + msg); } console.log('ok -', msg); }
const KEY = 'TESTKEY';
const MS = require('../core.js');

(async () => {
  const wst = MS.mergeState(null, { strategy: { on: true } });
  must(MS.strategyParts('warmup').map(p => p.id).join() === 'shock,own,prio,project' && !MS.validateStrategy(wst, 'warmup', { own: { expect: { gdp: 1 } } }).clean.own.expect, 'core: the warm-up has four parts and no forecasts');
  await api({ action: '__reset' });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const admin = await ctx.newPage();
  admin.on('pageerror', e => errors.push('admin: ' + e.message));
  admin.on('dialog', d => d.accept(d.type() === 'prompt' ? 'Strategy class' : undefined));
  await admin.goto(BASE + '/admin.html?lang=en&api=' + encodeURIComponent(API));
  await admin.waitForSelector('input[type=password]');
  await admin.fill('input[type=url]', API);
  await admin.fill('input[type=password]', KEY);
  await admin.click('button:has-text("Connect")');
  await admin.waitForSelector('text=No class yet');
  await admin.click('button:has-text("+ New class")');
  await admin.waitForSelector('#statusGrid');
  must(/backend v1\.19/.test(await admin.textContent('#footTime')), 'backend reports v1.19');
  const cid = JSON.parse((await api({ action: '__dump' })).dump.config.classes)[0].id;
  await admin.click('#tabs button:has-text("Groups")');
  await admin.click('button:has-text("Add 7 default groups")');
  await admin.click('button:has-text("Save groups")');
  await admin.waitForSelector('.toast.show:has-text("Groups saved")');
  const pins = {}; (await api({ action: '__dump' })).dump.groups.forEach(g => { pins[g.country] = g.pin; });
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { phase: 'game', round: 1, status: 'open', years: 3, communique: 'World demand falls by 2 % this year.' } });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(500);
  await admin.click('#tabs button:has-text("Control")');
  must(!(await admin.isVisible('label:has-text("guided strategy (five parts") input')), 'the guided strategy is no longer in the communication card');
  await admin.click('summary:has-text("Parameters")');
  must(!(await admin.isVisible('label:has-text("forecasts required")')), 'Parameters: its settings show only once it is ticked');
  await admin.check('#strategyOn');
  must(await admin.isVisible('label:has-text("forecasts required")') && await admin.isDisabled('xpath=//label[contains(.,"Min. characters, justification")]/following-sibling::input'), 'Parameters → Game: guided strategy beside the minimum length, which it replaces (greyed)');
  await admin.click('button:has-text("Save parameters")');
  await admin.waitForSelector('.toast.show:has-text("Parameters saved")');
  let s = (await api({ action: 'admin.overview', key: KEY, classId: cid })).state;
  must(s.strategy.on && !s.strategy.gridsRequired && s.strategy.minPart === 30, 'guided strategy on, forecasts optional, 30 characters a part');

  const fra = await ctx.newPage(); fra.on('pageerror', e => errors.push('desk FRA: ' + e.message));
  await fra.goto(BASE + '/desk.html?lang=en&api=' + encodeURIComponent(API) + '&pin=' + pins.FRA);
  await fra.waitForSelector('#strategy');
  must((await fra.$$('#strategy .spart')).length === 5 && !(await fra.$('#decisionText')), 'five parts instead of the free text');
  must(/World demand falls/.test(await fra.textContent('#strategy .spart[data-part="shock"]')), 'the communiqué is recalled in part 1');
  must((await fra.$$('#strategy .spart[data-part="own"] .sind')).length === 5, 'a forecast grid of the five indicators');
  await fra.fill('#form [name="L_pubdem_0"]', '1');
  await fra.click('#submitBtn');
  await fra.waitForSelector('#formErrors .err');
  const errTxt = await fra.textContent('#formErrors');
  must(/The shock and the votes of the year: at least 30/.test(errTxt) && /choose at least one priority/.test(errTxt), 'an empty strategy is refused part by part');
  const fill = (part, t) => fra.fill('#strategy textarea[name="S_' + part + '"]', t);
  await fill('shock', 'The fall of world demand cuts our exports and our growth this year.');
  await fill('others', 'Germany will keep its budget tight; Italy may spend, which helps our exports.');
  await fill('own', 'Public demand +1 % lifts GDP and jobs, and costs the public balance.');
  await fill('prio', 'Jobs first; we accept a wider deficit for a year or two.');
  await fill('project', 'A joint stimulus of the union within two years, then back to balance.');
  const pick = (part, ind, v) => fra.click('#strategy .spart[data-part="' + part + '"] input[name="G_' + part + '_' + ind + '"][value="' + v + '"] + span');
  await pick('shock', 'gdp', -1); await pick('shock', 'tradebal', -1);
  await pick('others', 'gdp', 0);
  await pick('own', 'gdp', 1); await pick('own', 'unemp', -1); await pick('own', 'pubbal', -1);
  await fra.click('#strategy label.schip:has(input[name="SP_up"][value="unemp"])');
  await fra.click('#strategy label.schip:has(input[name="SP_up"][value="gdp"])');
  await fra.click('#strategy label.schip:has(input[name="SP_up"][value="infl"])');
  must((await fra.$$('#strategy input[name="SP_up"]:checked')).length === 2, 'two priorities at most');
  await fra.click('#strategy label.schip:has(input[name="SP_down"][value="pubbal"])');
  await fra.screenshot({ path: OUT + '/s1-desk.png', fullPage: true });
  await fra.click('#submitBtn');
  await fra.waitForSelector('.toast.show:has-text("Decisions submitted")');
  let ov = await api({ action: 'admin.overview', key: KEY, classId: cid });
  const d1 = ov.decisions.filter(d => d.country === 'FRA' && d.phase === 'game')[0];
  must(/^The shock and the votes of the year: The fall/.test(d1.text) && /Our long-term project \(new\)/.test(d1.text) && /first: GDP volume, Unemployment rate; accepted to worsen: Public balance/.test(d1.text), 'the justification column carries the five parts');
  must(d1.payload.strategy.own.expect.gdp === 1 && d1.payload.strategy.shock.expect.tradebal === -1 && d1.payload.strategy.prio.up.join() === 'gdp,unemp', 'forecasts and priorities stored');

  /* year 1 published: France's row with its split (shock / foreign / own policy) */
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'closed' } });
  await api({ action: 'admin.results.set', key: KEY, classId: cid, phase: 'game', round: 1, rows: [{ key: 'FRA', year: 1, gdp: 0.3, unemp: -0.2, infl: 0.1, pubbal: -0.5, tradebal: -0.1, published: true,
    detail: { gdp: { shock: -0.4, foreign: 0.02, nat: 0.68 }, unemp: { shock: 0.1, foreign: 0, nat: -0.3 }, infl: { shock: 0, foreign: 0, nat: 0.1 }, pubbal: { shock: -0.1, foreign: 0, nat: -0.4 }, tradebal: { shock: 0.03, foreign: 0.01, nat: -0.14 } } }] });
  await fra.reload(); await fra.waitForSelector('#forecasts h2');
  const fc = await fra.textContent('#forecasts');
  must(/5 \/ 6 right/.test(fc) && /↓ → ↓/.test(fc) && /↓ → ≈/.test(fc), 'forecasts vs what happened: 5 right out of 6 (the trade balance did not fall with the shock)');
  must(/Diagnosis of the shock\s*87\s*\/ 100/.test(fc) && /Forecast of own policy\s*100\s*\/ 100/.test(fc), 'accuracy over the cells filled in: diagnosis of the shock 87 (the trade-balance arrow missed a tiny rise), forecast of the own policy 100');
  await (await fra.$('#forecasts')).screenshot({ path: OUT + '/s2-forecasts.png' });
  /* the console's table and the board's ranking (published by the administrator) */
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(400);
  await admin.click('#tabs button:has-text("Export")');
  await admin.waitForSelector('h2:has-text("Forecast accuracy")');
  must(/France · Group/.test(await admin.textContent('.card:has(h2:has-text("Forecast accuracy"))')) && /87 · 100/.test(await admin.textContent('.card:has(h2:has-text("Forecast accuracy"))')), 'console: the accuracy of every team, year by year');
  await admin.click('#tabs button:has-text("Control")');
  const boardA = await ctx.newPage(); boardA.on('pageerror', e => errors.push('board: ' + e.message));
  await boardA.goto(BASE + '/board.html?class=' + cid + '&api=' + encodeURIComponent(API)); await boardA.waitForTimeout(1500);
  must(!(await boardA.$('h2:has-text("Best diagnoses")')), 'board: no forecast ranking until the administrator publishes it');
  await admin.click('label:has-text("publish the forecast-accuracy ranking") input');
  await admin.waitForSelector('.toast.show:has-text("Forecast ranking published")');
  await boardA.reload(); await boardA.waitForSelector('h2:has-text("Best diagnoses")');
  must(/France/.test(await boardA.textContent('.card:has(h2:has-text("Best diagnoses"))')) && /94/.test(await boardA.textContent('.card:has(h2:has-text("Best diagnoses"))')), 'board: best diagnoses, France with an average of 94');
  await (await boardA.$('.card:has(h2:has-text("Best diagnoses"))')).screenshot({ path: OUT + '/s4-board-accuracy.png' });

  /* the team download: closed during the game, opened by the administrator at the end */
  must(!(await fra.$('#exportBtn')), 'no team download while the administrator has not allowed it');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { game: { teamExport: true } } });
  await fra.reload(); await fra.waitForSelector('#exportBtn');
  const [dlT] = await Promise.all([fra.waitForEvent('download'), fra.click('#exportBtn')]);
  const teamCsv = fs.readFileSync(await dlT.path(), 'utf8');
  must(/strategy: shock and votes/.test(teamCsv) && /The fall of world demand/.test(teamCsv) && /forecasts right/.test(teamCsv) && /5 \/ 6/.test(teamCsv) && /improve first/.test(teamCsv), 'team CSV: the five parts, the priorities, the forecasts and their score');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { game: { teamExport: false } } });

  /* year 2: the project comes back */
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { round: 2, status: 'open' } });
  await fra.reload(); await fra.waitForSelector('#strategy');
  must(/Your project in year 1/.test(await fra.textContent('#strategy .spart[data-part="project"]')) && (await fra.inputValue('#strategy textarea[name="S_project"]')).startsWith('A joint stimulus') && await fra.isChecked('#strategy input[name="S_project_status"][value="kept"]'), 'year 2: last year′s project comes back, kept by default');
  must(!(await fra.isVisible('#strategy .swhy')), 'no reason asked while kept');
  await fra.click('#strategy label.schip:has(input[name="S_project_status"][value="revised"])');
  must(await fra.isVisible('#strategy .swhy'), 'revising asks why');
  for (const p of ['shock', 'others', 'own', 'prio']) await fill(p, 'Same reading as last year, with a little less stimulus.');
  await fra.click('#strategy label.schip:has(input[name="SP_up"][value="pubbal"])');
  await fra.click('#submitBtn'); await fra.waitForSelector('#formErrors .err');
  must(/say why you revise it/.test(await fra.textContent('#formErrors')), 'a revision needs a reason');
  await fra.fill('#strategy textarea[name="S_project_why"]', 'The deficit rose faster than we thought.');
  await fra.click('#submitBtn'); await fra.waitForSelector('.toast.show:has-text("Decisions submitted")');
  ov = await api({ action: 'admin.overview', key: KEY, classId: cid });
  must(/Our long-term project \(revised: The deficit rose faster/.test(ov.decisions.filter(d => d.country === 'FRA' && d.phase === 'game' && d.round === 2)[0].text), 'the revision and its reason are kept');

  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(400);
  await admin.click('#tabs button:has-text("Export")');
  const [dl] = await Promise.all([admin.waitForEvent('download'), admin.click('button:has-text("Decisions (CSV)")')]);
  const csvTxt = fs.readFileSync(await dl.path(), 'utf8');
  must(/s_shock_expect/.test(csvTxt) && /forecast_hits/.test(csvTxt) && /s_project_status/.test(csvTxt), 'decisions CSV: strategy columns and forecast score');

  const fr = await ctx.newPage(); fr.on('pageerror', e => errors.push('desk FR: ' + e.message));
  await fr.goto(BASE + '/desk.html?lang=fr&api=' + encodeURIComponent(API) + '&pin=' + pins.ITA);
  await fr.waitForSelector('#strategy');
  const frt = await fr.textContent('#strategy');
  must(/Le choc et les votes de l’année/.test(frt) && /Notre projet de long terme/.test(frt), 'French desk: strategy translated');
  await (await fr.$('#strategy')).screenshot({ path: OUT + '/s3-desk-fr.png' });

  must(!errors.length, 'no page error' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log('\nE2E STRATEGY OK');
})().catch(e => { console.error(e); process.exit(1); });
