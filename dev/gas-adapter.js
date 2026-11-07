/* =====================================================================
   Google Apps Script adapter — storage in the bound Google Sheet,
   doGet / doPost web entry points, one-time setup().
   ===================================================================== */
var SHEETS = {
  config:    { name: 'Config',    header: ['key', 'value'] },
  groups:    { name: 'Groups',    header: ['classId', 'groupId', 'name', 'pin', 'country', 'members'] },
  decisions: { name: 'Decisions', header: null },   // built in decisionsHeader()
  results:   { name: 'Results',   header: ['ts', 'classId', 'phase', 'round', 'key', 'year', 'gdp', 'unemp', 'infl', 'pubbal', 'tradebal', 'R', 'published', 'detail', 'emis'] },   // emis appended last (v1.7) so older sheets stay aligned
  pledges:   { name: 'Pledges',   header: ['ts', 'classId', 'round', 'groupId', 'country', 'text', 'payload'] },
  comments:  { name: 'Comments',  header: ['ts', 'classId', 'phase', 'round', 'groupId', 'text'] },
  log:       { name: 'Log',       header: ['ts', 'action', 'classId', 'who', 'details'] }
};
var MAX_YEARS = 3;

function decisionsHeader() {
  var h = ['ts', 'classId', 'phase', 'round', 'groupId', 'country', 'used', 'text', 'payload'];
  for (var y = 1; y <= MAX_YEARS; y++) {
    MS.LEVERS.forEach(function (l) { h.push('Y' + y + ' ' + l.id); });
    h.push('Y' + y + ' tariffs'); h.push('Y' + y + ' euro'); h.push('Y' + y + ' tfp');
  }
  return h;
}
SHEETS.decisions.header = decisionsHeader();

function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) { /* fall through */ } }
  return SpreadsheetApp.getActiveSpreadsheet();
}
function getSheet_(ss, def) {
  var sh = ss.getSheetByName(def.name);
  if (!sh) {
    sh = ss.insertSheet(def.name);
    sh.getRange(1, 1, 1, def.header.length).setValues([def.header]).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else if (def.header && def.header.length) {
    /* migration: a column appended to a header (e.g. 'emis' in v1.7) is added to an existing sheet's header row */
    var have = sh.getLastColumn ? sh.getLastColumn() : 0;
    if (have > 0 && have < def.header.length) {
      sh.getRange(1, have + 1, 1, def.header.length - have).setValues([def.header.slice(have)]).setFontWeight('bold');
    }
  }
  return sh;
}
function normalizeCell_(v) {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string' && v.charAt(0) === "'") return v.slice(1);
  return v;
}
/* Strings are written as text literals: a leading apostrophe stops Sheets from
   parsing ISO timestamps as dates or a text starting with "=" as a formula. */
function cellSafe_(v) {
  if (typeof v === 'string' && /^[=+\-@']/.test(v)) return "'" + v;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return "'" + v;
  return v;
}

/* Run once from the script editor: creates the tabs and the administrator key. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  Object.keys(SHEETS).forEach(function (k) { getSheet_(ss, SHEETS[k]); });
  var first = ss.getSheets()[0];
  if (first.getName() === 'Sheet1' || first.getName() === 'Feuille 1') { if (ss.getSheets().length > 1) ss.deleteSheet(first); }
  var storage = makeStorage_(ss);
  var key = storage.getConfig('adminKey');
  if (!key) {
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', out = '';
    for (var i = 0; i < 12; i++) out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    key = out;
    storage.setConfig('adminKey', key);
  }
  if (!storage.getConfig('classes')) storage.setConfig('classes', '[]');
  Logger.log('Policy desk is ready. Administrator key: ' + key);
  try { SpreadsheetApp.getUi().alert('Policy desk is ready.\n\nAdministrator key: ' + key + '\n\n(also stored in the Config tab)'); } catch (e) { /* no UI when run headless */ }
  return key;
}

function makeStorage_(ss) {
  var cache = {};
  function sheet(k) { return getSheet_(ss, SHEETS[k]); }
  function readAll(k) {
    if (cache[k]) return cache[k];
    var sh = sheet(k);
    var values = sh.getDataRange().getValues();
    var header = SHEETS[k].header;
    var rows = [];
    for (var i = 1; i < values.length; i++) {
      var r = values[i];
      if (r.join('') === '') continue;
      var o = {};
      for (var j = 0; j < header.length; j++) o[header[j]] = normalizeCell_(r[j]);
      rows.push(o);
    }
    cache[k] = rows;
    return rows;
  }
  function toRow(k, obj) {
    var header = SHEETS[k].header;
    var o = Object.assign({}, obj);
    if (k === 'decisions' && typeof o.payload === 'string') {
      var pl; try { pl = JSON.parse(o.payload); } catch (e) { pl = null; }
      if (pl && pl.years) {
        pl.years.forEach(function (y, idx) {
          var n = idx + 1;
          MS.LEVERS.forEach(function (l) { o['Y' + n + ' ' + l.id] = (y.levers && y.levers[l.id]) || 0; });
          o['Y' + n + ' tariffs'] = Object.keys(y.tariffs || {}).map(function (p) { return p + ': ' + y.tariffs[p]; }).join('; ');
          o['Y' + n + ' euro'] = y.euro || 'none';
          o['Y' + n + ' tfp'] = y.tfp || 0;
        });
      }
    }
    return header.map(function (h) { var v = o[h]; return (v === undefined || v === null) ? '' : cellSafe_(v); });
  }
  return {
    now: function () { return new Date(); },
    getConfig: function (key) {
      var rows = readAll('config');
      for (var i = 0; i < rows.length; i++) if (String(rows[i].key) === key) return rows[i].value === '' ? null : String(rows[i].value);
      return null;
    },
    setConfig: function (key, value) {
      var sh = sheet('config');
      var values = sh.getDataRange().getValues();
      for (var i = 1; i < values.length; i++) {
        if (String(values[i][0]) === key) { sh.getRange(i + 1, 2).setValue(cellSafe_(value)); cache.config = null; return; }
      }
      sh.appendRow([key, cellSafe_(value)]);
      cache.config = null;
    },
    listGroups: function () {
      return readAll('groups').map(function (g) { return { classId: String(g.classId), groupId: String(g.groupId), name: String(g.name), pin: String(g.pin), country: String(g.country || ''), members: String(g.members || '') }; });
    },
    replaceGroups: function (classId, groups) {
      var keep = this.listGroups().filter(function (g) { return g.classId !== classId; }).concat(groups);
      var sh = sheet('groups');
      var header = SHEETS.groups.header;
      sh.clearContents();
      var data = [header].concat(keep.map(function (g) { return header.map(function (h) { return g[h] === undefined ? '' : cellSafe_(g[h]); }); }));
      sh.getRange(1, 1, data.length, header.length).setValues(data);
      sh.getRange(1, 1, 1, header.length).setFontWeight('bold');
      sh.getRange(2, 4, Math.max(data.length - 1, 1), 1).setNumberFormat('@');
      cache.groups = null;
    },
    appendRow: function (k, obj) {
      sheet(k).appendRow(toRow(k, obj));
      cache[k] = null;
    },
    readRows: function (k) { return readAll(k); },
    deleteConfig: function (key) {
      var sh = sheet('config');
      var values = sh.getDataRange().getValues();
      for (var i = values.length - 1; i >= 1; i--) if (String(values[i][0]) === key) sh.deleteRow(i + 1);
      cache.config = null;
    },
    /* rewrites the tab without the rows matching pred (append-only tabs, so this is the only destructive operation) */
    deleteRows: function (k, pred) {
      var sh = sheet(k);
      var header = SHEETS[k].header;
      var values = sh.getDataRange().getValues();
      if (values.length < 2) return 0;
      var keep = [values[0]], removed = 0;
      for (var i = 1; i < values.length; i++) {
        var r = values[i];
        if (r.join('') === '') continue;
        var o = {};
        for (var j = 0; j < header.length; j++) o[header[j]] = normalizeCell_(r[j]);
        if (pred(o)) removed++; else keep.push(r.map(cellSafe_));
      }
      if (removed) {
        sh.clearContents();
        sh.getRange(1, 1, keep.length, keep[0].length).setValues(keep);
        sh.getRange(1, 1, 1, header.length).setFontWeight('bold');
      }
      cache[k] = null;
      return removed;
    }
  };
}

/* ---------- web entry points ---------- */
function respond_(obj, callback) {
  var body = JSON.stringify(obj);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + body + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}
function run_(params) {
  var action = params.action;
  var p = Object.assign({}, params);
  if (typeof p.payload === 'string' && p.payload.charAt(0) === '{') { try { p.payload = JSON.parse(p.payload); } catch (e) { /* keep */ } }
  if (typeof p.patch === 'string') { try { p.patch = JSON.parse(p.patch); } catch (e) { /* keep */ } }
  if (typeof p.rows === 'string') { try { p.rows = JSON.parse(p.rows); } catch (e) { /* keep */ } }
  if (typeof p.groups === 'string') { try { p.groups = JSON.parse(p.groups); } catch (e) { /* keep */ } }
  var isWrite = ['submit', 'comment', 'pledge'].indexOf(action) >= 0 || (action && action.indexOf('admin.') === 0 && action !== 'admin.login' && action !== 'admin.overview');
  var lock = null;
  if (isWrite) { lock = LockService.getScriptLock(); try { lock.waitLock(15000); } catch (e) { return { ok: false, error: 'The server is busy, try again in a few seconds.' }; } }
  try {
    return MSService.handle(action, p, makeStorage_(getSpreadsheet_()));
  } finally {
    if (lock) lock.releaseLock();
  }
}
function doGet(e) {
  var params = (e && e.parameter) || {};
  if (params.q) { try { params = Object.assign({}, params, JSON.parse(params.q)); } catch (err) { /* ignore */ } }
  var callback = params.callback;
  delete params.callback;
  return respond_(run_(params), callback);
}
function doPost(e) {
  var params = {};
  try { params = JSON.parse(e.postData.contents); } catch (err) { params = (e && e.parameter) || {}; }
  return respond_(run_(params), null);
}
