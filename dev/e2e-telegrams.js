/* End-to-end scenario: diplomatic telegrams through the real pages against the mock backend.
   Class in the game → the administrator turns telegrams on (Control), the office is closed: no composer → opens it →
   France writes to Germany twice and to Italy once (quota 3) → Germany reads its 2 telegrams (new, then marked as read),
   Italy only its own, nothing on the board → the administrator reads everything, hides one (Council), exports → French desk.
   Mock server: PORT env (default 8787). */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:' + (process.env.E2E_PORT || 8787);
const API = BASE + '/api';
const OUT = process.argv[2] || '/tmp/shots-telegrams';
fs.mkdirSync(OUT, { recursive: true });
async function api(params) { const r = await fetch(API, { method: 'POST', body: JSON.stringify(params) }); return r.json(); }
function must(cond, msg) { if (!cond) { throw new Error('ASSERTION FAILED: ' + msg); } console.log('ok -', msg); }
const KEY = 'TESTKEY';

(async () => {
  await api({ action: '__reset' });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const admin = await ctx.newPage();
  admin.on('pageerror', e => errors.push('admin: ' + e.message));
  admin.on('dialog', d => d.accept(d.type() === 'prompt' ? 'Telegram class' : undefined));
  await admin.goto(BASE + '/admin.html?lang=en&api=' + encodeURIComponent(API));
  await admin.waitForSelector('input[type=password]');
  await admin.fill('input[type=url]', API);
  await admin.fill('input[type=password]', KEY);
  await admin.click('button:has-text("Connect")');
  await admin.waitForSelector('text=No class yet');
  await admin.click('button:has-text("+ New class")');
  await admin.waitForSelector('#statusGrid');
  must(/backend v1\.17/.test(await admin.textContent('#footTime')), 'backend reports v1.17');
  const cid = JSON.parse((await api({ action: '__dump' })).dump.config.classes)[0].id;
  await admin.click('#tabs button:has-text("Groups")');
  await admin.click('button:has-text("Add 7 default groups")');
  await admin.click('button:has-text("Save groups")');
  await admin.waitForSelector('.toast.show:has-text("Groups saved")');
  const pins = {}; (await api({ action: '__dump' })).dump.groups.forEach(g => { pins[g.country] = g.pin; });
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { phase: 'game', round: 1, status: 'closed', years: 3 } });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(500);
  await admin.click('#tabs button:has-text("Control")');
  await admin.click('label:has-text("Diplomatic telegrams") input');
  await admin.waitForSelector('button:has-text("Open the telegraph office")');

  const desk = async (c, lang) => { const p = await ctx.newPage(); p.on('pageerror', e => errors.push('desk ' + c + ': ' + e.message)); await p.goto(BASE + '/desk.html?lang=' + (lang || 'en') + '&api=' + encodeURIComponent(API) + '&pin=' + pins[c]); await p.waitForSelector('#telegrams h2'); return p; };
  const fra = await desk('FRA');
  must(/telegraph office closed/.test(await fra.textContent('#telegrams')) && !(await fra.$('#tgText')), 'office closed: no composer');
  await admin.click('button:has-text("Open the telegraph office")');
  await admin.waitForSelector('.toast.show:has-text("Telegraph office open")');
  await fra.reload(); await fra.waitForSelector('#tgText');
  must(/3 telegrams left this year/.test(await fra.textContent('#telegrams .cardhead')), '3 telegrams a year');
  const send = async (to, text) => { await fra.selectOption('#tgTo', to); await fra.fill('#tgText', text); await fra.click('#tgBtn'); await fra.waitForSelector('.toast.show:has-text("Telegram sent")'); await fra.waitForTimeout(300); };
  await fra.click('#tgBtn'); await fra.waitForSelector('#tgMsg .err');
  must(/Choose the country/.test(await fra.textContent('#tgMsg')), 'a telegram needs a recipient');
  await send('DEU', 'Berlin: we will not raise VAT if you hold public demand. Paris.');
  await send('DEU', 'Our offer stands until the close.');
  await send('ITA', 'Rome, are you with us on the rate cut?');
  must(!(await fra.$('#tgText')) && /no telegram left this year/.test(await fra.textContent('#telegrams .cardhead')), 'quota used: the composer is gone');
  await fra.click('#tgOutBox summary');
  must((await fra.$$('#tgOut .tg')).length === 3, 'France sees its 3 sent telegrams');

  const deu = await desk('DEU');
  must((await deu.$$('#tgIn .tg.new')).length === 2 && /2 new telegrams/.test(await deu.textContent('#strip')), 'Germany: 2 new telegrams');
  must(!/Rome/.test(await deu.textContent('#telegrams')), 'Germany does not read the telegram to Italy');
  await deu.screenshot({ path: OUT + '/t1-desk-deu.png', fullPage: true });
  await deu.click('#tgSeen'); await deu.waitForTimeout(200);
  must((await deu.$$('#tgIn .tg.new')).length === 0 && !/new telegram/.test(await deu.textContent('#strip')), 'marked as read');
  const ita = await desk('ITA');
  must((await ita.$$('#tgIn .tg')).length === 1 && /Rome/.test(await ita.textContent('#tgIn')), 'Italy reads only its own');
  const board = await ctx.newPage(); board.on('pageerror', e => errors.push('board: ' + e.message));
  await board.goto(BASE + '/board.html?class=' + cid + '&api=' + encodeURIComponent(API)); await board.waitForTimeout(1200);
  must(!/Berlin|Rome/.test(await board.textContent('body')), 'nothing on the board');

  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(400);
  await admin.click('#tabs button:has-text("Council")');
  await admin.waitForSelector('h2:has-text("Diplomatic telegrams")');
  must((await admin.$$('[data-tg]')).length === 3, 'the administrator reads every telegram');
  await admin.click('[data-tg]:has-text("Rome") button:has-text("Hide")');
  await admin.waitForSelector('.toast.show:has-text("Telegram hidden")');
  await admin.screenshot({ path: OUT + '/t2-admin.png', fullPage: true });
  await ita.reload(); await ita.waitForSelector('#tgIn .tg');
  must(!/Rome/.test(await ita.textContent('#tgIn')) && /hidden by the administrator/.test(await ita.textContent('#tgIn')), 'hidden telegram emptied for Italy');
  await admin.click('#tabs button:has-text("Export")');
  const [dl] = await Promise.all([admin.waitForEvent('download'), admin.click('button:has-text("Telegrams (CSV)")')]);
  must(/Berlin/.test(fs.readFileSync(await dl.path(), 'utf8')), 'telegrams CSV export');

  const fr = await desk('DEU', 'fr');
  const frt = await fr.textContent('#telegrams');
  must(/Télégrammes diplomatiques/.test(frt) && /Reçus/.test(frt), 'French desk: telegrams translated');
  await (await fr.$('#telegrams')).screenshot({ path: OUT + '/t3-desk-fr.png' });

  must(!errors.length, 'no page error' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log('\nE2E TELEGRAMS OK');
})().catch(e => { console.error(e); process.exit(1); });
