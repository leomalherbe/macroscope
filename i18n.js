/* =====================================================================
   Macroscope — page language (English by default, French on request).
   Loaded in <head>: picks the language before first paint
   (?lang= in the address > the visitor's last choice > the browser's
   language), sets <html lang>. A page then loads its dictionaries
   (i18n/<lang>-<page>.js, calling MXL.add) and calls MXL.apply() at the
   end of <body>, before its own scripts:
     - elements carrying data-i18n="key" get dict.html[key] as innerHTML;
     - dict.attr: [[css selector, attribute, value], …];
     - dict.title, dict.description: the <title> and meta description;
     - scripts translate their own strings with MXL.t('English text',
       {var: value}) — the English text is the key, {var} placeholders
       are filled in; a key 'ctx:text' shows as 'text' in English.
   Buttons carrying data-lang="en|fr" switch the language (the choice is
   remembered, the page reloads without its intro animation).

   Pages built by scripts (desk) use MXL.watch() instead: the rendered
   page is translated in place, now and after every change, from
     - dict.str: exact strings (a text node, or the inner HTML of an
       element mixing text and inline tags b/i/em/strong/span/small/
       code/sub/sup/br — no links or controls, whose handlers would be
       lost), surrounding spaces kept;
     - dict.re: [[regular expression, replacement], …] for strings with
       variable parts; $1 inserts a captured part as is, %1 translated;
     - a string "A · B · C" with no entry of its own: each part on its own;
     - the attributes placeholder, title, aria-label, and the messages of
       confirm/alert/prompt;
     - in French, numbers take a decimal comma (not after 'v', 'version').
   Elements with translate="no" (names, free text written by players)
   are left alone. While tests run (window.__mxCollect present), every
   string with no French entry is reported, whatever the language shown.
   Text kept in English when a key is missing: nothing breaks. ES5.
   ===================================================================== */
var MXL = (function () {
  'use strict';
  var LANGS = ['en', 'fr'], KEY = 'macroscope.lang', dicts = {};
  function pick() {
    var m = /[?&]lang=([a-z]{2})/.exec(location.search);
    if (m && LANGS.indexOf(m[1]) >= 0) return m[1];
    try { var s = localStorage.getItem(KEY); if (LANGS.indexOf(s) >= 0) return s; } catch (e) {}
    var n = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    return /^fr\b/i.test(n) ? 'fr' : 'en';
  }
  var lang = pick();
  document.documentElement.setAttribute('lang', lang);

  function add(l, d) {
    var t = dicts[l] || (dicts[l] = { html: {}, attr: [], str: {}, re: [] });
    var k;
    (d.re || []).forEach(function (r) { t.re.push([new RegExp('^' + r[0] + '$'), r[1]]); });
    for (k in d.html || {}) t.html[k] = d.html[k];
    for (k in d.str || {}) t.str[k] = d.str[k];
    t.attr = t.attr.concat(d.attr || []);
    if (d.title) t.title = d.title;
    if (d.description) t.description = d.description;
  }
  function t(en, vars) {
    var d = dicts[lang], s = (d && d.str[en] !== undefined) ? d.str[en] : String(en).replace(/^[a-z]+:/, '');
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined ? vars[k] : m; });
    return s;
  }
  /* numbers as text: decimal comma in French */
  function num(s) { return lang === 'fr' ? String(s).replace(/(\d)\.(\d)/g, '$1,$2') : String(s); }

  function set(l) {
    if (LANGS.indexOf(l) < 0 || l === lang) return;
    try { localStorage.setItem(KEY, l); } catch (e) {}
    try { sessionStorage.setItem('macroscope.skipIntro', '1'); } catch (e) {}
    var q = location.search.replace(/([?&])lang=[a-z]{2}&?/, '$1').replace(/[?&]$/, '');
    if (q === location.search) location.reload();
    else location.replace(location.pathname + q + location.hash);
  }
  function apply() {
    var d = dicts[lang];
    if (d) {
      Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (el) {
        var h = d.html[el.getAttribute('data-i18n')]; if (h !== undefined) el.innerHTML = h;
      });
      d.attr.forEach(function (a) {
        Array.prototype.forEach.call(document.querySelectorAll(a[0]), function (el) { el.setAttribute(a[1], a[2]); });
      });
      if (d.title) document.title = d.title;
      var md = document.querySelector('meta[name="description"]'); if (md && d.description) md.setAttribute('content', d.description);
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-lang]'), function (b) {
      var on = b.getAttribute('data-lang') === lang;
      b.setAttribute('aria-pressed', String(on));
      b.addEventListener('click', function () { set(b.getAttribute('data-lang')); });
    });
  }

  /* ---------- translation of a rendered page (MXL.watch) ---------- */
  var INLINE = { B: 1, I: 1, EM: 1, STRONG: 1, SPAN: 1, SMALL: 1, CODE: 1, SUB: 1, SUP: 1, BR: 1, U: 1 };
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, SELECT: 0 };
  function lookup(dl, s, lenient) {
    var d = dicts[dl]; if (!d) return null;
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s), core = m[2];
    if (!core || !/[A-Za-z]/.test(core)) return null;
    if (d.str[core] !== undefined) return m[1] + d.str[core] + m[3];
    for (var i = 0; i < d.re.length; i++) {
      var r = d.re[i], g = r[0].exec(core);
      if (g) return m[1] + r[1].replace(/([$%])(\d)/g, function (x, k, n) {
        var v = g[+n] === undefined ? '' : g[+n];
        if (k === '$') return v;
        var tv = lookup(dl, v, lenient); return tv === null ? v : tv;
      }) + m[3];
    }
    /* "A · B · C": each part on its own */
    if (core.indexOf(' · ') > 0) {
      var hit = 0, miss = 0;
      var parts = core.split(' · ').map(function (x) { var tx = lookup(dl, x, lenient); if (tx !== null) { hit++; return tx; } if (needs(x)) miss++; return x; });
      if (hit && (lenient || !miss)) return m[1] + parts.join(' · ') + m[3];
    }
    return null;
  }
  function needs(s) { return /[A-Za-z]{2}/.test(s); }
  function report(kind, s) {
    if (!window.__mxCollect || !needs(s) || lookup('fr', s) !== null) return;
    try { window.__mxCollect(kind, s.replace(/\s+/g, ' ').trim()); } catch (e) {}
  }
  function fixNum(s) {
    return s.replace(/(^|[^\w.])([+−-]?\d+)\.(\d+)/g, function (all, pre, a, b, off, str) {
      var before = str.slice(Math.max(0, off - 9), off + pre.length);
      return /(version\s|v)$/i.test(before) ? all : pre + a + ',' + b;
    });
  }
  function isBlock(el) {
    var txt = false, inl = false, c = el.firstChild;
    for (; c; c = c.nextSibling) {
      if (c.nodeType === 3) { if (/[A-Za-z]/.test(c.nodeValue)) txt = true; }
      else if (c.nodeType === 1) {
        if (!INLINE[c.tagName] || c.id || c.querySelector('a,button,input,select,textarea,[id],[translate="no"]')) return false;
        inl = true;
      }
    }
    return txt && inl;
  }
  function attrs(el) {
    ['placeholder', 'title', 'aria-label'].forEach(function (a) {
      var v = el.getAttribute && el.getAttribute(a); if (!v) return;
      if (lang === 'en') return report('attr', v);
      var t2 = lookup(lang, v, true); if (t2 !== null) el.setAttribute(a, t2);
    });
  }
  function walk(node) {
    if (node.nodeType === 3) {
      var v = node.nodeValue;
      if (lang === 'en') return report('text', v);
      var t2 = lookup(lang, v, true); if (t2 === null) t2 = v;
      t2 = fixNum(t2); if (t2 !== v) node.nodeValue = t2;
      return;
    }
    if (node.nodeType !== 1 || SKIP[node.tagName] || node.getAttribute('translate') === 'no') return;
    attrs(node);
    if (isBlock(node)) {
      var h = node.innerHTML.replace(/\s+/g, ' ');
      if (lang === 'en') { if (lookup('fr', h) !== null) return; }
      else { var t3 = lookup(lang, h); if (t3 !== null) { node.innerHTML = t3; Array.prototype.forEach.call(node.childNodes, function (c) { if (c.nodeType === 3) c.nodeValue = fixNum(c.nodeValue); }); return; } }
    }
    for (var c = node.firstChild; c; c = c.nextSibling) walk(c);
  }
  var watching = false;
  function watch(root) {
    root = root || document.body;
    if (lang !== 'en' && dicts[lang] && dicts[lang].title) document.title = dicts[lang].title;
    walk(root);
    if (watching || !window.MutationObserver) return;
    watching = true;
    var busy = false;
    new MutationObserver(function (ms) {
      if (busy) return; busy = true;
      try {
        ms.forEach(function (m) {
          if (m.type === 'characterData') { if (!inNo(m.target)) walk(m.target); }
          else Array.prototype.forEach.call(m.addedNodes, function (n) { if (!inNo(n)) walk(n); });
        });
      } finally { busy = false; }
    }).observe(root, { childList: true, subtree: true, characterData: true });
    ['confirm', 'alert', 'prompt'].forEach(function (f) {
      var orig = window[f]; if (!orig) return;
      window[f] = function (msg, def) { msg = String(msg); report('dialog', msg); var t2 = lang !== 'en' ? lookup(lang, msg, true) : null; return orig.call(window, t2 !== null ? t2 : msg, def); };
    });
  }
  function inNo(n) { for (var e = n.nodeType === 1 ? n : n.parentNode; e && e.getAttribute; e = e.parentNode) { if (e.getAttribute('translate') === 'no') return true; } return false; }

  return { lang: lang, add: add, t: t, num: num, set: set, apply: apply, watch: watch, lookup: lookup };
})();
