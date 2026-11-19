/* End-to-end scenario: several games at once, the email when every group has submitted, a timer in hours.
   Two consoles (two tabs) on two classes: each keeps its own class across a reload → the selector shows every class's
   submissions → the notification is switched on, a test email → the second group submits: one email, « ✓ » in the selector
   → a 24-hour timer: 23:59:xx on the console, the closing time on the desk. Mock server: E2E_PORT env (default 8787). */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:' + (process.env.E2E_PORT || 8787);
const API = BASE + '/api';
const OUT = process.argv[2] || '/tmp/shots-multi';
fs.mkdirSync(OUT, { recursive: true });
async function api(params) { const r = await fetch(API, { method: 'POST', body: JSON.stringify(params) }); return r.json(); }
function must(cond, msg) { if (!cond) { throw new Error('ASSERTION FAILED: ' + msg); } console.log('ok -', msg); }
const KEY = 'TESTKEY';

(async () => {
  await api({ action: '__reset' });
  const A = (await api({ action: 'admin.class.create', key: KEY, name: 'Alpha' })).classId;
  const B = (await api({ action: 'admin.class.create', key: KEY, name: 'Beta' })).classId;
  const gr = await api({ action: 'admin.groups.set', key: KEY, classId: B, groups: [{ name: 'F', country: 'FRA' }, { name: 'D', country: 'DEU' }] });
  const [pF, pD] = gr.groups.map(g => g.pin);
  await api({ action: 'admin.state.set', key: KEY, classId: B, patch: { phase: 'game', round: 1, status: 'open', years: 3 } });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const open = async (q) => { const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept()); await p.goto(BASE + '/admin.html?lang=' + (process.env.MX_LANG || 'en') + '&api=' + encodeURIComponent(API) + (q || '')); return p; };
  const a = await open();
  await a.fill('input[type=password]', KEY); await a.click('button:has-text("Connect")'); await a.waitForSelector('#classSel');
  must(/backend v1\.23/.test(await a.textContent('#footTime')), 'backend reports v1.23');
  await a.selectOption('#classSel', A); await a.waitForTimeout(600);
  const b = await open(); await b.waitForSelector('#classSel');
  await b.selectOption('#classSel', B); await b.waitForTimeout(600);
  must(/class=/.test(b.url()) && (await b.title()).startsWith('Beta'), 'the class is in the address and the tab title');
  await a.reload(); await a.waitForSelector('#classSel'); await a.waitForTimeout(600);
  must(await a.$eval('#classSel', s => s.value) === A && (await a.title()).startsWith('Alpha'), 'first console reloaded: still on Alpha');
  const c = await open(); await c.waitForSelector('#classSel'); await c.waitForTimeout(600);
  must(await c.$eval('#classSel', s => s.value) === A, 'a new console opens on the last class shown (Alpha, reloaded last)');
  await c.close();
  must(/Beta · (year|année) 1 · (open|ouvert) · 0\/2/.test(await b.textContent('#classSel')), 'selector: Beta, year 1, open, 0/2');

  await b.click('#notifyOn');
  await b.waitForSelector('.toast.show');
  await b.click('#notifyTest'); await b.waitForSelector('.toast.show:has-text("owner@example.org")');
  const dec = { years: [{ levers: { pubdem: 1 } }], text: 'x'.repeat(130) };
  await api({ action: 'submit', pin: pF, phase: 'game', round: 1, payload: dec });
  await api({ action: 'submit', pin: pD, phase: 'game', round: 1, payload: dec });
  const mails = (await api({ action: '__dump' })).dump.mails;
  must(mails.length === 2 && /Beta: every group has submitted the decisions of year 1/.test(mails[1].subject) && /admin\.html\?class=/.test(mails[1].body), 'one email when the last group submits, with the console link');
  await b.waitForFunction(() => /0?2\/2 ✓/.test(document.querySelector('#classSel').textContent), null, { timeout: 30000 });
  must(true, 'selector: Beta 2/2 ✓ (polling)');

  await b.selectOption('#timerUnit', 'h'); await b.fill('#timerN', '24'); await b.click('#timerGo');
  await b.waitForSelector('#countdown');
  await b.waitForTimeout(1200);
  must(/^23:59:\d\d$/.test((await b.textContent('#countdown')).trim()), 'a 24-hour timer: 23:59:xx');
  const d = await ctx.newPage(); d.on('pageerror', e => errors.push('desk: ' + e.message));
  await d.goto(BASE + '/desk.html?lang=fr&api=' + encodeURIComponent(API) + '&pin=' + pF); await d.waitForSelector('#countdown'); await d.waitForTimeout(1200);
  const strip = await d.textContent('#strip');
  must(/23:59:\d\d/.test(strip) && /ferme le \d+\/\d+ à \d\d:\d\d/.test(strip), 'desk (French): 23:59:xx and the closing time');
  await b.screenshot({ path: OUT + '/m1-console.png' });
  /* a timer that has run out: the round is closed; « Open submissions » reopens it (the expired timer is cleared) */
  await api({ action: 'admin.state.set', key: KEY, classId: B, patch: { deadline: new Date(Date.now() - 5 * 60000).toISOString() } });
  await b.click('#strip button:has-text("Refresh"), #strip button:has-text("Actualiser")'); await b.waitForTimeout(600);
  must(!(await b.$('#countdown')) && /closed|clos/i.test(await b.textContent('#strip')), 'timer run out: the round is closed');
  await b.click('button:has-text("Open submissions"), button:has-text("Ouvrir les soumissions")'); await b.waitForTimeout(800);
  const ovB = await api({ action: 'admin.overview', key: KEY, classId: B });
  must(ovB.roundOpen && !ovB.state.deadline, 'reopened after the timer ran out (timer cleared)');
  await (await d.$('#strip')).screenshot({ path: OUT + '/m2-desk.png' });
  must(!errors.length, 'no page error' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log('\nE2E MULTI OK');
})().catch(e => { console.error(e); process.exit(1); });
