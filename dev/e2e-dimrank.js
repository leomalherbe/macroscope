/* End-to-end scenario: the ranking by dimension (desk and board) against the mock backend.
   Three countries, two published years with their split → desk of France: ranks per dimension in the three views (cumulative,
   last year, own policy only), France highlighted with its summary and its priorities; board: the same table; hidden while the
   ranking is not published; French desk. Mock server: PORT env (default 8787). */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:' + (process.env.E2E_PORT || 8787);
const API = BASE + '/api';
const OUT = process.argv[2] || '/tmp/shots-dimrank';
fs.mkdirSync(OUT, { recursive: true });
async function api(params) { const r = await fetch(API, { method: 'POST', body: JSON.stringify(params) }); return r.json(); }
function must(cond, msg) { if (!cond) { throw new Error('ASSERTION FAILED: ' + msg); } console.log('ok -', msg); }
const KEY = 'TESTKEY';

(async () => {
  await api({ action: '__reset' });
  const cid = (await api({ action: 'admin.class.create', key: KEY, name: 'Rank class' })).classId;
  const g = (await api({ action: 'admin.groups.set', key: KEY, classId: cid, groups: [{ name: 'F', country: 'FRA' }, { name: 'D', country: 'DEU' }, { name: 'I', country: 'ITA' }] })).groups;
  const pins = {}; g.forEach(x => { pins[x.country] = x.pin; });
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { phase: 'game', round: 2, status: 'closed', years: 3, strategy: { on: true, minPart: 0 } } });
  /* France: growth and jobs, deficits; Germany: balances; Italy: in between. The split: own policy / foreign / shocks */
  const row = (key, year, v, nat) => ({ key, year, gdp: v[0], unemp: v[1], infl: v[2], pubbal: v[3], tradebal: v[4], published: true,
    detail: { gdp: { nat: nat[0], foreign: v[0] - nat[0], shock: 0 }, unemp: { nat: nat[1], foreign: v[1] - nat[1], shock: 0 }, infl: { nat: 0, foreign: v[2], shock: 0 }, pubbal: { nat: v[3], foreign: 0, shock: 0 }, tradebal: { nat: v[4], foreign: 0, shock: 0 } } });
  await api({ action: 'admin.results.set', key: KEY, classId: cid, phase: 'game', round: 1, rows: [row('FRA', 1, [1.0, -0.5, 0.4, -1.0, -0.6], [0.6, -0.3]), row('DEU', 1, [0.3, -0.1, 0.1, 0.4, 0.5], [0.0, 0.0]), row('ITA', 1, [0.6, -0.3, 0.2, -0.4, -0.1], [0.5, -0.2])] });
  await api({ action: 'admin.results.set', key: KEY, classId: cid, phase: 'game', round: 2, rows: [row('FRA', 2, [1.2, -0.6, 0.5, -1.2, -0.7], [0.7, -0.4]), row('DEU', 2, [0.9, -0.4, 0.1, 0.5, 0.6], [0.1, 0.0]), row('ITA', 2, [0.7, -0.3, 0.3, -0.5, -0.2], [0.6, -0.2])] });
  /* France's decision of year 2 with its priorities (guided strategy) */
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'open' } });
  const S = { shock: { text: '' }, others: { text: '' }, own: { text: '' }, prio: { text: '', up: ['gdp', 'unemp'], down: ['pubbal'] }, project: { text: 'A joint stimulus.' } };
  must((await api({ action: 'submit', pin: pins.FRA, phase: 'game', round: 2, payload: { years: [{ levers: { pubdem: 1 } }], strategy: S } })).ok, 'France′s decision with its priorities');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'closed', publishLeaderboard: false } });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const fra = await ctx.newPage(); fra.on('pageerror', e => errors.push('desk: ' + e.message));
  await fra.goto(BASE + '/desk.html?lang=en&api=' + encodeURIComponent(API) + '&pin=' + pins.FRA);
  await fra.waitForSelector('#strip');
  await fra.waitForTimeout(500);
  must(!(await fra.$('h2:has-text("Ranking by dimension")')), 'hidden while the ranking is not published');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { publishLeaderboard: true } });
  await fra.reload(); await fra.waitForSelector('h2:has-text("Ranking by dimension")');
  const card = '.card:has(h2:has-text("Ranking by dimension"))';
  const cell = async (country, col) => (await fra.textContent(card + ' tr:has(td:first-child:has-text("' + country + '")) td:nth-child(' + col + ') .r')).trim();
  must(await cell('France', 2) === '1st' && await cell('France', 3) === '1st' && await cell('France', 5) === '3rd' && await cell('Germany', 5) === '1st', 'cumulative: France 1st on GDP and unemployment, last on the public balance; Germany 1st on it');
  must(/2\.20 %/.test(await fra.textContent(card + ' tr.me')) , 'cumulative GDP of France: +2.20 %');
  const sum = await fra.textContent(card + ' .sumrk');
  must(/1st on GDP volume, Unemployment rate/.test(sum) && /last on Inflation rate, Public balance, Trade balance/.test(sum) && /Your priorities this year: GDP volume, Unemployment rate/.test(sum) && /accepted to worsen: Public balance/.test(sum), 'summary of France with its priorities');
  await fra.click(card + ' .seg2 span:has-text("Year 2")');
  must(await cell('France', 2) === '1st' && /1\.20 %/.test(await fra.textContent(card + ' tr.me')), 'last year: France′s GDP of year 2 (+1.20 %)');
  await fra.click(card + ' .seg2 span:has-text("Net of the other")');
  must(await cell('France', 2) === '1st' && await cell('Italy', 2) === '2nd' && await cell('Germany', 2) === '3rd' && /1\.30 %/.test(await fra.textContent(card + ' tr.me')) && /0\.10 %/.test(await fra.textContent(card + ' tr:has(td:first-child:has-text("Germany"))')), 'net of the other countries: France +1.30 % of GDP once the others′ policies are taken out, Germany +0.10 %');
  must(/Effect of the others/.test(await fra.textContent(card)) && /\+0\.\d{3}/.test(await fra.textContent(card + ' tr.me td:last-child')) && /Net of the others, you are/.test(await fra.textContent(card + ' .sumrk')), 'net view: effect of the others per country, and the sentence on the desk');
  const rk = '.card:has(h2:text-is("Ranking"))';
  must((await fra.$$(rk + ' .bar.rbar em')).length === 3 && /your play/.test(await fra.textContent(rk + ' .rbarleg')), 'ranking: the bar of cumulative R split into the team′s play and the others′ policies, with its legend');
  await (await fra.$(rk)).screenshot({ path: OUT + '/d0-ranking.png' });
  await fra.screenshot({ path: OUT + '/d1-desk.png', fullPage: true });
  await (await fra.$(card)).screenshot({ path: OUT + '/d1-card.png' });
  await fra.reload(); await fra.waitForSelector(card);
  must(/on/.test(await fra.getAttribute(card + ' .seg2 span:has-text("Net of the other")', 'class')), 'the view chosen is remembered');

  const board = await ctx.newPage(); board.on('pageerror', e => errors.push('board: ' + e.message));
  await board.goto(BASE + '/board.html?class=' + cid + '&api=' + encodeURIComponent(API));
  await board.waitForSelector('h2:has-text("Ranking by dimension")');
  must(!(await board.$(card + ' tr.me')) && !(await board.$(card + ' .sumrk')), 'board: the table, no country highlighted, no summary');
  await (await board.$(card)).screenshot({ path: OUT + '/d2-board.png' });

  const fr = await ctx.newPage(); fr.on('pageerror', e => errors.push('desk FR: ' + e.message));
  await fr.goto(BASE + '/desk.html?lang=fr&api=' + encodeURIComponent(API) + '&pin=' + pins.FRA);
  await fr.waitForSelector('h2:has-text("Classement par dimension")');
  const frt = await fr.textContent('.card:has(h2:has-text("Classement par dimension"))');
  must(/1er/.test(frt) && /Vos priorités cette année/.test(frt), 'French desk: ranking translated');
  await (await fr.$('.card:has(h2:has-text("Classement par dimension"))')).screenshot({ path: OUT + '/d3-desk-fr.png' });

  must(!errors.length, 'no page error' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log('\nE2E DIMRANK OK');
})().catch(e => { console.error(e); process.exit(1); });
