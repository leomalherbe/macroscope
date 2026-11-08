/* =====================================================================
   OPEN-MU policy desk — Google Apps Script backend
   Generated file: do not edit by hand (see dev/build.js).
   Setup: paste into Extensions > Apps Script of a blank Google Sheet,
   run setup() once, then Deploy > New deployment > Web app
   (Execute as: Me · Who has access: Anyone) and copy the /exec URL.
   ===================================================================== */

/* ===================== SHARED CORE (identical to macroscope/core.js on the site) ===================== */
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
  function isEcoModel(state) { return isDuel(state) || !!(state && state.sim && String(state.sim.model) === 'v2.0'); }
  function leversFor(state) { var eco = isEcoModel(state), duel = isDuel(state); return LEVERS.filter(function (l) { return !l.exitOnly && (!l.eco || eco) && (!l.duel || duel); }); }
  /* §13 tariffs: the common external tariff voted by the members and the tariff of a country out of the union (sim.tariffs) */
  function tariffsOn(state) { return !isDuel(state) && !!(state && state.sim && state.sim.tariffs); }
  var CET_LEVELS = [0, 5, 10, 20];
  /* §12 leaving the union: allowed in union classes playing model v1.3 or v2.0 when the administrator switches sim.exit on.
     state.exits = {country: N}: the country announced its exit in game year N−1 and is out from year N (recorded by the console
     at the publication of year N−1). */
  function exitModelOk(state) { var m = String((state && state.sim && state.sim.model) || ''); return !isDuel(state) && (m === 'v1.3' || m === 'v2.0'); }
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
    { id: 'emis',     label: 'Emissions',         unit: '% of ref.', sign: -1, eco: true }   // sixth dimension, v2.0 classes only (class weight 0 by default)
  ];
  /* the objective dimensions of a class: five for v1.x, six (with emissions) for v2.0 */
  function indicatorsFor(state) { var eco = isEcoModel(state); return INDICATORS.filter(function (i) { return !i.eco || eco; }); }

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
      weights: { gdp: 0.2, unemp: 0.2, infl: 0.2, pubbal: 0.2, tradebal: 0.2, emis: 0 },   // emis: sixth dimension (v2.0), 0 unless an election or the administrator activates it
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
  var VOTE_CRISIS = ['austerity', 'devaluation'];
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
    if (VOTE_CRISIS.indexOf(v) < 0) return { ok: false, errors: ['Vote austerity or devaluation.'] };
    return { ok: true, clean: { crisis: v, years: [], text: '' }, used: ['crisis:' + v] };
  }
  /* tally of a crisis round: one country one vote, absent = austerity, devaluation needs more than half of the playing countries */
  function tallyCrisis(votes, nPlaying) {
    var a = 0, d = 0;
    (votes || []).forEach(function (v) { if (v === 'devaluation') d++; else a++; });
    a += Math.max(0, nPlaying - a - d);
    return { austerity: a, devaluation: d, outcome: d > nPlaying / 2 ? 'devaluation' : 'austerity' };
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
          if (v !== 0 && !ecoOn) { errors.push('"' + l.label + '" belongs to model v2.0 (not this class).'); v = 0; }
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
    exitModelOk: exitModelOk, exitAllowed: exitAllowed, exitYearOf: exitYearOf, isOutIn: isOutIn, leversForCountry: leversForCountry, FX_REGIMES: FX_REGIMES,
    RETAL_TARIFF: RETAL_TARIFF, RETAL_SALE: RETAL_SALE, retaliationOf: retaliationOf, openRetaliation: openRetaliation, retaliationIn: retaliationIn, validateRetaliationVote: validateRetaliationVote, tallyRetaliation: tallyRetaliation,
    leaderboard: leaderboard, pledgeKept: pledgeKept, pledgeVerdict: pledgeVerdict,
    VOTE_RATE: VOTE_RATE, VOTE_CRISIS: VOTE_CRISIS, cleanVotes: cleanVotes,
    newId: newId, makePin: makePin
  };
})();

/* ===================== BACKEND SERVICE ===================== */
/* =====================================================================
   OPEN-MU policy desk — backend service (storage-agnostic)
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
  var VERSION = '1.10';
  /* results rows describing the monetary union as a whole (OPEN-MU): key 'UNION' in the game, 'UNION:<groupId>' in the warm-up */
  function isUnionKey(k) { var k2 = String(k || ''); return k2.indexOf('UNION') === 0 || k2.indexOf('DUEL:') === 0; }
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
      function (r) { return r.phase + '|' + r.round + '|' + r.groupId + (r.phase === 'retaliation' ? '|' + (((typeof r.payload === 'string' ? parseJSON(r.payload, {}) : r.payload) || {}).target || '') : ''); })   /* §12: one retaliation vote per target */
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
    var crisisOut = {}, retalOut = {};
    decisions.forEach(function (d) {
      var rd = Number(d.round);
      if (d.phase === 'retaliation') {
        /* §12: votes of a retaliation council, revealed once it is closed */
        var tg = d.payload ? d.payload.target : null, rc = MS.retaliationOf(state, rd, tg);
        if (rc && rc.status !== 'open') (retalOut[rd] = retalOut[rd] || []).push({ groupId: d.groupId, country: d.country, target: tg, tariff: d.payload.tariff, sale: d.payload.sale, settle: !!d.payload.settle, ts: d.ts });
        return;
      }
      if (d.phase === 'crisis') {
        var c = MS.crisisOf(state, rd);
        if (c && c.status !== 'open') (crisisOut[rd] = crisisOut[rd] || []).push({ groupId: d.groupId, country: d.country, crisis: d.payload ? d.payload.crisis : null, ts: d.ts });
        return;
      }
      if (d.phase !== 'game') return;
      var over = (state.phase === 'game' && (rd < cur || (rd === cur && state.status !== 'open'))) || (state.phase !== 'game');
      if (!over) return;
      (out[rd] = out[rd] || []).push({ groupId: d.groupId, country: d.country, payload: d.payload, ts: d.ts });
    });
    var rounds = {}; Object.keys(out).forEach(function (k) { rounds[k] = 1; }); Object.keys(crisisOut).forEach(function (k) { rounds[k] = 1; }); Object.keys(retalOut).forEach(function (k) { rounds[k] = 1; });
    return Object.keys(rounds).map(Number).sort(function (a, b) { return a - b; }).map(function (rd) { return { round: rd, decisions: out[rd] || [], crisisVotes: crisisOut[rd] || [], retaliationVotes: retalOut[rd] || [] }; });
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
    var duel = MS.duelOf(g.country);
    var union = results.filter(function (r) {
      if (duel) return r.phase === 'game' && r.key === duel.pairKey;   // duel: the pair's row (exchange rate, both reserves, climate)
      return (r.phase === 'warmup' && r.key === 'UNION:' + g.groupId) || (r.phase === 'game' && r.key === 'UNION');
    });
    var gameResults = state.publishLeaderboard ? results.filter(function (r) { return r.phase === 'game' && !isUnionKey(r.key); }) : [];
    var warmupAll = state.revealWarmup ? results.filter(function (r) { return r.phase === 'warmup' && !isUnionKey(r.key); }) : [];

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
      partner: duel ? (function () { var pg = groups.filter(function (x) { return x.country === duel.partner; })[0]; return pg ? { groupId: pg.groupId, name: pg.name, country: pg.country, side: duel.side === 'A' ? 'B' : 'A', pair: duel.pair } : null; })() : null,
      myDecisions: mine.map(function (d) { return { phase: d.phase, round: Number(d.round), country: d.country, payload: d.payload, ts: d.ts }; }),
      myResults: myResults,
      union: union,
      crisisVotesIn: decisions.filter(function (d) { return d.phase === 'crisis' && Number(d.round) === Number(state.round); }).length,
      retaliationVotesIn: decisions.filter(function (d) { return d.phase === 'retaliation' && Number(d.round) === Number(state.round); }).length,
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
    var cr = MS.crisisOf(state, state.round);
    var openRetal = state.phase === 'game' ? MS.openRetaliation(state, state.round) : null;
    if (phase === 'retaliation') {
      /* §12: the council on retaliation against a country that has left the union, a round of its own */
      if (state.phase !== 'game' || round !== Number(state.round)) return fail('The round has changed (now: ' + state.phase + ' / round ' + state.round + '). Reload the page.');
      if (!g.country) return fail('No country is assigned to your group yet. Ask the administrator.');
      var rv = MS.validateRetaliationVote(state, g.country, p.payload || {});
      if (!rv.ok) return { ok: false, error: 'Your vote was not accepted.', errors: rv.errors };
      var rrow = { ts: iso(now), classId: g.classId, phase: 'retaliation', round: round, groupId: g.groupId, country: g.country,
        payload: JSON.stringify(rv.clean), text: '', used: rv.used.join(', ') };
      st.appendRow('decisions', rrow);
      log(st, 'submit', g.classId, g.name, 'retaliation r' + round + ' ' + rv.used.join(','));
      return { ok: true, ts: rrow.ts, used: rv.used };
    }
    if (phase === 'crisis') {
      /* the reserves-crisis vote: a round of its own, opened and closed by the administrator */
      if (state.phase !== 'game' || round !== Number(state.round)) return fail('The round has changed (now: ' + state.phase + ' / round ' + state.round + '). Reload the page.');
      if (!cr || cr.status !== 'open') return fail('The crisis vote is not open.');
      if (!g.country) return fail('No country is assigned to your group yet. Ask the administrator.');
      if (MS.isOutIn(state, g.country, round)) return fail('A country that has left the union does not vote at the council.');
      var cv = MS.validateCrisisVote(state, p.payload || {});
      if (!cv.ok) return { ok: false, error: 'Your vote was not accepted.', errors: cv.errors };
      var crow = { ts: iso(now), classId: g.classId, phase: 'crisis', round: round, groupId: g.groupId, country: g.country,
        payload: JSON.stringify(cv.clean), text: '', used: cv.used.join(', ') };
      st.appendRow('decisions', crow);
      log(st, 'submit', g.classId, g.name, 'crisis r' + round + ' ' + cv.clean.crisis);
      return { ok: true, ts: crow.ts, used: cv.used };
    }
    if (phase !== state.phase || round !== Number(state.round)) return fail('The round has changed (now: ' + state.phase + ' / round ' + state.round + '). Reload the page.');
    if (cr && cr.status === 'open') return fail('The crisis vote is in progress; decisions open afterwards.');
    if (openRetal) return fail('The council on retaliation is in session; decisions open afterwards.');
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
    /* announced vote (optional): only the admissible values are kept */
    var pvIn = payload.votes || {}, pv = {};
    if (MS.VOTE_RATE.indexOf(pvIn.rate) >= 0) pv.rate = pvIn.rate;
    if (MS.VOTE_CRISIS.indexOf(pvIn.crisis) >= 0) pv.crisis = pvIn.crisis;
    var row = { ts: iso(st.now()), classId: g.classId, round: Number(state.round), groupId: g.groupId, country: g.country,
      text: text, payload: JSON.stringify({ text: text, year: cy, votes: pv }) };
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
      crisisVotesIn: decisions.filter(function (d) { return d.phase === 'crisis' && Number(d.round) === Number(state.round); }).length,
      retaliationVotesIn: decisions.filter(function (d) { return d.phase === 'retaliation' && Number(d.round) === Number(state.round); }).length,
      gameResults: state.publishLeaderboard ? results.filter(function (r) { return r.phase === 'game' && !isUnionKey(r.key); }) : [],
      warmupAll: state.revealWarmup ? results.filter(function (r) { return r.phase === 'warmup' && !isUnionKey(r.key); }) : [],
      union: results.filter(function (r) { return r.phase === state.phase && (state.phase === 'game' ? (r.key === 'UNION' || String(r.key).indexOf('DUEL:') === 0) : isUnionKey(r.key)); }),
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
      var detail = r.detail ? (typeof r.detail === 'string' ? r.detail : JSON.stringify(r.detail)) : '';
      if (!hasAny && R === '' && !detail) return;          // a UNION row carries only a detail
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
  results:   { name: 'Results',   header: ['ts', 'classId', 'phase', 'round', 'key', 'year', 'gdp', 'unemp', 'infl', 'pubbal', 'tradebal', 'R', 'published', 'detail', 'emis'] },   // emis appended last (v1.7) so older sheets stay aligned
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
  } else if (def.header && def.header.length) {
    /* migration: a column appended to a header (e.g. 'emis' in v1.7) is added to an existing sheet's header row */
    var have = sh.getLastColumn ? sh.getLastColumn() : 0;
    if (have > 0 && have < def.header.length) {
      sh.getRange(1, have + 1, 1, def.header.length - have).setValues([def.header.slice(have)]).setFontWeight('bold');
    }
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
  Logger.log('Policy desk is ready. Administrator key: ' + key);
  try { SpreadsheetApp.getUi().alert('Policy desk is ready.\n\nAdministrator key: ' + key + '\n\n(also stored in the Config tab)'); } catch (e) { /* no UI when run headless */ }
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
