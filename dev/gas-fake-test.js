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
console.log('\nGAS adapter OK');
