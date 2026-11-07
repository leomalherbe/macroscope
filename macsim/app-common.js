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
  async function call(action, params) {
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
  return { call: call, apiUrl: apiUrl, setApiUrl: setApiUrl };
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
  function signedClass(v) { v = Number(v); return v > 0 ? 'pos' : (v < 0 ? 'neg' : ''); }
  /* compact description of a decision year: non-zero levers, tariffs, options */
  function yearChips(y, opts) {
    var chips = [];
    if (!y) return chips;
    MS.LEVERS.forEach(function (l) { var v = MS.num(y.levers ? y.levers[l.id] : 0); if (v) chips.push({ label: (opts && opts.short ? l.id : l.label), value: v, unit: l.duel ? ' pt' : (l.eco ? (l.id === 'ctax' ? ' pt' : '') : '%') }); });
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
  var VOTE_LABEL = { cut: 'Rate: cut', hold: 'Rate: hold', hike: 'Rate: hike', austerity: 'Crisis: austerity', devaluation: 'Crisis: devaluation' };
  function voteChipsHtml(v, opts) {
    if (!v || !v.rate) return '';
    var h = '<span class="chip vote' + (v.rate === 'hold' ? ' zero' : '') + '">' + esc(VOTE_LABEL[v.rate] || v.rate) + '</span>';
    if (opts && opts.crisis && v.crisis) h += '<span class="chip vote">' + esc(VOTE_LABEL[v.crisis] || v.crisis) + '</span>';
    return '<div class="chips">' + h + '</div>';
  }
  function voteLinesHtml(u) {
    var v = u && u.votes; if (!v) return '';
    var r = v.rate, h = '';
    if (r) h += '<div class="urow"><span>Vote on the central bank’s rate</span><span class="num">' + esc(r.cut) + ' cut · ' + esc(r.hold) + ' hold · ' + esc(r.hike) + ' hike → ' + (r.outcome ? esc(MS.fmt(r.outcome, 2, true)) + ' pt' : 'unchanged') + ' · rate ' + esc(MS.fmt(r.level, 2)) + ' %</span></div>';
    var c = v.crisis || {};
    if (c.outcome === 'forced') h += '<div class="urow"><span>Reserves exhausted</span><span class="num neg">forced devaluation</span></div>';
    else if (c.active && c.kind === 'currency') h += '<div class="urow"><span>Currency crisis · vote</span><span class="num">' + esc(c.austerity) + ' defend · ' + esc(c.devaluation) + ' let it float → <b>' + (c.outcome === 'float' ? 'let it float' : 'defend (rate raised)') + '</b></span></div>';
    else if (c.active) h += '<div class="urow"><span>Reserves crisis · vote</span><span class="num">' + esc(c.austerity) + ' austerity · ' + esc(c.devaluation) + ' devaluation → <b>' + esc(c.outcome || '—') + '</b>' + (c.outcome === 'austerity' && u.caps && u.caps.length ? ' (capped: ' + esc(u.caps.join(', ')) + ')' : '') + '</span></div>';
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
      return '<div class="fact"><div class="lab">' + esc(it.label) + '</div><div class="val">' + esc(MS.fmt(it.v, it.d, it.signed)) + '<span class="u">' + esc(it.unit) + '</span></div>' +
        '<div>' + (factDeltaHtml(it, prev ? prev.year : null) || '<span class="d flat">&nbsp;</span>') + '</div>' + (it.note ? '<div class="d flat fnote' + (it.key === 'spread' && /pressure/.test(it.note) ? ' neg' : '') + '">' + esc(it.note) + '</div>' : '') + '</div>';
    }).join('') + '</div>';
  }
  /* items: [{name, sub, badge, row, prev, ctx}] → one row per country, one column per indicator (the board) */
  function factTableHtml(items) {
    var cols = [];
    items.forEach(function (o) { factItems(o.row, o.prev, o.ctx).forEach(function (it) { if (!cols.some(function (c) { return c.key === it.key; })) cols.push({ key: it.key, label: it.label, unit: it.unit }); }); });
    var order = ['gdp', 'pi', 'u', 'pb', 'ca', 'compet', 'xr', 'debt', 'spread'];
    cols.sort(function (a, b) { return order.indexOf(a.key) - order.indexOf(b.key); });
    /* the exchange-rate column: the members' unit in the header, another unit (a country out of the union, its own currency) in the cell */
    var xrUnit = null; items.forEach(function (o) { factItems(o.row, o.prev, o.ctx).forEach(function (it) { if (it.key === 'xr' && !(o.row.detail && o.row.detail.extra && o.row.detail.extra.exited) && !xrUnit) xrUnit = it.unit; }); });
    cols.forEach(function (c) { if (c.key === 'xr' && xrUnit) c.unit = xrUnit; });
    var h = '<div class="tablewrap"><table class="facttable"><thead><tr><th>Country</th>' + cols.map(function (c) { return '<th class="num">' + esc(c.label) + '<br><span class="unit">' + esc(c.unit) + '</span></th>'; }).join('') + '</tr></thead><tbody>';
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
    return h + '</div>';
  }
  /* v1.3: regime / capital-flow lines of a union row (empty for v1.1 / v1.2 rows) */
  function regimeLinesHtml(u) {
    if (!u || !u.regime) return '';
    var isFloat = u.regime === 'float', h = '';
    h += '<div class="urow"><span>Exchange-rate regime</span><span class="num">' + (isFloat ? 'floating' : 'fixed') + (u.backstop === false ? ' · <span class="pill closed">no central-bank backstop</span>' : '') + '</span></div>';
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
    if (v.crisis) h += '<span class="chip vote">Will vote: ' + esc(v.crisis) + '</span>';
    return '<div class="chips">' + (h || '<span class="chip zero">words only</span>') + '</div>';
  }
  /* trajectory of the objective: for each year, the contribution of the five dimensions to R as stacked bars
     (positive contributions above zero, negative below), the total R as a dashed line. Inline SVG, no library.
     rows: result rows of one country/group sorted by year; opts: {weights, title, height, legend, fontScale} */
  var TRAJ_SERIES = [
    { id: 'gdp', label: 'GDP', color: '#2f5d9e', sign: 1 },
    { id: 'unemp', label: 'Unemployment', color: '#b23b3b', sign: -1 },
    { id: 'infl', label: 'Inflation', color: '#c29d2c', sign: -1 },
    { id: 'pubbal', label: 'Public balance', color: '#2f7d4f', sign: 1 },
    { id: 'tradebal', label: 'Trade balance', color: '#7a4fa3', sign: 1 },
    { id: 'emis', label: 'Emissions', color: '#3b8ea5', sign: -1, eco: true }   // sixth dimension (v2.0), drawn only when the rows carry it
  ];
  /* the series present in a set of rows: the five, plus emissions when any row has a value for it */
  function trajSeriesFor(rows) {
    var hasEmis = (rows || []).some(function (r) { return r && r.emis !== undefined && r.emis !== null && r.emis !== ''; });
    return TRAJ_SERIES.filter(function (s) { return !s.eco || hasEmis; });
  }
  var R_SERIES = { id: 'R', label: 'R (total)', color: '#1b2437', dash: true };
  function trajWeights(w) { var d = MS.defaultState().weights; return Object.assign({}, d, w || {}); }
  function trajectorySvg(rows, opts) {
    opts = opts || {};
    var W = 640, H = opts.height || 240, padL = 44, padR = 20, padT = opts.title ? 30 : 14;
    var wts = trajWeights(opts.weights);
    var fs = opts.fontScale || 1, f11 = Math.round(11 * fs), f14 = Math.round(14 * fs);
    var SER = trajSeriesFor(rows);
    var seriesAll = SER.concat([R_SERIES]);
    var legend = [], lx0 = padL, lrow = 0;
    if (opts.legend !== false) seriesAll.forEach(function (s) { var w = 18 + 6.4 * s.label.length + 12; if (lx0 + w > W - padR) { lx0 = padL; lrow++; } legend.push({ s: s, x: lx0, row: lrow }); lx0 += w; });
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
    if (opts.title) h += '<text x="' + padL + '" y="' + Math.round(18 * fs) + '" font-size="' + f14 + '" font-weight="600" fill="#14213d">' + esc(opts.title) + '</text>';
    for (var t = -yMax; t <= yMax + 1e-9; t += step) {
      var yy = y(t), zero = Math.abs(t) < 1e-9;
      h += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '" stroke="' + (zero ? '#5b6475' : '#e6e2d6') + '" stroke-width="' + (zero ? 1.4 : 1) + '"/>';
      h += '<text x="' + (padL - 6) + '" y="' + (yy + 4).toFixed(1) + '" font-size="' + f11 + '" text-anchor="end" fill="#5b6475">' + fmtTick(t) + '</text>';
    }
    for (var yr = 1; yr <= maxYear; yr++) h += '<text x="' + x(yr).toFixed(1) + '" y="' + (H - padB + 6 + f11) + '" font-size="' + f11 + '" text-anchor="middle" fill="#5b6475">year ' + yr + '</text>';
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
    bars.forEach(function (b) { var px = x(b.year), py = y(b.R); pts.push([px, py]); marks += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="3.8" fill="#1b2437" stroke="#fff" stroke-width="1.2"><title>R · year ' + b.year + ': ' + fmtv(b.R) + '</title></circle>'; });
    if (pts.length > 1) h += '<polyline fill="none" stroke="#1b2437" stroke-width="2.4" stroke-dasharray="6 4" stroke-linejoin="round" points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>' + marks;
    var lh = '', ly0 = H - padB + 34;
    legend.forEach(function (e) {
      var s = e.s, ly = ly0 + 16 * e.row;
      if (s.dash) lh += '<line x1="' + e.x + '" x2="' + (e.x + 14) + '" y1="' + (ly - 4) + '" y2="' + (ly - 4) + '" stroke="' + s.color + '" stroke-width="2.5" stroke-dasharray="5 3"/>';
      else lh += '<rect x="' + e.x + '" y="' + (ly - 10) + '" width="14" height="11" fill="' + s.color + '"/>';
      lh += '<text x="' + (e.x + 18) + '" y="' + ly + '" font-size="11" fill="#1b2437">' + esc(s.label) + '</text>';
    });
    h += lh + '</svg>';
    return h;
  }
  /* compact text of a set of objective weights: 'GDP 0.15 · U 0.40 · π 0.15 · PB 0.15 · TB 0.15' (equal weights collapse) */
  var W_SHORT = { gdp: 'GDP', unemp: 'U', infl: 'π', pubbal: 'PB', tradebal: 'TB' , emis: 'Emis' };
  function weightsLine(w, label) {
    w = w || {};
    /* the sixth dimension (emissions) is listed only when it carries a weight */
    var ids = MS.INDICATORS.filter(function (i) { return !i.eco || MS.num(w[i.id]) > 0; }).map(function (i) { return i.id; });
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
  function trajectoryLegendHtml(withEmis) {
    var items = TRAJ_SERIES.filter(function (s) { return !s.eco || withEmis; }).concat([R_SERIES]);
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
  return { $: $, $$: $$, esc: esc, el: el, toast: toast, fmtTime: fmtTime, fmtDateTime: fmtDateTime, countdownText: countdownText, signedClass: signedClass, yearChips: yearChips, chipsHtml: chipsHtml, voteChipsHtml: voteChipsHtml, voteLinesHtml: voteLinesHtml, regimeLinesHtml: regimeLinesHtml, exitLinesHtml: exitLinesHtml, factSheetHtml: factSheetHtml, factTableHtml: factTableHtml, factItems: factItems, currencyPanelHtml: currencyPanelHtml, climateLinesHtml: climateLinesHtml, duelPanelHtml: duelPanelHtml, pledgeChipsHtml: pledgeChipsHtml, trajectorySvg: trajectorySvg, trajectoryLegendHtml: trajectoryLegendHtml, weightsLine: weightsLine, download: download, copyText: copyText, store: store, read: read };
})();
