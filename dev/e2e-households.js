/* End-to-end scenario: the households option (modest and wealthy households) and its inequality indicator through the real
   pages against the mock backend.
   New class → Parameters: v2 · Finance, every option but the climate (leaving the union, tariffs) + households; the
   « Inequality » weight appears and is set to 0.2 → game year 1: the desk shows the rule and the guide card; France raises
   benefits by 10 % → the published row carries inequality (benefits lower it) and R counts it with the class weight → the
   desk (results column, fact sheet), the board, the « Equality » election preset; French pages.
   Mock server: PORT env (default 8787). */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:' + (process.env.E2E_PORT || 8787);
const API = BASE + '/api';
const OUT = process.argv[2] || '/tmp/shots-households';
fs.mkdirSync(OUT, { recursive: true });
async function api(params) { const r = await fetch(API, { method: 'POST', body: JSON.stringify(params) }); return r.json(); }
function must(cond, msg) { if (!cond) { throw new Error('ASSERTION FAILED: ' + msg); } console.log('ok -', msg); }
const KEY = 'TESTKEY';
const MS = require('../core.js'), OPENMU = require('../engine.js');
const INEQ_W = 'div:has(> label:text-is("− Inequality")) > input';

(async () => {
  must(MS.householdsOn({ sim: { model: 'v2', households: true } }) && MS.householdsOn({ sim: { model: 'v1', households: true } }) && !MS.householdsOn({ sim: { model: 'v1.2', households: true } }) && !MS.householdsOn({ sim: { model: 'v2' } }) && !MS.householdsOn({ kind: 'duel', sim: { households: true } }), 'core: households option on Trade or Finance only, off by default and in duels');
  must(MS.indicatorsFor({ sim: { model: 'v2', households: true } }).map(i => i.id).join() === 'gdp,unemp,infl,pubbal,tradebal,ineq' && MS.indicatorsFor({ sim: { model: 'v2' } }).length === 5 && MS.indicatorsFor({ sim: { model: 'v2', households: true, climate: true } }).length === 7 && MS.defaultState().weights.ineq === 0,
    'core: inequality is a dimension of the objective with the households option only (weight 0 by default)');
  await api({ action: '__reset' });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const admin = await ctx.newPage();
  admin.on('pageerror', e => errors.push('admin: ' + e.message));
  admin.on('dialog', d => d.accept(d.type() === 'prompt' ? 'Households class' : undefined));
  await admin.goto(BASE + '/admin.html?lang=en&api=' + encodeURIComponent(API));
  await admin.waitForSelector('input[type=password]');
  await admin.fill('input[type=url]', API);
  await admin.fill('input[type=password]', KEY);
  await admin.click('button:has-text("Connect")');
  await admin.waitForSelector('text=No class yet');
  await admin.click('button:has-text("+ New class")');
  await admin.waitForSelector('#statusGrid');
  must(/backend v1\.18/.test(await admin.textContent('#footTime')), 'backend reports v1.18');
  const cid = JSON.parse((await api({ action: '__dump' })).dump.config.classes)[0].id;
  await admin.click('#tabs button:has-text("Groups")');
  await admin.click('button:has-text("Add 7 default groups")');
  await admin.click('button:has-text("Save groups")');
  await admin.waitForSelector('.toast.show:has-text("Groups saved")');
  const pins = {}; (await api({ action: '__dump' })).dump.groups.forEach(g => { pins[g.country] = g.pin; });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);

  /* Parameters: v2 · Finance, exit, tariffs, households */
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('summary:has-text("Parameters")');
  must(!(await admin.isChecked('#householdsOn')) && !(await admin.$(INEQ_W)), 'Parameters: households option off by default, no inequality weight');
  await admin.selectOption('#modelSel', 'v2');
  await admin.check('#exitAllowed');
  await admin.check('#tariffsOn');
  await admin.check('#householdsOn');
  await admin.click('button:has-text("Save parameters")');
  await admin.waitForSelector('.toast.show:has-text("Parameters saved")');
  let s = (await api({ action: 'admin.overview', key: KEY, classId: cid })).state;
  must(s.sim.model === 'v2' && s.sim.households === true && s.sim.exit === true && s.sim.tariffs === true && !s.sim.climate, 'saved: v2 · Finance, exit and tariffs, households on, no climate');
  /* the seventh weight: inequality, set to 0.2 */
  await admin.waitForTimeout(300);
  if (!(await admin.isVisible(INEQ_W))) await admin.click('summary:has-text("Parameters")');
  must(await admin.inputValue(INEQ_W) === '0' && /Inequality \(households option\) also counts negatively/.test(await admin.textContent('#view')), 'Parameters: the « Inequality » weight appears (0), with its explanation');
  await admin.fill(INEQ_W, '0.2');
  await admin.click('button:has-text("Save parameters")');
  await admin.waitForSelector('.toast.show:has-text("Parameters saved")');
  s = (await api({ action: 'admin.overview', key: KEY, classId: cid })).state;
  must(s.weights.ineq === 0.2 && s.weights.gdp === 0.2, 'inequality weight 0.2 saved with the five others');
  await admin.screenshot({ path: OUT + '/h1-parameters.png', fullPage: true });

  /* game year 1 */
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('button:has-text("Start the game")');
  await admin.waitForSelector('text=game · year 1');
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  must(/modest and wealthy households/.test(await admin.textContent('#view')), 'engine line: modest and wealthy households');
  must(await admin.isVisible('button:has-text("Equality: inequality first")') && !(await admin.isVisible('button:has-text("Green: emissions first")')), 'elections: the « Equality » preset is offered (not « Green », no climate)');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'open' } });

  /* the desk of a member: the rule and the guide card */
  const stu = await ctx.newPage();
  stu.on('pageerror', e => errors.push('student: ' + e.message));
  await stu.goto(BASE + '/desk.html?lang=en&api=' + encodeURIComponent(API) + '&pin=' + pins.DEU);
  await stu.waitForSelector('#form');
  must(/two halves of the population/.test(await stu.textContent('#app')), 'desk: the rule on the two halves and inequality');
  await stu.click('#guideBtn'); await stu.waitForSelector('#guidePanel:not([hidden])');
  const cards = await stu.$$eval('#guidePanel details.gcard', ds => ds.map(d => d.getAttribute('data-card')));
  must(cards.indexOf('households') > cards.indexOf('debt') && cards.indexOf('climate') < 0, 'guide: the households card is listed (no climate card)');
  await stu.click('#guidePanel details.gcard[data-card="households"] summary'); await stu.waitForTimeout(150);
  must(/Modest and wealthy households/.test(await stu.textContent('#guidePanel')), 'guide: households card opens');
  await stu.click('#guidePanel .gp-close');
  must((await stu.$$('[data-guide~="households"] .gi[data-card="households"]')).length >= 2, 'desk: an ⓘ next to benefits and income tax opens the households card');

  const sub = await api({ action: 'submit', pin: pins.FRA, phase: 'game', round: 1, payload: { years: [{ levers: { benefits: 10 }, tariffs: {}, euro: 'none', tfp: 0 }], text: 'France raises benefits.'.padEnd(120, ' .'), votes: { rate: 'hold' } } });
  must(sub.ok, 'France: benefits +10 % accepted (' + (sub.errors || []).join('; ') + ')');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'closed' } });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  await admin.click('#runBtn'); await admin.waitForSelector('#runBtn:not([disabled])');
  await admin.waitForSelector('#runPreview table');
  must(/Ineq\. \(pt\)/.test(await admin.textContent('#runPreview')), 'run preview: an inequality column');
  await admin.click('button:has-text("Save and publish all")');
  await admin.waitForTimeout(700);
  s = await api({ action: 'state', pin: pins.FRA });
  const fr = s.myResults.filter(r => r.phase === 'game' && r.year === 1)[0];
  const pol = { FRA: [{ benefits: 10 }] };
  const rep = OPENMU.report({ params: Object.assign(OPENMU.paramsFor('v2'), OPENMU.HOUSEHOLDS), years: 1, policies: pol }).years[0].countries.FRA;
  const one = OPENMU.report({ params: OPENMU.paramsFor('v2'), years: 1, policies: pol }).years[0].countries.FRA.gdp;
  must(Math.abs(fr.gdp - rep.gdp) < 0.01 && Math.abs(fr.gdp - one) > 0.1, 'published French GDP ' + fr.gdp.toFixed(2) + ' % = the engine with two household groups (' + rep.gdp.toFixed(2) + '), not one sector (' + one.toFixed(2) + ')');
  must(Math.abs(Number(fr.ineq) - rep.ineq) < 0.001 && Number(fr.ineq) < -0.5 && Math.abs(fr.detail.ineq.nat - rep.ineq) < 0.001, 'published French inequality ' + Number(fr.ineq).toFixed(3) + ' pt (benefits lower it), all of it own policy');
  const R5 = MS.scoreR(Object.assign({}, fr, { ineq: '' }), s.state.weights);
  must(Math.abs(fr.R - MS.scoreR(fr, s.state.weights)) < 0.001 && Math.abs(fr.R - R5 - (-0.2 * Number(fr.ineq))) < 0.002, 'R counts inequality with its weight: ' + fr.R + ' (' + MS.fmt(fr.R - R5, 3, true) + ' from inequality)');

  /* the desk of France: results column, fact sheet */
  await stu.goto(BASE + '/desk.html?lang=en&api=' + encodeURIComponent(API) + '&pin=' + pins.FRA);
  await stu.waitForSelector('.fact[data-key="ineq"]');
  const app = await stu.textContent('#app'), tile = (await stu.textContent('.fact[data-key="ineq"]')).replace(/\s+/g, ' ').trim();
  must(/Inequality/.test(app) && /5[34]\.\d/.test(tile), 'desk: inequality in the results table and the fact sheet (' + tile + ')');
  await stu.screenshot({ path: OUT + '/h2-desk.png', fullPage: true });

  /* the board */
  const board = await ctx.newPage();
  board.on('pageerror', e => errors.push('board: ' + e.message));
  await board.goto(BASE + '/board.html?class=' + cid + '&api=' + encodeURIComponent(API));
  await board.waitForTimeout(1500);
  must(/Inequality/.test(await board.textContent('body')), 'board: inequality shown');
  await board.screenshot({ path: OUT + '/h3-board.png', fullPage: true });

  /* French pages */
  await stu.goto(BASE + '/desk.html?lang=fr&api=' + encodeURIComponent(API) + '&pin=' + pins.FRA);
  await stu.waitForSelector('.fact[data-key="ineq"]'); await stu.waitForTimeout(300);
  const appFr = await stu.textContent('#app');
  must(/Inégalités/.test(appFr) && !/Inequality/.test(appFr), 'French desk: « Inégalités », no English left for it');
  await stu.click('#guideBtn'); await stu.waitForSelector('#guidePanel:not([hidden])');
  must(/Ménages modestes et aisés\s:\squi reçoit quoi/.test(await stu.textContent('#guidePanel')), 'French guide: the households card');
  await stu.screenshot({ path: OUT + '/h5-desk-fr.png', fullPage: true });
  await admin.goto(BASE + '/admin.html?lang=fr&api=' + encodeURIComponent(API));
  await admin.waitForSelector('#tabs button:has-text("Simulation")');
  await admin.click('#tabs button:has-text("Simulation")'); await admin.waitForSelector('#runBtn');
  const simFr = await admin.textContent('#view');
  must(/ménages modestes et aisés/.test(simFr) && /Égalité\s:\sles inégalités d’abord/.test(simFr), 'French console: engine line and the « Égalité » preset');
  await admin.click('#tabs button:has-text("Pilotage")'); await admin.click('summary:has-text("Paramètres")');
  const ctlFr = await admin.textContent('#view'), tip = await admin.getAttribute('label:has(#householdsOn)', 'title');
  await admin.screenshot({ path: OUT + '/h4-parametres.png', fullPage: true });
  must(/option Ménages \(ménages modestes et aisés\)/.test(ctlFr) && /^Deux groupes de ménages/.test(tip || '') && /Inégalités/.test(ctlFr) && /Les inégalités \(option Ménages\)/.test(ctlFr), 'French console: checkbox, tooltip, inequality weight and its explanation translated');
  must(errors.length === 0, 'no page errors (' + errors.join(' | ') + ')');
  await browser.close();
  console.log('\nHOUSEHOLDS E2E ALL GOOD');
})().catch(e => { console.error(e); process.exit(1); });
