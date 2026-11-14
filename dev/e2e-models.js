/* End-to-end scenario: the two models and the climate option through the real pages against the mock backend.
   New class → v1 · Trade (3 months of reserves) → Parameters: climate option on Trade, leaving the union refused outside Finance
   → a game year with a carbon tax → the union row carries the climate block, the reserves stay those of v1 → Parameters: v2 ·
   Finance + Climate. Mock server: PORT env (default 8787). */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:' + (process.env.E2E_PORT || 8787);
const API = BASE + '/api';
const OUT = process.argv[2] || '/tmp/shots-models';
fs.mkdirSync(OUT, { recursive: true });
async function api(params) { const r = await fetch(API, { method: 'POST', body: JSON.stringify(params) }); return r.json(); }
const runClick = async (pg) => { await pg.click('#runBtn'); await pg.waitForSelector('#runBtn:not([disabled])'); };
function must(cond, msg) { if (!cond) { throw new Error('ASSERTION FAILED: ' + msg); } console.log('ok -', msg); }
const KEY = 'TESTKEY';
const MS = require('../core.js'), OPENMU = require('../engine.js');

(async () => {
  /* engine and core */
  const z = { world: -5, rate: 0, confidence: 0, imports: 0, deval: 0 };
  const sim = id => OPENMU.simulate({ params: OPENMU.paramsFor(id), years: 3, policies: { FRA: [{ pubdem: 5, ctax: 3 }, { pubdem: 5, ctax: 3 }, { pubdem: 5, ctax: 3 }] }, shocks: [z, z, { regime: 'float', flows: -10 }] }).years.map(y => y.countries.FRA.Y + '/' + y.union.R).join(' ');
  must(sim('v2') === sim('v1.3') && sim('v2+climate') === sim('v2.0'), 'engine: v2 = the former v1.3, v2+climate = the former v2.0, to the last digit');
  const p1 = OPENMU.paramsFor('v1'), p12 = OPENMU.paramsFor('v1.2');
  must(p1.reserveMonths === 3 && Object.keys(p1).filter(k => JSON.stringify(p1[k]) !== JSON.stringify(p12[k])).join() === 'reserveMonths', 'engine: v1 = the former v1.2 with 3 months of reserves');
  const lv = sh => OPENMU.report({ params: OPENMU.paramsFor('v2'), years: 2, policies: { ITA: [{ leave: 1 }, {}] }, shocks: [{}, sh] }).years[1].countries.ITA.gdp;
  must(Math.abs(lv({ worldTariff: 10 }) - lv({ worldTariff: 10, worldTariffOut: 10 })) < 1e-12 && Math.abs(lv({ worldTariff: 10 }) - lv({ worldTariff: 10, worldTariffOut: 0 })) > 0.5, 'engine: by default the rest of the world taxes a leaver like the union; worldTariffOut: 0 spares it');
  must(OPENMU.paramsFor('v1+climate').eco === true && OPENMU.paramsFor('v1+climate').capital !== true, 'engine: the climate option on Trade, without capital flows');
  must(MS.engineModel({ sim: { model: 'v1', climate: true } }) === 'v1+climate' && MS.engineModel({ sim: { model: 'v1.2', climate: true } }) === 'v1.2' && MS.modelLabel({ sim: { model: 'v1.3' } }) === 'v2 · Finance' && MS.modelLabel({ sim: { model: 'v2.0' } }) === 'v2 · Finance + Climate', 'core: engine ids and labels, former ids included');
  must(MS.exitModelOk({ sim: { model: 'v2' } }) && !MS.exitModelOk({ sim: { model: 'v1', climate: true } }) && MS.isEcoModel({ sim: { model: 'v1', climate: true } }) && !MS.isEcoModel({ sim: { model: 'v1' } }), 'core: exit in Finance only; climate levers with the option');

  await api({ action: '__reset' });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const admin = await ctx.newPage();
  admin.on('pageerror', e => errors.push('admin: ' + e.message));
  admin.on('dialog', d => d.accept(d.type() === 'prompt' ? 'Models class' : undefined));
  await admin.goto(BASE + '/admin.html?lang=en&api=' + encodeURIComponent(API));
  await admin.waitForSelector('input[type=password]');
  await admin.fill('input[type=url]', API);
  await admin.fill('input[type=password]', KEY);
  await admin.click('button:has-text("Connect")');
  await admin.waitForSelector('text=No class yet');
  await admin.click('button:has-text("+ New class")');
  await admin.waitForSelector('#statusGrid');
  const cid = JSON.parse((await api({ action: '__dump' })).dump.config.classes)[0].id;
  must((await api({ action: 'admin.overview', key: KEY, classId: cid })).state.sim.model === 'v1', 'a new class plays v1 · Trade');
  must(/backend v1\.19/.test(await admin.textContent('#footTime')), 'backend reports v1.19');
  await admin.click('#tabs button:has-text("Groups")');
  await admin.click('button:has-text("Add 7 default groups")');
  await admin.click('button:has-text("Save groups")');
  await admin.waitForSelector('.toast.show:has-text("Groups saved")');
  const pins = {}; (await api({ action: '__dump' })).dump.groups.forEach(g => { pins[g.country] = g.pin; });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);

  /* Parameters: climate option on Trade; leaving the union is refused outside Finance */
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('summary:has-text("Parameters")');
  must(await admin.inputValue('#modelSel') === 'v1' && (await admin.$$('#modelSel option')).length === 2, 'Parameters: v1 · Trade, two models offered');
  await admin.check('#climateOn');
  await admin.check('#exitAllowed');
  await admin.click('button:has-text("Save parameters")');
  await admin.waitForSelector('.toast.show:has-text("leaving the union needs the Finance model")');
  let s = (await api({ action: 'admin.overview', key: KEY, classId: cid })).state;
  must(s.sim.model === 'v1' && s.sim.climate === true && !s.sim.exit && s.warmup.allowed.indexOf('ctax') >= 0 && s.warmup.allowed.indexOf('green') >= 0, 'saved: v1 + climate, exit left off, carbon tax and green investment join the warm-up');
  await admin.screenshot({ path: OUT + '/m1-parameters.png', fullPage: true });

  /* game year 1 with a carbon tax */
  await admin.click('button:has-text("Start the game")');
  await admin.waitForSelector('text=game · year 1');
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  const view = await admin.textContent('#view');
  must(/model v1 · Trade \+ Climate/.test(view) && /reserves 3 months/.test(view), 'engine line: v1 · Trade + Climate, reserves 3 months');
  const rows = await admin.evaluate(() => [...document.querySelectorAll('#view table.resgrid tbody tr td:first-child')].map(td => td.textContent.trim().split('\n')[0]));
  must(rows.some(r => /World emissions/.test(r)) && rows.some(r => /Climate disaster/.test(r)) && !rows.some(r => /Exchange-rate regime/.test(r)), 'shocks editor: the climate rows, no capital-flow rows');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'open' } });
  const sub = await api({ action: 'submit', pin: pins.FRA, phase: 'game', round: 1, payload: { years: [{ levers: { ctax: 5 }, tariffs: {}, euro: 'none', tfp: 0 }], text: 'France taxes carbon.'.padEnd(120, ' .'), votes: { rate: 'hold' } } });
  must(sub.ok, 'a carbon tax is accepted in a Trade + Climate class (' + (sub.errors || []).join('; ') + ')');
  const stu = await ctx.newPage();
  stu.on('pageerror', e => errors.push('student: ' + e.message));
  await stu.goto(BASE + '/desk.html?lang=en&api=' + encodeURIComponent(API) + '&pin=' + pins.DEU);
  await stu.waitForSelector('#form');
  must(/Carbon tax/.test(await stu.textContent('#form')), 'desk: the carbon tax lever is offered');
  /* − / + buttons on every number field (phone keypads often have no minus sign) */
  const nSt = (await stu.$$('#form .stepper')).length, nIn = (await stu.$$('#form input[type=number]')).length;
  await stu.click('#form .stepper .st-btn >> nth=0'); await stu.click('#form .stepper .st-btn >> nth=0');
  const v0 = await stu.inputValue('#form input[type=number] >> nth=0');
  for (let k = 0; k < 30; k++) await stu.click('#form .stepper .st-btn >> nth=1');
  const vMax = await stu.inputValue('#form input[type=number] >> nth=0'), mx = await stu.getAttribute('#form input[type=number] >> nth=0', 'max');
  must(nSt === nIn && nSt >= 6 && v0 === '-1' && Number(vMax) === Number(mx), 'desk: − / + on every field (' + nSt + '), two presses of − give −1, + stops at the bound (' + vMax + ')');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'closed' } });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  await runClick(admin);
  await admin.waitForSelector('#runPreview table');
  await admin.click('button:has-text("Save and publish all")');
  await admin.waitForTimeout(700);
  s = await api({ action: 'state', pin: pins.FRA });
  const u1 = s.union.filter(r => r.phase === 'game' && r.year === 1)[0].detail.extra;
  must(u1.D !== undefined && u1.Erel < 0 && !u1.regime, 'published union row: climate block (emissions below the reference), no capital-flow block');
  const ref = OPENMU.simulate({ params: OPENMU.paramsFor('v1+climate'), years: 1, policies: {}, shocks: [{}] }).years[0].union;
  must(Math.abs(u1.months - ref.months) < 0.2 && u1.months > 2.5, 'reserves of v1: about 3 months of imports (' + u1.months.toFixed(2) + ')');
  await stu.reload(); await stu.waitForSelector('#app');
  must(/Emissions/.test(await stu.textContent('#app')), 'desk: emissions shown');

  /* switch to v2 · Finance + Climate before the next year: exit can now be allowed */
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('summary:has-text("Parameters")');
  await admin.selectOption('#modelSel', 'v2');
  await admin.check('#exitAllowed');
  await admin.click('button:has-text("Save parameters")');
  await admin.waitForSelector('.toast.show:has-text("Parameters saved")');
  s = (await api({ action: 'admin.overview', key: KEY, classId: cid })).state;
  must(s.sim.model === 'v2' && s.sim.climate === true && s.sim.exit === true && MS.engineModel(s) === 'v2+climate', 'Parameters: v2 · Finance + Climate, leaving the union allowed');

  must(errors.length === 0, 'no page errors (' + errors.join(' | ') + ')');
  await browser.close();
  console.log('\nMODELS E2E ALL GOOD');
})().catch(e => { console.error(e); process.exit(1); });
