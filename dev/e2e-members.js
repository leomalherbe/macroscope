/* Union size (spec §14): the countries of the groups make the union, fixed once year 1 has been run.
   Class with four groups (Germany, France, Italy, Spain) → union of 4 → warm-up country follows → year 1 run on 4 members
   → board → adding a fifth country is refused, renaming a group is not. Mock server: PORT env (default 8787). */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:' + (process.env.E2E_PORT || 8787);
const API = BASE + '/api';
const OUT = process.argv[2] || '/tmp/shots-members';
fs.mkdirSync(OUT, { recursive: true });
async function api(params) { const r = await fetch(API, { method: 'POST', body: JSON.stringify(params) }); return r.json(); }
function must(cond, msg) { if (!cond) { throw new Error('ASSERTION FAILED: ' + msg); } console.log('ok -', msg); }
const KEY = 'TESTKEY', TEXT = 'We explain our decisions to the council: the mechanisms we expect to work this year, and what we expect from our partners.';

(async () => {
  await api({ action: '__reset' });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const admin = await ctx.newPage();
  admin.on('pageerror', e => errors.push('admin: ' + e.message));
  admin.on('dialog', d => d.accept(d.type() === 'prompt' ? 'Small union' : undefined));
  await admin.goto(BASE + '/admin.html?api=' + encodeURIComponent(API));
  await admin.waitForSelector('input[type=password]');
  await admin.fill('input[type=url]', API);
  await admin.fill('input[type=password]', KEY);
  await admin.click('button:has-text("Connect")');
  await admin.waitForSelector('text=No class yet');
  await admin.click('button:has-text("+ New class")');
  await admin.waitForSelector('#statusGrid');
  const cid = JSON.parse((await api({ action: '__dump' })).dump.config.classes)[0].id;
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { warmup: { country: 'NLD' } } });

  /* four groups, countries chosen in the Groups tab */
  await admin.click('#tabs button:has-text("Groups")');
  await admin.waitForSelector('#unionNote');
  must(/7 members/.test(await admin.textContent('#unionNote')), 'a new class starts with the seven');
  const countries = ['FRA', 'ITA', 'ESP', 'DEU'];
  for (let i = 0; i < countries.length; i++) await admin.click('button:has-text("+ Add a group")');
  const rows = await admin.$$('#view tbody tr');
  for (let i = 0; i < countries.length; i++) {
    await (await rows[i].$('input[type=text]')).fill('Team ' + (i + 1));
    await (await rows[i].$('select')).selectOption(countries[i]);
  }
  await admin.click('button:has-text("Save groups")');
  await admin.waitForTimeout(900);
  let ov = await api({ action: 'admin.overview', key: KEY, classId: cid });
  must(JSON.stringify(ov.state.sim.members) === JSON.stringify(['DEU', 'FRA', 'ITA', 'ESP']) && ov.groups.length === 4 && ov.groups.every(g => /^\d{4}$/.test(String(g.pin))), 'Save groups: four PINs, the union = Germany, France, Italy, Spain (in the fixed order)');
  must(ov.state.warmup.country === 'DEU', 'the warm-up country (the Netherlands, not in the union) moved to Germany');
  await admin.waitForSelector('#unionNote');
  must(/4 members/.test(await admin.textContent('#unionNote')), 'Groups tab: « The union of this class: 4 members »');
  await admin.screenshot({ path: OUT + '/m-a1-groups.png', fullPage: true });
  const pins = {}; ov.groups.forEach(g => { pins[g.country] = g.pin; });

  /* the members can be changed again before year 1: Spain out, Netherlands in */
  const rows2 = await admin.$$('#view tbody tr');
  for (const r of rows2) { const sel = await r.$('select'); if (await sel.inputValue() === 'ESP') await sel.selectOption('NLD'); }
  await admin.click('button:has-text("Save groups")'); await admin.waitForTimeout(900);
  ov = await api({ action: 'admin.overview', key: KEY, classId: cid });
  must(JSON.stringify(ov.state.sim.members) === JSON.stringify(['DEU', 'FRA', 'ITA', 'NLD']), 'before year 1 the union follows the groups (Spain → Netherlands)');
  ov.groups.forEach(g => { pins[g.country] = g.pin; });

  /* year 1 of the game */
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('button:has-text("Start the game")');
  await admin.waitForSelector('text=game · year 1');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'open' } });
  for (const c of ['DEU', 'FRA', 'ITA', 'NLD']) must((await api({ action: 'submit', pin: pins[c], phase: 'game', round: 1, payload: { years: [{ levers: c === 'FRA' ? { pubdem: 5 } : {} }], text: TEXT, votes: { rate: 'hold' } } })).ok, c + ' submits year 1');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'closed' } });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(600);
  await admin.click('#tabs button:has-text("Run")');
  await admin.waitForSelector('#runBtn');
  must(/· 4 members ·/.test(await admin.textContent('#view')), 'Run tab: the engine line says 4 members');
  await admin.click('#runBtn'); await admin.waitForSelector('#runBtn:not([disabled])');
  await admin.waitForSelector('#runPreview table');
  await admin.click('button:has-text("Save and publish all")');
  await admin.waitForTimeout(900);
  const sF = await api({ action: 'state', pin: pins.FRA });
  const fr = sF.myResults.filter(r => r.year === 1)[0];
  must(fr && fr.gdp > 1 && sF.gameResults.length === 4, 'year 1 run on the four members (France GDP ' + fr.gdp.toFixed(2) + ' %), four rows published');

  /* the union is now fixed */
  await admin.click('#tabs button:has-text("Groups")');
  await admin.waitForSelector('#unionNote');
  must(/Fixed since the first game year was run/.test(await admin.textContent('#unionNote')), 'Groups tab: the union is fixed');
  await admin.click('button:has-text("+ Add a group")');
  const last = (await admin.$$('#view tbody tr')).pop();
  await (await last.$('input[type=text]')).fill('Late team');
  await (await last.$('select')).selectOption('ESP');
  await admin.click('button:has-text("Save groups")'); await admin.waitForTimeout(900);
  ov = await api({ action: 'admin.overview', key: KEY, classId: cid });
  must(ov.groups.length === 4 && JSON.stringify(ov.state.sim.members) === JSON.stringify(['DEU', 'FRA', 'ITA', 'NLD']), 'after year 1, a fifth country is refused (groups and union unchanged)');
  await admin.click('#tabs button:has-text("Groups")');
  await admin.waitForSelector('#unionNote');
  const firstName = await (await admin.$$('#view tbody tr'))[0].$('input[type=text]');
  await firstName.fill('Renamed team');
  await admin.click('button:has-text("Save groups")'); await admin.waitForTimeout(900);
  ov = await api({ action: 'admin.overview', key: KEY, classId: cid });
  must(ov.groups.some(g => g.name === 'Renamed team') && ov.groups.length === 4, 'renaming a group is still allowed');

  /* board: four countries */
  const board = await ctx.newPage();
  board.on('pageerror', e => errors.push('board: ' + e.message));
  await board.goto(BASE + '/board.html?class=' + cid + '&api=' + encodeURIComponent(API));
  await board.waitForSelector('table.facttable');
  must((await board.$$('table.facttable tbody tr')).length === 4 && (await board.$$('svg.race polyline')).length === 0 && (await board.$$('svg.race circle')).length === 4, 'board: four countries in the key indicators and the race');
  await board.screenshot({ path: OUT + '/m-b1-board.png', fullPage: true });

  must(errors.length === 0, 'no page errors (' + errors.join(' | ') + ')');
  await browser.close();
  console.log('\nMEMBERS E2E ALL GOOD');
})().catch(e => { console.error(e); process.exit(1); });
