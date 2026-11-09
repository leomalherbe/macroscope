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
    var t = dicts[l] || (dicts[l] = { html: {}, attr: [], str: {} });
    var k;
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
  return { lang: lang, add: add, t: t, num: num, set: set, apply: apply };
})();
