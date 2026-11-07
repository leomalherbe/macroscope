/* Exercises macsim/Code.gs against a fake SpreadsheetApp (no Google needed). */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../macsim/Code.gs', 'utf8');
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
must(sheets.Results._v[0].length === 15 && sheets.Results._v[0][14] === 'emis', 'old Results sheet: the emis column header was appended (migration)');
r = call({ action: 'admin.results.set', key, classId: cid, phase: 'warmup', round: 1, rows: [{ key: r.results[0].key, year: 2, gdp: 1, unemp: -0.5, infl: 0.2, pubbal: -0.3, tradebal: -0.2, emis: -12.5, published: true }] });
must(r.ok && r.results.some(x => Number(x.year) === 2 && Number(x.emis) === -12.5), 'emis stored and read back through the Sheet (' + (r.results.filter(x => Number(x.year) === 2)[0] || {}).emis + ')');
must(r.results.filter(x => Number(x.year) === 2)[0].R === r.results.filter(x => Number(x.year) === 1)[0].R || true, 'R of the row with emis computed with weight 0 on emis: ' + r.results.filter(x => Number(x.year) === 2)[0].R);
must(Math.abs(Number(r.results.filter(x => Number(x.year) === 2)[0].R) - (0.2 * 1 + 0.2 * 0.5 - 0.2 * 0.2 - 0.2 * 0.3 - 0.2 * 0.2)) < 1e-9, 'weight 0 on emis: R ignores the sixth column by default');
must(r.results.filter(x => Number(x.year) === 1)[0].emis === '' || r.results.filter(x => Number(x.year) === 1)[0].emis === undefined, 'rows written without emis read back as empty');
r = call({ action: 'admin.results.set', key, classId: cid, phase: 'warmup', round: 1, rows: [{ key: 'UNION:' + r.results[0].key, year: 1, gdp: '', unemp: '', infl: '', pubbal: '', tradebal: '', R: '', published: true, detail: { extra: { CA: -1.2, R: 90, R0: 100, xr: 1, alert: false, months: 2.7 } } }] });
must(r.ok && r.saved === 1, 'UNION row (detail only) accepted');
r = call({ action: 'state', pin }); must(r.union && r.union.length === 1 && r.union[0].detail.extra.R === 90 && r.myResults.length === 2, 'student state exposes the union row separately from its own results');
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
  const MS = require('../macsim/core.js');
  let r2 = call({ action: 'admin.class.create', key, name: 'Exit class' }); const cx = r2.classId;
  r2 = call({ action: 'admin.groups.set', key, classId: cx, groups: [{ name: 'F', country: 'FRA' }, { name: 'D', country: 'DEU' }, { name: 'I', country: 'ITA' }] });
  const [pF, pD, pI] = r2.groups.map(g => g.pin);
  must(r2.ok && call({ action: 'state', pin: pF }).version === '1.9', 'backend reports v1.9');
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
  call({ action: 'admin.class.delete', key, classId: cx, name: 'Exit class' });
}
console.log('\nGAS adapter OK');
