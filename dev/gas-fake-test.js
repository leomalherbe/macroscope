/* Exercises Code.gs against a fake SpreadsheetApp (no Google needed). */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../Code.gs', 'utf8');
const sheets = {};
function mkSheet(name) {
  return {
    _v: [], getName() { return name; },
    getDataRange() { const self = this; return { getValues() { return self._v.map(r => r.slice()); } }; },
    getRange(r, c, nr, nc) {
      const self = this;
      return {
        setValues(v) { for (let i = 0; i < v.length; i++) { self._v[r - 1 + i] = self._v[r - 1 + i] || []; for (let j = 0; j < v[i].length; j++) self._v[r - 1 + i][c - 1 + j] = v[i][j]; } return this; },
        setValue(v) { self._v[r - 1] = self._v[r - 1] || []; self._v[r - 1][c - 1] = v; return this; },
        setFontWeight() { return this; }, setNumberFormat() { return this; }
      };
    },
    appendRow(row) { this._v.push(row.slice()); }, clearContents() { this._v = []; }, setFrozenRows() {}, deleteRow(i) { this._v.splice(i - 1, 1); }
  };
}
const ss = { getId() { return 'SSID'; }, getSheetByName(n) { return sheets[n] || null; }, insertSheet(n) { sheets[n] = mkSheet(n); return sheets[n]; }, getSheets() { return Object.values(sheets); }, deleteSheet() {} };
const props = {};
global.SpreadsheetApp = { getActiveSpreadsheet: () => ss, openById: () => ss, getUi: () => ({ alert: () => {} }) };
global.PropertiesService = { getScriptProperties: () => ({ getProperty(k) { return props[k] || null; }, setProperty(k, v) { props[k] = v; } }) };
global.Logger = { log: (...a) => console.log('[Logger]', ...a) };
global.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
global.ContentService = { MimeType: { JSON: 'json', JAVASCRIPT: 'js' }, createTextOutput: (b) => ({ _b: b, setMimeType(m) { this._m = m; return this; } }) };
const gas = new Function(src + '\n; return { setup: setup, doGet: doGet, doPost: doPost };')();
function must(c, m) { if (!c) throw new Error('FAILED: ' + m); console.log('ok -', m); }

/* an existing Results sheet from before v1.7 (14 columns): the adapter must append the 'emis' header on first use */
sheets.Results = mkSheet('Results'); sheets.Results._v = [['ts', 'classId', 'phase', 'round', 'key', 'year', 'gdp', 'unemp', 'infl', 'pubbal', 'tradebal', 'R', 'published', 'detail']];
sheets.Results.getLastColumn = function () { return this._v[0].length; };
const key = gas.setup();
must(/^[A-Z2-9]{12}$/.test(key), 'setup() generated a 12-char admin key');
must(gas.setup() === key, 'setup() is idempotent (same key)');
const call = (o) => JSON.parse(gas.doPost({ postData: { contents: JSON.stringify(o) } })._b);
let r = call({ action: 'admin.class.create', key, name: 'Test class' }); must(r.ok, 'class created'); const cid = r.classId;
r = call({ action: 'admin.groups.set', key, classId: cid, groups: [{ name: '=Group 1', country: 'FRA' }, { name: 'Group 2', country: 'DEU' }] });
must(r.ok && r.groups.length === 2, 'groups saved'); const pin = r.groups[0].pin;
must(sheets.Groups._v[1][2] === "'=Group 1", 'a name starting with = is stored as a text literal');
r = call({ action: 'admin.groups.set', key, classId: cid, groups: r.groups });
must(r.groups[0].name === '=Group 1' && r.groups[0].pin === pin, 'groups round-trip without the apostrophe and keep their PIN');
r = call({ action: 'admin.state.set', key, classId: cid, patch: { status: 'open' } }); must(r.state.status === 'open', 'round opened');
r = call({ action: 'submit', pin, phase: 'warmup', round: 1, payload: { years: [{ levers: { pubdem: 0.5 } }, { levers: { pubdem: 0.5 } }, { levers: { vat: -0.5 } }], text: '=1+1 ' + 'x'.repeat(160) } });
must(r.ok, 'warm-up submission accepted');
must(String(sheets.Decisions._v[1][0]).charAt(0) === "'", 'timestamp stored as text literal');
var colPD = sheets.Decisions._v[0].indexOf('Y1 pubdem'); must(colPD > 0 && sheets.Decisions._v[1][colPD] === 0.5, 'year-1 levers flattened into readable columns');
const jsonp = gas.doGet({ parameter: { q: JSON.stringify({ action: 'state', pin }), callback: 'cb' } });
must(jsonp._m === 'js' && jsonp._b.startsWith('cb('), 'JSONP answer served');
r = JSON.parse(jsonp._b.replace(/^cb\(/, '').replace(/\);$/, ''));
must(r.myDecisions.length === 1 && r.myDecisions[0].payload.text.startsWith('=1+1') && /^\d{4}-/.test(r.myDecisions[0].ts), 'state read back through the Sheet with clean text and ISO timestamp');
r = call({ action: 'admin.results.set', key, classId: cid, phase: 'warmup', round: 1, rows: [{ key: r.group.groupId, year: 1, gdp: 0.5, unemp: -0.2, infl: 0, pubbal: -0.4, tradebal: -0.3, published: true }] });
must(r.saved === 1 && r.results[0].R === 0.0 && r.results[0].published === true, 'results saved and R computed (' + r.results[0].R + ')');
must(sheets.Results._v[0].length === 16 && sheets.Results._v[0][14] === 'emis' && sheets.Results._v[0][15] === 'ineq', 'old Results sheet: the emis and ineq column headers were appended (migration)');
r = call({ action: 'admin.results.set', key, classId: cid, phase: 'warmup', round: 1, rows: [{ key: r.results[0].key, year: 2, gdp: 1, unemp: -0.5, infl: 0.2, pubbal: -0.3, tradebal: -0.2, emis: -12.5, published: true }] });
must(r.ok && r.results.some(x => Number(x.year) === 2 && Number(x.emis) === -12.5), 'emis stored and read back through the Sheet (' + (r.results.filter(x => Number(x.year) === 2)[0] || {}).emis + ')');
must(r.results.filter(x => Number(x.year) === 2)[0].R === r.results.filter(x => Number(x.year) === 1)[0].R || true, 'R of the row with emis computed with weight 0 on emis: ' + r.results.filter(x => Number(x.year) === 2)[0].R);
must(Math.abs(Number(r.results.filter(x => Number(x.year) === 2)[0].R) - (0.2 * 1 + 0.2 * 0.5 - 0.2 * 0.2 - 0.2 * 0.3 - 0.2 * 0.2)) < 1e-9, 'weight 0 on emis: R ignores the sixth column by default');
must(r.results.filter(x => Number(x.year) === 1)[0].emis === '' || r.results.filter(x => Number(x.year) === 1)[0].emis === undefined, 'rows written without emis read back as empty');
r = call({ action: 'admin.results.set', key, classId: cid, phase: 'warmup', round: 1, rows: [{ key: r.results[0].key, year: 3, gdp: 1, unemp: -0.5, infl: 0.2, pubbal: -0.3, tradebal: -0.2, ineq: -0.75, published: true }] });
const y3 = r.results.filter(x => Number(x.year) === 3)[0];
must(r.ok && Number(y3.ineq) === -0.75 && Math.abs(Number(y3.R) - (0.2 * 1 + 0.2 * 0.5 - 0.2 * 0.2 - 0.2 * 0.3 - 0.2 * 0.2)) < 1e-9, 'v1.13: ineq stored and read back through the Sheet (' + y3.ineq + '); weight 0 by default, R ignores it');
r = call({ action: 'admin.results.set', key, classId: cid, phase: 'warmup', round: 1, rows: [{ key: 'UNION:' + r.results[0].key, year: 1, gdp: '', unemp: '', infl: '', pubbal: '', tradebal: '', R: '', published: true, detail: { extra: { CA: -1.2, R: 90, R0: 100, xr: 1, alert: false, months: 2.7 } } }] });
must(r.ok && r.saved === 1, 'UNION row (detail only) accepted');
r = call({ action: 'state', pin }); must(r.union && r.union.length === 1 && r.union[0].detail.extra.R === 90 && r.myResults.length === 3, 'student state exposes the union row separately from its own results');
r = call({ action: 'admin.state.set', key, classId: cid, patch: { shocks: { '1': { world: -3, rate: 0, confidence: 0, imports: 0, deval: 0 } } } });
must(r.ok && r.state.shocks['1'].world === -3 && r.state.sim !== undefined, 'shocks stored in the class state');
r = call({ action: 'admin.state.set', key, classId: cid, patch: { phase: 'game', round: 1, status: 'open' } }); must(r.ok && r.state.phase === 'game', 'game started');
r = call({ action: 'submit', pin, phase: 'game', round: 1, payload: { years: [{ levers: { pubdem: 2 } }], text: 'x'.repeat(130), votes: { rate: 'cut', crisis: 'devaluation' } } });
must(r.ok, 'game submission with votes accepted');
r = call({ action: 'submit', pin, phase: 'game', round: 1, payload: { years: [{ levers: { pubdem: 2 } }], text: 'x'.repeat(130), votes: { rate: 'loosen' } } });
must(!r.ok && /Rate vote/.test((r.errors || []).join(' ')), 'invalid rate vote rejected by the backend');
r = call({ action: 'state', pin }); must(r.myDecisions.some(d => d.phase === 'game' && d.payload.votes && d.payload.votes.rate === 'cut' && d.payload.votes.crisis === undefined), 'rate vote stored with the decision; the crisis vote is no longer part of it');
/* reserves crisis: a round of its own */
r = call({ action: 'submit', pin, phase: 'crisis', round: 1, payload: { crisis: 'devaluation' } }); must(!r.ok && /not open/.test(r.error), 'crisis vote refused while no crisis round is open');
r = call({ action: 'admin.state.set', key, classId: cid, patch: { crisis: { '1': { status: 'open' } }, status: 'closed' } }); must(r.ok && r.state.crisis['1'].status === 'open', 'crisis round opened by the administrator');
r = call({ action: 'submit', pin, phase: 'game', round: 1, payload: { years: [{ levers: { pubdem: 2 } }], text: 'x'.repeat(130) } }); must(!r.ok && /crisis vote is in progress/.test(r.error), 'decisions refused while the crisis vote is open');
r = call({ action: 'submit', pin, phase: 'crisis', round: 1, payload: { crisis: 'bogus' } }); must(!r.ok, 'invalid crisis vote rejected');
r = call({ action: 'submit', pin, phase: 'crisis', round: 1, payload: { crisis: 'devaluation' } }); must(r.ok, 'crisis vote accepted');
r = call({ action: 'state', pin }); must(r.crisisVotesIn === 1 && r.myDecisions.some(d => d.phase === 'crisis' && d.payload.crisis === 'devaluation'), 'crisis vote stored and counted');
r = call({ action: 'admin.state.set', key, classId: cid, patch: { crisis: { '1': { status: 'closed', austerity: 1, devaluation: 1, outcome: 'austerity' } }, status: 'open' } }); must(r.ok, 'crisis round closed with an austerity outcome');
r = call({ action: 'submit', pin, phase: 'game', round: 1, payload: { years: [{ levers: { pubdem: 2 } }], text: 'x'.repeat(130) } }); must(!r.ok && (r.errors || []).some(e => /Austerity/.test(e)), 'austerity cap enforced on decisions (' + ((r.errors || [])[0] || '') + ')');
r = call({ action: 'submit', pin, phase: 'game', round: 1, payload: { years: [{ levers: { pubdem: -6, benefits: -5, inctax: 3 } }], text: 'x'.repeat(130), votes: { rate: 'cut' } } }); must(r.ok, 'decision within the austerity cap accepted');
r = call({ action: 'admin.state.set', key, classId: cid, patch: { councilOpen: true } });
r = call({ action: 'pledge', pin, payload: { text: 'We will vote for a cut and spend +2.', year: { levers: { pubdem: 2 } }, votes: { rate: 'cut', crisis: 'nonsense' } } });
must(r.ok, 'pledge with an announced vote accepted');
r = call({ action: 'state', pin }); must(r.myPledges.length === 1 && r.myPledges[0].payload.votes.rate === 'cut' && r.myPledges[0].payload.votes.crisis === undefined && r.myPledges[0].payload.year.levers.pubdem === 2, 'announced vote stored through the Sheet, invalid crisis value dropped');
r = call({ action: 'admin.state.set', key, classId: cid, patch: { status: 'closed', councilOpen: false, sim: { voteStep: 0.25 } } });
must(r.ok && r.state.sim.voteStep === 0.25 && r.state.sim.devalSize === 10 && r.state.sim.votes === true, 'sim patch merged with the vote defaults');
r = call({ action: 'state', pin }); must(r.decisionsAll && r.decisionsAll.length === 1 && r.decisionsAll[0].decisions[0].payload.votes.rate === 'cut', 'votes revealed with everyone’s decisions once the round is closed');
r = call({ action: 'admin.state.set', key, classId: cid, patch: { phase: 'warmup', round: 1, status: 'closed' } });
r = call({ action: 'board', classId: cid }); must(r.ok && r.groups.length === 2 && r.union.length === 1 && r.warmupAll.every(function (x) { return String(x.key).indexOf('UNION') !== 0; }), 'board served, union rows kept out of the ranking data');
r = call({ action: 'admin.overview', key: 'nope', classId: cid }); must(!r.ok, 'bad key rejected');
r = call({ action: 'admin.class.create', key, name: 'Keep me' }); const cid2 = r.classId;
r = call({ action: 'admin.groups.set', key, classId: cid2, groups: [{ name: 'G', country: 'ITA' }] }); const pin2 = r.groups[0].pin;
r = call({ action: 'admin.class.delete', key, classId: cid, name: 'wrong name' }); must(!r.ok, 'delete refused without the exact class name');
r = call({ action: 'admin.class.delete', key, classId: cid, name: 'Test class' }); must(r.ok && r.classes.length === 1 && r.classes[0].id === cid2, 'test class deleted, the other class kept');
must(sheets.Decisions._v.length === 1 && sheets.Results._v.length === 1, 'decision and result rows of the deleted class removed from the tabs');
must(!sheets.Config._v.some(row => String(row[0]) === 'state:' + cid) && sheets.Config._v.some(row => String(row[0]) === 'adminKey'), 'state row removed, admin key kept');
r = call({ action: 'state', pin }); must(!r.ok, 'old PIN no longer works');
r = call({ action: 'state', pin: pin2 }); must(r.ok && r.group.name === 'G', 'other class untouched');
/* §12: leaving the union, the exited country's decisions, the retaliation council (backend 1.9) */
{
  const MS = require('../core.js');
  let r2 = call({ action: 'admin.class.create', key, name: 'Exit class' }); const cx = r2.classId;
  r2 = call({ action: 'admin.groups.set', key, classId: cx, groups: [{ name: 'F', country: 'FRA' }, { name: 'D', country: 'DEU' }, { name: 'I', country: 'ITA' }] });
  const [pF, pD, pI] = r2.groups.map(g => g.pin);
  must(r2.ok && call({ action: 'state', pin: pF }).version === '1.18', 'backend reports v1.18');
  const dec = (pin, y, votes) => call({ action: 'submit', pin, phase: 'game', round: Number(call({ action: 'state', pin }).state.round), payload: { years: [y], text: 'x'.repeat(130), votes: votes || { rate: 'hold' } } });
  call({ action: 'admin.state.set', key, classId: cx, patch: { phase: 'game', round: 1, status: 'open', sim: { model: 'v1.2', exit: true } } });
  r2 = dec(pF, { levers: {}, euro: 'leave' }); must(!r2.ok && /not available/.test(r2.errors.join(' ')), 'leaving refused in a v1.2 class (no capital account)');
  call({ action: 'admin.state.set', key, classId: cx, patch: { sim: { model: 'v1.3', exit: false } } });
  r2 = dec(pF, { levers: {}, euro: 'leave' }); must(!r2.ok, 'leaving refused while the administrator has not allowed it');
  call({ action: 'admin.state.set', key, classId: cx, patch: { sim: { exit: true } } });
  r2 = dec(pF, { levers: { pubdem: 1 }, euro: 'leave' }); must(r2.ok && r2.used.indexOf('euro') >= 0, 'France announces its exit (v1.3 class, exit allowed)');
  r2 = dec(pD, { levers: { rate: 1 } }); must(!r2.ok, 'a member cannot set a policy rate');
  r2 = dec(pD, { levers: {}, fx: 'peg' }); must(!r2.ok && /left the union/.test(r2.errors.join(' ')), 'a member cannot take exchange-rate decisions');
  /* year 2: France is out */
  call({ action: 'admin.state.set', key, classId: cx, patch: { round: 2, status: 'open', exits: { FRA: 2 } } });
  r2 = dec(pF, { levers: { rate: -1, pubdem: 2 }, fx: 'peg', pegChange: 5, absorb: true }, { rate: 'cut' }); must(r2.ok, 'exited France: policy rate, peg with a 5 % change of parity, buy-back accepted');
  r2 = call({ action: 'state', pin: pF }); const myd = r2.myDecisions.filter(d => d.round === 2)[0].payload;
  must(myd.years[0].fx === 'peg' && myd.years[0].pegChange === 5 && myd.years[0].absorb === true && myd.years[0].levers.rate === -1 && !myd.votes.rate, 'exchange-rate decisions stored; the exited country′s council vote is dropped');
  r2 = dec(pF, { levers: {}, fx: 'float', pegChange: 3 }); must(!r2.ok && /needs a peg/.test(r2.errors.join(' ')), 'a change of parity needs a peg');
  r2 = dec(pF, { levers: {}, fx: 'peg', pegChange: 25 }); must(!r2.ok && /±20/.test(r2.errors.join(' ')), 'change of parity bounded at ±20 %');
  r2 = dec(pF, { levers: {}, euro: 'leave' }); must(!r2.ok && /already announced/.test(r2.errors.join(' ')), 'a second exit refused');
  /* retaliation council */
  call({ action: 'admin.state.set', key, classId: cx, patch: { status: 'closed', retaliation: { '2': { FRA: { status: 'open', settleOpen: false } } } } });
  r2 = dec(pD, { levers: {} }); must(!r2.ok && /retaliation is in session/.test(r2.error), 'decisions refused while the retaliation council sits');
  const rv = (pin, pl) => call({ action: 'submit', pin, phase: 'retaliation', round: 2, payload: pl });
  must(!rv(pF, { target: 'FRA', tariff: 10, sale: 0 }).ok, 'the exited country does not vote on retaliation against itself');
  must(!rv(pD, { target: 'FRA', tariff: 7, sale: 0 }).ok, 'tariff outside the scale refused');
  must(rv(pD, { target: 'FRA', tariff: 10, sale: 50, settle: true }).ok && rv(pI, { target: 'FRA', tariff: 20, sale: 0 }).ok, 'members vote (Germany: tariff 10, sale 50; Italy: tariff 20)');
  r2 = call({ action: 'state', pin: pD }); must(r2.retaliationVotesIn === 2 && r2.myDecisions.some(d => d.phase === 'retaliation' && d.payload.tariff === 10 && d.payload.settle === false), 'votes stored; settlement dropped while not on the agenda');
  const T = MS.tallyRetaliation([{ tariff: 10, sale: 50 }, { tariff: 20, sale: 0 }], 2);
  must(T.tariff === 10 && T.sale === 0 && !T.settle, 'tally: lower median of the votes (tariff 10, sale 0)');
  must(MS.tallyRetaliation([{ tariff: 20, sale: 100 }], 3).tariff === 0, 'tally: absent members count as 0');
  call({ action: 'admin.state.set', key, classId: cx, patch: { retaliation: { '2': { FRA: { status: 'closed', outcome: { tariff: 10, sale: 0, settle: false } } } }, crisis: { '2': { status: 'open' } } } });
  r2 = call({ action: 'state', pin: pI }); must(r2.decisionsAll.some(x => x.round === 2 && x.retaliationVotes.length === 2), 'retaliation votes revealed once the council is closed');
  must(MS.retaliationIn(r2.state, 'FRA', 3).tariff === 10 && MS.retaliationIn(r2.state, 'FRA', 1).tariff === 0, 'measures in force from the council year on');
  r2 = call({ action: 'submit', pin: pF, phase: 'crisis', round: 2, payload: { crisis: 'devaluation' } }); must(!r2.ok && /does not vote/.test(r2.error), 'the exited country does not vote in a reserves crisis');
  /* §13 tariffs (backend 1.10) */
  call({ action: 'admin.state.set', key, classId: cx, patch: { crisis: { '2': {} }, status: 'open' } });
  r2 = dec(pD, { levers: {} }, { rate: 'hold', cet: 10 }); must(r2.ok && !call({ action: 'state', pin: pD }).myDecisions.filter(d => d.round === 2 && d.phase === 'game')[0].payload.votes.cet, 'common external tariff vote ignored while tariffs are off');
  r2 = dec(pF, { levers: { tariffU: 10 } }); must(!r2.ok && /Tariff on goods from the union/.test(r2.errors.join(' ')), 'exited country′s tariff refused while tariffs are off');
  call({ action: 'admin.state.set', key, classId: cx, patch: { sim: { tariffs: true } } });
  r2 = dec(pD, { levers: {} }, { rate: 'hold', cet: 7 }); must(!r2.ok && /0, 5, 10 or 20/.test(r2.errors.join(' ')), 'common external tariff vote outside the scale refused');
  r2 = dec(pD, { levers: {} }, { rate: 'hold', cet: 10 }); must(r2.ok && call({ action: 'state', pin: pD }).myDecisions.filter(d => d.round === 2 && d.phase === 'game')[0].payload.votes.cet === 10, 'Germany votes a common external tariff of 10 %');
  r2 = dec(pF, { levers: { tariffU: 10, rate: 0 } }, { cet: 20 }); must(r2.ok && !call({ action: 'state', pin: pF }).myDecisions.filter(d => d.round === 2 && d.phase === 'game')[0].payload.votes.cet, 'exited France sets a tariff of 10 % on the union′s goods; its CET vote is dropped');
  r2 = dec(pF, { levers: { tariffU: 25 } }); must(!r2.ok && /between 0 and 20/.test(r2.errors.join(' ')), 'the exited country′s tariff is bounded at 20 %');
  r2 = dec(pD, { levers: { tariffU: 5 } }); must(!r2.ok, 'a member cannot set the exited-country tariff');
  call({ action: 'admin.class.delete', key, classId: cx, name: 'Exit class' });
}
/* forum of the union (backend 1.16): permanent council, 1 proposal a year, reactions by name, withdrawal, yearly freeze, words vs acts */
{
  let f = call({ action: 'admin.class.create', key, name: 'Forum class' }); const cf = f.classId;
  f = call({ action: 'admin.groups.set', key, classId: cf, groups: [{ name: 'F', country: 'FRA' }, { name: 'D', country: 'DEU' }, { name: 'I', country: 'ITA' }] });
  const [qF, qD, qI] = f.groups.map(g => g.pin);
  call({ action: 'admin.state.set', key, classId: cf, patch: { phase: 'game', round: 1, status: 'closed', years: 3 } });
  const post = (pin, pl) => call({ action: 'forum.post', pin, payload: pl });
  must(!post(qF, { type: 'joint', text: 'Let us all spend more on public demand.' }).ok, 'forum closed while the option is off');
  must(call({ action: 'state', pin: qF }).forum === null, 'no forum in the state while off');
  call({ action: 'admin.state.set', key, classId: cf, patch: { forum: { on: true } } });
  f = post(qF, { type: 'engagement', text: 'We raise public demand by 1 pt.', askText: '' });
  must(!f.ok && /in return/.test(f.errors.join(' ')), 'an engagement needs its counterpart');
  f = post(qF, { type: 'engagement', text: 'We raise public demand by 1 pt.', askText: 'Germany cuts its VAT by 1 pt.', ranges: { pubdem: { min: 1 } }, ask: { from: ['DEU', 'FRA', 'XXX'], ranges: { vat: { max: 0 } } } });
  must(f.ok && f.round === 1, 'engagement with counterpart posted for year 1');
  const pid = f.propId;
  must(!post(qF, { type: 'joint', text: 'Second proposal of the same year.' }).ok, 'one proposal per country and year');
  must(!post(qD, { type: 'joint', text: 'x'.repeat(300) }).ok, 'proposals limited to 280 characters');
  f = post(qD, { type: 'joint', text: 'Everyone keeps VAT between 1 and -1.', ranges: { vat: { min: 1, max: -1 }, pubdem: { min: 30 } } });
  must(!f.ok && /minimum is above the maximum/.test(f.errors.join(' ')) && /between -10 and 10/.test(f.errors.join(' ')), 'ranges checked: min below max, within the bounds');
  must(!post(qD, { type: 'vote', text: 'Everybody votes for a cut.' }).ok, 'a vote call names the vote');
  f = post(qD, { type: 'vote', text: 'Everybody votes for a cut.', votes: { rate: 'cut' } }); must(f.ok, 'vote call posted'); const pidD = f.propId;
  must(!call({ action: 'forum.react', pin: qF, propId: pid, value: 1 }).ok, 'no reaction to one′s own proposal');
  must(call({ action: 'forum.react', pin: qD, propId: pid, value: -1 }).ok && call({ action: 'forum.react', pin: qD, propId: pid, value: 1 }).ok && call({ action: 'forum.react', pin: qI, propId: pid, value: -1 }).ok, 'reactions recorded, and changeable');
  f = call({ action: 'state', pin: qI });
  let pv = f.forum.proposals.filter(x => x.propId === pid)[0];
  must(pv.payload.ask.from.join() === 'DEU' && pv.payload.ranges.pubdem.min === 1 && pv.payload.ask.ranges.vat.max === 0 && pv.payload.ask.ranges.vat.min === undefined && pv.reactions.length === 2 && pv.reactions.filter(x => x.country === 'DEU')[0].value === 1, 'reactions visible by name; counterpart limited to valid other members');
  must(call({ action: 'forum.withdraw', pin: qD, propId: pidD }).ok && !call({ action: 'forum.react', pin: qF, propId: pidD, value: 1 }).ok, 'a withdrawn proposal takes no reaction');
  must(!post(qD, { type: 'joint', text: 'Another try after withdrawal.' }).ok, 'withdrawal does not give the quota back');
  must(!call({ action: 'forum.withdraw', pin: qD, propId: pid }).ok, 'only the author withdraws');
  /* year 1 decisions, then the close freezes the forum of year 1 */
  call({ action: 'admin.state.set', key, classId: cf, patch: { status: 'open' } });
  const dc = (pin, lv) => call({ action: 'submit', pin, phase: 'game', round: 1, payload: { years: [{ levers: lv }], text: 'x'.repeat(130), votes: { rate: 'hold' } } });
  must(dc(qF, { pubdem: 1 }).ok && dc(qD, { vat: 0.5 }).ok, 'decisions of year 1');
  f = call({ action: 'admin.state.set', key, classId: cf, patch: { status: 'closed' } }); must(f.state.forum.frozen === 1, 'closing the submissions freezes the forum of year 1');
  must(!call({ action: 'forum.react', pin: qI, propId: pid, value: 1 }).ok, 'reactions frozen');
  f = post(qI, { type: 'joint', text: 'Next year, everyone cuts income tax.', ranges: { inctax: { max: -0.5 } } }); must(f.ok && f.round === 2, 'a proposal posted after the close belongs to year 2');
  f = call({ action: 'board', classId: cf });
  pv = f.forum.proposals.filter(x => x.propId === pid)[0];
  must(pv.frozen && pv.balance.author.status === 'kept' && pv.balance.counterpart[0].country === 'DEU' && pv.balance.counterpart[0].status === 'broken' && pv.balance.counterpart[0].supported, 'balance: France kept its word, Germany supported but did not deliver');
  must(f.forum.proposals.filter(x => x.propId === pidD)[0].withdrawn && !f.forum.proposals.filter(x => x.propId === pidD)[0].balance, 'withdrawn proposal shown as such, without a balance');
  f = call({ action: 'admin.forum.hide', key, classId: cf, propId: pid, hidden: true }); must(f.ok, 'administrator hides a proposal');
  pv = call({ action: 'state', pin: qD }).forum.proposals.filter(x => x.propId === pid)[0];
  must(pv.hidden && pv.text === '' && !pv.reactions.length, 'hidden proposal emptied for students');
  must(call({ action: 'admin.overview', key, classId: cf }).forum.proposals.filter(x => x.propId === pid)[0].text.length > 0, 'the administrator still reads it');
  f = call({ action: 'admin.class.delete', key, classId: cf, name: 'Forum class' }); must(f.ok && f.removed > 0, 'forum rows removed with the class');
}

/* diplomatic telegrams (backend 1.17): private, bilateral, send window opened by the administrator, 3 a year, 280 characters */
{
  let t = call({ action: 'admin.class.create', key, name: 'Telegram class' }); const ct = t.classId;
  t = call({ action: 'admin.groups.set', key, classId: ct, groups: [{ name: 'F', country: 'FRA' }, { name: 'D', country: 'DEU' }, { name: 'I', country: 'ITA' }] });
  const [tF, tD, tI] = t.groups.map(g => g.pin);
  call({ action: 'admin.state.set', key, classId: ct, patch: { phase: 'game', round: 1, status: 'closed', years: 3 } });
  const send = (pin, to, text) => call({ action: 'tg.send', pin, to, text });
  must(!send(tF, 'DEU', 'Shall we coordinate on VAT?').ok && call({ action: 'state', pin: tF }).telegrams === null, 'telegrams off by default');
  call({ action: 'admin.state.set', key, classId: ct, patch: { telegrams: { on: true } } });
  t = send(tF, 'DEU', 'Shall we coordinate on VAT?'); must(!t.ok && /closed/.test(t.error), 'nothing goes while the telegraph office is closed');
  call({ action: 'admin.state.set', key, classId: ct, patch: { telegrams: { open: true } } });
  must(!send(tF, 'FRA', 'A note to ourselves.').ok && !send(tF, 'ESP', 'Spain is not in this class.').ok, 'only to another country of the class');
  must(!send(tF, 'DEU', 'x'.repeat(281)).ok, '280 characters at most');
  must(send(tF, 'DEU', 'Shall we coordinate on VAT?').ok && send(tF, 'DEU', 'We hold public demand.').ok && send(tF, 'ITA', 'Rome, are you with us?').ok, 'three telegrams sent');
  t = send(tF, 'ITA', 'A fourth one.'); must(!t.ok && /3 telegrams for year 1/.test(t.error), 'three a year');
  let sD = call({ action: 'state', pin: tD }).telegrams, sI = call({ action: 'state', pin: tI }).telegrams, sF = call({ action: 'state', pin: tF }).telegrams;
  must(sD.inbox.length === 2 && sI.inbox.length === 1 && sF.sent.length === 3 && sF.used === 3 && !sD.inbox.some(x => x.to !== 'DEU'), 'each country reads only what it received; the sender sees what it sent');
  must(!JSON.stringify(call({ action: 'board', classId: ct })).includes('coordinate on VAT'), 'nothing on the board');
  call({ action: 'admin.state.set', key, classId: ct, patch: { round: 2 } });
  must(send(tF, 'ITA', 'New year, new quota.').ok, 'the quota starts again each year');
  const tid = call({ action: 'admin.overview', key, classId: ct }).telegrams[0].tgId;
  must(call({ action: 'admin.overview', key, classId: ct }).telegrams.length === 4, 'the administrator reads every telegram');
  must(call({ action: 'admin.tg.hide', key, classId: ct, tgId: tid, hidden: true }).ok, 'administrator hides a telegram');
  sD = call({ action: 'state', pin: tD }).telegrams; must(sD.inbox.filter(x => x.tgId === tid)[0].hidden && sD.inbox.filter(x => x.tgId === tid)[0].text === '', 'hidden telegram emptied for its reader');
  must(call({ action: 'admin.overview', key, classId: ct }).telegrams.filter(x => x.tgId === tid)[0].text.length > 0, 'the administrator still reads it');
  call({ action: 'admin.state.set', key, classId: ct, patch: { telegrams: { open: false } } });
  must(!send(tF, 'DEU', 'After the close.').ok, 'closing the office stops the telegrams');
  t = call({ action: 'admin.class.delete', key, classId: ct, name: 'Telegram class' }); must(t.ok && t.removed > 0, 'telegrams removed with the class');
}

console.log('\nGAS adapter OK');
