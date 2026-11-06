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
    MS.LEVERS.forEach(function (l) { var v = MS.num(y.levers ? y.levers[l.id] : 0); if (v) chips.push({ label: (opts && opts.short ? l.id : l.label), value: v, unit: l.eco ? (l.id === 'ctax' ? ' pt' : '') : '%' }); });
    Object.keys(y.tariffs || {}).forEach(function (p) { var v = MS.num(y.tariffs[p]); if (v) chips.push({ label: 'Tariff on ' + MS.countryName(p), value: v, unit: ' pt' }); });
    if (y.euro && y.euro !== 'none') chips.push({ label: 'Euro: ' + y.euro, value: null });
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
    { id: 'tradebal', label: 'Trade balance', color: '#7a4fa3', sign: 1 }
  ];
  var R_SERIES = { id: 'R', label: 'R (total)', color: '#1b2437', dash: true };
  function trajWeights(w) { var d = MS.defaultState().weights; return Object.assign({}, d, w || {}); }
  function trajectorySvg(rows, opts) {
    opts = opts || {};
    var W = 640, H = opts.height || 240, padL = 44, padR = 20, padT = opts.title ? 30 : 14;
    var wts = trajWeights(opts.weights);
    var fs = opts.fontScale || 1, f11 = Math.round(11 * fs), f14 = Math.round(14 * fs);
    var seriesAll = TRAJ_SERIES.concat([R_SERIES]);
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
      TRAJ_SERIES.forEach(function (s) { var v = val(r, s.id); if (v === null) return; var c = s.sign * (wr[s.id] || 0) * v; parts.push({ s: s, c: c, v: v }); if (c >= 0) pos += c; else neg += c; });
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
  var W_SHORT = { gdp: 'GDP', unemp: 'U', infl: 'π', pubbal: 'PB', tradebal: 'TB' };
  function weightsLine(w, label) {
    w = w || {};
    var ids = MS.INDICATORS.map(function (i) { return i.id; });
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
  function trajectoryLegendHtml() {
    var items = TRAJ_SERIES.concat([R_SERIES]);
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
  return { $: $, $$: $$, esc: esc, el: el, toast: toast, fmtTime: fmtTime, fmtDateTime: fmtDateTime, countdownText: countdownText, signedClass: signedClass, yearChips: yearChips, chipsHtml: chipsHtml, voteChipsHtml: voteChipsHtml, voteLinesHtml: voteLinesHtml, regimeLinesHtml: regimeLinesHtml, climateLinesHtml: climateLinesHtml, pledgeChipsHtml: pledgeChipsHtml, trajectorySvg: trajectorySvg, trajectoryLegendHtml: trajectoryLegendHtml, weightsLine: weightsLine, download: download, copyText: copyText, store: store, read: read };
})();
