/* End-to-end scenario: the forum of the union (permanent council) through the real pages against the mock backend.
   New class, 7 groups, game year 1 → the administrator opens the forum (Control) → France posts an engagement with the
   counterpart it asks from Germany (numbers attached) → Germany supports it, Italy rejects it, by name → Germany posts a
   vote call and withdraws it (the quota is not given back) → decisions of year 1, the administrator closes the submissions:
   the forum of year 1 freezes, words vs acts appear on the desk and the board → a proposal posted afterwards belongs to
   year 2 → the administrator hides a proposal (Council tab), exports the forum → French desk.
   Mock server: PORT env (default 8787). */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:' + (process.env.E2E_PORT || 8787);
const API = BASE + '/api';
const OUT = process.argv[2] || '/tmp/shots-forum';
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
  admin.on('dialog', d => d.accept(d.type() === 'prompt' ? 'Forum class' : undefined));
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
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { phase: 'game', round: 1, status: 'closed', years: 3 } });
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(500);
  await admin.click('#tabs button:has-text("Control")');
  must(await admin.isVisible('button:has-text("Convene the council")'), 'Control: the convened council is there while the forum is off');
  await admin.click('label:has-text("Forum of the union (permanent council)") input');
  await admin.waitForSelector('.toast.show:has-text("Forum of the union open")');
  must(!(await admin.isVisible('button:has-text("Convene the council")')), 'Control: with the forum on, the convened council is gone');
  let s = (await api({ action: 'admin.overview', key: KEY, classId: cid })).state;
  must(s.forum.on && s.forum.perYear === 1 && s.forum.maxLen === 280, 'forum on, 1 proposal a year, 280 characters');

  /* France posts an engagement with its counterpart */
  const fra = await ctx.newPage(); fra.on('pageerror', e => errors.push('desk FRA: ' + e.message)); fra.on('dialog', d => d.accept());
  await fra.goto(BASE + '/desk.html?lang=en&api=' + encodeURIComponent(API) + '&pin=' + pins.FRA);
  await fra.waitForSelector('#forum h2:has-text("Forum of the union · proposals for year 1")');
  must(/Forum: 0 proposals/.test(await fra.textContent('#strip')), 'desk strip: forum pill');
  await fra.fill('#fText', 'We raise public demand by 1 pt of GDP to pull the union out of the slump.');
  await fra.click('#forumBtn');
  await fra.waitForSelector('#forumMsg .err');
  must(/what you ask in return/.test(await fra.textContent('#forumMsg')) && /from which countries/.test(await fra.textContent('#forumMsg')), 'an engagement without counterpart is refused');
  await fra.fill('#fAsk', 'Germany cuts its VAT by 1 pt.');
  await fra.check('#forum .fFrom[value="DEU"]');
  await fra.click('#forum summary:has-text("Attach numbers")');
  await fra.fill('#forum [name="fO_pubdem_min"]', '1');
  await fra.fill('#forum [name="fA_vat_max"]', '0');
  must(/\d+ \/ 280 characters/.test(await fra.textContent('#forum .fcount')), 'character counter');
  await fra.click('#forumBtn');
  await fra.waitForSelector('.toast.show:has-text("Proposal posted")');
  await fra.waitForSelector('#forumList .fprop.mine');
  must(!(await fra.$('#fText')) && /your proposal is posted/.test(await fra.textContent('#forum .cardhead')), 'quota used: the composer is gone');
  must(/In return/.test(await fra.textContent('#forumList')) && /from Germany/.test(await fra.textContent('#forumList')), 'the proposal shows its counterpart and from whom');
  must(/Public demand ≥ \+1\.00 %/.test(await fra.textContent('#forumList')) && /Consumption tax \(VAT\) ≤ 0\.00 %/.test(await fra.textContent('#forumList')), 'ranges shown: at least / at most');

  /* Germany supports, Italy rejects */
  const deu = await ctx.newPage(); deu.on('pageerror', e => errors.push('desk DEU: ' + e.message)); deu.on('dialog', d => d.accept());
  await deu.goto(BASE + '/desk.html?lang=en&api=' + encodeURIComponent(API) + '&pin=' + pins.DEU);
  await deu.waitForSelector('#forumList .fprop');
  await deu.click('#forumList .fprop button:has-text("Support")');
  await deu.waitForSelector('#forumList .fprop button.on:has-text("Support")');
  const ita = await ctx.newPage(); ita.on('pageerror', e => errors.push('desk ITA: ' + e.message));
  await ita.goto(BASE + '/desk.html?lang=en&api=' + encodeURIComponent(API) + '&pin=' + pins.ITA);
  await ita.waitForSelector('#forumList .fprop');
  await ita.click('#forumList .fprop button:has-text("Reject")');
  await ita.waitForSelector('#forumList .fprop button.on:has-text("Reject")');
  await fra.reload(); await fra.waitForSelector('#forumList .fprop');
  const fr1 = await fra.textContent('#forumList .freact');
  must(/👍 1 Germany/.test(fr1) && /👎 1 Italy/.test(fr1) && !(await fra.$('#forumList button:has-text("Support")')), 'reactions by name; no reaction button on one′s own proposal');

  /* Germany: a vote call, then withdrawn */
  await deu.click('#forum .ftypes label:has-text("Vote call")');
  await deu.fill('#fText', 'Vote CUT: unemployment is rising everywhere.');
  await deu.selectOption('#fV_rate', 'cut');
  await deu.click('#forumBtn');
  await deu.waitForSelector('#forumList .fprop.mine');
  await deu.click('#forumList .fprop.mine button:has-text("Withdraw")');
  await deu.waitForSelector('#forumList .fprop.mine.withdrawn');
  must(!(await deu.$('#fText')), 'withdrawal does not give the proposal back');
  await deu.screenshot({ path: OUT + '/f1-desk-deu.png', fullPage: true });

  /* decisions of year 1, the close freezes the forum */
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'open' } });
  const dec = (pin, lv) => api({ action: 'submit', pin, phase: 'game', round: 1, payload: { years: [{ levers: lv }], text: 'x'.repeat(130), votes: { rate: 'hold' } } });
  must((await dec(pins.FRA, { pubdem: 1 })).ok && (await dec(pins.DEU, { vat: 0.5 })).ok, 'decisions of year 1');
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(400);
  await admin.click('button:has-text("Close submissions")');
  await admin.waitForTimeout(600);
  s = (await api({ action: 'admin.overview', key: KEY, classId: cid })).state;
  must(s.forum.frozen === 1, 'closing the submissions freezes the forum of year 1');
  await fra.reload(); await fra.waitForSelector('#forum h2:has-text("proposals for year 2")');
  must(!!(await fra.$('#fText')), 'after the close, France may post its proposal for year 2');
  await fra.click('#forumPast summary');
  const past = await fra.textContent('#forumPast');
  must(/Words vs acts/.test(past) && /France ✓ kept/.test(past) && /Germany \(👍\) ✗ not kept/.test(past), 'words vs acts: France kept its word; Germany supported but did not deliver');
  must(/Own word kept/.test(past), 'record table on the desk');
  await fra.fill('#fText', 'Next year, every country cuts its income tax by 0.5 pt.');
  await fra.click('#forum .ftypes label:has-text("Joint proposal")');
  await fra.click('#forumBtn');
  await fra.waitForSelector('#forumList .fprop.mine');
  await fra.screenshot({ path: OUT + '/f2-desk-fra.png', fullPage: true });

  /* board */
  const board = await ctx.newPage(); board.on('pageerror', e => errors.push('board: ' + e.message));
  await board.goto(BASE + '/board.html?class=' + cid + '&api=' + encodeURIComponent(API));
  await board.waitForSelector('h2:has-text("Forum of the union · proposals for year 2")');
  const bt = await board.textContent('#app');
  must(/every country cuts its income tax/.test(bt) && /Words vs acts/.test(bt) && !(await board.$('button[data-act]')), 'board: this year′s forum, words vs acts, no buttons');
  await board.screenshot({ path: OUT + '/f3-board.png', fullPage: true });

  /* the team download (allowed by the administrator): France's proposals, who supported or rejected them, its word */
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { game: { teamExport: true } } });
  await fra.reload(); await fra.waitForSelector('#exportBtn');
  const [dlF] = await Promise.all([fra.waitForEvent('download'), fra.click('#exportBtn')]);
  const fCsv = fs.readFileSync(await dlF.path(), 'utf8');
  must(/forum: our proposal/.test(fCsv) && /We raise public demand/.test(fCsv) && /Germany cuts its VAT/.test(fCsv) && /forum: supported by/.test(fCsv) && /,kept,/.test(fCsv.replace(/"[^"]*"/g, 'Q')), 'team CSV: our proposal, its counterpart, the reactions, our word kept');

  /* administrator: hide, export */
  await admin.click('#tabs button:has-text("Council")');
  await admin.waitForSelector('h2:has-text("Forum of the union")');
  await admin.click('.fprop.ftype-engagement button:has-text("Hide")');
  await admin.waitForSelector('.toast.show:has-text("Proposal hidden")');
  must(/hidden by the administrator/.test(await admin.textContent('.fprop.ftype-engagement')) && /We raise public demand/.test(await admin.textContent('.fprop.ftype-engagement')), 'admin: hidden proposal still readable by the administrator');
  await admin.screenshot({ path: OUT + '/f4-admin-council.png', fullPage: true });
  await fra.reload(); await fra.waitForSelector('#forumPast summary'); await fra.click('#forumPast summary');
  must(!/We raise public demand/.test(await fra.textContent('#forumPast')) && /hidden by the administrator/.test(await fra.textContent('#forumPast')), 'desk: hidden proposal emptied');
  await admin.click('#tabs button:has-text("Export")');
  const [dl] = await Promise.all([admin.waitForEvent('download'), admin.click('button:has-text("Forum (CSV)")')]);
  const csvTxt = fs.readFileSync(await dl.path(), 'utf8');
  must(/author_acts/.test(csvTxt) && /engagement/.test(csvTxt) && /DEU:broken/.test(csvTxt), 'forum CSV export with reactions and words vs acts');

  /* French desk */
  const fr = await ctx.newPage(); fr.on('pageerror', e => errors.push('desk FR: ' + e.message));
  await fr.goto(BASE + '/desk.html?lang=fr&api=' + encodeURIComponent(API) + '&pin=' + pins.ITA);
  await fr.waitForSelector('#forum h2');
  const frt = await fr.textContent('#forum');
  must(/Forum de l’union/.test(frt) && /Engagement/.test(frt) && /Proposition commune/.test(frt), 'French desk: forum translated');
  await fr.screenshot({ path: OUT + '/f5-desk-fr.png', fullPage: true });

  must(!errors.length, 'no page error' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log('\nE2E FORUM OK');
})().catch(e => { console.error(e); process.exit(1); });
