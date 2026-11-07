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
  var VERSION = '1.9';
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
if (typeof module !== 'undefined' && module.exports) module.exports = MSService;
