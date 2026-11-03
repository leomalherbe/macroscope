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
    MS.LEVERS.forEach(function (l) { var v = MS.num(y.levers ? y.levers[l.id] : 0); if (v) chips.push({ label: (opts && opts.short ? l.id : l.label), value: v, unit: '%' }); });
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
  return { $: $, $$: $$, esc: esc, el: el, toast: toast, fmtTime: fmtTime, fmtDateTime: fmtDateTime, countdownText: countdownText, signedClass: signedClass, yearChips: yearChips, chipsHtml: chipsHtml, download: download, copyText: copyText, store: store, read: read };
})();
