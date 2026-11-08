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
if (typeof module !== 'undefined' && module.exports) module.exports = MS;
