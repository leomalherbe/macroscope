/* The desk, the console and the model page in French (i18n.js + i18n/fr-desk.js): a class of four, year 1 run and published, then the desk of
   France opened with ?lang=fr — no page error, no English left outside the players' own text, decimal
   commas, the EN | FR switch back to English. Mock server: E2E_PORT env (default 8787). */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:' + (process.env.E2E_PORT || 8787);
const API = BASE + '/api';
const OUT = process.argv[2] || '/tmp/shots-fr';
fs.mkdirSync(OUT, { recursive: true });
async function api(params) { const r = await fetch(API, { method: 'POST', body: JSON.stringify(params) }); return r.json(); }
function must(cond, msg) { if (!cond) { throw new Error('ASSERTION FAILED: ' + msg); } console.log('ok -', msg); }
const KEY = 'TESTKEY', TEXT = 'We explain our decisions to the council: the mechanisms we expect to work this year, and what we expect from our partners.';
/* English words that should not survive on the French page (outside translate="no") */
const ENGLISH = /\b(the|and|your|of|with|year|rate|decisions?|results?|reserves|submit|which|what|this|from)\b/i;
async function leftovers(page) {
  return page.evaluate((src) => {
    const re = new RegExp(src, 'i'), out = [];
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
    while ((n = tw.nextNode())) {
      const t = n.nodeValue.trim(); if (!t || !re.test(t) || /Google Sheet/.test(t)) continue;  /* the Sheet's tab names stay in English */
      const p = n.parentElement; if (!p || p.closest('script,style,textarea,[translate="no"]')) continue;
      if (p.offsetParent === null && p.tagName !== 'title') continue;
      out.push(t.slice(0, 100));
    }
    return out;
  }, ENGLISH.source);
}

(async () => {
  await api({ action: '__reset' });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const admin = await ctx.newPage();
  admin.on('pageerror', e => errors.push('admin: ' + e.message));
  admin.on('dialog', d => d.accept(d.type() === 'prompt' ? 'Classe FR' : undefined));
  await admin.goto(BASE + '/admin.html?api=' + encodeURIComponent(API));
  await admin.fill('input[type=url]', API); await admin.fill('input[type=password]', KEY);
  await admin.click('button:has-text("Connect")'); await admin.waitForSelector('text=No class yet');
  await admin.click('button:has-text("+ New class")'); await admin.waitForSelector('#statusGrid');
  const cid = JSON.parse((await api({ action: '__dump' })).dump.config.classes)[0].id;
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { sim: { model: 'v1.3' } } });
  await admin.click('#tabs button:has-text("Groups")'); await admin.waitForSelector('#unionNote');
  const countries = ['FRA', 'DEU', 'ITA', 'ESP'];
  for (let i = 0; i < countries.length; i++) await admin.click('button:has-text("+ Add a group")');
  const rows = await admin.$$('#view tbody tr');
  for (let i = 0; i < countries.length; i++) { await (await rows[i].$('input[type=text]')).fill('Groupe ' + (i + 1)); await (await rows[i].$('select')).selectOption(countries[i]); }
  await admin.click('button:has-text("Save groups")'); await admin.waitForSelector('.toast.show:has-text("Groups saved")');
  const ov = await api({ action: 'admin.overview', key: KEY, classId: cid }); const pins = {}; ov.groups.forEach(g => { pins[g.country] = g.pin; });
  await admin.click('#tabs button:has-text("Control")'); await admin.click('button:has-text("Start the game")'); await admin.waitForSelector('text=game · year 1');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'open', communique: 'Year 1: a world recession. You have 15 minutes.' } });

  /* the desk of France, in French, during the round */
  const desk = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  desk.on('pageerror', e => errors.push('desk: ' + e.message));
  await desk.goto(BASE + '/desk.html?lang=fr&pin=' + pins.FRA + '&api=' + encodeURIComponent(API));
  await desk.waitForSelector('#decisionText');
  must(await desk.getAttribute('html', 'lang') === 'fr' && /Bureau des décisions/.test(await desk.title()), 'desk in French: <html lang="fr">, French title');
  must(/Décisions pour l’année 1/.test(await desk.textContent('#app')), 'form heading in French');
  must(/Year 1: a world recession/.test(await desk.textContent('#communique')), 'the administrator’s communiqué is left as written');
  let left = await leftovers(desk);
  must(left.length === 0, 'no English left during the round (' + left.join(' | ') + ')');
  await desk.screenshot({ path: OUT + '/fr-1-form.png', fullPage: true });

  /* the beginners' guide: titles only, one card at a time, ⓘ next to the levers, glossary in its own tab */
  must(await desk.isVisible('#guideBtn') && /^Comment ça marche\s\?$/.test((await desk.textContent('#guideBtn')).trim()), 'guide: « Comment ça marche ? » button');
  await desk.click('#guideBtn'); await desk.waitForSelector('#guidePanel:not([hidden])');
  const cards = await desk.$$eval('#guidePanel details.gcard', ds => ds.map(d => d.getAttribute('data-card')));
  must(cards.join(',') === 'score,demand,leaks,vat,rate,reserves,deval,coop,decomp,compet,float,debt', 'guide (v1.3, no options): 12 cards, no climate / exit / duel (' + cards.join(',') + ')');
  must((await desk.$$('#guidePanel details.gcard[open]')).length === 0, 'guide opens on the titles only');
  await desk.click('#guidePanel details.gcard[data-card="vat"] summary'); await desk.click('#guidePanel details.gcard[data-card="rate"] summary'); await desk.waitForTimeout(150);
  must((await desk.$$eval('#guidePanel details.gcard[open]', ds => ds.map(d => d.getAttribute('data-card')))).join() === 'rate', 'one card open at a time');
  must(/l’année suivante/.test(await desk.textContent('#guidePanel details.gcard[data-card="rate"]')), 'the rate card is in French');
  await desk.click('#guidePanel .gp-tabs [data-tab="glossary"]');
  must((await desk.$$('#guidePanel dl.gloss dt')).length === 22 && await desk.isHidden('#guidePanel [data-pane="cards"]'), 'glossary in its own tab, the 22 words of a v1.3 class (no climate, no exit, no tariffs)');
  await desk.screenshot({ path: OUT + '/fr-1b-glossary.png' });
  await desk.click('#guidePanel .gp-close'); await desk.waitForSelector('#guidePanel', { state: 'hidden' });
  const gi = await desk.$('td[data-guide="demand"] > .gi');
  must(!!gi, 'an ⓘ next to the public demand lever');
  await gi.click(); await desk.waitForSelector('#guidePanel details.gcard[data-card="demand"][open]');
  must(await desk.isVisible('#guidePanel details.gcard[data-card="demand"] dd'), 'the ⓘ opens the multiplier card');
  await desk.click('#guidePanel a.glink[data-card="leaks"]'); await desk.waitForSelector('#guidePanel details.gcard[data-card="leaks"][open]');
  must(true, 'a « fiche n » link opens that card');
  await desk.screenshot({ path: OUT + '/fr-1c-guide.png' });
  await desk.keyboard.press('Escape');
  /* switched off by the administrator */
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { sim: { guide: false } } });
  await desk.click('button:has-text("Actualiser")'); await desk.waitForTimeout(1200);
  must(await desk.isHidden('#guideBtn') && (await desk.$$('.gi')).length === 0, 'guide switched off: no button, no ⓘ');
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { sim: { guide: true } } });
  await desk.click('button:has-text("Actualiser")'); await desk.waitForTimeout(1200);
  must(await desk.isVisible('#guideBtn') && (await desk.$$('.gi')).length > 0, 'switched back on');
  /* a decision with a decimal, submitted from the French form */
  await desk.fill('input[name="L_pubdem_0"]', '2.5'); await desk.fill('#decisionText', TEXT + ' Nous relançons.');
  await desk.click('button:has-text("Envoyer nos décisions")'); await desk.waitForSelector('text=Décisions soumises');
  for (const c of ['DEU', 'ITA', 'ESP']) await api({ action: 'submit', pin: pins[c], phase: 'game', round: 1, payload: { years: [{ levers: {} }], text: TEXT, votes: { rate: 'hold' } } });
  await api({ action: 'admin.state.set', key: KEY, classId: cid, patch: { status: 'closed' } });

  /* run and publish year 1 */
  await admin.click('button:has-text("Refresh")'); await admin.waitForTimeout(500);
  await admin.click('#tabs button:has-text("Run")'); await admin.waitForSelector('#runBtn');
  await admin.click('#runBtn'); await admin.waitForSelector('#runPreview table');
  await admin.click('button:has-text("Save and publish all")'); await admin.waitForTimeout(900);

  await desk.click('button:has-text("Actualiser")'); await desk.waitForTimeout(1500);
  await desk.screenshot({ path: OUT + '/fr-2-results.png', fullPage: true });
  const txt = await desk.textContent('#app');
  must(/résultats à ce jour/.test(txt) && /Indicateurs clés/.test(txt) && /Classement/.test(txt), 'results, key indicators and ranking in French');
  must(/\d,\d/.test(txt) && !/\b\d+\.\d+\s?(%|pt)/.test(txt), 'decimal commas in the results');
  left = await leftovers(desk);
  must(left.length === 0, 'no English left in the results (' + left.join(' | ') + ')');
  await desk.screenshot({ path: OUT + '/fr-2-results.png', fullPage: true });

  /* the switch back to English, remembered */
  await desk.click('.lang button[data-lang="en"]'); await desk.waitForSelector('text=results so far');
  must(await desk.getAttribute('html', 'lang') === 'en', 'EN | FR switch: back to English');
  await desk.goto(BASE + '/desk.html?pin=' + pins.FRA + '&api=' + encodeURIComponent(API)); await desk.waitForSelector('text=results so far');
  must(await desk.getAttribute('html', 'lang') === 'en', 'the choice is remembered');

  /* the console in French, in a fresh browser */
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const adm = await ctxA.newPage();
  adm.on('pageerror', e => errors.push('admin (fr): ' + e.message));
  await adm.goto(BASE + '/admin.html?lang=fr&api=' + encodeURIComponent(API));
  await adm.fill('input[type=url]', API); await adm.fill('input[type=password]', KEY);
  await adm.click('button:has-text("Se connecter")'); await adm.waitForSelector('#statusGrid');
  must(/Pilotage/.test(await adm.textContent('#tabs')) && /Simulation/.test(await adm.textContent('#tabs')), 'console in French: tabs');
  left = await leftovers(adm);
  must(left.length === 0, 'no English left on the Control tab (' + left.join(' | ') + ')');
  await adm.screenshot({ path: OUT + '/fr-3-admin-control.png', fullPage: true });
  for (const tab of ['Groupes', 'Simulation', 'Résultats', 'Conseil', 'Export']) {
    await adm.click('#tabs button:has-text("' + tab + '")'); await adm.waitForTimeout(500);
    left = left.concat((await leftovers(adm)).map(t => tab + ': ' + t));
  }
  must(left.length === 0, 'no English left on the other tabs (' + left.join(' | ') + ')');
  {
  }
  await adm.click('#tabs button:has-text("Résultats")'); await adm.waitForTimeout(500);
  const just = await adm.$('details:has(summary:has-text("Justifications a priori des groupes"))');
  must(!!just && (await just.textContent()).includes('Nous relançons') && (await just.textContent()).includes('Allemagne'), 'Results tab (game): the groups’ justifications of the year in a drop-down');
  await adm.click('#tabs button:has-text("Simulation")'); await adm.waitForTimeout(400);
  await adm.screenshot({ path: OUT + '/fr-4-admin-run.png', fullPage: true });

  /* the model page in French */
  const model = await ctxA.newPage();
  model.on('pageerror', e => errors.push('model (fr): ' + e.message));
  await model.goto(BASE + '/model.html?lang=fr'); await model.waitForSelector('#mxFlows table');
  must(/Matrice des flux/.test(await model.textContent('body')) && /G = G\*·\(1 \+ pubdem\/100\)/.test(await model.textContent('body')), 'model page in French, equations untouched');
  left = await leftovers(model);
  must(left.length === 0, 'no English left on the model page (' + left.join(' | ') + ')');

  must(errors.length === 0, 'no page errors (' + errors.join(' | ') + ')');
  await browser.close();
  console.log('\nFR E2E ALL GOOD');
})().catch(e => { console.error(e); process.exit(1); });
