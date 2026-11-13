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
    { id: 'vat',      n: 4, label: 'Consumption tax (VAT)',       hint: 'tax on consumption spending; also lifts prices',       cat: 'supply' },
    /* v2.0 (model v2.0 only): one-sided levers, 0 to bounds.eco */
    { id: 'ctax',     n: 5, label: 'Carbon tax',                  hint: 'points; paid by firms on their emissions (1 pt ≈ 0.2 % of GDP of revenue); lifts prices the year it changes; cuts the carbon intensity by 4 % per point the next year', cat: 'eco', eco: true, unit: 'pt' },
    { id: 'green',    n: 6, label: 'Green public investment',     hint: 'units of 0.2 pt of GDP of public investment (demand, deficit); cuts the carbon intensity next year, with diminishing returns (5 units: −12.5 %, 10 units: −17 %). Green investment supports demand like public spending, but 60 % of it is imported equipment (about a third less effect on your GDP than public demand, and a worse trade balance) and its gain on your carbon intensity shrinks as you raise it.', cat: 'eco', eco: true, unit: '× 0.2 pt GDP' },
    /* duel (arcade mode): each player sets its own policy rate, in points around the reference, ±bounds.rate */
    /* §13 (class switch sim.tariffs): a country out of the union taxes the goods it buys from the members, 0 to bounds.tariffU % */
    { id: 'tariffU',  n: 8, label: 'Tariff on goods from the union', hint: 'a tax on everything your country buys from the members of the union, 0 to 20 %: your budget collects it, your households pay it, the union sells you less (and your currency appreciates, which gives part of it back)', cat: 'trade', exitOnly: true, unit: '%' },
    { id: 'rate',     n: 7, label: 'Policy rate',                hint: 'points above (+) or below (−) the reference rate of 3 %; acts on investment next year, on debt service and on capital flows (a higher rate pulls capital in and appreciates your currency)', cat: 'money', eco: true, duel: true, unit: 'pt' }
  ];
  /* the levers available to a class: the four demand/supply levers, plus the two ecological levers when the model is v2.0 */
  function isDuel(state) { return !!(state && state.kind === 'duel'); }
  /* the model of a class (spec: two models and options). Current: 'v1' (Trade) and 'v2' (Finance), the climate block as an option
     (sim.climate). Former ids kept for the classes created with them: 'v1.1', 'v1.2' (Trade, older calibrations), 'v1.3' (= v2),
     'v2.0' (= v2 + climate). A class without the key is a v1.1 class. */
  var MODEL_IDS = ['v1', 'v2', 'v1.1', 'v1.2', 'v1.3', 'v2.0'];
  function modelId(state) { if (isDuel(state)) return 'v2.0'; var m = String((state && state.sim && state.sim.model) || ''); return MODEL_IDS.indexOf(m) >= 0 ? m : 'v1.1'; }
  function financeModel(state) { var m = modelId(state); return m === 'v2' || m === 'v1.3' || m === 'v2.0'; }
  function climateOn(state) { var m = modelId(state); return isDuel(state) || m === 'v2.0' || ((m === 'v1' || m === 'v2') && !!(state && state.sim && state.sim.climate)); }
  /* the engine id of a class: OPENMU.paramsFor(engineModel(state)) */
  function engineModel(state) { var m = modelId(state); return (m === 'v1' || m === 'v2') && climateOn(state) ? m + '+climate' : m; }
  function modelLabel(state) {
    if (isDuel(state)) return 'duel';
    var m = modelId(state), lab = (financeModel(state) ? 'v2 · Finance' : 'v1 · Trade') + (climateOn(state) ? ' + Climate' : '');
    return lab + (m === 'v1.1' ? ' (former v1.1: no price channel)' : m === 'v1.2' ? ' (former v1.2: reserves 1.5 months)' : '');
  }
  /* households option (sim.households): modest and wealthy households in the engine (OPENMU.HOUSEHOLDS), Trade or Finance, not the duel */
  function householdsOn(state) { var m = modelId(state); return !isDuel(state) && (m === 'v1' || m === 'v2') && !!(state && state.sim && state.sim.households); }
  function isEcoModel(state) { return climateOn(state); }
  function leversFor(state) { var eco = isEcoModel(state), duel = isDuel(state); return LEVERS.filter(function (l) { return !l.exitOnly && (!l.eco || eco) && (!l.duel || duel); }); }
  /* §13 tariffs: the common external tariff voted by the members and the tariff of a country out of the union (sim.tariffs) */
  function tariffsOn(state) { return !isDuel(state) && !!(state && state.sim && state.sim.tariffs); }
  var CET_LEVELS = [0, 5, 10, 20];
  /* §12 leaving the union: allowed in union classes playing model v1.3 or v2.0 when the administrator switches sim.exit on.
     state.exits = {country: N}: the country announced its exit in game year N−1 and is out from year N (recorded by the console
     at the publication of year N−1). */
  function exitModelOk(state) { return !isDuel(state) && financeModel(state); }
  function exitAllowed(state) { return exitModelOk(state) && !!(state && state.sim && state.sim.exit); }
  function exitYearOf(state, country) { var e = state && state.exits ? Number(state.exits[country]) : NaN; return isFinite(e) && e > 0 ? e : null; }
  function isOutIn(state, country, year) { var e = exitYearOf(state, country); return e !== null && Number(year) >= e; }
  /* the levers of a country in a given game year: an exited country gains its policy rate */
  function leversForCountry(state, country, year) {
    var list = leversFor(state);
    if (!isDuel(state) && isOutIn(state, country, year)) list = list.concat(LEVERS.filter(function (l) { return l.id === 'rate' || (l.id === 'tariffU' && tariffsOn(state)); }));
    return list;
  }
  /* exchange-rate decisions of an exited country (payload.years[0]): regime, parity change (peg), buy-back of the bills the union sells */
  var FX_REGIMES = ['float', 'peg'];
  /* duel groups: their "country" is 'p<pair>:<side>' */
  function duelOf(country) { var m = /^p(\d+):([AB])$/.exec(String(country || '')); return m ? { pair: Number(m[1]), side: m[2], key: 'p' + m[1] + ':' + m[2], partner: 'p' + m[1] + ':' + (m[2] === 'A' ? 'B' : 'A'), pairKey: 'DUEL:p' + m[1] } : null; }
  LEVERS.forEach(function (l) { if (!l.unit) l.unit = '% of ref.'; });
  /* kept for compatibility with older classes; off by default (not part of OPEN-MU v1) */
  var TARIFF = { id: 'tariff', n: 11, label: 'Import tariffs', hint: 'by partner country, absolute variation in points', unit: 'pt (absolute)', cat: 'trade' };
  var EURO   = { id: 'euro',   label: 'Monetary union',  hint: 'leave or join the monetary union', cat: 'monetary' };
  var TFP    = { id: 'tfp',    label: 'Total factor productivity', hint: 'structural / technological shock', unit: '%', cat: 'structural' };

  var CATS = {
    demand:     'Demand-side policies',
    supply:     'Supply-side policies',
    trade:      'Trade policy',
    money:      'Monetary policy (duel)',
    monetary:   'Monetary policy',
    structural: 'Structural policy',
    eco:        'Ecological policies'
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
  /* §14: the members of a class's union — the countries assigned to its groups, recorded by the console in sim.members when the
     groups are saved before the first game run (2 to 7 countries, in the fixed order of COUNTRIES). A class without the key plays
     the seven (every class created before 8 Nov 2026). */
  function membersOf(state) {
    var list = state && state.sim && Array.isArray(state.sim.members) ? state.sim.members : null;
    var ok = list ? COUNTRIES.filter(function (c) { return list.indexOf(c.id) >= 0; }) : [];
    return ok.length >= 2 ? ok : COUNTRIES.slice();
  }

  /* ---------- Objective function: five indicators, deviations from the reference run ---------- */
  var INDICATORS = [
    { id: 'gdp',      label: 'GDP volume',        unit: '%',         sign: +1 },
    { id: 'unemp',    label: 'Unemployment rate', unit: 'pt',        sign: -1 },
    { id: 'infl',     label: 'Inflation rate',    unit: 'pt',        sign: -1 },
    { id: 'pubbal',   label: 'Public balance',    unit: 'pt of GDP', sign: +1 },
    { id: 'tradebal', label: 'Trade balance',     unit: 'pt of GDP', sign: +1 },
    { id: 'emis',     label: 'Emissions',         unit: '% of ref.', sign: -1, eco: true },   // sixth dimension, climate option only (class weight 0 by default)
    { id: 'ineq',     label: 'Inequality',        unit: 'pt',        sign: -1, hh: true }     // households option only: the wealthy half's share of disposable income (class weight 0 by default)
  ];
  /* the objective dimensions of a class: the five, plus emissions with the climate option and inequality with the households option */
  function indicatorsFor(state) { var eco = isEcoModel(state), hh = householdsOn(state); return INDICATORS.filter(function (i) { return (!i.eco || eco) && (!i.hh || hh); }); }

  function countryById(id) {
    if (id === 'ROW') return ROW;
    if (id === 'UNION') return UNION;
    for (var i = 0; i < COUNTRIES.length; i++) if (COUNTRIES[i].id === id) return COUNTRIES[i];
    return null;
  }
  function countryName(id) { var c = countryById(id); if (c) return c.name; var d = duelOf(id); return d ? 'Pair ' + d.pair + ' · Country ' + d.side : (id || '—'); }
  function leverById(id) {
    if (id === 'tariff') return TARIFF;
    for (var i = 0; i < LEVERS.length; i++) if (LEVERS[i].id === id) return LEVERS[i];
    return null;
  }

  /* ---------- Default state of a class (one state per class, kept by the backend) ---------- */
  function defaultState() {
    return {
      kind: 'union',              // 'union' (N members, one currency) | 'duel' (arcade: pairs of two countries, two currencies)
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
      bounds: { lever: 10, tariff: 10, tfp: 10, rate: 2, eco: 10, peg: 20, tariffU: 20 },   // all relative variations, in %; eco: upper bound of the one-sided v2.0 levers
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
      weights: { gdp: 0.2, unemp: 0.2, infl: 0.2, pubbal: 0.2, tradebal: 0.2, emis: 0, ineq: 0 },   // emis (climate option) and ineq (households option): 0 unless an election or the administrator activates them
      /* OPEN-MU engine inputs. `shocks`: key = year as a string ('1', '2', …), value =
         {world, rate, confidence, imports, deval} (world/confidence/imports/deval in %, rate in points).
         A patch of `shocks` replaces the WHOLE object (mergeState merges one level deep only),
         so the console always sends the complete map. `sim`: game rules computed in the console
         (votes at the central bank, see spec §7) and engine parameter overrides. */
      shocks: {},
      /* reserves-crisis votes, one per game year ('3': {status: 'open'|'closed'|'forced', austerity, devaluation, outcome}).
         Like `shocks`, a patch replaces the whole object. */
      crisis: {},
      /* §12: exits ({country: first year out}) and retaliation councils ({'N': {target country: {status, outcome: {tariff, sale, settle}, …}}}),
         both replaced as whole objects by a patch, like `shocks` */
      exits: {},
      retaliation: {},
      /* forum of the union (permanent council): on, proposals per country and year, characters per proposal,
         frozen = last year whose forum is frozen (set when the submissions of that year close) */
      forum: { on: false, perYear: 1, maxLen: 280, frozen: 0 },
      /* diplomatic telegrams: private, from country to country; the administrator opens and closes the send window */
      telegrams: { on: false, open: false, perYear: 3, maxLen: 280 },
      /* guided strategy: the justification in five short parts (instead of one free text), forecasts optional or required */
      strategy: { on: false, gridsRequired: false, minPart: 30 },
      sim: { votes: true, voteStep: 0.5, austerityCap: -5, devalSize: 10, forcedDeval: 15, crisisDepr: 10, defendStep: 1, exit: false, tariffs: false }
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
  /* Elections (any model version, no backend change): the administrator records in the game's shocks
     shocks['g'+N].elections = [{scope: 'ALL'|<countryId>, weights: {...}|null, label}], applying from year N.
     Weights in force for country c in year y: the latest country election with year <= y, else the latest
     union-wide one, else the class weights. A null `weights` means "back to the class weights". */
  var ELECTION_PRESETS = [
    { id: 'left', label: 'Left: unemployment first', weights: { gdp: 0.15, unemp: 0.4, infl: 0.15, pubbal: 0.15, tradebal: 0.15 } },
    { id: 'right', label: 'Right: public finances first', weights: { gdp: 0.15, unemp: 0.15, infl: 0.15, pubbal: 0.4, tradebal: 0.15 } },
    { id: 'green', label: 'Green: emissions first', weights: { gdp: 0.12, unemp: 0.12, infl: 0.12, pubbal: 0.12, tradebal: 0.12, emis: 0.4 }, eco: true },
    { id: 'equality', label: 'Equality: inequality first', weights: { gdp: 0.12, unemp: 0.12, infl: 0.12, pubbal: 0.12, tradebal: 0.12, ineq: 0.4 }, hh: true },
    { id: 'reset', label: 'Back to the class weights', weights: null }
  ];
  function electionsUpTo(state, year) {
    var sh = (state && state.shocks) || {}, out = [];
    Object.keys(sh).forEach(function (k) {
      var m = /^g(\d+)$/.exec(k); if (!m) return;
      var y = Number(m[1]); if (!(y <= Number(year))) return;
      var list = sh[k] && sh[k].elections; if (!Array.isArray(list)) return;
      list.forEach(function (e, idx) { if (e && e.scope) out.push({ year: y, idx: idx, scope: String(e.scope), weights: e.weights || null, label: e.label || '' }); });
    });
    out.sort(function (a, b) { return a.year - b.year || a.idx - b.idx; });
    return out;
  }
  /* {weights, label, scope, year} in force; label === '' when the class weights apply */
  function weightsInfo(state, year, country) {
    var base = Object.assign({}, defaultState().weights, (state && state.weights) || {});
    var res = { weights: base, label: '', scope: null, year: null, elected: false };
    if (!state || state.phase !== 'game') return res;
    var list = electionsUpTo(state, year), pick = null;
    var d = duelOf(country);
    list.forEach(function (e) { if (e.scope === String(country)) pick = e; });
    if (!pick && d) list.forEach(function (e) { if (e.scope === d.side) pick = e; });   // duel: 'A' / 'B' = every A / B side
    if (!pick) list.forEach(function (e) { if (e.scope === 'ALL') pick = e; });
    if (!pick || !pick.weights) return res;
    var w = Object.assign({}, base);
    INDICATORS.forEach(function (i) { var v = num(pick.weights[i.id]); if (!isNaN(v) && pick.weights[i.id] !== undefined && pick.weights[i.id] !== null && pick.weights[i.id] !== '') w[i.id] = v; });
    return { weights: w, label: pick.label, scope: pick.scope, year: pick.year, elected: true };
  }
  function weightsFor(state, year, country) { return weightsInfo(state, year, country).weights; }
  function sameWeights(a, b) { return INDICATORS.every(function (i) { return Math.abs(num(a && a[i.id]) - num(b && b[i.id])) < 1e-9; }); }
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
  /* votes at the central bank (game phase): one country, one vote — see spec §7 */
  var VOTE_RATE = ['cut', 'hold', 'hike'];
  /* reserves-crisis choices, ordered along a continuum (the median wins): austerity < devaluation < float.
     'float' (the central bank lets the currency float from that year on) exists only in the models with a floating regime. */
  var VOTE_CRISIS = ['austerity', 'devaluation', 'float'];
  function floatVoteOn(state) { return exitModelOk(state); }
  function cleanVotes(v) {
    v = v || {};
    return {
      rate: VOTE_RATE.indexOf(v.rate) >= 0 ? v.rate : 'hold',
      crisis: VOTE_CRISIS.indexOf(v.crisis) >= 0 ? v.crisis : 'austerity'
    };
  }

  function usedInstruments(payload) {
    var used = {};
    (payload.years || []).forEach(function (y) {
      Object.keys(y.levers || {}).forEach(function (id) { if (num(y.levers[id])) used[id] = true; });
      Object.keys(y.tariffs || {}).forEach(function (p) { if (num(y.tariffs[p])) used.tariff = true; });
      if (y.euro && y.euro !== 'none') used.euro = true;
      if (y.fx === 'peg') used.peg = true;
      if (num(y.tfp)) used.tfp = true;
    });
    return Object.keys(used);
  }

  /* the crisis record of a game year, or null */
  function crisisOf(state, year) {
    var c = state && state.crisis ? state.crisis[String(year)] : null;
    return c && typeof c === 'object' && c.status ? c : null;
  }
  /* a country's vote in the reserves-crisis round: payload = {crisis: 'austerity'|'devaluation'} */
  function validateCrisisVote(state, payload) {
    var v = payload && payload.crisis;
    var rec = crisisOf(state, state && state.round), fl = floatVoteOn(state) && !(rec && rec.kind === 'currency');
    if (VOTE_CRISIS.indexOf(v) < 0 || (v === 'float' && !fl)) return { ok: false, errors: [fl ? 'Vote austerity, devaluation or floating.' : 'Vote austerity or devaluation.'] };
    return { ok: true, clean: { crisis: v, years: [], text: '' }, used: ['crisis:' + v] };
  }
  /* tally of a crisis round: one country one vote, absent = austerity; the outcome is the (lower) median along
     austerity < devaluation < float — with two choices, devaluation needs more than half of the votes */
  function tallyCrisis(votes, nPlaying) {
    var a = 0, d = 0, f = 0;
    (votes || []).forEach(function (v) { if (v === 'devaluation') d++; else if (v === 'float') f++; else a++; });
    a += Math.max(0, nPlaying - a - d - f);
    var k = Math.floor((a + d + f - 1) / 2);   /* index of the lower median in the sorted votes */
    return { austerity: a, devaluation: d, float: f, outcome: a + d + f === 0 || k < a ? 'austerity' : (k < a + d ? 'devaluation' : 'float') };
  }
  /* §12 retaliation council against an exited country: each remaining member votes a level per measure; outcome = lower median
     of the playing members' votes (absent = 0); settlement of the TARGET balance by majority */
  var RETAL_TARIFF = [0, 5, 10, 20], RETAL_SALE = [0, 25, 50, 100];
  function retaliationOf(state, year, target) {
    var y = state && state.retaliation ? state.retaliation[String(year)] : null;
    var r = y && target ? y[target] : null;
    return r && typeof r === 'object' && r.status ? r : null;
  }
  /* the open retaliation council of a year, if any (first target in alphabetical order) */
  function openRetaliation(state, year) {
    var y = state && state.retaliation ? state.retaliation[String(year)] : null, out = null;
    if (y) Object.keys(y).sort().forEach(function (k) { if (!out && y[k] && y[k].status === 'open') out = k; });
    return out;
  }
  /* measures in force against `target` in game year `year`: the latest closed council at or before that year; settlement only the year it is voted */
  function retaliationIn(state, target, year) {
    var best = null, by = 0;
    Object.keys((state && state.retaliation) || {}).forEach(function (k) {
      var yy = Number(k), r = retaliationOf(state, yy, target);
      if (!r || r.status !== 'closed' || !r.outcome || !(yy <= Number(year)) || yy < by) return;
      best = r; by = yy;
    });
    if (!best) return { tariff: 0, sale: 0, settle: 0, from: null };
    return { tariff: num(best.outcome.tariff) || 0, sale: num(best.outcome.sale) || 0, settle: by === Number(year) && best.outcome.settle ? 1 : 0, from: by };
  }
  function validateRetaliationVote(state, country, payload) {
    var p = payload || {}, errors = [];
    var target = String(p.target || '');
    var r = retaliationOf(state, state.round, target);
    if (!r || r.status !== 'open') errors.push('No council on retaliation against this country is open.');
    if (target === country) errors.push('A country does not vote on retaliation against itself.');
    if (isOutIn(state, country, state.round)) errors.push('A country that has left the union does not vote at the council.');
    var tariff = num(p.tariff), sale = num(p.sale);
    if (RETAL_TARIFF.indexOf(tariff) < 0) errors.push('Tariff: choose 0, 5, 10 or 20 %.');
    if (RETAL_SALE.indexOf(sale) < 0) errors.push('Sale of bills: choose 0, 25, 50 or 100 %.');
    if (errors.length) return { ok: false, errors: errors };
    var clean = { target: target, tariff: tariff, sale: sale, settle: !!p.settle && !!(r && r.settleOpen), years: [], text: '' };
    return { ok: true, clean: clean, used: ['retaliation:' + target + ' tariff ' + tariff + ' sale ' + sale + (clean.settle ? ' settle' : '')] };
  }
  function lowerMedian(list) { var a = list.slice().sort(function (x, y) { return x - y; }); return a.length ? a[Math.floor((a.length - 1) / 2)] : 0; }
  function tallyRetaliation(votes, nPlaying) {
    var t = [], s = [], yes = 0;
    (votes || []).forEach(function (v) { t.push(num(v && v.tariff) || 0); s.push(num(v && v.sale) || 0); if (v && v.settle) yes++; });
    while (t.length < nPlaying) { t.push(0); s.push(0); }
    return { tariff: lowerMedian(t), sale: lowerMedian(s), settle: yes > nPlaying / 2, votes: (votes || []).length, playing: nPlaying, settleYes: yes };
  }

  function validateDecision(state, phase, countryId, payload) {
    var errors = [];
    var st = mergeState(state);
    var isWarm = phase === 'warmup';
    var cfg = isWarm ? st.warmup : st.game;
    var nYears = isWarm ? (cfg.years || 3) : 1;
    var ecoOn = isEcoModel(st);
    var allowed = isWarm ? (cfg.allowed || []) : leversFor(st).map(function (l) { return l.id; });
    var allowTariff = isWarm ? allowed.indexOf('tariff') >= 0 : cfg.allowTariff !== false;
    var allowEuro = isWarm ? allowed.indexOf('euro') >= 0 : !!cfg.allowEuro;
    var allowTfp = isWarm ? allowed.indexOf('tfp') >= 0 : !!cfg.allowTfp;
    var country = countryById(countryId);
    var clean = { years: [], text: String((payload && payload.text) || '').trim() };
    if (!isWarm) {
      var rawVotes = (payload && payload.votes) || {};
      if (rawVotes.rate !== undefined && VOTE_RATE.indexOf(rawVotes.rate) < 0) errors.push('Rate vote must be cut, hold or hike.');
      clean.votes = { rate: cleanVotes(rawVotes).rate };   /* the crisis vote is a round of its own (see crisisOf / validateCrisisVote) */
      /* §13: the members' vote on the common external tariff (0, 5, 10 or 20 %) */
      if (tariffsOn(st) && rawVotes.cet !== undefined && rawVotes.cet !== null && rawVotes.cet !== '') {
        var cv0 = num(rawVotes.cet);
        if (CET_LEVELS.indexOf(cv0) < 0) errors.push('Common external tariff vote: choose 0, 5, 10 or 20 %.');
        else clean.votes.cet = cv0;
      }
      if (isOutIn(st, countryId, st.round)) clean.votes = {};   /* §12: an exited country no longer votes at the council */
    }
    var crisisNow = !isWarm ? crisisOf(st, st.round) : null;
    var cap = crisisNow && crisisNow.outcome === 'austerity' ? num(st.sim.austerityCap) : null;
    var years = (payload && payload.years) || [];
    if (years.length !== nYears) errors.push('Expected ' + nYears + ' year(s) of decisions, got ' + years.length + '.');

    for (var yi = 0; yi < nYears; yi++) {
      var y = years[yi] || emptyYear();
      var cy = emptyYear();
      LEVERS.forEach(function (l) {
        var v = num(y.levers ? y.levers[l.id] : 0);
        if (isNaN(v)) { errors.push('Year ' + (yi + 1) + ': "' + l.label + '" is not a number.'); v = 0; }
        if (l.exitOnly) {
          /* §13: the tariff of a country out of the union, 0 to bounds.tariffU */
          var outT = !isWarm && isOutIn(st, countryId, st.round) && tariffsOn(st);
          if (v !== 0 && !outT) { errors.push('"' + l.label + '" belongs to a country that has left the union (tariffs switched on).'); v = 0; }
          else if (v < -1e-9 || v > num(st.bounds.tariffU || 20) + 1e-9) errors.push('"' + l.label + '" must be between 0 and ' + num(st.bounds.tariffU || 20) + ' %.');
          cy.levers[l.id] = round2(Math.max(0, v));
          return;
        }
        if (l.duel) {
          /* duel: policy rate in points, two-sided, ±bounds.rate */
          var outNow = !isWarm && isOutIn(st, countryId, st.round);
          if (v !== 0 && !isDuel(st) && !outNow) { errors.push('"' + l.label + '" belongs to the duel mode or to a country that has left the union.'); v = 0; }
          else if (Math.abs(v) > num(st.bounds.rate || 2) + 1e-9) errors.push('Year ' + (yi + 1) + ': "' + l.label + '" must stay within ±' + num(st.bounds.rate || 2) + ' points.');
          cy.levers[l.id] = round2(v);
          return;
        }
        if (l.eco) {
          /* v2.0 levers: only in a v2.0 class, one-sided, 0 to bounds.eco */
          if (v !== 0 && !ecoOn) { errors.push('"' + l.label + '" belongs to the climate option (not on in this class).'); v = 0; }
          else if (v !== 0 && allowed.indexOf(l.id) < 0) errors.push('"' + l.label + '" is not available in this phase.');
          else if (v < -1e-9 || v > num(st.bounds.eco || 10) + 1e-9) errors.push('Year ' + (yi + 1) + ': "' + l.label + '" must be between 0 and ' + num(st.bounds.eco || 10) + '.');
          cy.levers[l.id] = round2(Math.max(0, v));
          return;
        }
        if (v !== 0 && allowed.indexOf(l.id) < 0) { errors.push('"' + l.label + '" is not available in this phase.'); }
        if (Math.abs(v) > st.bounds.lever + 1e-9) errors.push('Year ' + (yi + 1) + ': "' + l.label + '" must stay within ±' + st.bounds.lever + ' %.');
        if (cap !== null && (l.id === 'pubdem' || l.id === 'benefits') && v > cap + 1e-9) errors.push('Austerity programme: "' + l.label + '" must be at most ' + cap + ' % this year.');
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
        /* §12: leaving only, in the game, when the administrator allows it; one exit per country, irreversible */
        if (isWarm || euro !== 'leave' || !exitAllowed(st)) errors.push('Leaving the monetary union is not available (ask the administrator).');
        else if (exitYearOf(st, countryId) !== null) errors.push(countryName(countryId) + ' has already announced its exit.');
        else if (!country || !country.euro) errors.push('Only a member of the union can leave it.');
      }
      cy.euro = euro === 'leave' && !isWarm ? 'leave' : 'none';
      if (!isWarm && isOutIn(st, countryId, st.round)) {
        /* exchange-rate decisions of an exited country */
        var fx = FX_REGIMES.indexOf(y.fx) >= 0 ? y.fx : 'float';
        var pc = num(y.pegChange);
        if (isNaN(pc)) { errors.push('The change of parity is not a number.'); pc = 0; }
        if (fx !== 'peg' && pc !== 0) errors.push('A change of parity needs a peg.');
        if (Math.abs(pc) > num(st.bounds.peg || 20) + 1e-9) errors.push('The change of parity must stay within ±' + num(st.bounds.peg || 20) + ' %.');
        cy.fx = fx; cy.pegChange = fx === 'peg' ? round2(pc) : 0; cy.absorb = !!y.absorb;
      } else if (y.fx || num(y.pegChange) || y.absorb) {
        errors.push('Exchange-rate decisions belong to a country that has left the union.');
      }
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
    if (strategyOn(st, phase)) {
      /* guided strategy: five parts checked one by one; the text column carries them as one text */
      var sv = validateStrategy(st, phase, payload && payload.strategy);
      errors = errors.concat(sv.errors); clean.strategy = sv.clean; clean.text = sv.text;
    } else if (clean.text.length < minText) errors.push('Your ' + (isWarm ? 'strategy statement' : 'justification') + ' needs at least ' + minText + ' characters (' + clean.text.length + ' so far).');

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
    /* ranked by the cumulative score (sum of the yearly R), the latest year breaking ties */
    rows.sort(function (a, b) {
      var ca = a.latestR === null ? -Infinity : a.cumR, cb = b.latestR === null ? -Infinity : b.cumR;
      if (cb !== ca) return cb - ca;
      var ra = a.latestR === null ? -Infinity : a.latestR, rb = b.latestR === null ? -Infinity : b.latestR;
      return rb - ra;
    });
    rows.forEach(function (r, i) { r.rank = i + 1; });
    return rows;
  }

  /* ---------- Pledges vs decisions ---------- */
  /* full verdict on a pledge payload {text, year, votes} against a decision payload {years:[…], votes} */
  function pledgeVerdict(pledgePayload, decisionPayload, tol) {
    var out = pledgeKept(pledgePayload && pledgePayload.year, decisionPayload && decisionPayload.years ? decisionPayload.years[0] : null, tol);
    var pv = (pledgePayload && pledgePayload.votes) || {}, dv = cleanVotes(decisionPayload && decisionPayload.votes);
    if (pv.rate) { var okR = (dv.rate || 'hold') === pv.rate; out.items.push({ id: 'vote_rate', label: 'Vote on the rate', pledged: pv.rate, actual: dv.rate || 'hold', kept: okR }); if (!okR) out.kept = false; }
    if (pv.crisis) { var okC = (dv.crisis || 'austerity') === pv.crisis; out.items.push({ id: 'vote_crisis', label: 'Crisis vote', pledged: pv.crisis, actual: dv.crisis || 'austerity', kept: okC }); if (!okC) out.kept = false; }
    return out;
  }
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

  /* ---------- Forum of the union (permanent council) ----------
     Each country posts a limited number of proposals a year; every country reacts (support / reject) for free,
     by name. The forum of year N freezes when the submissions of year N close; proposals posted afterwards
     belong to year N+1. Once frozen, a year's proposals are compared with the decisions (words vs acts). */
  var FORUM_TYPES = ['engagement', 'joint', 'vote'];
  function forumConf(state) {
    var f = (state && state.forum) || {};
    return { on: !!f.on, perYear: Math.max(1, Math.round(num(f.perYear)) || 1), maxLen: Math.max(80, Math.round(num(f.maxLen)) || 280), frozen: Math.max(0, Math.round(num(f.frozen)) || 0) };
  }
  function forumOn(state) { return forumConf(state).on && !!state && state.phase === 'game'; }
  /* last frozen year: every year before the current one, the years closed by the administrator, the current one once its timer ran out */
  function forumFrozenThrough(state, now) {
    var cur = Number(state.round) || 1, t = Math.max(forumConf(state).frozen, cur - 1);
    if (state.status === 'open' && state.deadline && now) {
      var dl = Date.parse(state.deadline);
      if (!isNaN(dl) && now.getTime() > dl + 60 * 1000) t = Math.max(t, cur);
    }
    return t;
  }
  /* the year new proposals are about */
  function forumYear(state, now) { var cur = Number(state.round) || 1; return forumFrozenThrough(state, now) >= cur ? cur + 1 : cur; }
  /* numbers of the forum: a range per lever, {lever: {min?, max?}} — "at least", "at most" or both; an empty field is no bound
     (0 is a bound: "at most 0" = no increase) */
  function isBlank(v) { return v === '' || v === null || v === undefined || (typeof v === 'string' && !v.trim()); }
  function cleanRanges(state, r, errors, who) {
    var out = {}, b = (state && state.bounds) || {};
    LEVERS.forEach(function (l) {
      var x = r && r[l.id]; if (!x || typeof x !== 'object') return;
      var o = {};
      ['min', 'max'].forEach(function (k) {
        if (isBlank(x[k])) return;
        var v = num(x[k]); if (isNaN(v)) { errors.push(who + l.label + ': not a number.'); return; }
        var lo = l.eco ? 0 : -(b.lever || 10), hi = l.eco ? (l.id === 'rate' ? (b.rate || 2) : (b.eco || 10)) : (b.lever || 10);
        if (l.id === 'rate') lo = -(b.rate || 2);
        if (l.id === 'tariffU') { lo = 0; hi = b.tariffU || 20; }
        if (v < lo - 1e-9 || v > hi + 1e-9) { errors.push(who + l.label + ': between ' + lo + ' and ' + hi + '.'); return; }
        o[k] = round2(v);
      });
      if (o.min !== undefined && o.max !== undefined && o.min > o.max) { errors.push(who + l.label + ': the minimum is above the maximum.'); return; }
      if (Object.keys(o).length) out[l.id] = o;
    });
    return out;
  }
  function cleanAnnounced(v) {
    v = v || {}; var out = {};
    if (VOTE_RATE.indexOf(v.rate) >= 0) out.rate = v.rate;
    if (VOTE_CRISIS.indexOf(v.crisis) >= 0) out.crisis = v.crisis;
    return out;
  }
  function hasContent(ranges, votes) {
    return !!(ranges && Object.keys(ranges).length) || !!(votes && (votes.rate || votes.crisis));
  }
  /* {ok, errors, clean}: clean = {type, text, askText?, ranges, votes, ask?: {from: ['ALL'] | [country…], ranges, votes}} */
  function validateProposal(state, author, payload) {
    payload = payload || {};
    var f = forumConf(state), errors = [];
    var type = payload.type;
    if (FORUM_TYPES.indexOf(type) < 0) errors.push('Choose the kind of proposal.');
    var text = String(payload.text || '').trim(), askText = type === 'engagement' ? String(payload.askText || '').trim() : '';
    var len = text.length + askText.length;
    if (text.length < 10) errors.push('State your proposal in a sentence (10 characters minimum).');
    if (type === 'engagement' && askText.length < 5) errors.push('Say what you ask in return.');
    if (len > f.maxLen) errors.push('Too long: ' + len + ' characters, ' + f.maxLen + ' at most.');
    var clean = { type: type, text: text, ranges: type === 'vote' ? {} : cleanRanges(state, payload.ranges, errors, ''), votes: cleanAnnounced(payload.votes) };
    if (type === 'vote' && !clean.votes.rate && !clean.votes.crisis) errors.push('Choose the vote you call for.');
    if (type === 'engagement') {
      var a = payload.ask || {}, from = Array.isArray(a.from) ? a.from : [];
      var members = membersOf(state).map(function (c) { return c.id; });
      var list = from.indexOf('ALL') >= 0 ? ['ALL'] : from.filter(function (c, i) { return c !== author && members.indexOf(c) >= 0 && from.indexOf(c) === i; });
      if (!list.length) errors.push('Say from which countries you ask the counterpart.');
      clean.askText = askText;
      clean.ask = { from: list, ranges: cleanRanges(state, a.ranges, errors, 'Asked in return, '), votes: cleanAnnounced(a.votes) };
    }
    return { ok: !errors.length, errors: errors, clean: clean };
  }
  /* words vs acts of one country against what it was to do ({ranges, votes}); decision payload or null */
  function forumCheck(country, what, decision, tol) {
    tol = tol === undefined ? 0.05 : tol;
    if (!hasContent(what.ranges, what.votes)) return { country: country, status: 'words', items: [] };
    if (!decision) return { country: country, status: 'nodecision', items: [] };
    var dy = decision.years ? decision.years[0] : null, items = [];
    Object.keys(what.ranges || {}).forEach(function (id) {
      var r = what.ranges[id], l = leverById(id), d = num(dy && dy.levers ? dy.levers[id] : 0);
      var ok = (r.min === undefined || d >= r.min - tol) && (r.max === undefined || d <= r.max + tol);
      items.push({ id: id, label: l ? l.label : id, min: r.min, max: r.max, actual: d, kept: ok });
    });
    var v = pledgeVerdict({ votes: what.votes }, decision);
    items = items.concat(v.items);
    var kept = items.every(function (i) { return i.kept; });
    return { country: country, status: !items.length ? 'words' : (kept ? 'kept' : 'broken'), items: items };
  }
  /* balance of a proposal: decOf = {country: decision payload of that year}; others = the other members (for 'ALL') */
  function forumBalance(prop, reactions, decOf, others) {
    var pay = prop.payload || {}, own = { ranges: pay.ranges, votes: pay.votes };
    var sup = (reactions || []).filter(function (r) { return Number(r.value) > 0; }).map(function (r) { return r.country; });
    var out = { author: forumCheck(prop.country, own, decOf[prop.country] || null), counterpart: [], supporters: [] };
    if (prop.type === 'engagement') {
      var ask = pay.ask || {}, what = { ranges: ask.ranges, votes: ask.votes };
      var from = (ask.from || []).indexOf('ALL') >= 0 ? (others || []).filter(function (c) { return c !== prop.country; }) : (ask.from || []);
      out.counterpart = from.map(function (c) { var k = forumCheck(c, what, decOf[c] || null); k.supported = sup.indexOf(c) >= 0; return k; });
    } else {
      out.supporters = sup.map(function (c) { return forumCheck(c, own, decOf[c] || null); });
    }
    return out;
  }

  /* ---------- Diplomatic telegrams: private, bilateral, a quota per country and year ---------- */
  function telegramConf(state) {
    var t = (state && state.telegrams) || {};
    return { on: !!t.on, open: !!t.open, perYear: Math.max(1, Math.round(num(t.perYear)) || 3), maxLen: Math.max(80, Math.round(num(t.maxLen)) || 280) };
  }
  function telegramsOn(state) { return telegramConf(state).on && !!state && state.phase === 'game' && !isDuel(state); }
  function validateTelegram(state, from, to, text, countries) {
    var c = telegramConf(state), errors = [];
    text = String(text || '').trim();
    if (!to || to === from || (countries || []).indexOf(to) < 0) errors.push('Choose the country you write to.');
    if (text.length < 5) errors.push('Your telegram is empty.');
    if (text.length > c.maxLen) errors.push('Too long: ' + text.length + ' characters, ' + c.maxLen + ' at most.');
    return { ok: !errors.length, errors: errors, clean: { to: to, text: text } };
  }

  /* ---------- Guided strategy ----------
     Five parts: the shock and the votes of the year, the other countries, our own policy (each with a forecast grid:
     the expected direction ↑ ≈ ↓ of every indicator, compared ex post with the matching part of the published split:
     shocks, foreign policies, own policy), priorities and sacrifices among the dimensions of R, the long-term project
     (kept or revised from one year to the next). The warm-up has no "other countries" part and no grids. */
  var STRAT_PARTS = [
    { id: 'shock', label: 'The shock and the votes of the year', src: 'shock' },
    { id: 'others', label: 'The other countries of the union', src: 'foreign', game: true },
    { id: 'own', label: 'Our own policy', src: 'nat' },
    { id: 'prio', label: 'Priorities and sacrifices' },
    { id: 'project', label: 'Our long-term project' }
  ];
  function strategyConf(state) {
    var g = (state && state.strategy) || {};
    return { on: !!g.on, gridsRequired: !!g.gridsRequired, minPart: Math.max(0, Math.round(num(g.minPart)) || 0) };
  }
  function strategyOn(state, phase) { return strategyConf(state).on && !isDuel(state) && (phase === 'game' || phase === 'warmup'); }
  function strategyParts(phase) { return STRAT_PARTS.filter(function (p) { return phase === 'game' || !p.game; }); }
  var ARROW = { '1': '↑', '0': '≈', '-1': '↓' };
  function validateStrategy(state, phase, raw) {
    raw = raw || {};
    var c = strategyConf(state), errors = [], clean = {}, ids = indicatorsFor(state).map(function (i) { return i.id; });
    var grids = phase === 'game';
    var txt = function (v) { return String(v || '').trim(); };
    strategyParts(phase).forEach(function (p) {
      var r = raw[p.id] || {}, o = { text: txt(r.text) };
      if (p.id === 'project') {
        o.status = ['new', 'kept', 'revised'].indexOf(r.status) >= 0 ? r.status : 'new';
        o.why = txt(r.why);
        if (o.status === 'revised' && o.why.length < 10) errors.push(p.label + ': say why you revise it.');
        if (o.text.length < (o.status === 'kept' ? 10 : c.minPart)) errors.push(p.label + ': at least ' + (o.status === 'kept' ? 10 : c.minPart) + ' characters (' + o.text.length + ' so far).');
      } else if (o.text.length < c.minPart) errors.push(p.label + ': at least ' + c.minPart + ' characters (' + o.text.length + ' so far).');
      if (p.src && grids) {
        o.expect = {};
        ids.forEach(function (id) { var v = r.expect ? r.expect[id] : null; if (v === 1 || v === 0 || v === -1 || v === '1' || v === '0' || v === '-1') o.expect[id] = Number(v); });
        if (c.gridsRequired && Object.keys(o.expect).length < ids.length) errors.push(p.label + ': give your forecast for every indicator.');
      }
      if (p.id === 'prio') {
        var up = (Array.isArray(r.up) ? r.up : []).filter(function (x, i, a) { return ids.indexOf(x) >= 0 && a.indexOf(x) === i; }).slice(0, 2);
        var down = (Array.isArray(r.down) ? r.down : []).filter(function (x, i, a) { return ids.indexOf(x) >= 0 && a.indexOf(x) === i && up.indexOf(x) < 0; }).slice(0, 2);
        if (!up.length) errors.push(p.label + ': choose at least one priority.');
        o.up = up; o.down = down;
      }
      clean[p.id] = o;
    });
    return { ok: !errors.length, errors: errors, clean: clean, text: strategyText(state, phase, clean) };
  }
  /* the strategy as one text (the justification column of the sheet, the exports, the reveals) */
  function strategyText(state, phase, s) {
    var name = function (id) { var i = INDICATORS.filter(function (x) { return x.id === id; })[0]; return i ? i.label : id; };
    return strategyParts(phase).map(function (p) {
      var o = s[p.id] || {}, h = p.label;
      if (p.id === 'project') h += ' (' + (o.status === 'kept' ? 'kept' : o.status === 'revised' ? 'revised: ' + o.why : 'new') + ')';
      var line = h + ': ' + (o.text || '');
      if (o.expect && Object.keys(o.expect).length) line += ' [' + Object.keys(o.expect).map(function (k) { return name(k) + ' ' + ARROW[String(o.expect[k])]; }).join(', ') + ']';
      if (p.id === 'prio') line += ' [first: ' + (o.up || []).map(name).join(', ') + (o.down && o.down.length ? '; accepted to worsen: ' + o.down.map(name).join(', ') : '') + ']';
      return line;
    }).join('\n');
  }
  /* forecasts vs what happened: for each part with a grid, the change over the year of the matching part of the split
     (row of the year minus the row of the year before, or zero in year 1); ≈ within ±tol */
  function forecastCheck(state, strat, row, prevRow, tol) {
    tol = tol === undefined ? 0.05 : tol;
    var out = { parts: [], hits: 0, n: 0 };
    if (!strat || !row || !row.detail) return out;
    strategyParts('game').forEach(function (p) {
      if (!p.src) return;
      var ex = (strat[p.id] && strat[p.id].expect) || {}, cells = [];
      indicatorsFor(state).forEach(function (ind) {
        if (ex[ind.id] === undefined) return;
        var a = row.detail[ind.id] ? num(row.detail[ind.id][p.src]) : NaN, b = prevRow && prevRow.detail && prevRow.detail[ind.id] ? num(prevRow.detail[ind.id][p.src]) : 0;
        if (isNaN(a)) return;
        var d = a - (isNaN(b) ? 0 : b), dir = d > tol ? 1 : (d < -tol ? -1 : 0), hit = dir === ex[ind.id];
        cells.push({ id: ind.id, expected: ex[ind.id], actual: dir, change: round3(d), hit: hit });
        out.n++; if (hit) out.hits++;
      });
      if (cells.length) out.parts.push({ id: p.id, label: p.label, cells: cells });
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
    COUNTRIES: COUNTRIES, ROW: ROW, UNION: UNION, DEFAULT_GAME_COUNTRIES: DEFAULT_GAME_COUNTRIES, INDICATORS: INDICATORS, indicatorsFor: indicatorsFor,
    membersOf: membersOf,
    countryById: countryById, countryName: countryName, leverById: leverById,
    defaultState: defaultState, mergeState: mergeState,
    num: num, round2: round2, round3: round3, fmt: fmt, pad: pad,
    scoreR: scoreR, isDuel: isDuel, duelOf: duelOf, ELECTION_PRESETS: ELECTION_PRESETS, electionsUpTo: electionsUpTo, weightsInfo: weightsInfo, weightsFor: weightsFor, sameWeights: sameWeights, emptyYear: emptyYear, usedInstruments: usedInstruments, validateDecision: validateDecision, isEcoModel: isEcoModel, leversFor: leversFor, crisisOf: crisisOf, validateCrisisVote: validateCrisisVote, tallyCrisis: tallyCrisis,
    tariffsOn: tariffsOn, CET_LEVELS: CET_LEVELS,
    exitModelOk: exitModelOk, MODEL_IDS: MODEL_IDS, modelId: modelId, financeModel: financeModel, climateOn: climateOn, householdsOn: householdsOn, engineModel: engineModel, modelLabel: modelLabel, exitAllowed: exitAllowed, exitYearOf: exitYearOf, isOutIn: isOutIn, leversForCountry: leversForCountry, FX_REGIMES: FX_REGIMES,
    RETAL_TARIFF: RETAL_TARIFF, RETAL_SALE: RETAL_SALE, retaliationOf: retaliationOf, openRetaliation: openRetaliation, retaliationIn: retaliationIn, validateRetaliationVote: validateRetaliationVote, tallyRetaliation: tallyRetaliation,
    leaderboard: leaderboard, pledgeKept: pledgeKept, pledgeVerdict: pledgeVerdict,
    FORUM_TYPES: FORUM_TYPES, forumConf: forumConf, forumOn: forumOn, forumFrozenThrough: forumFrozenThrough, forumYear: forumYear, validateProposal: validateProposal, forumCheck: forumCheck, forumBalance: forumBalance,
    telegramConf: telegramConf, telegramsOn: telegramsOn, validateTelegram: validateTelegram,
    STRAT_PARTS: STRAT_PARTS, strategyConf: strategyConf, strategyOn: strategyOn, strategyParts: strategyParts, validateStrategy: validateStrategy, strategyText: strategyText, forecastCheck: forecastCheck,
    VOTE_RATE: VOTE_RATE, VOTE_CRISIS: VOTE_CRISIS, floatVoteOn: floatVoteOn, cleanVotes: cleanVotes,
    newId: newId, makePin: makePin
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MS;
