/* End-to-end scenario: the desk's discretionary budget balance (spec §26). Warm-up: one line per year of the plan, updated as the
   levers move → game year 2: public demand +10 = −2.0 % of GDP, expansionary; income tax +10 on top → restrictive; last year's
   figure; the stepper buttons update it → French desk. Mock server: E2E_PORT env (default 8787). */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:' + (process.env.E2E_PORT || 8787);
const API = BASE + '/api';
const OUT = process.argv[2] || '/tmp/shots-budget';
fs.mkdirSync(OUT, { recursive: true });
async function api(params) { const r = await fetch(API, { method: 'POST', body: JSON.stringify(params) }); return r.json(); }
function must(cond, msg) { if (!cond) { throw new Error('ASSERTION FAILED: ' + msg); } console.log('ok -', msg); }
const KEY = 'TESTKEY';

(async () => {
  await api({ action: '__reset' });
  const cid = (await api({ action: 'admin.class.create', key: KEY, name: 'Budget class' })).classId;
  const gr = await api({ action: 'admin.groups.set', key: KEY, classId: cid, groups: [{ name: 'F', country: 'FRA' }, { name: 'D', country: 'DEU' }] });
  const pF = gr.groups[0].pin;
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { phase: 'warmup', round: 1, status: 'open', sim: { model: 'v2' } } });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const desk = async (lang) => { const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.goto(BASE + '/desk.html?lang=' + lang + '&api=' + encodeURIComponent(API) + '&pin=' + pF); await p.waitForSelector('#budgetBox .brow'); return p; };
  const box = (p) => p.textContent('#budgetBox');
  let d = await desk('en');
  must((await d.$$('#budgetBox .brow')).length === 3 && /0\.0 % of GDP neutral/.test(await box(d)), 'warm-up: one line per year, neutral at first');
  await d.fill('[name="L_pubdem_1"]', '5'); await d.dispatchEvent('[name="L_pubdem_1"]', 'input');
  const rows = await d.$$eval('#budgetBox .brow', r => r.map(x => x.textContent));
  must(/0\.0 % of GDP/.test(rows[0]) && /−1\.0 % of GDP expansionary/.test(rows[1]) && /public demand −1\.0/.test(rows[1]), 'warm-up year 2: public demand +5 → −1.0 % of GDP, expansionary');

  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { phase: 'game', round: 1, status: 'open', years: 3 } });
  await api({ action: 'submit', pin: pF, phase: 'game', round: 1, payload: { years: [{ levers: { benefits: 4 } }], text: 'x'.repeat(130) } });
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { round: 2, status: 'open' } });
  await d.reload(); await d.waitForSelector('#budgetBox .brow');
  await d.fill('[name="L_pubdem_0"]', '10'); await d.dispatchEvent('[name="L_pubdem_0"]', 'input');
  let t = await box(d);
  must(/−2\.0 % of GDP expansionary/.test(t) && /last year: −0\.6/.test(t), 'game: public demand +10 → −2.0 % of GDP, expansionary; last year −0.6 (benefits +4)');
  await d.fill('[name="L_inctax_0"]', '10'); await d.dispatchEvent('[name="L_inctax_0"]', 'input');
  t = await box(d);
  must(/\+1\.1 % of GDP restrictive/.test(t) && /income tax \+3\.1/.test(t), 'income tax +10 on top → +1.1 % of GDP, restrictive');
  await d.click('#form tr:has([name="L_pubdem_0"]) .st-btn[aria-label="decrease"]');
  must(/public demand −1\.9/.test(await box(d)) && /\+1\.2 % of GDP/.test(await box(d)), 'the stepper buttons update it (public demand 9.5)');
  await (await d.$('#budgetBox')).screenshot({ path: OUT + '/b1-en.png' });
  const fr = await desk('fr');
  await fr.fill('[name="L_pubdem_0"]', '10'); await fr.dispatchEvent('[name="L_pubdem_0"]', 'input');
  const tf = await box(fr);
  must(/Solde budgétaire discrétionnaire/.test(tf) && /−2,0 % du PIB/.test(tf) && /expansionniste/.test(tf) && /demande publique −2,0/.test(tf), 'French desk');
  await (await fr.$('#budgetBox')).screenshot({ path: OUT + '/b2-fr.png' });
  must(!errors.length, 'no page error' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log('\nE2E BUDGET OK');
})().catch(e => { console.error(e); process.exit(1); });
