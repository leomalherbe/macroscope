/* Quick visual check of the student page against the mock backend */
const { chromium } = require('playwright');
const BASE = 'http://localhost:8787';
const OUT = process.argv[2] || '/tmp/shots';
const fs = require('fs'); fs.mkdirSync(OUT, { recursive: true });
async function api(params) { const r = await fetch(BASE + '/api', { method: 'POST', body: JSON.stringify(params) }); return r.json(); }
(async () => {
  await api({ action: '__reset' });
  const c = await api({ action: 'admin.class.create', key: 'TESTKEY', name: 'M1 Finance A' });
  const cid = c.classId;
  const g = await api({ action: 'admin.groups.set', key: 'TESTKEY', classId: cid, groups: [
    { name: 'Group 1', country: 'DEU' }, { name: 'Group 2', country: 'FRA' }, { name: 'Group 3', country: 'ITA' }, { name: 'Group 4', country: 'NLD' },
    { name: 'Group 5', country: 'ESP' }, { name: 'Group 6', country: 'BEL' }, { name: 'Group 7', country: 'AUT' }] });
  const pins = g.groups.map(x => x.pin);
  await api({ action: 'admin.state.set', key: 'TESTKEY', classId: cid, patch: { status: 'open', deadlineMinutes: 12, communique: 'Year 0 shock: world demand falls by 3% and the risk premium on sovereign debt doubles. You have 12 minutes to submit a 3-year plan for France.' } });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.on('pageerror', e => console.log('PAGE ERROR', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await page.goto(BASE + '/index.html?api=' + encodeURIComponent(BASE + '/api'));
  await page.waitForSelector('input[placeholder="4-digit PIN"]');
  await page.screenshot({ path: OUT + '/s0-login.png' });
  await page.fill('input[placeholder="4-digit PIN"]', pins[1]);
  await page.keyboard.press('Enter');
  await page.waitForSelector('#submitBtn');
  await page.screenshot({ path: OUT + '/s1-warmup-form.png', fullPage: true });
  // fill a plan
  await page.fill('[name="L_pubdem_0"]', '0.5'); await page.fill('[name="L_pubdem_1"]', '0.5'); await page.fill('[name="L_pubdem_2"]', '0.3');
  await page.fill('[name="L_inctax_0"]', '-3'); await page.fill('[name="L_inctax_1"]', '-3'); await page.fill('[name="L_inctax_2"]', '-3');
  await page.fill('[name="L_vat_2"]', '12');
  await page.click('#submitBtn');
  await page.waitForSelector('#formErrors .err');
  await page.screenshot({ path: OUT + '/s2-warmup-errors.png', fullPage: true });
  await page.fill('[name="L_vat_2"]', '2');
  await page.fill('#decisionText', 'We stimulate demand through public spending in years 1-2 to offset the world demand shock, and cut employer contributions to lower production costs, restore competitiveness and contain inflation. We expect GDP up, unemployment down, a worse public balance and a slightly worse trade balance in year 1.');
  await page.click('#submitBtn');
  await page.waitForSelector('#formErrors .ok');
  await page.screenshot({ path: OUT + '/s3-warmup-submitted.png', fullPage: true });
  // admin posts results
  const ov = await api({ action: 'admin.overview', key: 'TESTKEY', classId: cid });
  const gid = ov.groups[1].groupId;
  await api({ action: 'admin.results.set', key: 'TESTKEY', classId: cid, phase: 'warmup', round: 1, rows: [
    { key: gid, year: 1, gdp: 0.62, unemp: -0.31, infl: -0.40, pubbal: -0.55, tradebal: -0.38, published: true },
    { key: gid, year: 2, gdp: 0.88, unemp: -0.44, infl: -0.21, pubbal: -0.49, tradebal: -0.35, published: true },
    { key: gid, year: 3, gdp: 0.95, unemp: -0.40, infl: 0.12, pubbal: -0.30, tradebal: -0.30, published: true }] });
  await page.click('text=Refresh');
  await page.waitForSelector('#commentText');
  await page.screenshot({ path: OUT + '/s4-warmup-results.png', fullPage: true });
  await page.fill('#commentText', 'The multiplier was close to 0.6 in year 1 as in the handbook; inflation fell thanks to the cut in employer contributions.');
  await page.click('text=Submit our analysis');
  await page.waitForTimeout(800);
  // switch to the game, open council
  await api({ action: 'admin.state.set', key: 'TESTKEY', classId: cid, patch: { phase: 'game', round: 1, status: 'open', deadline: null, councilOpen: true, communique: 'Year 1: the rest of the world enters a recession (world demand −4%). The council of ministers is in session for 10 minutes.' } });
  await page.click('text=Refresh');
  await page.waitForSelector('#pledgeText');
  await page.fill('#pledgeText', 'France will raise public demand by 0.5 pt of GDP if at least three partners do the same.');
  await page.click('summary:has-text("Attach numbers")');
  await page.fill('[name="PL_pubdem"]', '0.5');
  await page.click('text=Post our pledge');
  await page.waitForSelector('#pledgeMsg .ok');
  // another country pledges
  await api({ action: 'pledge', pin: pins[0], payload: { text: 'Germany pledges a +0.3 public demand stimulus.', year: { levers: { pubdem: 0.3 } } } });
  await page.click('text=Refresh');
  await page.waitForTimeout(600);
  await page.screenshot({ path: OUT + '/s5-game-council.png', fullPage: true });
  // submit game decisions
  await page.fill('[name="L_pubdem_0"]', '0.5');
  await page.fill('[name="L_vat_0"]', '-2');
  await page.fill('#decisionText', 'We honour our pledge and add a tariff on US imports to protect the trade balance while world demand is weak.');
  await page.click('#submitBtn');
  await page.waitForSelector('#formErrors .ok');
  await page.screenshot({ path: OUT + '/s6-game-submitted.png', fullPage: true });
  // germany defects, results, reveal
  await api({ action: 'submit', pin: pins[0], phase: 'game', round: 1, payload: { years: [{ levers: { pubdem: 0 }, tariffs: {}, euro: 'none', tfp: 0 }], text: 'Germany keeps its powder dry and free-rides on the French stimulus, hoping for a trade surplus.'.padEnd(110, '.') } });
  await api({ action: 'admin.results.set', key: 'TESTKEY', classId: cid, phase: 'game', round: 1, rows: [
    { key: 'FRA', year: 1, gdp: 0.3, unemp: -0.2, infl: 0.1, pubbal: -0.6, tradebal: -0.5, published: true },
    { key: 'DEU', year: 1, gdp: 0.15, unemp: -0.05, infl: 0.0, pubbal: 0.05, tradebal: 0.2, published: true },
    { key: 'ITA', year: 1, gdp: -0.4, unemp: 0.2, infl: -0.1, pubbal: -0.2, tradebal: -0.1, published: true },
    { key: 'ESP', year: 1, gdp: -0.6, unemp: 0.3, infl: -0.2, pubbal: -0.3, tradebal: -0.4, published: true }] });
  await api({ action: 'admin.state.set', key: 'TESTKEY', classId: cid, patch: { round: 2, status: 'open', councilOpen: false, revealRounds: [1], communique: 'Year 2: oil price shock (+30%).' } });
  await page.click('text=Refresh');
  await page.waitForSelector('text=Pledges vs decisions');
  await page.screenshot({ path: OUT + '/s7-game-year2.png', fullPage: true });
  await browser.close();
  console.log('pins', pins.join(' '), 'class', cid);
})().catch(e => { console.error(e); process.exit(1); });
