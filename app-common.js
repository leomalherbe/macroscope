/* OPEN-MU policy desk — browser helpers shared by the three pages (requires core.js + config.js) */
var MSApi = (function () {
  'use strict';
  var JSONP_N = 0;
  function apiUrl() {
    var q = new URLSearchParams(location.search).get('api');
    if (q) { try { localStorage.setItem('macsim.api', q); } catch (e) { /* ignore */ } return q; }
    var cfg = (window.MACSIM_CONFIG && window.MACSIM_CONFIG.API_URL) || '';
    if (cfg) return cfg;
    try { return localStorage.getItem('macsim.api') || ''; } catch (e) { return ''; }
  }
  function setApiUrl(u) { try { localStorage.setItem('macsim.api', u || ''); } catch (e) { /* ignore */ } }
  function jsonp(base, body) {
    return new Promise(function (resolve, reject) {
      var cb = '__msjsonp' + (++JSONP_N);
      var s = document.createElement('script');
      var timer = setTimeout(function () { cleanup(); reject(new Error('No answer from the server (timeout).')); }, 25000);
      function cleanup() { clearTimeout(timer); delete window[cb]; if (s.parentNode) s.parentNode.removeChild(s); }
      window[cb] = function (data) { cleanup(); resolve(data); };
      s.onerror = function () { cleanup(); reject(new Error('Cannot reach the server.')); };
      s.src = base + (base.indexOf('?') >= 0 ? '&' : '?') + 'q=' + encodeURIComponent(body) + '&callback=' + cb + '&_=' + Date.now();
      document.head.appendChild(s);
    });
  }
  /* « The server is busy »: the request found the backend's write lock taken and wrote nothing — try again, up to three times */
  async function call(action, params) {
    for (var attempt = 0; ; attempt++) {
      var res = await call1(action, params);
      if (attempt < 3 && res && res.ok === false && /server is busy/i.test(String(res.error || ''))) { await new Promise(function (ok) { setTimeout(ok, 1500 * (attempt + 1)); }); continue; }
      return res;
    }
  }
  async function call1(action, params) {
    var base = apiUrl();
    if (!base) throw new Error('No backend URL is configured (config.js).');
    var body = JSON.stringify(Object.assign({ action: action }, params || {}));
    try {
      var r = await fetch(base, { method: 'POST', body: body, redirect: 'follow' });
      if (r.ok) return await r.json();
    } catch (e) { /* fall back to GET */ }
    try {
      var r2 = await fetch(base + (base.indexOf('?') >= 0 ? '&' : '?') + 'q=' + encodeURIComponent(body) + '&_=' + Date.now(), { redirect: 'follow' });
      if (r2.ok) return await r2.json();
    } catch (e) { /* fall back to JSONP */ }
    return jsonp(base, body);
  }
  /* polling without rereading: ask the backend's stamp (it changes with every write) and say whether the page must reload its
     data — when the stamp changed, or after maxAge ms anyway (deadlines pass without a write). A backend without stamps (before
     1.14) gets the former rhythm: a reload every `every` ms. */
  var stamps = {};
  async function due(key, maxAge, every) {
    var now = Date.now(), st = stamps[key] || (stamps[key] = { s: undefined, t: 0, none: false });
    if (st.none) { if (now - st.t >= every) { st.t = now; return true; } return false; }
    var r = null; try { r = await call1('stamp', {}); } catch (e) { r = null; }
    if (r && r.ok === false && /unknown action/i.test(String(r.error || ''))) { st.none = true; st.t = now; return true; }
    var s = r && r.ok ? r.stamp : null;
    if (s === null || s !== st.s || now - st.t >= maxAge) { st.s = s; st.t = now; return true; }
    return false;
  }
  return { call: call, due: due, apiUrl: apiUrl, setApiUrl: setApiUrl };
})();

var UI = (function () {
  'use strict';
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (children || []).forEach(function (c) { if (c === null || c === undefined) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  var toastEl = null, toastTimer = null;
  function toast(msg, ms) {
    if (!toastEl) { toastEl = el('div', { class: 'toast' }); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, ms || 2600);
  }
  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d)) return String(iso);
    return MS.pad(d.getHours()) + ':' + MS.pad(d.getMinutes()) + ':' + MS.pad(d.getSeconds());
  }
  function fmtDateTime(iso) {
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d)) return String(iso);
    return d.getDate() + '/' + (d.getMonth() + 1) + ' ' + MS.pad(d.getHours()) + ':' + MS.pad(d.getMinutes());
  }
  /* countdown text given a deadline ISO and a server-client offset (ms) */
  function countdownText(deadline, offset) {
    if (!deadline) return null;
    var left = Date.parse(deadline) - (Date.now() + (offset || 0));
    var late = left < 0; left = Math.abs(left);
    var m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
    return { text: (late ? '−' : '') + m + ':' + MS.pad(s), late: late };
  }
  /* a label as the page will show it (the desk may translate it in place: i18n.js) */
  function shownLabel(t) { return typeof MXL !== 'undefined' && MXL.lang !== 'en' ? MXL.t(t) : t; }
  function signedClass(v) { v = Number(v); return v > 0 ? 'pos' : (v < 0 ? 'neg' : ''); }
  /* compact description of a decision year: non-zero levers, tariffs, options */
  function yearChips(y, opts) {
    var chips = [];
    if (!y) return chips;
    MS.LEVERS.forEach(function (l) { var v = MS.num(y.levers ? y.levers[l.id] : 0); if (v) chips.push({ label: (opts && opts.short ? l.id : l.label), value: v, unit: l.duel ? ' pt' : (l.eco ? (l.id === 'ctax' ? ' pt' : '') : '%'), lever: l.id }); });
    Object.keys(y.tariffs || {}).forEach(function (p) { var v = MS.num(y.tariffs[p]); if (v) chips.push({ label: 'Tariff on ' + MS.countryName(p), value: v, unit: ' pt' }); });
    if (y.euro === 'leave') chips.push({ label: 'Leaves the union', value: null });
    /* §12: exchange-rate decisions of a country that has left the union */
    if (y.fx) chips.push({ label: y.fx === 'peg' ? 'Peg to the euro' : 'Floating currency', value: null });
    if (MS.num(y.pegChange)) chips.push({ label: MS.num(y.pegChange) > 0 ? 'Devaluation' : 'Revaluation', value: Math.abs(MS.num(y.pegChange)), unit: '%' });
    if (y.absorb) chips.push({ label: 'Central bank buys back the bills sold', value: null });
    if (MS.num(y.tfp)) chips.push({ label: 'TFP', value: MS.num(y.tfp), unit: '%' });
    return chips;
  }
  function chipsHtml(y) {
    var chips = yearChips(y);
    if (!chips.length) return '<span class="chip zero">no change</span>';
    return '<div class="chips">' + chips.map(function (c) {
      return '<span class="chip">' + esc(c.label) + (c.value === null ? '' : ' ' + esc(MS.fmt(c.value, 2, true)) + esc(c.unit || '')) + '</span>';
    }).join('') + '</div>';
  }
  /* votes at the central bank (spec §7): chips for a decision, tally lines for a union row's detail.extra */
  var VOTE_LABEL = { cut: 'Rate: cut', hold: 'Rate: hold', hike: 'Rate: hike', austerity: 'Crisis: austerity', devaluation: 'Crisis: devaluation', float: 'Crisis: floating rate' };
  /* a reserves-crisis choice or outcome as shown to people ('float' = the currency floats from that year on, no austerity cap) */
  function crisisWord(o) { return o === 'float' ? 'floating rate' : (o || '—'); }
  /* tally of a reserves-crisis round: 'N austerity · N devaluation' (+ ' · N floating' when anyone voted it) */
  function crisisTally(c) { return (c.austerity || 0) + ' austerity · ' + (c.devaluation || 0) + ' devaluation' + (c.float ? ' · ' + c.float + ' floating' : ''); }
  function voteChipsHtml(v, opts) {
    if (!v || !v.rate) return '';
    var h = '<span class="chip vote' + (v.rate === 'hold' ? ' zero' : '') + '">' + esc(VOTE_LABEL[v.rate] || v.rate) + '</span>';
    if (v.cet !== undefined && v.cet !== null) h += '<span class="chip vote">External tariff: ' + esc(MS.fmt(v.cet, 0)) + ' %</span>';   /* §13 */
    if (opts && opts.crisis && v.crisis) h += '<span class="chip vote">' + esc(VOTE_LABEL[v.crisis] || v.crisis) + '</span>';
    return '<div class="chips">' + h + '</div>';
  }
  /* who holds a country's public debt (points of GDP, from the published detail) and what it costs: a stacked bar, one line per
     holder with its change since the year before, then the average rate paid and the interest bill. u: the union row of the year */
  var HOLDERS = [['hh', 'Households', '#122ddb'], ['banks', 'Banks', '#7f8ff2'], ['cb', 'Central bank', '#ff7a59'], ['row', 'Rest of the world', '#5aa58c']];
  function debtHoldersHtml(x, px, u) {
    var h = x && x.holders; if (!h) return '';
    var tot = 0; HOLDERS.forEach(function (k) { tot += Math.max(0, MS.num(h[k[0]])); });
    if (!(tot > 0)) return '';
    var shown = HOLDERS.filter(function (k) { return Math.abs(MS.num(h[k[0]])) > 0.05; });
    var bar = '<div class="dbar" role="img" aria-label="' + esc(shown.map(function (k) { return k[1] + ' ' + MS.fmt(h[k[0]], 1) + ' % of GDP'; }).join(', ')) + '">' + shown.map(function (k) { var w = 100 * Math.max(0, MS.num(h[k[0]])) / tot; return '<i style="width:' + w.toFixed(2) + '%;background:' + k[2] + '"></i>'; }).join('') + '</div>';
    var rows = shown.map(function (k) {
      var v = MS.num(h[k[0]]), pv = px && px.holders ? MS.num(px.holders[k[0]]) : null;
      return '<div class="urow"><span><i class="dkey" style="background:' + k[2] + '"></i>' + esc(k[1]) + '</span><span class="num">' + esc(MS.fmt(v, 1)) + ' % of GDP · ' + esc(MS.fmt(100 * v / tot, 0)) + ' % of the debt' + (pv === null ? '' : ' <span class="small muted">(' + esc(MS.fmt(v - pv, 1, true)) + ' pt)</span>') + '</span></div>';
    }).join('');
    var rate = '';
    if (x.intRate !== undefined) {
      rate = '<div class="urow"><span>Average rate paid on the debt this year</span><span class="num"><b>' + esc(MS.fmt(x.intRate, 2)) + ' %</b>' +
        ' <span class="small muted">(last year’s central-bank rate' + (x.spread !== undefined ? ', plus the risk premium on the bills held by the market' : '') + ')</span></span></div>' +
        '<div class="urow"><span>Interest bill</span><span class="num">' + esc(MS.fmt(x.intBill, 2)) + ' % of GDP</span></div>';
    }
    return '<div class="union">' + bar + rows + '<div class="urow"><span><b>Public debt</b></span><span class="num"><b>' + esc(MS.fmt(tot, 1)) + ' % of GDP</b></span></div>' + rate + '</div>' +
      '<p class="xs muted" style="margin:.5em 0 0">The interest paid to the central bank comes back to the government with its profits. Households and banks hold bills at the common rate (plus the risk premium in Finance); the rest of the world, in Finance, buys or sells them as rates and risk change.</p>';
  }
  /* the result of a currency-crisis vote: « 2 defend · 3 peg · 1 let it float → peg, devaluation of 5 % » */
  function currencyTally(c) {
    var o = c.outcome === 'float' || c.outcome === 'devaluation' ? 'let it float' : c.outcome === 'peg' ? 'peg' + (MS.num(c.parity) ? (c.parity > 0 ? ', devaluation of ' : ', revaluation of ') + MS.fmt(Math.abs(c.parity), 0) + ' %' : ' at today’s rate') : 'defend';
    return (c.austerity || 0) + ' defend · ' + (c.peg || 0) + ' peg · ' + (c.devaluation || 0) + ' let it float → ' + o;
  }
  function voteLinesHtml(u) {
    var v = u && u.votes; if (!v) return '';
    var r = v.rate, h = '';
    var ct = v.cet;   /* §13: the common external tariff */
    if (ct) h += '<div class="urow"><span>Common external tariff (median of the votes)</span><span class="num wrap">' + MS.CET_LEVELS.map(function (l, i) { return esc(ct.levels[i]) + ' × ' + l + ' %'; }).join(' · ') + ' → <b>' + esc(MS.fmt(ct.level, 0)) + ' %</b>' + (ct.votes ? '' : ' (no vote: unchanged)') + '</span></div>';
    if (u.worldTariffOut) h += '<div class="urow"><span>Rest of the world’s tariff on the exports of the countries out of the union</span><span class="num neg">' + esc(MS.fmt(u.worldTariffOut, 0)) + ' %</span></div>';
    if (u.worldTariff) h += '<div class="urow"><span>Rest of the world’s tariff on the union’s exports</span><span class="num neg">' + esc(MS.fmt(u.worldTariff, 0)) + ' %</span></div>';
    if (r) h += '<div class="urow"><span>Vote on the central bank’s rate</span><span class="num">' + esc(r.cut) + ' cut · ' + esc(r.hold) + ' hold · ' + esc(r.hike) + ' hike → ' + (r.outcome ? esc(MS.fmt(r.outcome, 2, true)) + ' pt' : 'unchanged') + ' · rate ' + esc(MS.fmt(r.level, 2)) + ' %</span></div>';
    var c = v.crisis || {};
    if (c.outcome === 'forced') h += '<div class="urow"><span>Reserves exhausted</span><span class="num neg">forced devaluation</span></div>';
    else if (c.active && c.kind === 'currency') h += '<div class="urow"><span>Currency crisis · vote</span><span class="num">' + esc(currencyTally(c)) + '</span></div>';
    else if (c.active) h += '<div class="urow"><span>Reserves crisis · vote</span><span class="num">' + esc(crisisTally(c)) + ' → <b>' + esc(crisisWord(c.outcome)) + '</b>' + (c.outcome === 'austerity' && u.caps && u.caps.length ? ' (capped: ' + esc(u.caps.join(', ')) + ')' : '') + '</span></div>';
    return h;
  }
  /* Fact sheet of a country: key indicators at the end of a year, with the change since the previous year.
     row / prev: published result rows of the country (prev may be null); ctx: {xr, xrPrev} — the union's exchange rate of the
     same years (price of the world currency in the union's currency). Levels where the model has them (inflation, unemployment, debt),
     deviations from the reference otherwise (GDP). Older rows without the current account fall back on the trade balance.
     factItems gives the list; factSheetHtml draws tiles (team page), factTableHtml one table for several countries (board). */
  function factItems(row, prev, ctx) {
    ctx = ctx || {};
    var x = (row && row.detail && row.detail.extra) || {}, px = (prev && prev.detail && prev.detail.extra) || null;
    function n(v) { return v === undefined || v === null || v === '' || isNaN(Number(v)) ? null : Number(v); }
    var out = [];
    /* good: +1 if a rise helps the country, −1 if it hurts, 0 if neither */
    function add(key, label, unit, v, pv, d, good, signed, note) { if (v !== null) out.push({ key: key, label: label, unit: unit, v: v, dv: pv === null || pv === undefined ? null : v - pv, d: d, good: good, signed: !!signed, note: note || '' }); }
    add('gdp', 'GDP', '% vs ref.', n(row.gdp), prev ? n(prev.gdp) : null, 2, 1, true);
    add('pi', 'Inflation', '%', n(x.pi), px ? n(px.pi) : null, 2, 0);
    add('u', 'Unemployment', '%', n(x.u), px ? n(px.u) : null, 2, -1);
    add('pb', 'Public balance', '% of GDP', n(row.pubbal), prev ? n(prev.pubbal) : null, 2, 1, true);
    if (n(x.ca) !== null) add('ca', 'Current account', '% of GDP', n(x.ca), px ? n(px.ca) : null, 2, 1, true);
    else add('ca', 'Trade balance', '% of GDP', n(row.tradebal), prev ? n(prev.tradebal) : null, 2, 1, true);
    /* price competitiveness (v1.2+): price level against the union's average (against the partner's in a duel), in a common currency */
    if (n(x.compet) !== null) add('compet', 'Relative price level', ctx.duel ? '% vs partner' : '% vs union', n(x.compet), px ? n(px.compet) : null, 2, -1, true, (n(x.compet) > 0.005 ? 'dearer: less competitive' : (n(x.compet) < -0.005 ? 'cheaper: more competitive' : 'as competitive')));
    if (x.exited) add('xr', 'Exchange rate', 'per €', n(x.fx), px && px.exited ? n(px.fx) : (px ? 1 : null), 3, 0, false, (x.peg ? 'pegged' : 'floating') + ' · ' + MS.fmt(x.fxWorld, 3) + ' per world unit');
    else if (n(x.xr) !== null) add('xr', 'Exchange rate', 'per partner unit', n(x.xr), px ? n(px.xr) : null, 3, 0, false, 'up = your currency depreciates');
    else if (n(ctx.xr) !== null) add('xr', 'Exchange rate', '€ per world unit', n(ctx.xr), n(ctx.xrPrev), 3, 0, false, 'up = the euro depreciates');
    add('debt', 'Public debt', '% of GDP', n(x.debt), px ? n(px.debt) : null, 1, -1);
    if (n(x.spread) !== null) add('spread', 'Risk premium', 'pt', n(x.spread), px ? n(px.spread) : null, 2, -1, false, x.pressured ? 'under market pressure' : (n(x.spread) > 0 ? 'debt above 110 % of GDP' : 'none below 110 % of debt'));
    /* households option: the wealthy half's share of disposable income (54.8 % at the reference) */
    if (n(x.shareR) !== null) add('ineq', 'Inequality', '% of income', n(x.shareR), px ? n(px.shareR) : null, 1, -1, false, 'the wealthy half’s share of disposable income (reference 54.8 %)');
    return out;
  }
  function factDeltaHtml(it, prevYear) {
    if (it.dv === null) return '';
    var flat = Math.abs(it.dv) < 0.5 * Math.pow(10, -it.d);
    var cls = flat || !it.good ? 'flat' : (it.dv * it.good > 0 ? 'up' : 'down');
    return '<span class="d ' + cls + '">' + (flat ? '= ' : (it.dv > 0 ? '▲ ' : '▼ ')) + esc(MS.fmt(it.dv, it.d, true)) + (prevYear ? ' vs year ' + esc(prevYear) : '') + '</span>';
  }
  function factSheetHtml(row, prev, ctx) {
    if (!row) return '';
    var its = factItems(row, prev, ctx);
    return '<div class="facts' + (its.length > 8 ? ' n5' : '') + '">' + its.map(function (it) {
      return '<div class="fact" data-key="' + esc(it.key) + '"><div class="lab">' + esc(it.label) + '</div><div class="val">' + esc(MS.fmt(it.v, it.d, it.signed)) + '<span class="u">' + esc(it.unit) + '</span></div>' +
        '<div>' + (factDeltaHtml(it, prev ? prev.year : null) || '<span class="d flat">&nbsp;</span>') + '</div>' + (it.note ? '<div class="d flat fnote' + (it.key === 'spread' && /pressure/.test(it.note) ? ' neg' : '') + '">' + esc(it.note) + '</div>' : '') + '</div>';
    }).join('') + '</div>';
  }
  /* items: [{name, sub, badge, row, prev, ctx}] → one row per country, one column per indicator (the board) */
  function factTableHtml(items) {
    var cols = [];
    items.forEach(function (o) { factItems(o.row, o.prev, o.ctx).forEach(function (it) { if (!cols.some(function (c) { return c.key === it.key; })) cols.push({ key: it.key, label: it.label, unit: it.unit }); }); });
    var order = ['gdp', 'pi', 'u', 'pb', 'ca', 'compet', 'xr', 'debt', 'spread', 'ineq'];
    cols.sort(function (a, b) { return order.indexOf(a.key) - order.indexOf(b.key); });
    /* the exchange-rate column: the members' unit in the header, another unit (a country out of the union, its own currency) in the cell */
    var xrUnit = null; items.forEach(function (o) { factItems(o.row, o.prev, o.ctx).forEach(function (it) { if (it.key === 'xr' && !(o.row.detail && o.row.detail.extra && o.row.detail.extra.exited) && !xrUnit) xrUnit = it.unit; }); });
    cols.forEach(function (c) { if (c.key === 'xr' && xrUnit) c.unit = xrUnit; });
    var h = '<div class="tablewrap"><table class="facttable' + (cols.length >= 10 ? ' dense' : '') + '"><thead><tr><th>Country</th>' + cols.map(function (c) { return '<th class="num">' + esc(c.label) + '<br><span class="unit">' + esc(c.unit) + '</span></th>'; }).join('') + '</tr></thead><tbody>';
    items.forEach(function (o) {
      var its = factItems(o.row, o.prev, o.ctx);
      h += '<tr><td><b>' + esc(o.name) + '</b>' + (o.badge ? ' ' + o.badge : '') + (o.sub ? '<br><span class="small muted">' + esc(o.sub) + '</span>' : '') + '</td>' + cols.map(function (c) {
        var it = its.filter(function (z) { return z.key === c.key; })[0];
        if (!it) return '<td class="num muted">—</td>';
        var warn = (c.key === 'spread' && it.v > 0) ? ' neg' : '';
        return '<td class="num' + warn + '"><span class="v">' + esc(MS.fmt(it.v, it.d, it.signed)) + (c.key === 'xr' && it.unit !== c.unit ? ' <span class="unit">' + esc(it.unit) + '</span>' : '') + '</span>' + factDeltaHtml(it, null) + '</td>';
      }).join('') + '</tr>';
    });
    return h + '</tbody></table></div>';
  }
  /* §12: exits and retaliation, lines of a union row's detail.extra (empty when nobody left) */
  function exitLinesHtml(u) {
    if (!u) return '';
    var h = '';
    (u.announced || []).forEach(function (c) { h += '<div class="urow"><span><b>' + esc(MS.countryName(c)) + '</b> announced its exit</span><span class="num neg">out of the union next year</span></div>'; });
    if (u.exited && u.exited.length) h += '<div class="urow"><span>Out of the union (own currency)</span><span class="num wrap">' + esc(u.exited.map(function (c) { var x = u.exitInfo && u.exitInfo[c]; return MS.countryName(c) + (x ? ' · ' + MS.fmt(x.fx, 3) + ' per € (' + (x.peg ? 'peg' : 'float') + ')' : ''); }).join(' · ')) + '</span></div>';
    var rt = u.retaliation || {};
    Object.keys(rt).forEach(function (c) { var m = rt[c]; if (!m || (!m.tariff && !m.sale && !m.settle)) return; h += '<div class="urow"><span>Union measures against ' + esc(MS.countryName(c)) + '</span><span class="num wrap">' + [m.tariff ? 'tariff ' + MS.fmt(m.tariff, 0) + ' %' : '', m.sale ? 'sale of ' + MS.fmt(m.sale, 0) + ' % of its bills held by the central bank' : '', m.settle ? 'TARGET balance settled' : ''].filter(Boolean).map(esc).join(' · ') + '</span></div>'; });
    return h;
  }
  /* §12: the currency panel of a country that has left the union (its result row's detail.extra) */
  function currencyPanelHtml(x, opts) {
    if (!x || !x.exited) return '';
    opts = opts || {};
    var h = '<div class="union">' + (opts.title ? '<h3>' + esc(opts.title) + '</h3>' : '');
    h += '<div class="urow"><span>Exchange-rate regime</span><span class="num">' + (x.peg ? 'peg to the euro' : 'floating') + (x.forced ? ' <span class="pill closed">forced devaluation</span>' : '') + '</span></div>';
    h += '<div class="urow"><span>Price of one euro in your currency (+ = depreciation)</span><span class="num">' + esc(MS.fmt(x.fx, 3)) + ' <span class="' + (x.dfx > 0 ? 'neg' : (x.dfx < 0 ? 'pos' : 'muted')) + '">(' + esc(MS.fmt(x.dfx, 1, true)) + ' % over the year)</span></span></div>';
    h += '<div class="urow"><span>Price of the world currency in your currency</span><span class="num">' + esc(MS.fmt(x.fxWorld, 3)) + '</span></div>';
    h += '<div class="urow"><span>Your policy rate · rate on your bills</span><span class="num">' + esc(MS.fmt(x.rate, 2)) + ' % · ' + esc(MS.fmt(x.rEff, 2)) + ' %</span></div>';
    if (x.peg) {
      var pct = Math.max(0, Math.min(100, 100 * (x.RXshare || 0)));
      h += '<div class="urow"><span>Your foreign reserves (share received at the exit)</span><span class="num">' + esc(MS.fmt(100 * (x.RXshare || 0), 0)) + ' %' + (x.RXalert ? ' <span class="pill closed">ALERT</span>' : '') + '</span></div>' +
        '<div class="bar reserves"><i class="' + (x.RXalert ? 'neg' : '') + '" style="left:0;width:' + pct + '%"></i><b style="left:25%"></b></div>';
    }
    h += '<div class="urow"><span>Your bills held by the union’s central bank</span><span class="num">' + esc(MS.fmt(x.BcbU, 1)) + ' % of GDP' + (x.sold ? ' <span class="neg">(' + esc(MS.fmt(x.sold, 1)) + ' % sold this year)</span>' : '') + '</span></div>';
    h += '<div class="urow"><span>TARGET balance (+: your central bank owes the union, in euros)</span><span class="num ' + (x.T2 > 0 ? 'neg' : '') + '">' + esc(MS.fmt(x.T2, 1, true)) + ' % of GDP' + (x.settled ? ' · settled this year' : '') + '</span></div>';
    if (x.tariff) h += '<div class="urow"><span>Union tariff on your exports</span><span class="num neg">' + esc(MS.fmt(x.tariff, 0)) + ' %</span></div>';
    if (x.tariffU) h += '<div class="urow"><span>Your tariff on goods from the union</span><span class="num">' + esc(MS.fmt(x.tariffU, 0)) + ' %' + (x.tariffRev ? ' · revenue ' + esc(MS.fmt(x.tariffRev, 2)) + ' % of GDP' : '') + '</span></div>';
    return h + '</div>';
  }
  /* v1.3: regime / capital-flow lines of a union row (empty for v1.1 / v1.2 rows) */
  function regimeLinesHtml(u) {
    if (!u || !u.regime) return '';
    var isFloat = u.regime === 'float', h = '';
    h += '<div class="urow"><span>Exchange-rate regime</span><span class="num">' + (isFloat ? 'floating' : 'fixed') + (u.backstop === false ? ' · <span class="pill closed">no central-bank backstop</span>' : '') + '</span></div>';
    /* the pull of the union's bills on capital: its rate against the rest of the world's (Finance rows carry both) */
    if (u.rate !== undefined && u.rw !== undefined && u.rate !== null && u.rw !== null) h += '<div class="urow"><span>Rate gap with the rest of the world (union rate − world rate)</span><span class="num">' + esc(MS.fmt(100 * u.rate, 2)) + ' % − ' + esc(MS.fmt(100 * u.rw, 2)) + ' % = <b>' + esc(MS.fmt(100 * (u.rate - u.rw), 2, true)) + ' pt</b></span></div>';
    if (u.dxr !== undefined) h += '<div class="urow"><span>Change of the exchange rate over the year (+ = depreciation)</span><span class="num ' + (u.dxr > 0 ? 'neg' : (u.dxr < 0 ? 'pos' : '')) + '">' + esc(MS.fmt(u.dxr, 1, true)) + ' %</span></div>';
    if (u.KA !== undefined) h += '<div class="urow"><span>Capital flows (net inflows from the rest of the world)</span><span class="num ' + UI.signedClass(u.KA) + '">' + esc(MS.fmt(u.KA, 2, true)) + '</span></div>';
    if (u.pressured && u.pressured.length) h += '<div class="urow"><span>Members under market pressure (public debt above 110 % of GDP)</span><span class="num neg">' + esc(u.pressured.map(function (c) { return MS.countryName(c); }).join(', ')) + '</span></div>';
    return h;
  }
  /* duel (arcade mode): the pair row — bilateral exchange rate, both reserves, flows, climate. `side` highlights the viewer's country */
  function duelPanelHtml(x, side, opts) {
    if (!x || x.e === undefined) return '';
    opts = opts || {};
    var isFloat = x.regime === 'float';
    function resLine(id) {
      var share = id === 'A' ? x.RshareA : x.RshareB, months = id === 'A' ? x.monthsA : x.monthsB, alert = id === 'A' ? x.alertA : x.alertB, forced = id === 'A' ? x.forcedA : x.forcedB;
      var pct = Math.max(0, Math.min(100, 100 * (share || 0)));
      var who = 'Country ' + id + (side === id ? ' (you)' : (side ? ' (your partner)' : ''));
      var h = '<div class="urow"><span>Reserves of ' + who + (isFloat ? ' (frozen while floating)' : '') + '</span><span class="num">' + esc(MS.fmt(Math.max(0, months || 0), 1)) + ' months of imports · ' + esc(MS.fmt(100 * (share || 0), 0)) + ' % of initial' + (alert ? ' <span class="pill closed">ALERT</span>' : '') + (forced ? ' <span class="pill closed">forced devaluation</span>' : '') + '</span></div>';
      if (!isFloat) h += '<div class="bar reserves"><i class="' + (alert ? 'neg' : '') + '" style="left:0;width:' + pct + '%"></i><b style="left:25%"></b></div>';
      return h;
    }
    var h = '<div class="urow"><span>Exchange-rate regime</span><span class="num">' + (isFloat ? 'floating' : 'fixed') + (x.backstop === false ? ' · <span class="pill closed">no central-bank backstop</span>' : '') + '</span></div>';
    h += '<div class="urow"><span>Exchange rate e (A’s currency per unit of B’s; up = A depreciates)</span><span class="num">' + esc(MS.fmt(x.e, 3)) + (x.de !== undefined ? ' <span class="' + (Math.abs(x.de) < 0.05 ? 'muted' : (side === 'B' ? (x.de > 0 ? 'pos' : 'neg') : (x.de > 0 ? 'neg' : 'pos'))) + '">(' + esc(MS.fmt(x.de, 1, true)) + ' % over the year)</span>' : '') + '</span></div>';
    h += resLine('A') + resLine('B');
    if (x.CApA !== undefined) h += '<div class="urow"><span>Current account of A incl. primary income · capital inflows to A</span><span class="num">' + esc(MS.fmt(x.CApA, 2, true)) + ' · ' + esc(MS.fmt(x.KAA, 2, true)) + '</span></div>';
    if (x.rA !== undefined) h += '<div class="urow"><span>Policy rates (A · B)</span><span class="num">' + esc(MS.fmt(x.rA, 2)) + ' % · ' + esc(MS.fmt(x.rB, 2)) + ' %</span></div>';
    if (x.pressured && x.pressured.length) h += '<div class="urow"><span>Under market pressure (public debt above 110 % of GDP)</span><span class="num neg">' + esc(x.pressured.map(function (c) { return 'Country ' + c; }).join(', ')) + '</span></div>';
    if (x.D !== undefined) {
      h += '<div class="urow"><span>Pollution stock of your world (start = 100)</span><span class="num">' + esc(MS.fmt(100 * (x.Sshare || 1), 1)) + '</span></div>';
      h += '<div class="urow"><span>Climate damage this year (loss of potential output, both countries)</span><span class="num ' + (x.D > 0 ? 'neg' : '') + '">' + esc(MS.fmt(x.D, 1)) + ' %</span></div>';
      if (x.Erel !== undefined) h += '<div class="urow"><span>Emissions of the pair vs the reference</span><span class="num ' + UI.signedClass(-x.Erel) + '">' + esc(MS.fmt(x.Erel, 0, true)) + ' %</span></div>';
    }
    return h;
  }
  /* v2.0: the climate block of a union row (pollution stock, damage, emissions) */
  function climateLinesHtml(u) {
    if (!u || u.D === undefined) return '';
    var h = '<div class="urow"><span>Global pollution stock (start = 100)</span><span class="num">' + esc(MS.fmt(100 * (u.Sshare || 1), 1)) + '</span></div>';
    h += '<div class="urow"><span>Climate damage this year (loss of potential output)</span><span class="num ' + (u.D > 0 ? 'neg' : '') + '">' + esc(MS.fmt(u.D, 1)) + ' %</span></div>';
    if (u.Erel !== undefined) h += '<div class="urow"><span>Union emissions vs the reference</span><span class="num ' + UI.signedClass(-u.Erel) + '">' + esc(MS.fmt(u.Erel, 0, true)) + ' %</span></div>';
    return h;
  }
  /* a pledge's attachments: numbers (non-zero levers) and the vote it announces; « words only » when it carries neither */
  function pledgeChipsHtml(payload) {
    var chips = yearChips(payload && payload.year), v = (payload && payload.votes) || {}, h = '';
    chips.forEach(function (c) { h += '<span class="chip">' + esc(c.label) + (c.value === null ? '' : ' ' + esc(MS.fmt(c.value, 2, true)) + esc(c.unit || '')) + '</span>'; });
    if (v.rate) h += '<span class="chip vote">Will vote: ' + esc(v.rate) + '</span>';
    if (v.crisis) h += '<span class="chip vote">Will vote: ' + esc(crisisWord(v.crisis)) + '</span>';
    return '<div class="chips">' + (h || '<span class="chip zero">words only</span>') + '</div>';
  }
  /* ---------- forum of the union (permanent council) ---------- */
  var FORUM_TYPE_LABEL = { engagement: 'Engagement', joint: 'Joint proposal', vote: 'Vote call' };
  var FORUM_STATUS = { kept: '<span class="kept">✓ kept</span>', broken: '<span class="broken">✗ not kept</span>', words: '<span class="muted">words only</span>', nodecision: '<span class="muted">no decision</span>' };
  function forumHasContent(ranges, votes) { return !!(ranges && Object.keys(ranges).length) || !!(votes && (votes.rate || votes.crisis)); }
  /* a lever's range as a chip label: "≥ +0.50 %", "≤ 0.00 %", "+0.50 to +1.00 %" */
  function rangeText(id, r) {
    var l = MS.leverById(id) || {}, u = l.duel ? ' pt' : (l.eco ? (l.id === 'ctax' ? ' pt' : '') : ' %'), f = function (v) { return MS.fmt(v, 2, true); };
    if (r.min !== undefined && r.max !== undefined) return r.min === r.max ? '= ' + f(r.min) + u : f(r.min) + ' to ' + f(r.max) + u;
    return (r.min !== undefined ? '≥ ' + f(r.min) : '≤ ' + f(r.max)) + u;
  }
  function forumChips(ranges, votes) {
    if (!forumHasContent(ranges, votes)) return '';
    var h = '';
    Object.keys(ranges || {}).forEach(function (id) { var l = MS.leverById(id); h += '<span class="chip">' + esc(l ? l.label : id) + ' ' + esc(rangeText(id, ranges[id])) + '</span>'; });
    if (votes && votes.rate) h += '<span class="chip vote">Will vote: ' + esc(votes.rate) + '</span>';
    if (votes && votes.crisis) h += '<span class="chip vote">Will vote: ' + esc(crisisWord(votes.crisis)) + '</span>';
    return '<div class="chips">' + h + '</div>';
  }
  function forumNames(list) { return list.map(function (c) { return '<span>' + esc(MS.countryName(c)) + '</span>'; }).join(', '); }
  /* one proposal; opts: {me: my country, react: true to show the reaction buttons, withdraw: true for the author's button, admin: true} */
  function forumPostHtml(p, opts) {
    opts = opts || {};
    var pay = p.payload || {}, mine = opts.me && p.country === opts.me;
    var cls = 'fprop ftype-' + esc(p.type) + (mine ? ' mine' : '') + (p.withdrawn ? ' withdrawn' : '') + (p.hidden ? ' hiddenp' : '');
    var h = '<div class="' + cls + '" data-prop="' + esc(p.propId) + '"><div class="fhead"><span class="ftype">' + esc(FORUM_TYPE_LABEL[p.type] || p.type) + '</span> <b>' + esc(MS.countryName(p.country)) + '</b> <span class="muted small">' + esc(fmtDateTime(p.ts)) + '</span>' +
      (p.withdrawn ? ' <span class="pill">withdrawn</span>' : '') + (p.hidden ? ' <span class="pill">hidden by the administrator</span>' : '') + '</div>';
    if (p.hidden && !opts.admin) return h + '</div>';
    h += '<div class="ftext"><span translate="no">' + esc(p.text) + '</span></div>';
    var own = forumChips(pay.ranges, pay.votes);
    if (own) h += '<div class="vals"><span class="flabel">' + (p.type === 'engagement' ? 'We will' : p.type === 'vote' ? 'Vote called' : 'Everyone') + '</span>' + own + '</div>';
    if (p.type === 'engagement' && pay.ask) {
      var from = (pay.ask.from || []).indexOf('ALL') >= 0 ? '<span>all the other members</span>' : forumNames(pay.ask.from || []);
      h += '<div class="fask"><b>In return</b> <span class="muted small"><span>from</span> ' + from + '</span> · <span translate="no">' + esc(pay.askText || '') + '</span>' +
        (forumHasContent(pay.ask.ranges, pay.ask.votes) ? '<div class="vals">' + forumChips(pay.ask.ranges, pay.ask.votes) + '</div>' : '') + '</div>';
    }
    var ups = (p.reactions || []).filter(function (r) { return r.value > 0; }).map(function (r) { return r.country; });
    var downs = (p.reactions || []).filter(function (r) { return r.value < 0; }).map(function (r) { return r.country; });
    var myR = opts.me ? ((p.reactions || []).filter(function (r) { return r.country === opts.me; })[0] || {}).value || 0 : 0;
    h += '<div class="freact">';
    if (opts.react && !mine && !p.withdrawn && !p.frozen) {
      h += '<button class="btn sm rbtn' + (myR > 0 ? ' on' : '') + '" data-act="react" data-v="' + (myR > 0 ? 0 : 1) + '">👍 Support</button>' +
        '<button class="btn sm rbtn' + (myR < 0 ? ' on' : '') + '" data-act="react" data-v="' + (myR < 0 ? 0 : -1) + '">👎 Reject</button>';
    }
    h += '<span class="small"><span>👍 ' + ups.length + '</span>' + (ups.length ? ' <span class="muted">' + forumNames(ups) + '</span>' : '') + '</span>' +
      '<span class="small"><span>👎 ' + downs.length + '</span>' + (downs.length ? ' <span class="muted">' + forumNames(downs) + '</span>' : '') + '</span>';
    if (opts.withdraw && mine && !p.withdrawn && !p.frozen) h += '<button class="btn ghost sm" data-act="withdraw">Withdraw</button>';
    if (opts.admin) h += '<button class="btn ghost sm" data-act="hide" data-v="' + (p.hidden ? 0 : 1) + '">' + (p.hidden ? 'Show again' : 'Hide') + '</button>';
    h += '</div>';
    if (p.balance) h += forumBalanceHtml(p);
    return h + '</div>';
  }
  function forumBalanceHtml(p) {
    var b = p.balance, nm = function (c) { return '<span>' + esc(MS.countryName(c)) + '</span>'; };
    var h = '<div class="fbal"><div><b>Words vs acts</b></div><div>' + nm(p.country) + ' ' + FORUM_STATUS[b.author.status] + '</div>';
    if (p.type === 'engagement') {
      h += '<div><span class="flabel">Counterpart</span> ' + (b.counterpart.length ? b.counterpart.map(function (k) { return nm(k.country) + (k.supported ? ' (👍)' : '') + ' ' + FORUM_STATUS[k.status]; }).join(' · ') : '—') + '</div>';
    } else {
      h += '<div><span class="flabel">Supporters</span> ' + (b.supporters.length ? b.supporters.map(function (k) { return nm(k.country) + ' ' + FORUM_STATUS[k.status]; }).join(' · ') : '<span class="muted">none</span>') + '</div>';
    }
    return h + '</div>';
  }
  /* words vs acts over the frozen years, per country: its own proposals kept, and the proposals it supported followed by acts */
  function forumRecord(forum) {
    var rec = {};
    function add(c, k, st) { if (st !== 'kept' && st !== 'broken') return; var r = rec[c] = rec[c] || { country: c, own: 0, ownKept: 0, sup: 0, supKept: 0 }; r[k]++; if (st === 'kept') r[k + 'Kept']++; }
    (forum && forum.proposals || []).forEach(function (p) {
      if (!p.balance) return;
      add(p.country, 'own', p.balance.author.status);
      (p.balance.supporters || []).forEach(function (k) { add(k.country, 'sup', k.status); });
      (p.balance.counterpart || []).forEach(function (k) { if (k.supported) add(k.country, 'sup', k.status); });
    });
    return Object.keys(rec).map(function (k) { return rec[k]; }).sort(function (a, b) { return MS.countryName(a.country) < MS.countryName(b.country) ? -1 : 1; });
  }
  function forumRecordHtml(forum, me) {
    var rows = forumRecord(forum);
    if (!rows.length) return '';
    return '<div class="tablewrap"><table class="frec"><thead><tr><th>Country</th><th class="num">Own word kept</th><th class="num">Support followed by acts</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr' + (r.country === me ? ' class="me"' : '') + '><td><b>' + esc(MS.countryName(r.country)) + '</b></td><td class="num">' + (r.own ? r.ownKept + ' / ' + r.own : '—') + '</td><td class="num">' + (r.sup ? r.supKept + ' / ' + r.sup : '—') + '</td></tr>'; }).join('') +
      '</tbody></table></div><p class="xs muted">Only measurable words count: numbers or votes attached to a proposal, compared with the decisions of the same year.</p>';
  }

  /* trajectory of the objective: for each year, the contribution of the five dimensions to R as stacked bars
     (positive contributions above zero, negative below), the total R as a dashed line. Inline SVG, no library.
     rows: result rows of one country/group sorted by year; opts: {weights, title, height, legend, fontScale} */
  var TRAJ_SERIES = [
    { id: 'gdp', label: 'GDP', color: '#122ddb', sign: 1 },
    { id: 'unemp', label: 'Unemployment', color: '#7f8ff2', sign: -1 },
    { id: 'infl', label: 'Inflation', color: '#ff7a59', sign: -1 },
    { id: 'pubbal', label: 'Public balance', color: '#ffc2ad', sign: 1 },
    { id: 'tradebal', label: 'Trade balance', color: '#cfd5ea', sign: 1 },
    { id: 'emis', label: 'Emissions', color: '#5aa58c', sign: -1, eco: true },   // climate option, drawn only when the rows carry it
    { id: 'ineq', label: 'Inequality', color: '#b0418f', sign: -1, hh: true }     // households option, drawn only when the rows carry it
  ];
  /* the series present in a set of rows: the five, plus emissions and inequality when any row has a value for them */
  function trajSeriesFor(rows) {
    var has = function (k) { return (rows || []).some(function (r) { return r && r[k] !== undefined && r[k] !== null && r[k] !== ''; }); };
    var hasEmis = has('emis'), hasIneq = has('ineq');
    return TRAJ_SERIES.filter(function (s) { return (!s.eco || hasEmis) && (!s.hh || hasIneq); });
  }
  var R_SERIES = { id: 'R', label: 'R (total)', color: '#0a1670', dash: true };
  function trajWeights(w) { var d = MS.defaultState().weights; return Object.assign({}, d, w || {}); }
  /* The race: cumulative R of every country, year by year (who overtakes whom). series: [{key, name, rows: [{year, R}]}].
     Colors follow the country (fixed order of MS.COUNTRIES), never the rank; each line ends with the country's name (the palette
     is below 3:1 contrast for three slots, so identity never rests on color alone); a native tooltip on every point. */
  var RACE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6'];
  function raceColor(key) { var i = -1; MS.COUNTRIES.forEach(function (c, k) { if (c.id === key) i = k; }); return RACE_COLORS[(i >= 0 ? i : 0) % RACE_COLORS.length]; }
  function rRaceSvg(series, opts) {
    opts = opts || {};
    var W = 1100, H = opts.height || 340, padL = 56, padR = 150, padT = 16, padB = 34;
    var years = {}; series.forEach(function (s0) { s0.rows.forEach(function (r) { years[r.year] = 1; }); });
    var yl = Object.keys(years).map(Number).sort(function (a, b) { return a - b; });
    if (!yl.length) return '';
    var lines = series.map(function (s0) {
      var cum = 0, pts = [];
      yl.forEach(function (y) { var r = s0.rows.filter(function (x) { return Number(x.year) === y; })[0]; if (r && r.R !== null && r.R !== undefined && r.R !== '') { cum += Number(r.R); pts.push({ year: y, R: Number(r.R), cum: cum }); } });
      return { key: s0.key, name: s0.name, color: raceColor(s0.key), pts: pts };
    }).filter(function (l) { return l.pts.length; });
    var vals = [0]; lines.forEach(function (l) { l.pts.forEach(function (p) { vals.push(p.cum); }); });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals); if (hi - lo < 0.2) { hi += 0.1; lo -= 0.1; }
    var pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    var x0 = yl[0], x1 = yl[yl.length - 1];
    function X(y) { return padL + (x1 === x0 ? (W - padL - padR) / 2 : (y - x0) / (x1 - x0) * (W - padL - padR)); }
    function Y(v) { return padT + (hi - v) / (hi - lo) * (H - padT - padB); }
    /* ticks: about five round values */
    var step = Math.pow(10, Math.floor(Math.log(hi - lo) / Math.LN10)); if ((hi - lo) / step < 3) step /= 2; if ((hi - lo) / step > 7) step *= 2;
    var g = '';
    for (var t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) g += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + Y(t).toFixed(1) + '" y2="' + Y(t).toFixed(1) + '" stroke="rgba(18,45,219,.14)" stroke-width="1"/><text x="' + (padL - 8) + '" y="' + (Y(t) + 4).toFixed(1) + '" text-anchor="end" font-size="13" fill="#5566cf">' + esc(MS.fmt(t, Math.abs(step) < 0.1 ? 2 : 1, true)) + '</text>';
    g += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + Y(0).toFixed(1) + '" y2="' + Y(0).toFixed(1) + '" stroke="#5566cf" stroke-width="1.2"/>';
    yl.forEach(function (y) { g += '<text x="' + X(y).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="13" fill="#5566cf">Year ' + y + '</text>'; });
    var marks = '';
    lines.forEach(function (l) {
      if (l.pts.length > 1) marks += '<polyline fill="none" stroke="' + l.color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="' + l.pts.map(function (p) { return X(p.year).toFixed(1) + ',' + Y(p.cum).toFixed(1); }).join(' ') + '"/>';
      l.pts.forEach(function (p) { marks += '<circle cx="' + X(p.year).toFixed(1) + '" cy="' + Y(p.cum).toFixed(1) + '" r="5" fill="' + l.color + '" stroke="#ffffff" stroke-width="2"><title>' + esc(l.name) + ' · year ' + p.year + ': R of the year ' + MS.fmt(p.R, 3, true) + ', cumulative ' + MS.fmt(p.cum, 3, true) + '</title></circle>'; });
    });
    /* direct labels at the line ends, nudged apart (at least 16 px) */
    var ends = lines.map(function (l) { var p = l.pts[l.pts.length - 1]; return { l: l, y: Y(p.cum), x: X(p.year), v: p.cum }; }).sort(function (a, b) { return a.y - b.y; });
    for (var k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 16) ends[k].y = ends[k - 1].y + 16;
    var over = ends.length ? ends[ends.length - 1].y - (H - padB) : 0; if (over > 0) ends.forEach(function (e) { e.y -= over; });
    ends.forEach(function (e) { marks += '<line x1="' + (e.x + 7) + '" x2="' + (e.x + 16) + '" y1="' + Y(e.v).toFixed(1) + '" y2="' + e.y.toFixed(1) + '" stroke="' + e.l.color + '" stroke-width="1.5"/><text x="' + (e.x + 20) + '" y="' + (e.y + 4.5).toFixed(1) + '" font-size="14" font-weight="600" fill="#0a1670">' + esc(e.l.name) + ' <tspan font-weight="400" fill="#5566cf">' + esc(MS.fmt(e.v, 2, true)) + '</tspan></text>'; });
    var legend = '<div class="racelegend">' + lines.map(function (l) { return '<span><i style="background:' + l.color + '"></i>' + esc(l.name) + '</span>'; }).join('') + '</div>';
    return legend + '<svg class="race" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Cumulative R of every country, year by year">' + g + marks + '</svg>';
  }

  /* ---------- model explorer (board): any published variable, several countries, year by year ----------
     Every value is a deviation from the reference: volumes in %, rates and ratios in points. src: 'row' (the result row),
     'extra' (detail.extra), 'x' (detail.x, recorded since the explorer), 'u' (the union row's detail.extra.x).
     need: 'prices' | 'capital' | 'eco' — shown only when the class's model or options have it. */
  var EXPLORE_GROUPS = ['Activity', 'Households', 'Firms', 'Government', 'Trade', 'Money and finance', 'The union', 'Climate'];
  var EXPLORE_VARS = [
    { id: 'gdp', g: 'Activity', label: 'GDP', sym: 'Y', unit: '%', src: 'row', eq: 'trade' },
    { id: 'unemp', g: 'Activity', label: 'Unemployment', sym: 'u', unit: 'pt', src: 'row', eq: 'thermo' },
    { id: 'infl', g: 'Activity', label: 'Inflation', sym: 'π', unit: 'pt', src: 'row', eq: 'thermo' },
    { id: 'compet', g: 'Activity', label: 'Price level vs the union', sym: 'compet', unit: '%', src: 'extra', eq: 'thermo', need: 'prices' },
    { id: 'C', g: 'Households', label: 'Consumption', sym: 'C', unit: '%', src: 'x', eq: 'households' },
    { id: 'YD', g: 'Households', label: 'Disposable income', sym: 'YD', unit: '%', src: 'x', eq: 'households' },
    { id: 'V', g: 'Households', label: 'Wealth', sym: 'V', unit: '%', src: 'x', eq: 'households' },
    { id: 'ineq', g: 'Households', label: 'Inequality', sym: 'sR', unit: 'pt', src: 'row', eq: 'hh', need: 'hh' },
    { id: 'YDP', g: 'Households', label: 'Disposable income, modest half', sym: 'YDP', unit: '%', src: 'x', eq: 'hh', need: 'hh' },
    { id: 'YDR', g: 'Households', label: 'Disposable income, wealthy half', sym: 'YDR', unit: '%', src: 'x', eq: 'hh', need: 'hh' },
    { id: 'I', g: 'Firms', label: 'Investment', sym: 'I', unit: '%', src: 'x', eq: 'firms' },
    { id: 'G', g: 'Government', label: 'Public demand', sym: 'G', unit: '%', src: 'x', eq: 'levers' },
    { id: 'TR', g: 'Government', label: 'Social benefits', sym: 'TR', unit: '%', src: 'x', eq: 'levers' },
    { id: 'T', g: 'Government', label: 'Tax revenue', sym: 'T', unit: '%', src: 'x', eq: 'gov' },
    { id: 'pubbal', g: 'Government', label: 'Public balance', sym: 'PB', unit: 'pt of GDP', src: 'row', eq: 'gov' },
    { id: 'debt', g: 'Government', label: 'Public debt', sym: 'B/Y', unit: 'pt of GDP', src: 'x', eq: 'gov' },
    { id: 'spread', g: 'Government', label: 'Risk premium', sym: 's', unit: 'pt', src: 'extra', eq: 'capital', need: 'capital' },
    { id: 'X', g: 'Trade', label: 'Exports', sym: 'X', unit: '%', src: 'x', eq: 'trade' },
    { id: 'IM', g: 'Trade', label: 'Imports (value)', sym: 'IMV', unit: '%', src: 'x', eq: 'trade' },
    { id: 'tradebal', g: 'Trade', label: 'Trade balance', sym: 'TB', unit: 'pt of GDP', src: 'row', eq: 'trade' },
    { id: 'ca', g: 'Trade', label: 'Current account', sym: 'CA′', unit: 'pt of GDP', src: 'extra', eq: 'capital', need: 'capital' },
    { id: 'Bcb', g: 'Money and finance', label: 'Bills held by the central bank', sym: 'Bcb/Y', unit: 'pt of GDP', src: 'x', eq: 'gov' },
    { id: 'Bf', g: 'Money and finance', label: 'Foreign bills held by households', sym: 'xr·Bf/Y', unit: 'pt of GDP', src: 'x', eq: 'capital', need: 'capital' },
    { id: 'rate', g: 'Money and finance', label: 'Central bank rate', sym: 'r', unit: 'pt', src: 'u', eq: 'rules' },
    { id: 'R', g: 'The union', label: 'Foreign reserves', sym: 'R', unit: '%', src: 'u', eq: 'union' },
    { id: 'xr', g: 'The union', label: 'Exchange rate (up = depreciation)', sym: 'xr', unit: '%', src: 'u', eq: 'union' },
    { id: 'CAu', g: 'The union', label: 'Current account of the union', sym: 'CA', unit: 'pt of GDP', src: 'u', key: 'CA', eq: 'union' },
    { id: 'KA', g: 'The union', label: 'Net capital inflows', sym: 'KA', unit: 'pt of GDP', src: 'u', eq: 'capital', need: 'capital' },
    { id: 'E', g: 'Climate', label: 'Emissions', sym: 'E', unit: '%', src: 'extra', eq: 'eco', need: 'eco' },
    { id: 'ci', g: 'Climate', label: 'Carbon intensity', sym: 'ci', unit: '%', src: 'x', eq: 'eco', need: 'eco' },
    { id: 'D', g: 'Climate', label: 'Climate damage', sym: 'D', unit: 'pt of potential', src: 'extra', eq: 'eco', need: 'eco' }
  ];
  function exploreVars(st) {
    var has = { prices: MS.modelId(st) !== 'v1.1', capital: MS.financeModel(st), eco: MS.climateOn(st), hh: MS.householdsOn(st) };
    return EXPLORE_VARS.filter(function (v) { return !v.need || has[v.need]; });
  }
  /* the value of variable v in a result row (country) or a union row; null when the row does not carry it */
  function exploreValue(v, row) {
    if (!row) return null;
    var d = row.detail || {}, x;
    if (v.src === 'row') x = row[v.id];
    else if (v.src === 'extra') x = d.extra ? d.extra[v.id] : undefined;
    else if (v.src === 'x') x = d.x ? d.x[v.id] : undefined;
    else x = d.extra && d.extra.x ? d.extra.x[v.key || v.id] : undefined;
    return x === undefined || x === null || x === '' || !isFinite(Number(x)) ? null : Number(x);
  }
  /* the « Explore the model » card (board and teams' page): any published variable, year by year, for the countries ticked.
     o: {st, results: the countries' result rows, union: the union rows, key: localStorage key of the selection, ctry: the countries
     ticked at first (default: all), note: a sentence under the charts}. The selection survives the page's refresh (and, per
     browser, a reload). Not in duels. */
  var xState = {};
  function exploreCard(o) {
    var st = o.st; if (MS.isDuel(st)) return null;
    var res = (o.results || []).filter(function (r) { return (r.phase === undefined || r.phase === 'game') && r.key && String(r.key).indexOf('UNION') !== 0; });
    var uRows = (o.union || []).filter(function (r) { return r.phase === 'game' && r.key === 'UNION'; });
    var years = []; res.concat(uRows).forEach(function (r) { var y = Number(r.year); if (years.indexOf(y) < 0) years.push(y); }); years.sort(function (a, b) { return a - b; });
    if (!years.length) return null;
    var sel = xState[o.key];
    if (!sel) { try { sel = JSON.parse(localStorage.getItem(o.key) || 'null'); } catch (e) { sel = null; } sel = xState[o.key] = sel || { open: false, vars: ['gdp', 'debt'], ctry: null }; }
    function save() { try { localStorage.setItem(o.key, JSON.stringify(sel)); } catch (e) { /* per-viewer convenience only */ } }
    var vars = exploreVars(st);
    var ctrys = []; res.forEach(function (r) { if (ctrys.indexOf(r.key) < 0) ctrys.push(r.key); });
    ctrys = MS.COUNTRIES.map(function (c) { return c.id; }).filter(function (id) { return ctrys.indexOf(id) >= 0; });
    if (!sel.ctry) sel.ctry = o.ctry ? o.ctry.filter(function (id) { return ctrys.indexOf(id) >= 0; }) : ctrys.slice();
    var det = el('details', { class: 'card explore' }); det.open = !!sel.open;
    det.addEventListener('toggle', function () { sel.open = det.open; save(); });
    det.appendChild(el('summary', {}, [el('h2', { style: 'display:inline' }, ['Explore the model']), el('span', { class: 'small muted', style: 'margin-left:10px' }, ['any variable, year by year, for the countries you choose'])]));
    var pick = el('div', { class: 'xpick' });
    var cRow = el('div', { class: 'xctry' }, [el('b', { class: 'small' }, ['Countries'])]);
    ctrys.forEach(function (id) {
      var cb = el('input', { type: 'checkbox' }); cb.checked = sel.ctry.indexOf(id) >= 0;
      cb.addEventListener('change', function () { var i = sel.ctry.indexOf(id); if (cb.checked && i < 0) sel.ctry.push(id); if (!cb.checked && i >= 0) sel.ctry.splice(i, 1); save(); draw(); });
      cRow.appendChild(el('label', { class: 'xchip' }, [cb, el('i', { style: 'background:' + raceColor(id) }), ' ' + MS.countryName(id)]));
    });
    pick.appendChild(cRow);
    var vBox = el('div', { class: 'xvars' });
    EXPLORE_GROUPS.forEach(function (gName) {
      var gv = vars.filter(function (v) { return v.g === gName; }); if (!gv.length) return;
      var col = el('div', { class: 'xgroup' }, [el('b', { class: 'small' }, [gName])]);
      gv.forEach(function (v) {
        var cb = el('input', { type: 'checkbox' }); cb.checked = sel.vars.indexOf(v.id) >= 0;
        cb.addEventListener('change', function () { var i = sel.vars.indexOf(v.id); if (cb.checked && i < 0) sel.vars.push(v.id); if (!cb.checked && i >= 0) sel.vars.splice(i, 1); save(); draw(); });
        col.appendChild(el('label', { class: 'small' }, [cb, ' ' + v.label]));
      });
      vBox.appendChild(col);
    });
    pick.appendChild(vBox);
    det.appendChild(pick);
    var grid = el('div', { class: 'xgrid' }), note = el('p', { class: 'xs muted', style: 'margin:.6em 0 0' });
    det.appendChild(grid); det.appendChild(note);
    if (o.note) det.appendChild(el('p', { class: 'xs muted', style: 'margin:.3em 0 0' }, [o.note]));
    function draw() {
      grid.innerHTML = '';
      var chosen = vars.filter(function (v) { return sel.vars.indexOf(v.id) >= 0; });
      if (!chosen.length) { grid.appendChild(el('p', { class: 'small muted' }, ['Tick one or more variables.'])); note.textContent = ''; return; }
      var missing = false;
      chosen.forEach(function (v) {
        var series;
        if (v.src === 'u') series = [{ name: 'Union', color: '#0a1670', pts: years.map(function (y) { var r = uRows.filter(function (x) { return Number(x.year) === y; })[0]; return { year: y, v: exploreValue(v, r) }; }) }];
        else series = ctrys.filter(function (id) { return sel.ctry.indexOf(id) >= 0; }).map(function (id) {
          return { name: MS.countryName(id), color: raceColor(id), pts: years.map(function (y) { var r = res.filter(function (x) { return x.key === id && Number(x.year) === y; })[0]; return { year: y, v: exploreValue(v, r) }; }) };
        });
        series.forEach(function (sr) { sr.pts.forEach(function (p) { if (p.v === null) missing = true; }); });
        grid.appendChild(el('div', { class: 'xcell' }, [el('div', { html: exploreSvg(v, series, years) }), el('a', { class: 'xs', href: 'model.html#' + v.eq, target: '_blank', rel: 'noopener' }, ['equation →'])]));
      });
      note.textContent = 'Deviations from the reference (no decision, no shock): volumes in %, rates and ratios in points; the union’s variables are drawn once for all. Hover a point for its value.' + (missing ? ' Gaps: variables recorded only for the years published since this tool exists (the console can publish a year again).' : '');
    }
    draw();
    return det;
  }
  /* one small chart: series = [{name, color, pts: [{year, v}]}] over years */
  /* the hover text of a point, in the page's language */
  function pointTitle(name, year, val, unit) {
    var fr = typeof MXL !== 'undefined' && MXL.lang === 'fr';
    return fr ? name + ' · année ' + year + ' : ' + MXL.num(val) + ' ' + shownLabel(unit) : name + ' · year ' + year + ': ' + val + ' ' + unit;
  }
  function exploreSvg(v, series, years) {
    var W = 360, H = 190, L = 46, Rg = 12, T = 32, B = 26;
    var vals = []; series.forEach(function (s) { s.pts.forEach(function (p) { if (p.v !== null) vals.push(p.v); }); });
    var lo = Math.min(0, Math.min.apply(null, vals.length ? vals : [0])), hi = Math.max(0, Math.max.apply(null, vals.length ? vals : [0]));
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    var pad = (hi - lo) * 0.08; hi += pad; lo -= pad;
    var X = function (y) { return years.length < 2 ? L + (W - L - Rg) / 2 : L + (W - L - Rg) * (years.indexOf(y) / (years.length - 1)); };
    var Y = function (val) { return T + (H - T - B) * (hi - val) / (hi - lo); };
    var dec = Math.abs(hi - lo) < 2 ? 2 : 1;
    var g = '<svg class="xchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(v.label) + '">';
    g += '<text x="' + L + '" y="14" class="t">' + esc(v.label) + '</text><text x="' + L + '" y="27" class="u"><tspan translate="no">' + esc(v.sym) + '</tspan> · ' + esc(shownLabel(v.unit + ' vs the reference')) + '</text>';
    [hi - pad, 0, lo + pad].forEach(function (tv, k) { if (k !== 1 && Math.abs(tv) < 1e-9) return; g += '<line x1="' + L + '" x2="' + (W - Rg) + '" y1="' + Y(tv) + '" y2="' + Y(tv) + '" class="' + (k === 1 ? 'z' : 'gl') + '"/><text x="' + (L - 6) + '" y="' + (Y(tv) + 4) + '" class="a" text-anchor="end">' + esc(fmt2(tv, dec)) + '</text>'; });
    years.forEach(function (y, k) { if (years.length > 8 && k % 2 && k !== years.length - 1) return; g += '<text x="' + X(y) + '" y="' + (H - 8) + '" class="a" text-anchor="middle">Y' + y + '</text>'; });
    series.forEach(function (s) {
      var path = '', on = false;
      s.pts.forEach(function (p) { if (p.v === null) { on = false; return; } path += (on ? 'L' : 'M') + X(p.year).toFixed(1) + ' ' + Y(p.v).toFixed(1); on = true; });
      if (path) g += '<path d="' + path + '" fill="none" stroke="' + s.color + '" stroke-width="2" stroke-linejoin="round"/>';
      s.pts.forEach(function (p) { if (p.v === null) return; g += '<circle cx="' + X(p.year).toFixed(1) + '" cy="' + Y(p.v).toFixed(1) + '" r="3.2" fill="' + s.color + '" stroke="#fff" stroke-width="1.5"><title>' + esc(pointTitle(s.name, p.year, fmt2(p.v, 2), v.unit)) + '</title></circle>'; });
    });
    if (!vals.length) g += '<text x="' + ((W + L) / 2) + '" y="' + (H / 2) + '" class="a" text-anchor="middle">not recorded for these years</text>';
    return g + '</svg>';
  }
  function fmt2(x, d) { return (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d); }
  function trajectorySvg(rows, opts) {
    opts = opts || {};
    var W = 640, H = opts.height || 240, padL = 44, padR = 20, padT = opts.title ? 30 : 14;
    var wts = trajWeights(opts.weights);
    var fs = opts.fontScale || 1, f11 = Math.round(11 * fs), f14 = Math.round(14 * fs);
    var SER = trajSeriesFor(rows);
    var seriesAll = SER.concat([R_SERIES]);
    var legend = [], lx0 = padL, lrow = 0;
    if (opts.legend !== false) seriesAll.forEach(function (s) { var w = 18 + 6.4 * shownLabel(s.label).length + 12; if (lx0 + w > W - padR) { lx0 = padL; lrow++; } legend.push({ s: s, x: lx0, row: lrow }); lx0 += w; });
    var padB = opts.legend === false ? 22 + f11 : 30 + 16 * (lrow + 1);
    if (fs > 1) { padL = Math.round(padL * fs); padT = opts.title ? Math.round(20 * fs) + 10 : padT; }
    var data = (rows || []).filter(function (r) { return r && r.year !== undefined && r.year !== null; })
      .map(function (r) { return Object.assign({}, r, { year: Number(r.year) }); })
      .sort(function (a, b) { return a.year - b.year; });
    var maxYear = data.length ? Math.max(1, data[data.length - 1].year) : 1;
    var val = function (r, id) { var v = r[id]; if (v === null || v === undefined || v === '') return null; v = Number(v); return isFinite(v) ? v : null; };
    /* contributions and totals */
    var bars = data.map(function (r) {
      var pos = 0, neg = 0, parts = [];
      var wr = r.detail && r.detail.weights ? trajWeights(r.detail.weights) : wts;   /* per-row weights (elections) win over the class weights */
      SER.forEach(function (s) { var v = val(r, s.id); if (v === null) return; var c = s.sign * (wr[s.id] || 0) * v; parts.push({ s: s, c: c, v: v }); if (c >= 0) pos += c; else neg += c; });
      var R = val(r, 'R'); if (R === null) R = pos + neg;
      return { year: r.year, parts: parts, pos: pos, neg: neg, R: R };
    });
    var maxAbs = 0;
    bars.forEach(function (b) { maxAbs = Math.max(maxAbs, b.pos, -b.neg, Math.abs(b.R)); });
    if (!(maxAbs > 0)) maxAbs = 1;
    var raw = maxAbs * 1.1, pow = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), m = raw / pow;
    var nice = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * pow;
    var yMax = nice, step = nice / 2;
    var slot = (W - padL - padR) / maxYear, bw = Math.min(56 * fs, slot * 0.55);
    var x = function (yr) { return padL + slot * (yr - 0.5); };
    var y = function (v) { return padT + (H - padT - padB) * (1 - (v + yMax) / (2 * yMax)); };
    var fmtv = function (v) { var s = (Math.round(v * 1000) / 1000).toFixed(3); return v > 0 ? '+' + s : s; };
    var fmtTick = function (v) { var s = String(Math.round(v * 100) / 100); return v > 0 ? '+' + s : s; };
    var h = '<svg class="traj" viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="contributions to the objective">';
    if (opts.title) h += '<text x="' + padL + '" y="' + Math.round(18 * fs) + '" font-size="' + f14 + '" font-weight="600" fill="#122ddb">' + esc(opts.title) + '</text>';
    for (var t = -yMax; t <= yMax + 1e-9; t += step) {
      var yy = y(t), zero = Math.abs(t) < 1e-9;
      h += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '" stroke="' + (zero ? '#5566cf' : 'rgba(18,45,219,.14)') + '" stroke-width="' + (zero ? 1.4 : 1) + '"/>';
      h += '<text x="' + (padL - 6) + '" y="' + (yy + 4).toFixed(1) + '" font-size="' + f11 + '" text-anchor="end" fill="#5566cf">' + fmtTick(t) + '</text>';
    }
    for (var yr = 1; yr <= maxYear; yr++) h += '<text x="' + x(yr).toFixed(1) + '" y="' + (H - padB + 6 + f11) + '" font-size="' + f11 + '" text-anchor="middle" fill="#5566cf">year ' + yr + '</text>';
    /* stacked bars */
    bars.forEach(function (b) {
      var cx = x(b.year), up = 0, down = 0;
      b.parts.forEach(function (pt) {
        if (Math.abs(pt.c) < 1e-9) return;
        var y0, y1;
        if (pt.c > 0) { y0 = y(up + pt.c); y1 = y(up); up += pt.c; } else { y0 = y(down); y1 = y(down + pt.c); down += pt.c; }
        h += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + y0.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0.5, y1 - y0).toFixed(1) + '" fill="' + pt.s.color + '" stroke="#fff" stroke-width="0.8"><title>' + esc(pt.s.label) + ' · year ' + b.year + ': ' + fmtv(pt.c) + ' to R (' + esc(pt.s.id === 'gdp' ? 'GDP ' : '') + fmtv(pt.v).replace(/0+$/, '').replace(/\.$/, '') + (pt.s.id === 'gdp' ? ' %' : ' pt') + ')</title></rect>';
      });
    });
    /* total R: dashed line from the reference (0) through the yearly totals, with markers */
    var pts = [[padL, y(0)]], marks = '';
    bars.forEach(function (b) { var px = x(b.year), py = y(b.R); pts.push([px, py]); marks += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="3.8" fill="#0a1670" stroke="#fff" stroke-width="1.2"><title>R · year ' + b.year + ': ' + fmtv(b.R) + '</title></circle>'; });
    if (pts.length > 1) h += '<polyline fill="none" stroke="#0a1670" stroke-width="2.4" stroke-dasharray="6 4" stroke-linejoin="round" points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>' + marks;
    var lh = '', ly0 = H - padB + 34;
    legend.forEach(function (e) {
      var s = e.s, ly = ly0 + 16 * e.row;
      if (s.dash) lh += '<line x1="' + e.x + '" x2="' + (e.x + 14) + '" y1="' + (ly - 4) + '" y2="' + (ly - 4) + '" stroke="' + s.color + '" stroke-width="2.5" stroke-dasharray="5 3"/>';
      else lh += '<rect x="' + e.x + '" y="' + (ly - 10) + '" width="14" height="11" fill="' + s.color + '"/>';
      lh += '<text x="' + (e.x + 18) + '" y="' + ly + '" font-size="11" fill="#0a1670">' + esc(s.label) + '</text>';
    });
    h += lh + '</svg>';
    return h;
  }
  /* compact text of a set of objective weights: 'GDP 0.15 · U 0.40 · π 0.15 · PB 0.15 · TB 0.15' (equal weights collapse) */
  var W_SHORT = { gdp: 'GDP', unemp: 'U', infl: 'π', pubbal: 'PB', tradebal: 'TB' , emis: 'Emis', ineq: 'Ineq' };
  function weightsLine(w, label) {
    w = w || {};
    /* the option dimensions (emissions, inequality) are listed only when they carry a weight */
    var ids = MS.INDICATORS.filter(function (i) { return (!i.eco && !i.hh) || MS.num(w[i.id]) > 0; }).map(function (i) { return i.id; });
    var vals = ids.map(function (id) { return MS.num(w[id]); });
    var txt;
    if (vals.every(function (v) { return Math.abs(v - vals[0]) < 1e-9; })) txt = MS.fmt(vals[0], 2) + ' everywhere';
    else {
      var counts = {}; vals.forEach(function (v) { var k = MS.fmt(v, 2); counts[k] = (counts[k] || 0) + 1; });
      var common = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
      var parts = ids.filter(function (id, k) { return MS.fmt(vals[k], 2) !== common; }).map(function (id, k) { return W_SHORT[id] + ' ' + MS.fmt(MS.num(w[id]), 2); });
      txt = parts.join(' · ') + (counts[common] > 1 ? ' · others ' + common : '');
    }
    return (label ? label + ' — ' : '') + txt;
  }
  /* the split of a result row into its parts — own policy, the other countries' policies, shocks, climate — with the R of each
     part: stored with the row (detail.R) or rebuilt from the parts of the indicators with the row's weights (R is linear) */
  var SPLIT_PARTS = ['nat', 'foreign', 'shock', 'climate'];
  function rowSplit(r, st, weights) {
    var d = r && r.detail, out = {}; if (!d || typeof d !== 'object') return out;
    var w = d.weights || weights || (st && st.weights);
    SPLIT_PARTS.forEach(function (p) {
      var ind = {}, has = false;
      MS.indicatorsFor(st).forEach(function (i) { var x = d[i.id] ? d[i.id][p] : undefined; if (x !== undefined && x !== null && x !== '') { ind[i.id] = Number(x); has = true; } });
      var Rp = d.R && d.R[p] !== undefined && d.R[p] !== null ? Number(d.R[p]) : (has ? MS.scoreR(ind, w) : null);
      if (has || Rp !== null) out[p] = { ind: ind, R: Rp };
    });
    return out;
  }
  /* the lines « of which … » under a country's row of a results table (board); nExtra: empty cells that close each line */
  function splitRowsHtml(r, st, weights, nExtra) {
    var sp = rowSplit(r, st, weights);
    var lab = { nat: '↳ own policy', foreign: MS.isDuel(st) ? '↳ partner’s policy' : '↳ other countries', shock: '↳ shocks', climate: '↳ climate' };
    return SPLIT_PARTS.filter(function (p) { return sp[p]; }).map(function (p) {
      var s = sp[p];
      return '<tr class="bd"><td class="small muted" style="padding-left:1.6em;white-space:nowrap">' + esc(lab[p]) + '</td>' + MS.indicatorsFor(st).map(function (i) { var x = s.ind[i.id]; return '<td class="num small ' + (x === undefined ? '' : signedClass(i.sign * x)) + '">' + esc(x === undefined ? '' : MS.fmt(x, 3, true)) + '</td>'; }).join('') +
        '<td class="num small ' + (s.R === null ? '' : signedClass(s.R)) + '">' + esc(s.R === null ? '' : MS.fmt(s.R, 3, true)) + '</td>' + new Array((nExtra || 0) + 1).join('<td></td>') + '</tr>';
    }).join('');
  }
  /* the caption under the objective charts: the five dimensions, or more with the climate or the households option */
  function trajCaption(st) {
    if (MS.climateOn(st) || MS.householdsOn(st)) return 'Each bar stacks the contributions of the dimensions to R for the year (weight × deviation; GDP and the two balances count positively, the others negatively): above zero what helped, below zero what hurt. The dashed line is R itself.';
    return 'Each bar stacks the contributions of the five dimensions to R for the year (weight × deviation; unemployment and inflation count negatively): above zero what helped, below zero what hurt. The dashed line is R itself.';
  }
  function trajectoryLegendHtml(withEmis, withIneq) {
    var items = TRAJ_SERIES.filter(function (s) { return (!s.eco || withEmis) && (!s.hh || withIneq); }).concat([R_SERIES]);
    return '<div class="trajlegend">' + items.map(function (s) { return '<span><i style="' + (s.dash ? 'background:repeating-linear-gradient(90deg,' + s.color + ' 0 6px,transparent 6px 10px)' : 'background:' + s.color + ';height:10px') + '"></i>' + esc(s.label) + '</span>'; }).join('') + '</div>';
  }
  function download(filename, text, mime) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain' }));
    a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.remove(); return Promise.resolve();
  }
  function store(key, val) { try { if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, val); } catch (e) { /* ignore */ } }
  function read(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  return { exploreCard: exploreCard, rowSplit: rowSplit, splitRowsHtml: splitRowsHtml, debtHoldersHtml: debtHoldersHtml, currencyTally: currencyTally, trajCaption: trajCaption, EXPLORE_GROUPS: EXPLORE_GROUPS, exploreVars: exploreVars, exploreValue: exploreValue, exploreSvg: exploreSvg, raceColor: raceColor, $: $, $$: $$, esc: esc, el: el, toast: toast, fmtTime: fmtTime, fmtDateTime: fmtDateTime, countdownText: countdownText, signedClass: signedClass, yearChips: yearChips, chipsHtml: chipsHtml, voteChipsHtml: voteChipsHtml, crisisWord: crisisWord, crisisTally: crisisTally, voteLinesHtml: voteLinesHtml, regimeLinesHtml: regimeLinesHtml, exitLinesHtml: exitLinesHtml, factSheetHtml: factSheetHtml, factTableHtml: factTableHtml, factItems: factItems, currencyPanelHtml: currencyPanelHtml, climateLinesHtml: climateLinesHtml, duelPanelHtml: duelPanelHtml, pledgeChipsHtml: pledgeChipsHtml, FORUM_TYPE_LABEL: FORUM_TYPE_LABEL, forumPostHtml: forumPostHtml, forumBalanceHtml: forumBalanceHtml, forumRecord: forumRecord, forumRecordHtml: forumRecordHtml, rangeText: rangeText, trajectorySvg: trajectorySvg, rRaceSvg: rRaceSvg, trajectoryLegendHtml: trajectoryLegendHtml, weightsLine: weightsLine, download: download, copyText: copyText, store: store, read: read };
})();
