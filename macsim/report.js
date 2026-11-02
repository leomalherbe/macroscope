/* =====================================================================
   MacSim 2 end-of-year report (PDF) → results rows.
   Pure text parsing; works on the text of the "Objectifs Principaux"
   pages (Page 1.0 / 1.1 of every country). Used by admin.html (via pdf.js)
   and by the Node tests. Requires MS (core.js).
   ===================================================================== */
var MSReport = (function () {
  'use strict';
  var NAMES = {
    'BELGIQUE': 'BEL', 'ALLEMAGNE': 'DEU', 'FRANCE': 'FRA', 'ROYAUME UNI': 'GBR', 'ROYAUME-UNI': 'GBR', 'ITALIE': 'ITA',
    'JAPON': 'JPN', 'LUXEMBOURG': 'LUX', 'PAYS-BAS': 'NLD', 'PAYS BAS': 'NLD', 'ETATS UNIS': 'USA', 'ETATS-UNIS': 'USA', 'OEA': 'OEA',
    'BELGIUM': 'BEL', 'GERMANY': 'DEU', 'UNITED KINGDOM': 'GBR', 'ITALY': 'ITA', 'JAPAN': 'JPN', 'NETHERLANDS': 'NLD', 'UNITED STATES': 'USA'
  };
  /* label → regex on the normalised (accent-free, lower-case, single-spaced) text */
  var FIELDS = [
    { id: 'R',          re: /fonction objectif\s*(?:fonction objectif\s*)?/ },
    { id: 'gdp',        re: /ecart relatif du pib total par rapport au compte de reference \(en %\)\s*/ },
    { id: 'gdpGrowth',  re: /ecart de taux de croissance du pib en volume par rapport au compte de reference \(en points\)\s*/ },
    { id: 'unemp',      re: /ecart de niveau du taux de chomage par rapport au compte de reference \(en points\)\s*/ },
    { id: 'priceLevel', re: /ecart de niveau des prix de consommation par rapport au compte de reference\s*\(en %\)\s*/ },
    { id: 'infl',       re: /ecart du taux de croissance des prix de consommation par rapport au compte de reference \(en points\)\s*/ },
    { id: 'pubbalPrim', re: /ecart du solde public primaire en valeur par rapport au compte de reference \(en points de pib\)\s*/ },
    { id: 'pubbal',     re: /ecart du solde public en valeur par rapport au compte de reference \(en points de pib\)\s*/ },
    { id: 'tradebal',   re: /ecart du solde commercial en valeur par rapport au compte de reference \(en points de pib\)\s*/ }
  ];
  var NUMS = '((?:-?\\d+(?:[.,]\\d+)?\\s+)+)';
  var BLOCK = new RegExp(NUMS + 'effets des chocs\\s+' + NUMS + 'politique nationale seule\\s+' + NUMS + 'politiques etrangeres seules\\s+' + NUMS + 'ensemble');

  function norm(t) {
    return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
  }
  function num(s) { return Math.round(parseFloat(String(s).replace(',', '.')) * 1000) / 1000; }
  function nums(s) { return s.trim().split(/\s+/).map(num); }
  function countryCode(name) {
    var n = norm(name).toUpperCase().replace(/[^A-Z -]/g, '').trim();
    if (NAMES[n]) return NAMES[n];
    var keys = Object.keys(NAMES);
    for (var i = 0; i < keys.length; i++) if (n.indexOf(keys[i]) >= 0) return NAMES[keys[i]];
    return null;
  }
  /* which years the columns of a page stand for: the "annee 1 annee 2 …" line under the title, else 1..n */
  function pageYears(t, headerYear, n) {
    var m = /objectifs principaux[ .]*((?:annee \d+ ?)+)/.exec(t);
    if (m) { var ys = []; m[1].replace(/annee (\d+)/g, function (_, y) { ys.push(Number(y)); }); if (ys.length) return ys; }
    if (n === 1) return [headerYear];
    var out = []; for (var i = 1; i <= n; i++) out.push(i); return out;
  }

  /* pagesText: array of strings (one per PDF page). Returns {years:{<year>:{<country>:{R:{shock,nat,foreign,total},gdp:{…},…}}}, warnings:[]} */
  function parse(pagesText) {
    var years = {}, warnings = [], colYears = {};
    (pagesText || []).forEach(function (raw, idx) {
      var t = norm(raw);
      if (t.indexOf('objectifs principaux') < 0) return;
      var head = /annee\s+(\d+)\s+pays\s+(\d+)\s*:\s*([a-z' -]+?)\s+\d{2}\/\d{2}\/\d{4}/.exec(t) || /annee\s+(\d+)\s+pays\s+(\d+)\s*:\s*([a-z' -]+)/.exec(t);
      if (!head) { warnings.push('Page ' + (idx + 1) + ': header not recognised.'); return; }
      var headerYear = Number(head[1]);
      var code = countryCode(head[3]);
      if (!code) { warnings.push('Page ' + (idx + 1) + ': unknown country "' + head[3].trim() + '".'); return; }
      FIELDS.forEach(function (f) {
        var m = f.re.exec(t);
        if (!m) return;
        var rest = t.slice(m.index + m[0].length);
        var b = BLOCK.exec(rest);
        if (!b || b.index > 40) return;
        var sh = nums(b[1]), na = nums(b[2]), fo = nums(b[3]), to = nums(b[4]);
        var n = to.length;
        var ys = pageYears(t, headerYear, n);
        if (ys.length === n) colYears[code] = ys; else ys = colYears[code] && colYears[code].length === n ? colYears[code] : pageYears('', headerYear, n);
        for (var k = 0; k < n; k++) {
          var yr = ys[k];
          var y = years[yr] = years[yr] || {};
          var c = y[code] = y[code] || {};
          c[f.id] = { shock: sh[k], nat: na[k], foreign: fo[k], total: to[k] };
        }
      });
    });
    Object.keys(years).forEach(function (yr) {
      Object.keys(years[yr]).forEach(function (code) {
        var c = years[yr][code];
        ['R', 'gdp', 'unemp', 'infl', 'pubbal', 'tradebal'].forEach(function (k) { if (!c[k]) warnings.push('Year ' + yr + ' · ' + code + ': "' + k + '" not found.'); });
      });
    });
    return { years: years, warnings: warnings };
  }

  /* rows for admin.results.set: one per country and year */
  function toRows(parsed) {
    var rows = [];
    Object.keys(parsed.years).map(Number).sort(function (a, b) { return a - b; }).forEach(function (yr) {
      Object.keys(parsed.years[yr]).forEach(function (code) {
        var c = parsed.years[yr][code];
        var get = function (k) { return c[k] ? c[k].total : ''; };
        var detail = {};
        Object.keys(c).forEach(function (k) { detail[k] = { shock: c[k].shock, nat: c[k].nat, foreign: c[k].foreign }; });
        rows.push({ key: code, year: yr, gdp: get('gdp'), unemp: get('unemp'), infl: get('infl'), pubbal: get('pubbal'), tradebal: get('tradebal'), R: get('R'), detail: JSON.stringify(detail) });
      });
    });
    return rows;
  }

  /* pdf.js text items → page text with line breaks (items sorted top-to-bottom, left-to-right) */
  function itemsToText(items) {
    var rows = [];
    (items || []).forEach(function (it) {
      if (!it.str || !it.transform) return;
      var x = it.transform[4], y = it.transform[5];
      var row = null;
      for (var i = 0; i < rows.length; i++) if (Math.abs(rows[i].y - y) < 2.5) { row = rows[i]; break; }
      if (!row) { row = { y: y, items: [] }; rows.push(row); }
      row.items.push({ x: x, s: it.str });
    });
    rows.sort(function (a, b) { return b.y - a.y; });
    return rows.map(function (r) { r.items.sort(function (a, b) { return a.x - b.x; }); return r.items.map(function (i) { return i.s; }).join(' '); }).join('\n');
  }

  return { parse: parse, toRows: toRows, itemsToText: itemsToText, countryCode: countryCode, norm: norm };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MSReport;
