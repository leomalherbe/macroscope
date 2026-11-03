/* =====================================================================
   OPEN-MU policy desk — shared core
   Runs unchanged in the browser (global MS), in Node (module.exports)
   and inside Google Apps Script (global MS, pasted into Code.gs).
   Keep it dependency-free and ES2017-compatible.
   ===================================================================== */
var MS = (function () {
  'use strict';

  /* ---------- Policy levers of the OPEN-MU game. Every value is a RELATIVE variation,
     in %, of the country's own reference level (0 = no change). ---------- */
  var LEVERS = [
    { id: 'pubdem',   n: 1, label: 'Public demand',               hint: 'real public expenditure on goods and services',        cat: 'demand' },
    { id: 'benefits', n: 2, label: 'Social benefits',             hint: 'transfers to households (pensions, allowances, insurance)', cat: 'demand' },
    { id: 'inctax',   n: 3, label: 'Household income tax rate',   hint: 'direct tax rate on household income',                  cat: 'demand' },
    { id: 'vat',      n: 4, label: 'Consumption tax (VAT)',       hint: 'tax on consumption spending; also lifts prices',       cat: 'supply' }
  ];
  LEVERS.forEach(function (l) { l.unit = '% of ref.'; });
  /* kept for compatibility with older classes; off by default (not part of OPEN-MU v1) */
  var TARIFF = { id: 'tariff', n: 11, label: 'Import tariffs', hint: 'by partner country, absolute variation in points', unit: 'pt (absolute)', cat: 'trade' };
  var EURO   = { id: 'euro',   label: 'Monetary union',  hint: 'leave or join the monetary union', cat: 'monetary' };
  var TFP    = { id: 'tfp',    label: 'Total factor productivity', hint: 'structural / technological shock', unit: '%', cat: 'structural' };

  var CATS = {
    demand:     'Demand-side policies',
    supply:     'Supply-side policies',
    trade:      'Trade policy',
    monetary:   'Monetary policy',
    structural: 'Structural policy'
  };

  /* ---------- The member countries of the union (OPEN-MU) + the passive rest of the world ---------- */
  var COUNTRIES = [
    { id: 'DEU', name: 'Germany',     euro: true, size: 100 },
    { id: 'FRA', name: 'France',      euro: true, size: 75 },
    { id: 'ITA', name: 'Italy',       euro: true, size: 60 },
    { id: 'ESP', name: 'Spain',       euro: true, size: 40 },
    { id: 'NLD', name: 'Netherlands', euro: true, size: 30 },
    { id: 'BEL', name: 'Belgium',     euro: true, size: 18 },
    { id: 'AUT', name: 'Austria',     euro: true, size: 14 }
  ];
  var ROW = { id: 'ROW', name: 'Rest of the world', euro: false };
  var UNION = { id: 'UNION', name: 'Monetary union' };
  var DEFAULT_GAME_COUNTRIES = ['DEU', 'FRA', 'ITA', 'ESP', 'NLD', 'BEL', 'AUT'];

  /* ---------- Objective function: five indicators, deviations from the reference run ---------- */
  var INDICATORS = [
    { id: 'gdp',      label: 'GDP volume',        unit: '%',         sign: +1 },
    { id: 'unemp',    label: 'Unemployment rate', unit: 'pt',        sign: -1 },
    { id: 'infl',     label: 'Inflation rate',    unit: 'pt',        sign: -1 },
    { id: 'pubbal',   label: 'Public balance',    unit: 'pt of GDP', sign: +1 },
    { id: 'tradebal', label: 'Trade balance',     unit: 'pt of GDP', sign: +1 }
  ];

  function countryById(id) {
    if (id === 'ROW') return ROW;
    if (id === 'UNION') return UNION;
    for (var i = 0; i < COUNTRIES.length; i++) if (COUNTRIES[i].id === id) return COUNTRIES[i];
    return null;
  }
  function countryName(id) { var c = countryById(id); return c ? c.name : (id || '—'); }
  function leverById(id) {
    if (id === 'tariff') return TARIFF;
    for (var i = 0; i < LEVERS.length; i++) if (LEVERS[i].id === id) return LEVERS[i];
    return null;
  }

  /* ---------- Default state of a class (one state per class, kept by the backend) ---------- */
  function defaultState() {
    return {
      phase: 'warmup',            // 'warmup' | 'game'
      round: 1,                   // game year (warm-up has a single round)
      status: 'closed',           // 'open' | 'closed'  (submissions accepted only when open)
      deadline: null,             // ISO string or null — countdown shown to students, enforced with a short grace
      communique: '',             // administrator's news flash (shocks, instructions)
      councilOpen: false,         // council of ministers: pledges can be posted
      revealRounds: [],           // rounds for which pledges vs actual decisions are revealed
      revealWarmup: false,        // show every group's warm-up results to everyone (debrief)
      publishLeaderboard: true,   // students and board see the ranking
      showDecisionsWhenClosed: true, // once a round is closed, every group can see everyone's decisions for that round
      years: 5,                   // length of the real game
      bounds: { lever: 10, tariff: 10, tfp: 10 },   // all relative variations, in %
      warmup: {
        country: 'FRA',
        years: 3,
        allowed: ['pubdem', 'benefits', 'inctax', 'vat'],
        maxNonZero: 4,
        minText: 150
      },
      game: {
        allowTariff: false,
        allowEuro: false,
        allowTfp: false,
        maxNonZero: 0,            // 0 = no limit
        minText: 100
      },
      weights: { gdp: 0.2, unemp: 0.2, infl: 0.2, pubbal: 0.2, tradebal: 0.2 },
      /* OPEN-MU engine inputs. `shocks`: key = year as a string ('1', '2', …), value =
         {world, rate, confidence, imports, deval} (world/confidence/imports/deval in %, rate in points).
         A patch of `shocks` replaces the WHOLE object (mergeState merges one level deep only),
         so the console always sends the complete map. `sim`: engine parameter overrides (may stay empty). */
      shocks: {},
      sim: {}
    };
  }

  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  /* shallow merge per top-level key, one level deep for nested objects */
  function mergeState(base, patch) {
    var out = JSON.parse(JSON.stringify(base || defaultState()));
    var def = defaultState();
    Object.keys(def).forEach(function (k) { if (out[k] === undefined) out[k] = def[k]; });
    if (!patch) return out;
    Object.keys(patch).forEach(function (k) {
      if (!(k in def)) return;
      if (isObj(def[k]) && isObj(patch[k])) {
        out[k] = Object.assign({}, out[k] || {}, patch[k]);
      } else {
        out[k] = patch[k];
      }
    });
    return out;
  }

  /* ---------- Numbers ---------- */
  function num(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'string') v = v.replace(',', '.').trim();
    var n = Number(v);
    return isFinite(n) ? n : NaN;
  }
  function round2(n) { return Math.round(n * 100) / 100; }
  function round3(n) { return Math.round(n * 1000) / 1000; }
  function fmt(v, d, signed) {
    if (v === null || v === undefined || v === '' || isNaN(v)) return '—';
    var n = Number(v);
    var s = n.toFixed(d === undefined ? 2 : d);
    if (signed && n > 0) s = '+' + s;
    return s;
  }

  /* ---------- Objective function ---------- */
  function scoreR(dev, weights) {
    var w = Object.assign({}, defaultState().weights, weights || {});
    var total = 0, any = false;
    INDICATORS.forEach(function (ind) {
      var v = dev ? dev[ind.id] : undefined;
      if (v === null || v === undefined || v === '' || isNaN(Number(v))) return;
      any = true;
      total += ind.sign * (w[ind.id] || 0) * Number(v);
    });
    return any ? round3(total) : null;
  }

  /* ---------- Decision payloads ----------
     payload = { years: [ {levers:{id:value}, tariffs:{partnerId:value}, euro:'none'|'leave'|'join', tfp:0}, ... ], text: '' }
     warm-up: years.length === state.warmup.years ; game: years.length === 1
  */
  function emptyYear() { return { levers: {}, tariffs: {}, euro: 'none', tfp: 0 }; }

  function usedInstruments(payload) {
    var used = {};
    (payload.years || []).forEach(function (y) {
      Object.keys(y.levers || {}).forEach(function (id) { if (num(y.levers[id])) used[id] = true; });
      Object.keys(y.tariffs || {}).forEach(function (p) { if (num(y.tariffs[p])) used.tariff = true; });
      if (y.euro && y.euro !== 'none') used.euro = true;
      if (num(y.tfp)) used.tfp = true;
    });
    return Object.keys(used);
  }

  function validateDecision(state, phase, countryId, payload) {
    var errors = [];
    var st = mergeState(state);
    var isWarm = phase === 'warmup';
    var cfg = isWarm ? st.warmup : st.game;
    var nYears = isWarm ? (cfg.years || 3) : 1;
    var allowed = isWarm ? (cfg.allowed || []) : LEVERS.map(function (l) { return l.id; });
    var allowTariff = isWarm ? allowed.indexOf('tariff') >= 0 : cfg.allowTariff !== false;
    var allowEuro = isWarm ? allowed.indexOf('euro') >= 0 : !!cfg.allowEuro;
    var allowTfp = isWarm ? allowed.indexOf('tfp') >= 0 : !!cfg.allowTfp;
    var country = countryById(countryId);
    var clean = { years: [], text: String((payload && payload.text) || '').trim() };
    var years = (payload && payload.years) || [];
    if (years.length !== nYears) errors.push('Expected ' + nYears + ' year(s) of decisions, got ' + years.length + '.');

    for (var yi = 0; yi < nYears; yi++) {
      var y = years[yi] || emptyYear();
      var cy = emptyYear();
      LEVERS.forEach(function (l) {
        var v = num(y.levers ? y.levers[l.id] : 0);
        if (isNaN(v)) { errors.push('Year ' + (yi + 1) + ': "' + l.label + '" is not a number.'); v = 0; }
        if (v !== 0 && allowed.indexOf(l.id) < 0) { errors.push('"' + l.label + '" is not available in this phase.'); }
        if (Math.abs(v) > st.bounds.lever + 1e-9) errors.push('Year ' + (yi + 1) + ': "' + l.label + '" must stay within ±' + st.bounds.lever + ' %.');
        cy.levers[l.id] = round2(v);
      });
      var tariffs = y.tariffs || {};
      Object.keys(tariffs).forEach(function (p) {
        var v = num(tariffs[p]);
        if (isNaN(v) || v === 0) return;
        if (!allowTariff) { errors.push('Tariffs are not available in this phase.'); return; }
        if (!countryById(p) || p === countryId) { errors.push('Tariff partner "' + p + '" is not valid.'); return; }
        if (Math.abs(v) > st.bounds.tariff + 1e-9) errors.push('Year ' + (yi + 1) + ': tariff on ' + countryName(p) + ' must stay within ±' + st.bounds.tariff + ' points.');
        cy.tariffs[p] = round2(v);
      });
      var euro = y.euro || 'none';
      if (euro !== 'none') {
        if (!allowEuro) errors.push('Joining / leaving the monetary union is not available in this phase.');
        else if (country && country.euro && euro !== 'leave') errors.push(country.name + ' is already a member of the euro area.');
        else if (country && !country.euro && euro !== 'join') errors.push(country.name + ' is not a member of the euro area.');
      }
      cy.euro = euro === 'leave' || euro === 'join' ? euro : 'none';
      var tfp = num(y.tfp);
      if (isNaN(tfp)) { errors.push('TFP shock is not a number.'); tfp = 0; }
      if (tfp !== 0 && !allowTfp) errors.push('The productivity shock is not available (ask the administrator).');
      if (Math.abs(tfp) > st.bounds.tfp + 1e-9) errors.push('TFP shock must stay within ±' + st.bounds.tfp + ' %.');
      cy.tfp = round2(tfp);
      clean.years.push(cy);
    }

    var used = usedInstruments(clean);
    if (cfg.maxNonZero && used.length > cfg.maxNonZero) errors.push('At most ' + cfg.maxNonZero + ' instruments may be used (you use ' + used.length + ').');
    if (used.length === 0 && isWarm) errors.push('No instrument is activated — a plan with all zeros is not a policy.');
    var minText = cfg.minText || 0;
    if (clean.text.length < minText) errors.push('Your ' + (isWarm ? 'strategy statement' : 'justification') + ' needs at least ' + minText + ' characters (' + clean.text.length + ' so far).');

    return { ok: errors.length === 0, errors: errors, clean: clean, used: used };
  }

  /* ---------- Leaderboard from published results ----------
     results: [{key, year, gdp, unemp, infl, pubbal, tradebal, R, published}]  (key = country id in the game)
  */
  function leaderboard(results, weights) {
    var byKey = {};
    (results || []).forEach(function (r) {
      if (r.published === false) return;
      var R = (r.R === null || r.R === undefined || r.R === '') ? scoreR(r, weights) : Number(r.R);
      if (!byKey[r.key]) byKey[r.key] = { key: r.key, years: {}, latestYear: 0, latestR: null, cumR: 0 };
      var e = byKey[r.key];
      e.years[r.year] = Object.assign({}, r, { R: R });
      if (R !== null && !isNaN(R)) {
        e.cumR = round3(e.cumR + R);
        if (Number(r.year) >= e.latestYear) { e.latestYear = Number(r.year); e.latestR = R; }
      }
    });
    var rows = Object.keys(byKey).map(function (k) { return byKey[k]; });
    rows.sort(function (a, b) {
      var ra = a.latestR === null ? -Infinity : a.latestR, rb = b.latestR === null ? -Infinity : b.latestR;
      return rb - ra;
    });
    rows.forEach(function (r, i) { r.rank = i + 1; });
    return rows;
  }

  /* ---------- Pledges vs decisions ---------- */
  function pledgeKept(pledgeYear, decisionYear, tol) {
    tol = tol === undefined ? 0.05 : tol;
    var out = { kept: true, items: [] };
    if (!pledgeYear) return out;
    LEVERS.forEach(function (l) {
      var p = num(pledgeYear.levers ? pledgeYear.levers[l.id] : 0);
      if (!p) return;
      var d = num(decisionYear && decisionYear.levers ? decisionYear.levers[l.id] : 0);
      var ok = (p > 0 ? d >= p - tol : d <= p + tol);
      out.items.push({ id: l.id, label: l.label, pledged: p, actual: d, kept: ok });
      if (!ok) out.kept = false;
    });
    var pt = pledgeYear.tariffs || {}, dt = (decisionYear && decisionYear.tariffs) || {};
    Object.keys(pt).forEach(function (p) {
      var pv = num(pt[p]); if (!pv) return;
      var dv = num(dt[p]);
      var ok = (pv > 0 ? dv >= pv - tol : dv <= pv + tol);
      out.items.push({ id: 'tariff:' + p, label: 'Tariff on ' + countryName(p), pledged: pv, actual: dv, kept: ok });
      if (!ok) out.kept = false;
    });
    return out;
  }

  /* ---------- Misc ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function newId(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function makePin(existing) {
    var set = {};
    (existing || []).forEach(function (p) { set[String(p)] = true; });
    for (var tries = 0; tries < 1000; tries++) {
      var pin = String(1000 + Math.floor(Math.random() * 9000));
      if (!set[pin]) return pin;
    }
    return String(Date.now()).slice(-4);
  }

  return {
    LEVERS: LEVERS, TARIFF: TARIFF, EURO: EURO, TFP: TFP, CATS: CATS,
    COUNTRIES: COUNTRIES, ROW: ROW, UNION: UNION, DEFAULT_GAME_COUNTRIES: DEFAULT_GAME_COUNTRIES, INDICATORS: INDICATORS,
    countryById: countryById, countryName: countryName, leverById: leverById,
    defaultState: defaultState, mergeState: mergeState,
    num: num, round2: round2, round3: round3, fmt: fmt, pad: pad,
    scoreR: scoreR, emptyYear: emptyYear, usedInstruments: usedInstruments, validateDecision: validateDecision,
    leaderboard: leaderboard, pledgeKept: pledgeKept,
    newId: newId, makePin: makePin
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MS;
