/* End-to-end scenario: the households option (modest and wealthy households) through the real pages against the mock backend.
   New class → Parameters: v2 · Finance, every option but the climate (leaving the union, tariffs) + households → a game year
   with France's benefits +10 % → the published results are those of the engine with the two household groups.
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

(async () => {
  must(MS.householdsOn({ sim: { model: 'v2', households: true } }) && MS.householdsOn({ sim: { model: 'v1', households: true } }) && !MS.householdsOn({ sim: { model: 'v1.2', households: true } }) && !MS.householdsOn({ sim: { model: 'v2' } }) && !MS.householdsOn({ kind: 'duel', sim: { households: true } }), 'core: households option on Trade or Finance only, off by default and in duels');
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
  const cid = JSON.parse((await api({ action: '__dump' })).dump.config.classes)[0].id;
  await admin.click('#tabs button:has-text("Groups")');
  await admin.click('button:has-text("Add 7 default groups")');
  await admin.click('button:has-text("Save groups")');
  await admin.waitForSelector('.toast.show:has-text("Groups saved")');
  const pins = {}; (await api({ action: '__dump' })).dump.groups.forEach(g => { pins[g.country] = g.pin; });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);

  await admin.click('#tabs button:has-text("Control")');
  await admin.click('summary:has-text("Parameters")');
  must(!(await admin.isChecked('#householdsOn')), 'Parameters: households option off by default');
  await admin.selectOption('#modelSel', 'v2');
  await admin.check('#exitAllowed');
  await admin.check('#tariffsOn');
  await admin.check('#householdsOn');
  await admin.click('button:has-text("Save parameters")');
  await admin.waitForSelector('.toast.show:has-text("Parameters saved")');
  let s = (await api({ action: 'admin.overview', key: KEY, classId: cid })).state;
  must(s.sim.model === 'v2' && s.sim.households === true && s.sim.exit === true && s.sim.tariffs === true && !s.sim.climate, 'saved: v2 · Finance, exit and tariffs, households on, no climate');
  await admin.screenshot({ path: OUT + '/h1-parameters.png', fullPage: true });

  await admin.click('button:has-text("Start the game")');
  await admin.waitForSelector('text=game · year 1');
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  must(/modest and wealthy households/.test(await admin.textContent('#view')), 'engine line: modest and wealthy households');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'open' } });
  const sub = await api({ action: 'submit', pin: pins.FRA, phase: 'game', round: 1, payload: { years: [{ levers: { benefits: 10 }, tariffs: {}, euro: 'none', tfp: 0 }], text: 'France raises benefits.'.padEnd(120, ' .'), votes: { rate: 'hold' } } });
  must(sub.ok, 'France: benefits +10 % accepted (' + (sub.errors || []).join('; ') + ')');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'closed' } });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  await admin.click('#runBtn'); await admin.waitForSelector('#runBtn:not([disabled])');
  await admin.waitForSelector('#runPreview table');
  await admin.click('button:has-text("Save and publish all")');
  await admin.waitForTimeout(700);
  s = await api({ action: 'state', pin: pins.FRA });
  const fr = s.myResults.filter(r => r.phase === 'game' && r.year === 1)[0];
  const pol = { FRA: [{ benefits: 10 }] };
  const hh = OPENMU.report({ params: Object.assign(OPENMU.paramsFor('v2'), OPENMU.HOUSEHOLDS), years: 1, policies: pol }).years[0].countries.FRA.gdp;
  const one = OPENMU.report({ params: OPENMU.paramsFor('v2'), years: 1, policies: pol }).years[0].countries.FRA.gdp;
  must(Math.abs(fr.gdp - hh) < 0.01 && Math.abs(fr.gdp - one) > 0.1, 'published French GDP ' + fr.gdp.toFixed(2) + ' % = the engine with two household groups (' + hh.toFixed(2) + '), not one sector (' + one.toFixed(2) + ')');

  /* French console */
  await admin.goto(BASE + '/admin.html?lang=fr&api=' + encodeURIComponent(API));
  await admin.waitForSelector('#tabs button:has-text("Simulation")');   // still connected: the key is remembered
  await admin.click('#tabs button:has-text("Simulation")'); await admin.waitForSelector('#runBtn');
  const simFr = await admin.textContent('#view');
  await admin.click('#tabs button:has-text("Pilotage")'); await admin.click('summary:has-text("Paramètres")');
  const ctlFr = await admin.textContent('#view'), tip = await admin.getAttribute('label:has(#householdsOn)', 'title');
  await admin.screenshot({ path: OUT + '/h2-parametres.png', fullPage: true });
  must(/ménages modestes et aisés/.test(simFr) && /option Ménages \(ménages modestes et aisés\)/.test(ctlFr) && /^Deux groupes de ménages/.test(tip || ''), 'French console: engine line, checkbox and its tooltip translated');
  must(errors.length === 0, 'no page errors (' + errors.join(' | ') + ')');
  await browser.close();
  console.log('\nHOUSEHOLDS E2E ALL GOOD');
})().catch(e => { console.error(e); process.exit(1); });
