/* =====================================================================
   MacSim policy desk — Google Apps Script backend
   Generated file: do not edit by hand (see dev/build.js).
   Setup: paste into Extensions > Apps Script of a blank Google Sheet,
   run setup() once, then Deploy > New deployment > Web app
   (Execute as: Me · Who has access: Anyone) and copy the /exec URL.
   ===================================================================== */

/* ===================== SHARED CORE (identical to macsim/core.js on the site) ===================== */
/* =====================================================================
   MacSim policy desk — shared core
   Runs unchanged in the browser (global MS), in Node (module.exports)
   and inside Google Apps Script (global MS, pasted into Code.gs).
   Keep it dependency-free and ES2017-compatible.
   ===================================================================== */
var MS = (function () {
  'use strict';

  /* ---------- Policy levers, in the exact order of the MacSim 2 administrator screen
     ("Décisions Administrateur : Chocs par Pays"). Every value is a RELATIVE variation,
     in %, of the country's own reference level (the "Variation relative (%)" box of MacSim). ---------- */
  var LEVERS = [
    { id: 'pubemp',    n: 1,  label: 'Public employment',                 fr: 'Emploi des Administrations publiques',          hint: 'number of civil servants',                               cat: 'demand' },
    { id: 'pubdem',    n: 2,  label: 'Public demand',                     fr: 'Demande globale des Administrations publiques', hint: 'real public expenditure on goods and services',           cat: 'demand' },
    { id: 'ercontr',   n: 3,  label: 'Employer social contribution rate', fr: 'Taux de cotisations sociales employeurs',       hint: 'paid by firms, in % of gross wages',                      cat: 'supply' },
    { id: 'empcontr',  n: 4,  label: 'Employee social contribution rate', fr: 'Taux de cotisations sociales salariés',         hint: 'paid by employees, in % of gross wages',                  cat: 'demand' },
    { id: 'benefits',  n: 5,  label: 'Real social benefits',              fr: 'Prestations sociales réelles',                  hint: 'unemployment insurance, family allowances, pensions',     cat: 'demand' },
    { id: 'corptax',   n: 6,  label: 'Corporate tax rate',                fr: 'Taux d’impôt sur les bénéfices des entreprises', hint: 'tax rate on company profits',                            cat: 'supply' },
    { id: 'inctax',    n: 7,  label: 'Household income tax rate',         fr: 'Taux d’impôt sur le revenu des ménages',        hint: 'direct tax rate on household income',                     cat: 'demand' },
    { id: 'subsidies', n: 8,  label: 'Subsidy rate to firms',             fr: 'Taux de subvention des entreprises',            hint: 'subsidies in % of firms’ value added',                    cat: 'supply' },
    { id: 'vat',       n: 9,  label: 'VAT rate',                          fr: 'Taux de la taxe sur la VA',                     hint: 'also moves prices, real wages and demand',                cat: 'supply' },
    { id: 'wagegap',   n: 10, label: 'Public / private relative wage',    fr: 'Salaire relatif Secteur Public/Privé',          hint: 'public-sector wage in % of the private wage',             cat: 'demand' }
  ];
  LEVERS.forEach(function (l) { l.unit = '% of ref.'; });
  var TARIFF = { id: 'tariff', n: 11, label: 'Import tariffs', fr: 'Droits de douane sur les importations en provenance de', hint: 'by partner country, ABSOLUTE variation of the tariff rate in points of % (the « Variation absolue » box of MacSim)', unit: 'pt (absolute)', cat: 'trade' };
  var EURO   = { id: 'euro',   label: 'Monetary union',  hint: 'leave or join the euro area', cat: 'monetary' };
  var TFP    = { id: 'tfp',    label: 'Total factor productivity', hint: 'structural / technological shock', unit: '%', cat: 'structural' };

  var CATS = {
    demand:     'Demand-side policies',
    supply:     'Supply-side policies',
    trade:      'Trade policy',
    monetary:   'Monetary policy',
    structural: 'Structural policy'
  };

  /* ---------- The ten active economies, in the order of the MacSim screen, + the passive rest of the world ---------- */
  var COUNTRIES = [
    { id: 'BEL', name: 'Belgium',         euro: true  },
    { id: 'DEU', name: 'Germany',         euro: true  },
    { id: 'FRA', name: 'France',          euro: true  },
    { id: 'GBR', name: 'United Kingdom',  euro: false },
    { id: 'ITA', name: 'Italy',           euro: true  },
    { id: 'JPN', name: 'Japan',           euro: false },
    { id: 'LUX', name: 'Luxembourg',      euro: true  },
    { id: 'NLD', name: 'Netherlands',     euro: true  },
    { id: 'USA', name: 'United States',   euro: false },
    { id: 'OEA', name: 'Other euro area', euro: true  }
  ];
  var ROW = { id: 'ROW', name: 'Rest of the world', euro: false };
  var DEFAULT_GAME_COUNTRIES = ['DEU', 'FRA', 'ITA', 'NLD', 'GBR', 'USA', 'JPN'];

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
        allowed: ['pubemp', 'pubdem', 'benefits', 'inctax', 'ercontr', 'vat'],
        maxNonZero: 4,
        minText: 150
      },
      game: {
        allowTariff: true,
        allowEuro: true,
        allowTfp: false,
        maxNonZero: 0,            // 0 = no limit
        minText: 100
      },
      weights: { gdp: 0.2, unemp: 0.2, infl: 0.2, pubbal: 0.2, tradebal: 0.2 }
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
    COUNTRIES: COUNTRIES, ROW: ROW, DEFAULT_GAME_COUNTRIES: DEFAULT_GAME_COUNTRIES, INDICATORS: INDICATORS,
    countryById: countryById, countryName: countryName, leverById: leverById,
    defaultState: defaultState, mergeState: mergeState,
    num: num, round2: round2, round3: round3, fmt: fmt, pad: pad,
    scoreR: scoreR, emptyYear: emptyYear, usedInstruments: usedInstruments, validateDecision: validateDecision,
    leaderboard: leaderboard, pledgeKept: pledgeKept,
    newId: newId, makePin: makePin
  };
})();

/* ===================== BACKEND SERVICE ===================== */
/* =====================================================================
   MacSim policy desk — backend service (storage-agnostic)
   Used by Google Apps Script (Code.gs) and by the Node mock server.
   Requires MS (core.js) in scope.
   storage interface:
     getConfig(key) -> string|null ; setConfig(key, value)
     listGroups() -> [{classId, groupId, name, pin, country, members}]
     replaceGroups(classId, groups)
     appendRow(table, obj) ; readRows(table) -> [obj]      tables: decisions, results, pledges, comments, log
     deleteRows(table, predicate) -> number removed ; deleteConfig(key)
     now() -> Date
   ===================================================================== */
var MSService = (function () {
  'use strict';
  var VERSION = '1.1';
  var GRACE_MS = 60 * 1000;

  function fail(msg) { return { ok: false, error: msg }; }
  function iso(d) { return (d instanceof Date ? d : new Date(d)).toISOString(); }
  function parseJSON(s, fallback) { try { return s ? JSON.parse(s) : fallback; } catch (e) { return fallback; } }

  /* ---------- config helpers ---------- */
  function getClasses(st) { return parseJSON(st.getConfig('classes'), []); }
  function setClasses(st, list) { st.setConfig('classes', JSON.stringify(list)); }
  function getState(st, classId) { return MS.mergeState(parseJSON(st.getConfig('state:' + classId), null)); }
  function setState(st, classId, state) { st.setConfig('state:' + classId, JSON.stringify(state)); }
  function classExists(st, classId) { return getClasses(st).some(function (c) { return c.id === classId; }); }

  /* ---------- row helpers: append-only tables, latest row wins ---------- */
  function latestBy(rows, keyFn) {
    var map = {};
    rows.forEach(function (r) {
      var k = keyFn(r);
      if (!map[k] || String(r.ts) > String(map[k].ts)) map[k] = r;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }
  function decisionsOf(st, classId) {
    return latestBy(st.readRows('decisions').filter(function (r) { return r.classId === classId; }),
      function (r) { return r.phase + '|' + r.round + '|' + r.groupId; })
      .map(function (r) { return Object.assign({}, r, { payload: typeof r.payload === 'string' ? parseJSON(r.payload, null) : r.payload }); });
  }
  function resultsOf(st, classId) {
    return latestBy(st.readRows('results').filter(function (r) { return r.classId === classId; }),
      function (r) { return r.phase + '|' + r.round + '|' + r.key + '|' + r.year; })
      .map(function (r) {
        var o = Object.assign({}, r);
        ['gdp', 'unemp', 'infl', 'pubbal', 'tradebal', 'R'].forEach(function (f) {
          o[f] = (o[f] === '' || o[f] === null || o[f] === undefined) ? null : Number(o[f]);
        });
        o.year = Number(o.year); o.round = Number(o.round);
        o.published = (o.published === true || o.published === 'true' || o.published === 'TRUE' || o.published === 1);
        o.detail = typeof o.detail === 'string' ? parseJSON(o.detail, null) : (o.detail || null);
        return o;
      });
  }
  function pledgesOf(st, classId) {
    return latestBy(st.readRows('pledges').filter(function (r) { return r.classId === classId; }),
      function (r) { return r.round + '|' + r.groupId; })
      .map(function (r) { return Object.assign({}, r, { round: Number(r.round), payload: typeof r.payload === 'string' ? parseJSON(r.payload, null) : r.payload }); });
  }
  function commentsOf(st, classId) {
    return latestBy(st.readRows('comments').filter(function (r) { return r.classId === classId; }),
      function (r) { return r.phase + '|' + r.round + '|' + r.groupId; });
  }
  function log(st, action, classId, who, details) {
    try { st.appendRow('log', { ts: iso(st.now()), action: action, classId: classId || '', who: who || '', details: typeof details === 'string' ? details : JSON.stringify(details || '') }); } catch (e) { /* logging must never break a request */ }
  }

  /* ---------- group lookup ---------- */
  function groupByPin(st, pin) {
    pin = String(pin || '').trim();
    if (!pin) return null;
    var all = st.listGroups();
    for (var i = 0; i < all.length; i++) if (String(all[i].pin) === pin) return all[i];
    return null;
  }
  function publicGroup(g) { return { groupId: g.groupId, name: g.name, country: g.country, classId: g.classId, members: g.members || '' }; }

  function roundOpen(state, now) {
    if (state.status !== 'open') return false;
    if (state.deadline) {
      var dl = Date.parse(state.deadline);
      if (!isNaN(dl) && now.getTime() > dl + GRACE_MS) return false;
    }
    return true;
  }

  /* decisions everyone may see: game rounds that are over (previous years, or the current year once closed) */
  function closedRoundDecisions(state, decisions) {
    if (!state.showDecisionsWhenClosed) return [];
    var cur = Number(state.round), out = {};
    decisions.forEach(function (d) {
      if (d.phase !== 'game') return;
      var rd = Number(d.round);
      var over = (state.phase === 'game' && (rd < cur || (rd === cur && state.status !== 'open'))) || (state.phase !== 'game');
      if (!over) return;
      (out[rd] = out[rd] || []).push({ groupId: d.groupId, country: d.country, payload: d.payload, ts: d.ts });
    });
    return Object.keys(out).map(Number).sort(function (a, b) { return a - b; }).map(function (rd) { return { round: rd, decisions: out[rd] }; });
  }
  function warmupPlans(state, decisions) {
    if (!state.revealWarmup) return [];
    return decisions.filter(function (d) { return d.phase === 'warmup'; }).map(function (d) { return { groupId: d.groupId, payload: d.payload, ts: d.ts }; });
  }

  /* =====================================================================
     PUBLIC ACTIONS
     ===================================================================== */
  function actState(st, p) {
    var g = groupByPin(st, p.pin);
    if (!g) return fail('Unknown PIN.');
    var state = getState(st, g.classId);
    var now = st.now();
    var groups = st.listGroups().filter(function (x) { return x.classId === g.classId; }).map(publicGroup);
    var decisions = decisionsOf(st, g.classId);
    var results = resultsOf(st, g.classId).filter(function (r) { return r.published; });
    var pledges = pledgesOf(st, g.classId);
    var comments = commentsOf(st, g.classId);

    var mine = decisions.filter(function (d) { return d.groupId === g.groupId; });
    var myResults = results.filter(function (r) {
      return (r.phase === 'warmup' && r.key === g.groupId) || (r.phase === 'game' && r.key === g.country);
    });
    var gameResults = state.publishLeaderboard ? results.filter(function (r) { return r.phase === 'game'; }) : [];
    var warmupAll = state.revealWarmup ? results.filter(function (r) { return r.phase === 'warmup'; }) : [];

    var visiblePledges = [];
    var reveals = [];
    if (state.councilOpen) visiblePledges = pledges.filter(function (x) { return x.round === Number(state.round); });
    (state.revealRounds || []).forEach(function (rd) {
      rd = Number(rd);
      reveals.push({
        round: rd,
        pledges: pledges.filter(function (x) { return x.round === rd; }),
        decisions: decisions.filter(function (d) { return d.phase === 'game' && Number(d.round) === rd; })
          .map(function (d) { return { groupId: d.groupId, country: d.country, payload: d.payload, text: d.text, ts: d.ts }; })
      });
    });

    return {
      ok: true, version: VERSION, now: iso(now),
      group: publicGroup(g), groups: groups, state: state,
      roundOpen: roundOpen(state, now),
      myDecisions: mine.map(function (d) { return { phase: d.phase, round: Number(d.round), country: d.country, payload: d.payload, ts: d.ts }; }),
      myResults: myResults,
      myComments: comments.filter(function (c) { return c.groupId === g.groupId; }),
      gameResults: gameResults,
      warmupAll: warmupAll,
      myPledges: pledges.filter(function (x) { return x.groupId === g.groupId; }),
      pledges: visiblePledges,
      reveals: reveals,
      decisionsAll: closedRoundDecisions(state, decisions),
      warmupPlans: warmupPlans(state, decisions)
    };
  }

  function actSubmit(st, p) {
    var g = groupByPin(st, p.pin);
    if (!g) return fail('Unknown PIN.');
    var state = getState(st, g.classId);
    var now = st.now();
    var phase = p.phase, round = Number(p.round);
    if (phase !== state.phase || round !== Number(state.round)) return fail('The round has changed (now: ' + state.phase + ' / round ' + state.round + '). Reload the page.');
    if (!roundOpen(state, now)) return fail('Submissions are closed for this round.');
    var country = phase === 'warmup' ? state.warmup.country : g.country;
    if (!country) return fail('No country is assigned to your group yet. Ask the administrator.');
    var v = MS.validateDecision(state, phase, country, p.payload || {});
    if (!v.ok) return { ok: false, error: 'Your decision was not accepted.', errors: v.errors };
    var row = { ts: iso(now), classId: g.classId, phase: phase, round: round, groupId: g.groupId, country: country,
      payload: JSON.stringify(v.clean), text: v.clean.text, used: v.used.join(', ') };
    st.appendRow('decisions', row);
    log(st, 'submit', g.classId, g.name, phase + ' r' + round + ' ' + v.used.join(','));
    return { ok: true, ts: row.ts, used: v.used };
  }

  function actComment(st, p) {
    var g = groupByPin(st, p.pin);
    if (!g) return fail('Unknown PIN.');
    var text = String(p.text || '').trim();
    if (text.length < 20) return fail('Your comment is too short (20 characters minimum).');
    var row = { ts: iso(st.now()), classId: g.classId, phase: p.phase, round: Number(p.round), groupId: g.groupId, text: text };
    st.appendRow('comments', row);
    log(st, 'comment', g.classId, g.name, p.phase + ' r' + p.round);
    return { ok: true, ts: row.ts };
  }

  function actPledge(st, p) {
    var g = groupByPin(st, p.pin);
    if (!g) return fail('Unknown PIN.');
    var state = getState(st, g.classId);
    if (state.phase !== 'game') return fail('The council of ministers only meets during the game.');
    if (!state.councilOpen) return fail('The council of ministers is not in session.');
    if (!g.country) return fail('No country is assigned to your group yet.');
    var payload = p.payload || {};
    var text = String(payload.text || '').trim();
    if (text.length < 10) return fail('State your pledge in a sentence (10 characters minimum).');
    var year = payload.year || MS.emptyYear();
    var cy = MS.emptyYear();
    MS.LEVERS.forEach(function (l) { var v = MS.num(year.levers ? year.levers[l.id] : 0); cy.levers[l.id] = isNaN(v) ? 0 : MS.round2(v); });
    Object.keys(year.tariffs || {}).forEach(function (k) { var v = MS.num(year.tariffs[k]); if (!isNaN(v) && v && MS.countryById(k)) cy.tariffs[k] = MS.round2(v); });
    var row = { ts: iso(st.now()), classId: g.classId, round: Number(state.round), groupId: g.groupId, country: g.country,
      text: text, payload: JSON.stringify({ text: text, year: cy }) };
    st.appendRow('pledges', row);
    log(st, 'pledge', g.classId, g.name, 'r' + state.round);
    return { ok: true, ts: row.ts };
  }

  function actBoard(st, p) {
    var classId = String(p.classId || '');
    if (!classExists(st, classId)) return fail('Unknown class.');
    var state = getState(st, classId);
    var now = st.now();
    var groups = st.listGroups().filter(function (x) { return x.classId === classId; }).map(publicGroup);
    var results = resultsOf(st, classId).filter(function (r) { return r.published; });
    var pledges = pledgesOf(st, classId);
    var decisions = decisionsOf(st, classId);
    var reveals = (state.revealRounds || []).map(function (rd) {
      rd = Number(rd);
      return {
        round: rd,
        pledges: pledges.filter(function (x) { return x.round === rd; }),
        decisions: decisions.filter(function (d) { return d.phase === 'game' && Number(d.round) === rd; })
          .map(function (d) { return { groupId: d.groupId, country: d.country, payload: d.payload, text: d.text, ts: d.ts }; })
      };
    });
    var submitted = decisions.filter(function (d) { return d.phase === state.phase && Number(d.round) === Number(state.round); })
      .map(function (d) { return d.groupId; });
    var cls = getClasses(st).filter(function (c) { return c.id === classId; })[0];
    return {
      ok: true, version: VERSION, now: iso(now), className: cls ? cls.name : classId,
      state: state, roundOpen: roundOpen(state, now), groups: groups,
      submitted: submitted,
      gameResults: state.publishLeaderboard ? results.filter(function (r) { return r.phase === 'game'; }) : [],
      warmupAll: state.revealWarmup ? results.filter(function (r) { return r.phase === 'warmup'; }) : [],
      pledges: state.councilOpen ? pledges.filter(function (x) { return x.round === Number(state.round); }) : [],
      reveals: reveals,
      decisionsAll: closedRoundDecisions(state, decisions),
      warmupPlans: warmupPlans(state, decisions)
    };
  }

  /* =====================================================================
     ADMIN ACTIONS
     ===================================================================== */
  function checkKey(st, p) {
    var key = st.getConfig('adminKey');
    return key && String(p.key || '') === String(key);
  }

  function actAdminLogin(st, p) {
    return { ok: true, version: VERSION, now: iso(st.now()), classes: getClasses(st) };
  }
  function actAdminClassCreate(st, p) {
    var name = String(p.name || '').trim();
    if (!name) return fail('Give the class a name.');
    var list = getClasses(st);
    var id = String(p.id || '').trim() || ('c' + (list.length + 1) + '_' + Math.random().toString(36).slice(2, 6));
    if (classExists(st, id)) return fail('A class with this id already exists.');
    list.push({ id: id, name: name });
    setClasses(st, list);
    setState(st, id, MS.defaultState());
    log(st, 'class.create', id, 'admin', name);
    return { ok: true, classes: list, classId: id };
  }
  function actAdminClassRename(st, p) {
    var list = getClasses(st);
    var c = list.filter(function (x) { return x.id === p.classId; })[0];
    if (!c) return fail('Unknown class.');
    c.name = String(p.name || c.name).trim() || c.name;
    setClasses(st, list);
    return { ok: true, classes: list };
  }
  function actAdminClassDelete(st, p) {
    var list = getClasses(st);
    var cls = list.filter(function (x) { return x.id === p.classId; })[0];
    if (!cls) return fail('Unknown class.');
    if (String(p.name || '').trim() !== cls.name) return fail('Type the exact class name to confirm the deletion.');
    var id = cls.id;
    setClasses(st, list.filter(function (x) { return x.id !== id; }));
    st.deleteConfig('state:' + id);
    st.replaceGroups(id, []);
    var n = 0;
    ['decisions', 'results', 'pledges', 'comments', 'log'].forEach(function (t) { n += st.deleteRows(t, function (r) { return String(r.classId) === id; }); });
    log(st, 'class.delete', '', 'admin', cls.name + ' (' + n + ' rows removed)');
    return { ok: true, classes: getClasses(st), removed: n };
  }
  function actAdminStateSet(st, p) {
    if (!classExists(st, p.classId)) return fail('Unknown class.');
    var state = MS.mergeState(getState(st, p.classId), p.patch || {});
    if (p.patch && p.patch.deadlineMinutes !== undefined) {
      var m = Number(p.patch.deadlineMinutes);
      state.deadline = (m > 0) ? new Date(st.now().getTime() + m * 60000).toISOString() : null;
    }
    setState(st, p.classId, state);
    log(st, 'state.set', p.classId, 'admin', p.patch);
    return { ok: true, state: state, now: iso(st.now()) };
  }
  function actAdminGroupsSet(st, p) {
    if (!classExists(st, p.classId)) return fail('Unknown class.');
    var others = st.listGroups().filter(function (g) { return g.classId !== p.classId; });
    var pins = others.map(function (g) { return String(g.pin); });
    var out = [];
    (p.groups || []).forEach(function (g) {
      var name = String(g.name || '').trim();
      if (!name) return;
      var pin = String(g.pin || '').trim();
      if (!pin || pins.indexOf(pin) >= 0) pin = MS.makePin(pins);
      pins.push(pin);
      out.push({ classId: p.classId, groupId: g.groupId || MS.newId('g'), name: name, pin: pin,
        country: g.country || '', members: String(g.members || '') });
    });
    st.replaceGroups(p.classId, out);
    log(st, 'groups.set', p.classId, 'admin', out.length + ' groups');
    return { ok: true, groups: out };
  }
  function actAdminOverview(st, p) {
    if (!classExists(st, p.classId)) return fail('Unknown class.');
    var state = getState(st, p.classId);
    return {
      ok: true, version: VERSION, now: iso(st.now()),
      state: state, roundOpen: roundOpen(state, st.now()),
      groups: st.listGroups().filter(function (g) { return g.classId === p.classId; }),
      decisions: decisionsOf(st, p.classId),
      results: resultsOf(st, p.classId),
      pledges: pledgesOf(st, p.classId),
      comments: commentsOf(st, p.classId)
    };
  }
  function actAdminResultsSet(st, p) {
    if (!classExists(st, p.classId)) return fail('Unknown class.');
    var state = getState(st, p.classId);
    var ts = iso(st.now());
    var n = 0;
    (p.rows || []).forEach(function (r) {
      if (!r.key) return;
      var dev = {};
      MS.INDICATORS.forEach(function (ind) { var v = MS.num(r[ind.id]); dev[ind.id] = (r[ind.id] === '' || r[ind.id] === null || r[ind.id] === undefined || isNaN(v)) ? '' : MS.round3(v); });
      var hasAny = MS.INDICATORS.some(function (ind) { return dev[ind.id] !== ''; });
      var Rgiven = MS.num(r.R);
      var R = (r.R !== '' && r.R !== null && r.R !== undefined && !isNaN(Rgiven)) ? MS.round3(Rgiven) : (hasAny ? MS.scoreR(dev, state.weights) : '');
      if (!hasAny && R === '') return;
      var detail = r.detail ? (typeof r.detail === 'string' ? r.detail : JSON.stringify(r.detail)) : '';
      st.appendRow('results', Object.assign({ ts: ts, classId: p.classId, phase: p.phase, round: Number(p.round), key: r.key, year: Number(r.year),
        R: R, published: !!r.published, detail: detail }, dev));
      n++;
    });
    log(st, 'results.set', p.classId, 'admin', p.phase + ' r' + p.round + ' ' + n + ' rows');
    return { ok: true, saved: n, results: resultsOf(st, p.classId) };
  }

  /* ---------- dispatcher ---------- */
  var PUBLIC = { ping: function () { return { ok: true, version: VERSION }; }, state: actState, submit: actSubmit, comment: actComment, pledge: actPledge, board: actBoard };
  var ADMIN = { 'admin.login': actAdminLogin, 'admin.class.create': actAdminClassCreate, 'admin.class.rename': actAdminClassRename, 'admin.class.delete': actAdminClassDelete,
    'admin.state.set': actAdminStateSet, 'admin.groups.set': actAdminGroupsSet, 'admin.overview': actAdminOverview, 'admin.results.set': actAdminResultsSet };

  function handle(action, params, storage) {
    params = params || {};
    try {
      if (PUBLIC[action]) return PUBLIC[action](storage, params);
      if (ADMIN[action]) {
        if (!checkKey(storage, params)) return fail('Invalid administrator key.');
        return ADMIN[action](storage, params);
      }
      return fail('Unknown action "' + action + '".');
    } catch (e) {
      return fail('Server error: ' + (e && e.message ? e.message : e));
    }
  }

  return { handle: handle, VERSION: VERSION, getClasses: getClasses, getState: getState };
})();

/* ===================== GOOGLE SHEETS ADAPTER + WEB ENTRY POINTS ===================== */
/* =====================================================================
   Google Apps Script adapter — storage in the bound Google Sheet,
   doGet / doPost web entry points, one-time setup().
   ===================================================================== */
var SHEETS = {
  config:    { name: 'Config',    header: ['key', 'value'] },
  groups:    { name: 'Groups',    header: ['classId', 'groupId', 'name', 'pin', 'country', 'members'] },
  decisions: { name: 'Decisions', header: null },   // built in decisionsHeader()
  results:   { name: 'Results',   header: ['ts', 'classId', 'phase', 'round', 'key', 'year', 'gdp', 'unemp', 'infl', 'pubbal', 'tradebal', 'R', 'published', 'detail'] },
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
  Logger.log('MacSim desk is ready. Administrator key: ' + key);
  try { SpreadsheetApp.getUi().alert('MacSim desk is ready.\n\nAdministrator key: ' + key + '\n\n(also stored in the Config tab)'); } catch (e) { /* no UI when run headless */ }
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
