/* =====================================================================
   OPEN-MU — game engine (v2.0)
   N member countries in a monetary union (chapter-6 OPEN/REG logic:
   real flows, households' wealth target, government bills, one central
   bank), rest of the world exogenous, reserves absorb the union's
   current account, two reporting "thermometers" (unemployment,
   inflation) outside the dynamics.
   v1.1 (params.firms = true, the default): firms invest, financed by
   bank loans (horizontalist banks, zero spread), households hold
   deposits; the interest rate acts on investment with a one-year lag
   (spec section 6). params.firms = false reproduces v1.0 bit for bit
   (its code path is kept verbatim below).
   v1.2 (params.prices = true, defaultParams(true, true) / paramsFor('v1.2')):
   the price level of each member (built from the inflation thermometer,
   no inertia) enters trade volumes with a one-year lag — intra-union
   and with the rest of the world, elasticities 0.7 — and the initial
   reserves are halved (1.5 months). params.prices = false keeps v1.1
   bit for bit (spec section 8).
   v1.3 (params.capital = true, paramsFor('v1.3')): capital flows with the
   rest of the world (RoW holdings of union bills, households' foreign
   bills), a balance of payments with a financial account, a per-year
   exchange-rate regime (fixed: reserves absorb; float: reserves frozen,
   xr clears the balance of payments), a risk premium on public debt
   rising with the debt ratio, flight to quality, and the central-bank
   backstop as a per-year switch (spec section 9). params.capital = false
   keeps v1.2 bit for bit.
   v2.0 (params.eco = true, paramsFor('v2.0')): production emits, a global
   pollution stock damages the economy (structural unemployment, inflation
   on a damaged potential, import propensity, forced repairs), two levers
   (carbon tax, green public investment) cut the carbon intensity with a
   one-year lag (spec section 10). params.eco = false keeps v1.3 bit for bit.
   Spec: docs/openmu-spec.md. Runs in the browser (global OPENMU) and in
   Node (module.exports). No dependencies. Nothing is rounded here.
   ===================================================================== */
var OPENMU = (function () {
  'use strict';
  var VERSION = '2.0';

  /* ---------- defaults ---------- */
  /* defaultParams(firms): v1.1 defaults; defaultParams(false) gives the v1.0 values
     of the two parameters re-tuned in v1.1 (alpha2, lambda0). */
  function defaultParams(firms, prices, capital, eco) {
    var useFirms = firms !== false, usePrices = prices === true, useCapital = capital === true, useEco = eco === true;
    var p = {
      firms: useFirms,
      prices: usePrices,   // v1.2: price levels enter trade volumes (one-year lag)
      capital: useCapital, // v1.3: capital flows, exchange-rate regime, risk premium (spec section 9)
      eco: useEco,         // v2.0: emissions and a damage function (spec section 10)
      countries: [
        { id: 'DEU', name: 'Germany',     size: 100 },
        { id: 'FRA', name: 'France',      size: 75 },
        { id: 'ITA', name: 'Italy',       size: 60 },
        { id: 'ESP', name: 'Spain',       size: 40 },
        { id: 'NLD', name: 'Netherlands', size: 30 },
        { id: 'BEL', name: 'Belgium',     size: 18 },
        { id: 'AUT', name: 'Austria',     size: 14 }
      ],
      /* fiscal reference ratios and tax rates */
      g: 0.20,          // G*/Y*
      tr: 0.15,         // TR*/Y*
      tau: 0.10,        // consumption tax rate ("VAT")
      /* trade */
      mu: 0.30,         // import propensity (volume / Y)
      sR: 0.5,          // share of imports coming from the rest of the world
      eps: 0.7,         // price elasticity of imports from the RoW (one-year lag)
      eta: 0.7,         // price elasticity of exports to the RoW
      epsU: 0.7,        // v1.2: price elasticity of intra-union imports (one-year lag) — equal across partners
      xr0: 1,           // reference exchange rate (union currency per unit of world currency)
      YRoW0: 1,         // reference RoW demand index
      reserveMonths: 3, // initial reserves, in months of the union's RoW imports
      alertShare: 0.25, // alert when R < alertShare * R0
      /* households and portfolio */
      alpha1: 0.75,     // propensity to consume out of disposable income
      alpha2: 0.092,    // propensity to consume out of wealth (v1.1; 0.185 in v1.0)
      lambda0: 0.33,    // bills share of wealth at r = 0 (v1.1; 0.70 in v1.0)
      lambda1: 5,       // sensitivity of the bills share to r
      lambdaCap: 0.8,   // v1.1: cap on the bills share
      nu: 0.83,         // v1.1: deposits share of non-bill wealth (the rest is cash)
      r: 0.03,          // central-bank bill rate
      /* v1.1: firms and banks */
      kappaK: 1,        // K*/Y*: capital financed by bank loans, in years of GDP
      delta: 0.10,      // depreciation rate (I* = delta * K*)
      iota: 12,         // investment sensitivity to the lagged rate: I = I* (1 - iota (r_-1 - r*))
      ifloor: 0.5,      // floor on investment, share of I*
      /* thermometers (reported, not fed back) */
      ustar: 7,  beta: 0.4,
      pistar: 2, kappa: 0.3, rho: 0.6, omega: 0.15,
      /* v1.3: capital flows and market pressure */
      rw: 0.03,         // rest-of-the-world bill rate at the reference (= r*)
      bwShare: 0.30,    // RoW holdings of union bills at the reference, share of union GDP (= households' foreign bills: primary income balanced)
      chiW: 6,          // RoW demand for union bills: +chiW per unit of (r − r_w)
      chiS: 10,         // RoW demand for union bills: −chiS per unit of the union-average spread
      lambdaF1: 1.3,    // households' foreign-bills share: +lambdaF1 per unit of (r_w − r − spread)
      phi: 0.05,        // spread (rate units) per unit of debt ratio above dstar: s = 1 pt at d = dstar + 0.20
      dstar: 1.10,      // debt ratio (B/Y) above which the spread starts
      psi: 50,          // flight to quality: RoW allocation weight ∝ size · exp(−psi · spread)
      rEffMax: 0.25,    // no backstop: cap on the market-clearing bill rate of a pressured member
      /* v2.0: emissions and damages */
      ci0: 1,           // reference carbon intensity (emissions per unit of output); 0 switches emissions off
      ciMin: 0.3,       // floor on the carbon intensity (share of the reference)
      ewMult: 1,        // RoW emissions at the reference, multiple of the union's (1: the union's effort weighs half of the global flow)
      s0Years: 50,      // initial pollution stock S0 = s0Years × yearly reference emissions (⇒ reference emissions = 2 % of S0)
      chiD: 0.5,        // damage per unit of (S − S0)/S0  (≈ 5 % at year 6 under business as usual)
      dMax: 0.25,       // cap on the damage
      chiU: 0.4,        // structural unemployment: +chiU × 100·D points (D = 5 % → u* + 2 pt)
      damageOff: false, // report helper: simulate emissions and intensities but force D = 0 (isolates the "climate" part of the decomposition)
      aC: 0.04,         // carbon intensity: −aC per point of carbon tax, next year
      aG: 0.05,         // carbon intensity: −aG·green/(1 + green/gSat) next year (diminishing returns: green 10 → −17 %/yr)
      gSat: 5,          // saturation of the green lever (half the marginal gain at green = 5)
      greenImport: 0.60, // import content of green investment (equipment): the excess over mu leaks abroad
      greenUnit: 0.002, // green lever: one unit = 0.2 pt of reference GDP of public investment
      rhoC: 0.15,       // inflation pass-through of a change in the carbon tax, per point
      ctaxUnit: 0.002   // carbon-tax revenue per point: ctaxUnit × emissions (1 point ≈ 0.2 % of GDP at the reference intensity)
    };
    if (!useFirms) { p.alpha2 = 0.185; p.lambda0 = 0.70; }
    if (usePrices) { p.reserveMonths = 1.5; }
    return p;
  }
  /* parameters of a game version: 'v1.1' (class 6: no price channel, 3 months of reserves), 'v1.2' (prices in trade), 'v1.3' (capital flows) */
  function paramsFor(version) {
    var v = String(version || '').replace(/^v/, '');
    if (v === '2.0') return defaultParams(true, true, true, true);
    if (v === '1.3') return defaultParams(true, true, true);
    return v === '1.2' ? defaultParams(true, true) : defaultParams(true);
  }

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function mergeParams(params) {
    var p = defaultParams(!(params && params.firms === false), !!(params && params.prices === true), !!(params && params.capital === true), !!(params && params.eco === true));
    if (!params) return p;
    Object.keys(params).forEach(function (k) { if (params[k] !== undefined && params[k] !== null) p[k] = params[k]; });
    p.countries = clone(p.countries);
    return p;
  }

  /* ---------- trade shares: s_ij = size_j / Σ_{k≠i} size_k ---------- */
  function shares(countries) {
    var total = 0; countries.forEach(function (c) { total += c.size; });
    var s = {};
    countries.forEach(function (ci) {
      s[ci.id] = {};
      countries.forEach(function (cj) { s[ci.id][cj.id] = ci.id === cj.id ? 0 : cj.size / (total - ci.size); });
    });
    return s;
  }

  /* ---------- reference (stationary) state ---------- */
  function calibrate(params) {
    var p = mergeParams(params);
    return p.firms ? calibrateV11(p) : calibrateV10(p);
  }

  /* v1.0 path — kept verbatim */
  function calibrateV10(p) {
    var s = shares(p.countries);
    var tauc = p.tau / (1 + p.tau);
    var ref = { countries: {}, union: {}, shares: s, params: p };
    var totalSize = 0; p.countries.forEach(function (c) { totalSize += c.size; });
    /* flows and stocks per country, except xR (needs every IMU) and Bcb (needs R0) */
    p.countries.forEach(function (c) {
      var Y = c.size;
      var G = p.g * Y, TR = p.tr * Y;
      var C = Y - G;                          // trade balanced at the reference
      var CE = C / (1 - tauc);
      var V = (1 - p.alpha1) / p.alpha2 * CE; // households at their wealth target: YD = CE
      var Bh = V * (p.lambda0 + p.lambda1 * p.r);
      var H = V - Bh;
      var theta = 1 - (CE - TR) / (Y + p.r * Bh);
      var IM = p.mu * Y, IMU = (1 - p.sR) * IM, IMR = p.sR * IM;
      ref.countries[c.id] = { id: c.id, name: c.name, size: c.size, Y: Y, G: G, TR: TR, theta: theta, tau: p.tau, tauc: tauc,
        C: C, CE: CE, YD: CE, V: V, Bh: Bh, H: H, IM: IM, IMU: IMU, IMR: IMR, T: 0, PB: 0, TB: 0 };
    });
    var sumIMR = 0;
    p.countries.forEach(function (c) {
      var rc = ref.countries[c.id];
      var intraX = 0;
      p.countries.forEach(function (cj) { intraX += s[cj.id][c.id] * ref.countries[cj.id].IMU; });
      rc.xR = rc.IM - intraX;                 // exports to the RoW such that every member's trade is balanced
      rc.XR = rc.xR; rc.X = intraX + rc.xR; rc.IMV = rc.IMU + p.xr0 * rc.IMR;
      rc.T = rc.theta * (rc.Y + p.r * rc.Bh) + tauc * rc.CE;
      sumIMR += rc.IMR;
    });
    var R0 = (p.reserveMonths / 12) * sumIMR;  // in world currency (xr0 = 1 by convention of the price level)
    p.countries.forEach(function (c) {
      var rc = ref.countries[c.id];
      rc.Rshare = c.size / totalSize;
      rc.Bcb = rc.H - p.xr0 * R0 * rc.Rshare;  // the CB's holdings of this government's bills
      rc.B = rc.Bh + rc.Bcb;
      rc.Fcb = p.r * rc.Bcb;
      rc.PB = rc.T + rc.Fcb - rc.G - rc.TR - p.r * rc.B;
      rc.TB = rc.X - rc.IMV;
    });
    ref.union = { R0: R0, xr0: p.xr0, YRoW0: p.YRoW0, r0: p.r, totalSize: totalSize, sumIMR: sumIMR };
    return ref;
  }

  /* v1.1: firms (capital K financed by loans L), banks (deposits M, bills Bb, advances A), households with three assets */
  function billsShare(p, r) { return Math.min(p.lambdaCap, p.lambda0 + p.lambda1 * r); }
  function calibrateV11(p) {
    var s = shares(p.countries);
    var tauc = p.tau / (1 + p.tau);
    var ref = { countries: {}, union: {}, shares: s, params: p };
    var totalSize = 0; p.countries.forEach(function (c) { totalSize += c.size; });
    p.countries.forEach(function (c) {
      var Y = c.size;
      var G = p.g * Y, TR = p.tr * Y;
      var K = p.kappaK * Y, I = p.delta * K, L = K, AF = p.delta * K;
      var C = Y - G - I;                       // trade balanced at the reference
      var CE = C / (1 - tauc);
      var V = (1 - p.alpha1) / p.alpha2 * CE;  // households at their wealth target: YD = CE
      var BhAll = V * billsShare(p, p.r);      // domestic + foreign bills (v1.3): the foreign share is carved out of this total
      var Bf = p.capital ? p.bwShare * Y : 0;  // v1.3: foreign bills (world currency, xr0 = 1) — same amount as the RoW holds of this government's bills
      var Bh = BhAll - Bf;
      var M = (V - BhAll) * p.nu, H = (V - BhAll) * (1 - p.nu);
      var YF = Y - AF - p.r * L;               // income distributed to households by firms
      var base = YF + p.r * (Bh + M) + p.rw * Bf;   // income-tax base (foreign interest = domestic interest forgone: θ* unchanged)
      var theta = 1 - (CE - TR) / base;
      var Bb = Math.max(0, M - L), A = Math.max(0, L - M);
      var IM = p.mu * Y, IMU = (1 - p.sR) * IM, IMR = p.sR * IM;
      ref.countries[c.id] = { id: c.id, name: c.name, size: c.size, Y: Y, G: G, TR: TR, theta: theta, tau: p.tau, tauc: tauc,
        C: C, CE: CE, YD: CE, V: V, Bh: Bh, Bf: Bf, Bw: Bf, lambdaF0: p.capital ? Bf / V : 0, M: M, H: H, I: I, K: K, L: L, AF: AF, YF: YF, Bb: Bb, A: A, IM: IM, IMU: IMU, IMR: IMR, T: 0, PB: 0, TB: 0 };
    });
    var sumIMR = 0;
    p.countries.forEach(function (c) {
      var rc = ref.countries[c.id];
      var intraX = 0;
      p.countries.forEach(function (cj) { intraX += s[cj.id][c.id] * ref.countries[cj.id].IMU; });
      rc.xR = rc.IM - intraX;
      rc.XR = rc.xR; rc.X = intraX + rc.xR; rc.IMV = rc.IMU + p.xr0 * rc.IMR;
      rc.T = rc.theta * (rc.YF + p.r * (rc.Bh + rc.M) + p.rw * rc.Bf) + rc.tauc * rc.CE;
      sumIMR += rc.IMR;
    });
    var R0 = (p.reserveMonths / 12) * sumIMR;
    var sumBw = 0;
    p.countries.forEach(function (c) {
      var rc = ref.countries[c.id];
      rc.Rshare = c.size / totalSize;
      rc.Bcb = rc.H - p.xr0 * R0 * rc.Rshare - rc.A;   // CB balance sheet: H = Bcb + A + xr R, country by country at the reference
      rc.B = rc.Bh + rc.Bb + rc.Bcb + rc.Bw;           // v1.3: the RoW holds part of the debt (Bw = 0 otherwise)
      rc.Fcb = p.r * (rc.Bcb + rc.A);
      rc.PB = rc.T + rc.Fcb - rc.G - rc.TR - p.r * rc.B;
      rc.TB = rc.X - rc.IMV;
      sumBw += rc.Bw;
    });
    ref.union = { R0: R0, xr0: p.xr0, YRoW0: p.YRoW0, r0: p.r, totalSize: totalSize, sumIMR: sumIMR, Bw0: sumBw };
    if (p.eco) {
      /* v2.0: reference emissions and the initial pollution stock (spec section 10.1) */
      var Eu0 = p.ci0 * totalSize, Ew0 = p.ewMult * p.ci0 * totalSize;
      ref.union.Eu0 = Eu0; ref.union.Ew0 = Ew0; ref.union.S0 = p.s0Years * (Eu0 + Ew0);
    }
    return ref;
  }

  /* ---------- one simulation ---------- */
  function lever(policies, id, t, key) {
    var arr = policies && policies[id];
    if (!arr) return 0;
    var y = arr[t];
    return y ? num(y[key]) : 0;
  }
  /* exact solution of the linear fixed point Y = A + M·Y (M by finite differences of the map; Gaussian elimination) */
  function solveLinear(step, ids) {
    var n = ids.length, zero = function () { return 0; };
    var A = step(zero), M = [];
    ids.forEach(function (idj, j) {
      var col = step(function (id) { return id === idj ? 1 : 0; });
      ids.forEach(function (idi, i) { M[i] = M[i] || []; M[i][j] = col[idi] - A[idi]; });
    });
    var a = [];
    for (var i = 0; i < n; i++) { a[i] = []; for (var j = 0; j < n; j++) a[i][j] = (i === j ? 1 : 0) - M[i][j]; a[i][n] = A[ids[i]]; }
    for (var c = 0; c < n; c++) {
      var piv = c; for (var r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
      var tmp = a[c]; a[c] = a[piv]; a[piv] = tmp;
      for (var r2 = 0; r2 < n; r2++) { if (r2 === c) continue; var f = a[r2][c] / a[c][c]; for (var k = c; k <= n; k++) a[r2][k] -= f * a[c][k]; }
    }
    var out = {}; ids.forEach(function (id, i) { out[id] = a[i][n] / a[i][i]; });
    return out;
  }
  function shockAt(shocks, t, key) {
    var y = shocks && shocks[t];
    return y ? num(y[key]) : 0;
  }

  function simulate(opts) {
    opts = opts || {};
    var p = mergeParams(opts.params);
    return p.firms ? simulateV11(p, opts) : simulateV10(p, opts);
  }

  /* v1.0 path — kept verbatim (zero-valued firm/bank fields added to the output only) */
  function simulateV10(p, opts) {
    var ref = calibrate(p);
    var s = ref.shares;
    var ids = p.countries.map(function (c) { return c.id; });
    var years = Math.max(1, Math.round(num(opts.years) || 1));
    var policies = opts.policies || {}, shocks = opts.shocks || [];
    var TOL = 1e-13, CAP = 500;

    /* lagged state */
    var prev = {}, prevU = { xr: ref.union.xr0, R: ref.union.R0, NWcb: 0, r: ref.union.r0 };
    ids.forEach(function (id) {
      var rc = ref.countries[id];
      prev[id] = { Y: rc.Y, V: rc.V, Bh: rc.Bh, B: rc.B, Bcb: rc.Bcb, tau: rc.tau, P: 1 };
    });
    var out = { years: [], ref: ref, checks: { maxIdentityError: 0, maxIterations: 0 } };

    for (var t = 0; t < years; t++) {
      var deval = shockAt(shocks, t, 'deval');
      var xr = prevU.xr * (1 + deval / 100);
      var r = p.r + shockAt(shocks, t, 'rate') / 100;
      var r1 = prevU.r;
      var a1 = p.alpha1 * (1 + shockAt(shocks, t, 'confidence') / 100);
      var muF = p.mu * (1 + shockAt(shocks, t, 'imports') / 100);
      var worldF = (p.YRoW0 / ref.union.YRoW0) * (1 + shockAt(shocks, t, 'world') / 100);
      var priceLagF = Math.pow(prevU.xr / ref.union.xr0, -p.eps);
      var xrF = Math.pow(xr / ref.union.xr0, p.eta);

      /* exogenous per-country settings of the year */
      var cur = {};
      ids.forEach(function (id) {
        var rc = ref.countries[id];
        var tau = rc.tau * (1 + lever(policies, id, t, 'vat') / 100);
        cur[id] = {
          G: rc.G * (1 + lever(policies, id, t, 'pubdem') / 100),
          TR: rc.TR * (1 + lever(policies, id, t, 'benefits') / 100),
          theta: rc.theta * (1 + lever(policies, id, t, 'inctax') / 100),
          tau: tau, tauc: tau / (1 + tau),
          XR: rc.xR * worldF * xrF,
          Y: prev[id].Y
        };
      });

      /* fixed point on {Y_i} (the system is linear in Y) */
      var iter = 0, maxChange = Infinity;
      while (maxChange > TOL && iter < CAP) {
        var IMU = {};
        ids.forEach(function (id) { IMU[id] = (1 - p.sR) * muF * cur[id].Y; });
        maxChange = 0;
        var next = {};
        ids.forEach(function (id) {
          var c = cur[id], pv = prev[id];
          var IM = muF * c.Y;
          var IMR = p.sR * IM * priceLagF;
          var IMV = IMU[id] + xr * IMR;
          var X = c.XR; ids.forEach(function (j) { X += s[j][id] * IMU[j]; });
          var YD = (1 - c.theta) * (c.Y + r1 * pv.Bh) + c.TR;
          var CE = a1 * YD + p.alpha2 * pv.V;
          var C = (1 - c.tauc) * CE;
          var Ynew = C + c.G + X - IMV;
          var ch = Math.abs(Ynew - c.Y) / ref.countries[id].Y;
          if (ch > maxChange) maxChange = ch;
          next[id] = Ynew;
        });
        ids.forEach(function (id) { cur[id].Y = next[id]; });
        iter++;
      }
      if (maxChange > TOL) throw new Error('OPENMU: fixed point did not converge in year ' + (t + 1) + ' (change ' + maxChange + ')');
      if (iter > out.checks.maxIterations) out.checks.maxIterations = iter;

      /* finalise the year */
      var year = { countries: {}, union: {} };
      var IMUf = {};
      ids.forEach(function (id) { IMUf[id] = (1 - p.sR) * muF * cur[id].Y; });
      var sumH = 0, sumBcb = 0, CA = 0, sumIMRv = 0, sumY = 0, sumTB = 0;
      ids.forEach(function (id) {
        var c = cur[id], pv = prev[id], rc = ref.countries[id];
        var Y = c.Y;
        var IM = muF * Y, IMU = IMUf[id], IMR = p.sR * IM * priceLagF, IMV = IMU + xr * IMR;
        var X = c.XR; ids.forEach(function (j) { X += s[j][id] * IMUf[j]; });
        var YD = (1 - c.theta) * (Y + r1 * pv.Bh) + c.TR;
        var CE = a1 * YD + p.alpha2 * pv.V;
        var C = (1 - c.tauc) * CE;
        var T = c.theta * (Y + r1 * pv.Bh) + c.tauc * CE;
        var V = pv.V + YD - CE;
        var Bh = V * (p.lambda0 + p.lambda1 * r);
        var H = V - Bh;
        var Fcb = r1 * pv.Bcb;
        var B = pv.B + c.G + c.TR + r1 * pv.B - T - Fcb;
        var Bcb = B - Bh;
        var PB = T + Fcb - c.G - c.TR - r1 * pv.B;
        var TB = X - IMV;
        var gap = 100 * (Y / rc.Y - 1);
        var u = p.ustar - p.beta * gap;
        var pi = p.pistar + p.kappa * gap + p.rho * (c.tau - pv.tau) * 100 + p.omega * 100 * (xr - prevU.xr) / prevU.xr;
        var P = pv.P * (1 + pi / 100);
        year.countries[id] = { Y: Y, gap: gap, u: u, pi: pi, P: P, C: C, CE: CE, G: c.G, TR: c.TR, theta: c.theta, tau: c.tau, T: T, YD: YD,
          V: V, Bh: Bh, H: H, B: B, Bcb: Bcb, Fcb: Fcb, X: X, XR: c.XR, IM: IM, IMU: IMU, IMR: IMR, IMV: IMV, PB: PB, TB: TB,
          pb: 100 * PB / Y, tb: 100 * TB / Y, saving: YD - CE, r: r,
          I: 0, K: 0, L: 0, M: 0, Bb: 0, A: 0, AF: 0, YF: Y };
        sumH += H; sumBcb += Bcb; CA += c.XR - xr * IMR; sumIMRv += xr * IMR; sumY += Y; sumTB += TB;
        prev[id] = { Y: Y, V: V, Bh: Bh, B: B, Bcb: Bcb, tau: c.tau, P: P };
      });
      var R = prevU.R + CA / xr;
      var NWcb = prevU.NWcb + (xr - prevU.xr) * prevU.R;
      year.union = { Y: sumY, CA: CA, R: R, R0: ref.union.R0, xr: xr, r: r, alert: R < p.alertShare * ref.union.R0,
        months: sumIMRv > 0 ? 12 * R * xr / sumIMRv : Infinity, NWcb: NWcb, sumTB: sumTB, iterations: iter };
      var identErr = Math.abs(sumH - sumBcb - xr * R + NWcb) / sumH;
      var sectorErr = Math.abs(sumTB - CA) / Math.max(1, Math.abs(CA));
      year.union.identityError = identErr; year.union.sectorError = sectorErr;
      if (identErr > out.checks.maxIdentityError) out.checks.maxIdentityError = identErr;
      out.years.push(year);
      prevU = { xr: xr, R: R, NWcb: NWcb, r: r };
    }
    return out;
  }

  /* v1.1 path: firms, investment, banks (spec section 6) */
  function simulateV11(p, opts) {
    var ref = calibrate(p);
    var s = ref.shares;
    var ids = p.countries.map(function (c) { return c.id; });
    var years = Math.max(1, Math.round(num(opts.years) || 1));
    var policies = opts.policies || {}, shocks = opts.shocks || [];
    var TOL = 1e-13, CAP = 500;

    var cap = !!p.capital, eco = !!p.eco;
    var prev = {}, prevU = { xr: ref.union.xr0, R: ref.union.R0, NWcb: 0, r: ref.union.r0, rw: p.rw, backstop: true, S: eco ? ref.union.S0 : 0 };
    ids.forEach(function (id) {
      var rc = ref.countries[id];
      prev[id] = { Y: rc.Y, V: rc.V, Bh: rc.Bh, M: rc.M, B: rc.B, Bcb: rc.Bcb, A: rc.A, K: rc.K, L: rc.L, tau: rc.tau, P: 1, Prel: 1,
        Bf: rc.Bf || 0, Bw: rc.Bw || 0, Bb: rc.Bb, s: 0, ci: p.ci0, ctax: 0, green: 0 };
    });
    var out = { years: [], ref: ref, checks: { maxIdentityError: 0, maxIterations: 0 } };

    for (var t = 0; t < years; t++) {
      var deval = shockAt(shocks, t, 'deval');
      var r = p.r + shockAt(shocks, t, 'rate') / 100;
      var r1 = prevU.r;
      var a1 = p.alpha1 * (1 + shockAt(shocks, t, 'confidence') / 100);
      var muF = p.mu * (1 + shockAt(shocks, t, 'imports') / 100);
      var worldF = (p.YRoW0 / ref.union.YRoW0) * (1 + shockAt(shocks, t, 'world') / 100);
      var invF = Math.max(p.ifloor, 1 - p.iota * (r1 - p.r));   // investment responds to last year's rate
      /* v1.3: regime and capital-flow settings of the year */
      var sh = shocks && shocks[t] ? shocks[t] : {};
      var regime = cap && sh.regime === 'float' ? 'float' : 'fixed';
      var flowsF = cap ? 1 + shockAt(shocks, t, 'flows') / 100 : 1;
      var rw = cap ? p.rw + shockAt(shocks, t, 'worldRate') / 100 : p.rw;
      var rw1 = prevU.rw;
      var backstop = cap ? sh.backstop !== false : true;
      var bsPrev = prevU.backstop;
      /* v2.0: damage of the year from the pollution stock accumulated so far (+ a disaster), carbon intensities from last year's levers */
      var D = 0, ci = {}, ctaxNow = {}, greenNow = {};
      if (eco) {
        D = p.damageOff ? 0 : Math.min(p.dMax, Math.max(0, (ref.union.S0 > 0 ? p.chiD * (prevU.S - ref.union.S0) / ref.union.S0 : 0) + shockAt(shocks, t, 'disaster') / 100));
        ids.forEach(function (id) {
          var pv = prev[id];
          ci[id] = Math.max(p.ciMin * p.ci0, pv.ci * (1 - p.aC * pv.ctax - p.aG * pv.green / (1 + pv.green / p.gSat)));
          ctaxNow[id] = Math.max(0, lever(policies, id, t, 'ctax'));
          greenNow[id] = Math.max(0, lever(policies, id, t, 'green'));
        });
      }
      /* v1.3: spreads of the year from last year's debt ratios (market pressure); members under pressure */
      var spread = {}, sBar = 0, pressured = {};
      ids.forEach(function (id) {
        var d = prev[id].B / prev[id].Y;
        spread[id] = cap ? p.phi * Math.max(0, d - p.dstar) : 0;
        pressured[id] = cap && d > p.dstar;
        sBar += spread[id] * ref.countries[id].Y / ref.union.totalSize;
      });
      /* v1.2: last year's price levels enter this year's trade volumes (one-year lag, like the exchange rate).
         priceLagF[i]: imports of i from the RoW ∝ (xr_-1 / P_i,-1)^(−ε); xrF[i]: exports of i to the RoW ∝ (xr / P_i,-1)^η;
         w[i][j]: weight of partner j in i's intra-union imports = s_ij · (P_j,-1 / P_i,-1)^(−εU) (not renormalised:
         a dearer home market imports more from everybody). With prices off, P ≡ 1 and v1.1 is reproduced bit for bit. */
      var priceLagF = {}, w = {};
      ids.forEach(function (id) {
        var Pi = p.prices ? prev[id].Prel : 1;   // price level relative to the reference path (world prices grow at π*)
        priceLagF[id] = Math.pow(prevU.xr / (ref.union.xr0 * Pi), -p.eps);
        w[id] = {};
        ids.forEach(function (j) { w[id][j] = s[id][j] * (p.prices ? Math.pow(prev[j].Prel / Pi, -p.epsU) : 1); });
      });
      /* intra-union imports of i: base volume (1−sR)·μ·Y_i, split (and scaled) by the price-weighted partner weights */
      /* v2.0: the import content of green investment above the economy's propensity leaks abroad (equipment); zero for v1.x (bit for bit) */
      var extraIM = {};
      ids.forEach(function (id) { extraIM[id] = eco ? Math.max(0, p.greenImport - p.mu) * Math.max(0, lever(policies, id, t, 'green')) * p.greenUnit * ref.countries[id].Y : 0; });
      function imBase(id, Y) { return eco ? muF * Y + extraIM[id] : muF * Y; }
      function intraOf(id, Y) { var base = (1 - p.sR) * imBase(id, Y), tot = 0; ids.forEach(function (j) { tot += w[id][j]; }); return base * tot; }
      function exportsTo(id, Yof) { var X = 0; ids.forEach(function (j) { X += w[j][id] * (1 - p.sR) * imBase(j, Yof(j)); }); return X; }

      /* ---- the year at a given exchange rate: fixed point on {Y_i}, then the accounts. Pure (does not touch prev). ---- */
      function evalYear(xr) {
        var xrF = {};
        ids.forEach(function (id) { var Pi = p.prices ? prev[id].Prel : 1; xrF[id] = Math.pow(xr / (ref.union.xr0 * Pi), p.eta); });
        var cur = {};
        ids.forEach(function (id) {
          var rc = ref.countries[id], pv = prev[id];
          var tau = rc.tau * (1 + lever(policies, id, t, 'vat') / 100);
          cur[id] = {
            G: rc.G * (1 + lever(policies, id, t, 'pubdem') / 100) + (eco ? greenNow[id] * p.greenUnit * rc.Y : 0),
            GREEN: eco ? greenNow[id] * p.greenUnit * rc.Y : 0, ctaxRate: eco ? ctaxNow[id] * p.ctaxUnit : 0,
            TR: rc.TR * (1 + lever(policies, id, t, 'benefits') / 100),
            theta: rc.theta * (1 + lever(policies, id, t, 'inctax') / 100),
            tau: tau, tauc: tau / (1 + tau),
            XR: rc.xR * worldF * xrF[id],
            I: rc.I * invF,
            AF: p.delta * rc.K,     // amortisation funds: straight-line charge on the reference capital (keeps L = K, no income artefact)
            Y: pv.Y
          };
        });
        /* v1.3: lagged interest flows outside the fixed point. Households' extra income: the spread on their bills and on the
           banks' bills (bank profit rebated) and the interest on their foreign bills; capital gain on foreign bills goes to wealth. */
        var extraInc = {}, capGain = {};
        ids.forEach(function (id) {
          var pv = prev[id];
          extraInc[id] = cap ? pv.s * (pv.Bh + pv.Bb) + rw1 * xr * pv.Bf : 0;
          capGain[id] = cap ? (xr - prevU.xr) * pv.Bf : 0;
        });
        /* fixed point on {Y_i}: Y, C and T are simultaneous; I is predetermined within the year */
        function stepFrom(Yof) {   // the yearly map Y → Y (linear in Y given the predetermined items)
          var IMU = {}, next = {};
          ids.forEach(function (id) { IMU[id] = intraOf(id, Yof(id)); });
          ids.forEach(function (id) {
            var c = cur[id], pv = prev[id], Yc = Yof(id);
            var IM = imBase(id, Yc);
            var IMR = p.sR * IM * priceLagF[id];
            var IMV = IMU[id] + xr * IMR;
            var X = c.XR + exportsTo(id, Yof);
            var YF = Yc - c.AF - r1 * pv.L - (eco ? c.ctaxRate * ci[id] * Yc : 0);
            var base = cap ? YF + r1 * (pv.Bh + pv.M) + extraInc[id] : YF + r1 * (pv.Bh + pv.M);
            var YD = (1 - c.theta) * base + c.TR;
            var CE = a1 * YD + p.alpha2 * pv.V;
            var C = (1 - c.tauc) * CE;
            next[id] = C + c.G + c.I + X - IMV;
          });
          return next;
        }
        var iter = 0, maxChange = Infinity, lastChange = Infinity, grow = 0, solved = false;
        while (maxChange > TOL && iter < CAP) {
          lastChange = maxChange; maxChange = 0;
          var next = stepFrom(function (id) { return cur[id].Y; });
          ids.forEach(function (id) { var ch = Math.abs(next[id] - cur[id].Y) / ref.countries[id].Y; if (ch > maxChange) maxChange = ch; });
          /* the plain iteration is exact for every converging case (v1.x unchanged bit for bit); if it diverges (very large xr while
             bracketing a floating rate, or a damaged economy with a high import leak) the linear system is solved directly once */
          if (!solved && ((maxChange > lastChange && ++grow >= 2) || iter === 150)) { next = solveLinear(stepFrom, ids); solved = true; } else if (maxChange <= lastChange) grow = 0;
          ids.forEach(function (id) { cur[id].Y = next[id]; });
          iter++;
        }
        if (maxChange > TOL) throw new Error('OPENMU: fixed point did not converge in year ' + (t + 1) + ' (change ' + maxChange + ')');

        var year = { countries: {}, union: {} }, newPrev = {};
        var IMUf = {};
        ids.forEach(function (id) { IMUf[id] = intraOf(id, cur[id].Y); });
        /* v1.3: RoW demand for union bills (world currency) and its allocation across members (flight to quality) */
        var BwDollar = cap ? ref.union.Bw0 * (1 + p.chiW * (r - rw) - p.chiS * sBar) * flowsF : 0;
        var wsh = {}, wtot = 0;
        ids.forEach(function (id) { var wgt = cap ? ref.countries[id].size * Math.exp(-p.psi * spread[id] * (!backstop && pressured[id] ? 2 : 1)) : 0; wsh[id] = wgt; wtot += wgt; });
        ids.forEach(function (id) { wsh[id] = wtot > 0 ? wsh[id] / wtot : 0; });
        var sumH = 0, sumBcbA = 0, CA = 0, sumIMRv = 0, sumY = 0, sumTB = 0, sumPY = 0, primInc = 0, KA = 0, sumBw = 0, sumBf = 0, sumSav = 0, sumFirm = 0, sumPB = 0, sumAssets = 0, sumV = 0, unabsorbed = 0, sumE = 0;
        ids.forEach(function (id) {
          var c = cur[id], pv = prev[id], rc = ref.countries[id];
          var Y = c.Y;
          var IM = imBase(id, Y), IMU = IMUf[id], IMR = p.sR * IM * priceLagF[id], IMV = IMU + xr * IMR;
          var X = c.XR + exportsTo(id, function (j) { return cur[j].Y; });
          var Tc = eco ? c.ctaxRate * ci[id] * Y : 0;      // v2.0: carbon tax, paid by firms on their emissions
          var YF = Y - c.AF - r1 * pv.L - Tc;
          var base = cap ? YF + r1 * (pv.Bh + pv.M) + extraInc[id] : YF + r1 * (pv.Bh + pv.M);
          var YD = (1 - c.theta) * base + c.TR;
          var CE = a1 * YD + p.alpha2 * pv.V;
          var C = (1 - c.tauc) * CE;
          var T = c.theta * base + c.tauc * CE + Tc;
          var V = cap ? pv.V + YD - CE + capGain[id] : pv.V + YD - CE;
          /* v1.3: government interest of the year (lagged rates); the spread is not paid on the CB's holdings while the backstop was on */
          var govInt = cap ? r1 * pv.B + pv.s * (pv.B - (bsPrev ? pv.Bcb : 0)) : r1 * pv.B;
          var Fcb = cap ? r1 * (pv.Bcb + pv.A) + (bsPrev ? 0 : pv.s * pv.Bcb) : r1 * (pv.Bcb + pv.A);
          var B = cap ? pv.B + c.G + c.TR + govInt - T - Fcb : pv.B + c.G + c.TR + r1 * pv.B - T - Fcb;
          var PB = cap ? T + Fcb - c.G - c.TR - govInt : T + Fcb - c.G - c.TR - r1 * pv.B;
          var K = pv.K + c.I - c.AF;       // straight-line depreciation at the reference rate (δ K*)
          var L = pv.L + c.I - c.AF;       // ⇒ L = K at all times
          /* portfolio: domestic bills (own government), foreign bills (v1.3), deposits and cash */
          var sEff = spread[id], Bh, Bf, Bw, M, H, Bb, A, Bcb;
          function portfolio(rEff) {
            var all = V * billsShare(p, rEff);
            var lamF = cap ? Math.max(0, Math.min(billsShare(p, rEff), rc.lambdaF0 + p.lambdaF1 * (rw - rEff))) : 0;
            var o = {};
            o.Bf = cap ? lamF * V / xr : 0;               // world currency
            o.Bh = cap ? all - lamF * V : all;
            o.M = (V - all) * p.nu; o.H = (V - all) * (1 - p.nu);
            o.Bb = Math.max(0, o.M - L); o.A = Math.max(0, L - o.M);
            return o;
          }
          Bw = cap ? xr * BwDollar * wsh[id] : 0;
          var pf = portfolio(r + sEff);
          if (cap && !backstop && pressured[id]) {
            /* no backstop: the CB stops buying this member's residual bills; its bill rate rises until households and banks absorb them */
            var target = B - pv.Bcb - Bw;
            var f = function (rE) { var o = portfolio(rE); return o.Bh + o.Bb - target; };
            var lo = r + sEff, hi = p.rEffMax;
            if (f(lo) >= 0) { pf = portfolio(lo); }
            else if (f(hi) < 0) { pf = portfolio(hi); sEff = hi - r; unabsorbed += target - (pf.Bh + pf.Bb); }
            else {
              for (var k = 0; k < 60; k++) { var mid = (lo + hi) / 2; if (f(mid) < 0) lo = mid; else hi = mid; }
              sEff = hi - r; pf = portfolio(hi);
            }
          }
          Bh = pf.Bh; Bf = pf.Bf; M = pf.M; H = pf.H; Bb = pf.Bb; A = pf.A;
          Bcb = cap ? B - Bh - Bb - Bw : B - Bh - Bb;
          var TB = X - IMV;
          var gap = 100 * (Y / rc.Y - 1);
          var gapD = eco ? 100 * (Y / (rc.Y * (1 - D)) - 1) : gap;   // v2.0: gap on the damaged potential
          var u = p.ustar + (eco ? p.chiU * 100 * D : 0) - p.beta * gap;
          var pi = p.pistar + p.kappa * gapD + p.rho * (c.tau - pv.tau) * 100 + p.omega * 100 * (xr - prevU.xr) / prevU.xr + (eco ? p.rhoC * (ctaxNow[id] - pv.ctax) : 0);
          var P = pv.P * (1 + pi / 100);
          var Prel = pv.Prel * (1 + pi / 100) / (1 + p.pistar / 100);   // v1.2: price level relative to the reference path (= world prices, growing at π*)
          year.countries[id] = { Y: Y, gap: gap, u: u, pi: pi, P: P, Prel: Prel, C: C, CE: CE, G: c.G, TR: c.TR, theta: c.theta, tau: c.tau, T: T, YD: YD,
            V: V, Bh: Bh, H: H, B: B, Bcb: Bcb, Fcb: Fcb, X: X, XR: c.XR, IM: IM, IMU: IMU, IMR: IMR, IMV: IMV, PB: PB, TB: TB,
            pb: 100 * PB / Y, tb: 100 * TB / Y, saving: YD - CE, r: r,
            I: c.I, K: K, L: L, M: M, Bb: Bb, A: A, AF: c.AF, YF: YF,
            Bf: Bf, Bw: Bw, spread: sEff, rEff: r + sEff, pressured: !!pressured[id], capGain: capGain[id],
            CAi: cap ? TB + rw1 * xr * pv.Bf - (r1 + pv.s) * pv.Bw : TB,
            E: eco ? ci[id] * Y : 0, ci: eco ? ci[id] : 0, ctax: eco ? ctaxNow[id] : 0, green: eco ? greenNow[id] : 0, GREEN: c.GREEN || 0, Tc: Tc, D: D };
          if (eco) sumE += ci[id] * Y;
          sumH += H; sumBcbA += Bcb + A; CA += c.XR - xr * IMR; sumIMRv += xr * IMR; sumY += Y; sumTB += TB; sumPY += Prel * rc.Y;
          if (cap) {
            primInc += rw1 * xr * pv.Bf - (r1 + pv.s) * pv.Bw;
            KA += (Bw - pv.Bw) - xr * (Bf - pv.Bf);
            sumBw += Bw; sumBf += Bf; sumSav += YD - CE; sumFirm += c.AF - c.I; sumPB += PB; sumV += V; sumAssets += Bh + M + H + xr * Bf;
          }
          newPrev[id] = { Y: Y, V: V, Bh: Bh, M: M, B: B, Bcb: Bcb, A: A, K: K, L: L, tau: c.tau, P: P, Prel: Prel, Bf: Bf, Bw: Bw, Bb: Bb, s: sEff,
            ci: eco ? ci[id] : p.ci0, ctax: eco ? ctaxNow[id] : 0, green: eco ? greenNow[id] : 0 };
        });
        var CAp = CA + primInc;                       // current account incl. primary income (v1.3; = CA otherwise)
        var excess = CAp + KA;                        // balance of payments excess: what the reserves absorb (fixed) or xr clears (float)
        var R = regime === 'float' ? prevU.R : prevU.R + excess / xr;
        var NWcb = prevU.NWcb + (xr - prevU.xr) * prevU.R;
        var Pu = sumPY / ref.union.totalSize;   // union price level (relative to the reference path): reference-GDP-weighted mean of the members' Prel
        ids.forEach(function (id) { year.countries[id].compet = 100 * (year.countries[id].Prel / Pu - 1); });
        year.union = { Y: sumY, CA: CA, R: R, R0: ref.union.R0, xr: xr, r: r, alert: regime === 'fixed' && R < p.alertShare * ref.union.R0,
          months: sumIMRv > 0 ? 12 * R * xr / sumIMRv : Infinity, NWcb: NWcb, sumTB: sumTB, iterations: iter, P: Pu,
          regime: regime, CAp: CAp, primInc: primInc, KA: KA, Bw: sumBw, Bf: sumBf, rw: rw, backstop: backstop, sBar: sBar,
          dxr: 100 * (xr - prevU.xr) / prevU.xr, unabsorbed: unabsorbed, excess: excess };
        if (eco) {
          var Ew = ref.union.Ew0 * (1 + shockAt(shocks, t, 'worldEmissions') / 100);
          var S = prevU.S + sumE + Ew;
          year.union.S = S; year.union.Sshare = ref.union.S0 > 0 ? S / ref.union.S0 : 1; year.union.D = D; year.union.Eu = sumE; year.union.Ew = Ew;
          year.union.Erel = ref.union.Eu0 > 0 ? 100 * (sumE / ref.union.Eu0 - 1) : 0;
        }
        var identErr = Math.abs(sumH - sumBcbA - xr * R + NWcb) / sumH;
        var sectorErr = Math.abs(sumTB - CA) / Math.max(1, Math.abs(CA));
        if (cap) {
          /* v1.3 checks: Σ sector balances = CA'; households' wealth = assets; ΔBw − xr·ΔBf − xr·ΔR = −CA' */
          var secErr2 = Math.abs(sumSav + sumFirm + sumPB - CAp) / Math.max(1, Math.abs(CAp));
          var wealthErr = Math.abs(sumAssets - sumV) / sumV;
          var bopErr = Math.abs(KA - xr * (R - prevU.R) + CAp) / Math.max(1, Math.abs(CAp) + Math.abs(KA));
          sectorErr = Math.max(secErr2, wealthErr, bopErr);
        }
        year.union.identityError = identErr; year.union.sectorError = sectorErr;
        return { year: year, newPrev: newPrev, excess: excess, iter: iter };
      }

      var res;
      if (regime === 'float') {
        /* xr clears the balance of payments: excess(xr) = 0, excess increasing in xr (capital side dominates the J-curve) */
        var x0 = prevU.xr, e0 = evalYear(x0).excess;
        var lo = x0, hi = x0, elo = e0, ehi = e0, k2 = 0;
        if (e0 > 0) { while (elo > 0 && k2 < 60) { lo = lo / 1.05; elo = evalYear(lo).excess; k2++; } }
        else { while (ehi < 0 && k2 < 60) { hi = hi * 1.05; ehi = evalYear(hi).excess; k2++; } }
        if (elo > 0 || ehi < 0) throw new Error('OPENMU: no floating exchange rate clears the balance of payments in year ' + (t + 1));
        for (var k3 = 0; k3 < 80 && (hi - lo) > 1e-13 * hi; k3++) {
          var mid = Math.abs(ehi - elo) > 0 ? lo - elo * (hi - lo) / (ehi - elo) : (lo + hi) / 2;   // secant step, kept inside the bracket
          if (!(mid > lo && mid < hi)) mid = (lo + hi) / 2;
          var em = evalYear(mid).excess;
          if (em < 0) { lo = mid; elo = em; } else { hi = mid; ehi = em; }
          if (Math.abs(em) < 1e-12 * Math.max(1, ref.union.totalSize)) { lo = hi = mid; elo = ehi = em; }
        }
        res = evalYear((lo + hi) / 2);
        res.year.union.floatIterations = k2 + k3;
      } else {
        res = evalYear(prevU.xr * (1 + deval / 100));
      }
      var year = res.year;
      if (res.iter > out.checks.maxIterations) out.checks.maxIterations = res.iter;
      if (year.union.identityError > out.checks.maxIdentityError) out.checks.maxIdentityError = year.union.identityError;
      out.years.push(year);
      ids.forEach(function (id) { prev[id] = res.newPrev[id]; });
      prevU = { xr: year.union.xr, R: year.union.R, NWcb: year.union.NWcb, r: r, rw: rw, backstop: backstop, S: eco ? year.union.S : 0 };
    }
    return out;
  }

  /* ---------- report: deviations from the stationary reference, decomposed ---------- */
  var INDIC = ['gdp', 'unemp', 'infl', 'pubbal', 'tradebal'];
  var INDIC_ECO = INDIC.concat(['emis']);   // v2.0: sixth dimension, emissions in % of the reference
  function indicList(p) { return p.eco ? INDIC_ECO : INDIC; }
  function indicators(cy, rc, p) {
    var o = {
      gdp: 100 * (cy.Y / rc.Y - 1),
      unemp: cy.u - p.ustar,
      infl: cy.pi - p.pistar,
      pubbal: cy.pb,       // reference public balance is 0
      tradebal: cy.tb      // reference trade balance is 0
    };
    if (p.eco) o.emis = p.ci0 > 0 ? 100 * (cy.E / (p.ci0 * rc.Y) - 1) : 0;   // emissions vs the reference, %
    return o;
  }
  function diff(a, b, p) { var d = {}; indicList(p).forEach(function (k) { d[k] = a[k] - b[k]; }); return d; }

  function report(opts) {
    opts = opts || {};
    var p = mergeParams(opts.params);
    var years = Math.max(1, Math.round(num(opts.years) || 1));
    var policies = opts.policies || {}, shocks = opts.shocks || [];
    var ids = p.countries.map(function (c) { return c.id; });
    var KEYS = indicList(p);
    var zero = {}; KEYS.forEach(function (k) { zero[k] = 0; });

    /* v2.0: a fourth part, "climate" = the run with the damage on minus the same run with the damage forced to 0 (emissions,
       intensities and levers still simulated); reference, shocks and own-policy parts are computed with the damage off, so the
       four parts add up to the total. Without eco, pOff = p and the climate part is absent. */
    var pOff = p.eco ? Object.assign({}, p, { damageOff: true }) : p;
    var runRef = simulate({ params: pOff, years: years });
    var runShock = simulate({ params: pOff, years: years, shocks: shocks });
    var runAllOff = simulate({ params: pOff, years: years, policies: policies, shocks: shocks });
    var runAll = p.eco ? simulate({ params: p, years: years, policies: policies, shocks: shocks }) : runAllOff;
    var runNat = {};
    ids.forEach(function (id) {
      if (policies[id] && policies[id].some(function (y) { return y && Object.keys(y).some(function (k) { return num(y[k]) !== 0; }); })) {
        var only = {}; only[id] = policies[id];
        runNat[id] = simulate({ params: pOff, years: years, policies: only, shocks: shocks });
      } else runNat[id] = null;
    });
    var ref = runAll.ref;
    var out = { years: [], ref: ref, params: p, version: VERSION };
    for (var t = 0; t < years; t++) {
      var yr = { countries: {}, union: {} };
      ids.forEach(function (id) {
        var rc = ref.countries[id];
        var iRef = indicators(runRef.years[t].countries[id], rc, p);
        var iShock = indicators(runShock.years[t].countries[id], rc, p);
        var iAll = indicators(runAll.years[t].countries[id], rc, p);
        var iAllOff = p.eco ? indicators(runAllOff.years[t].countries[id], rc, p) : iAll;
        var total = diff(iAll, iRef, p);
        var shock = diff(iShock, iRef, p);
        var nat = runNat[id] ? diff(indicators(runNat[id].years[t].countries[id], rc, p), iShock, p) : zero;
        var foreign = diff(diff(diff(iAllOff, iRef, p), shock, p), nat, p);
        var climate = p.eco ? diff(iAll, iAllOff, p) : null;
        var detail = {};
        KEYS.forEach(function (k) { detail[k] = { shock: shock[k], nat: nat[k], foreign: foreign[k] }; if (climate) detail[k].climate = climate[k]; });
        var cy = runAll.years[t].countries[id];
        detail.extra = { gap: cy.gap, debt: 100 * cy.B / cy.Y, wealth: 100 * cy.V / cy.Y, u: cy.u, pi: cy.pi, P: cy.P,
          inv: rc.I ? 100 * (cy.I / rc.I - 1) : 0, loans: 100 * cy.L / cy.Y, deposits: 100 * cy.M / cy.Y };
        if (p.prices && cy.compet !== undefined) detail.extra.compet = cy.compet;   // price level vs the union's, %
        if (p.capital) { detail.extra.foreign = 100 * runAll.years[t].union.xr * cy.Bf / cy.Y; detail.extra.spread = 100 * cy.spread; detail.extra.pressured = !!cy.pressured; }   // v1.3: foreign bills % of GDP, spread in points
        if (p.eco) { detail.extra.E = p.ci0 > 0 ? 100 * (cy.E / (p.ci0 * rc.Y) - 1) : 0; detail.extra.ci = cy.ci / p.ci0; detail.extra.ctax = cy.ctax; detail.extra.green = cy.green; detail.extra.D = 100 * cy.D; }   // v2.0: emissions vs reference %, carbon intensity (share of reference), levers, damage %
        var entry = { detail: detail, byPart: { total: total, shock: shock, nat: nat, foreign: foreign } };
        if (climate) entry.byPart.climate = climate;
        KEYS.forEach(function (k) { entry[k] = total[k]; });
        yr.countries[id] = entry;
      });
      var u = runAll.years[t].union, uRef = runRef.years[t].union;
      yr.union = { Y: u.Y, CA: u.CA, R: u.R, R0: u.R0, xr: u.xr, r: u.r, alert: u.alert, months: u.months,
        gdp: 100 * (u.Y / uRef.Y - 1), CAref: uRef.CA, Rshare: u.R / u.R0 };
      if (p.capital) {
        var press = ids.filter(function (id) { return runAll.years[t].countries[id].pressured; });
        yr.union.regime = u.regime; yr.union.dxr = u.dxr; yr.union.CAp = u.CAp; yr.union.KA = u.KA; yr.union.Bw = u.Bw; yr.union.Bf = u.Bf;
        yr.union.backstop = u.backstop; yr.union.pressured = press; yr.union.sBar = 100 * u.sBar; yr.union.rw = u.rw; yr.union.unabsorbed = u.unabsorbed;
      }
      if (p.eco) { yr.union.Sshare = u.Sshare; yr.union.D = 100 * u.D; yr.union.Erel = u.Erel; yr.union.Ew = u.Ew; yr.union.Eu = u.Eu; }
      out.years.push(yr);
    }
    out.checks = runAll.checks;
    return out;
  }

  /* =====================================================================
     DUEL (arcade mode, spec section 11): two identical economies A and B,
     each with its own currency and central bank, trading only with each
     other, holding each other's bills, a bilateral exchange rate e
     (A's currency per unit of B's) fixed or floating per year, a closed
     climate block (S fed by E_A + E_B). Each side is the one-member v2.0
     economy; the partner replaces the exogenous rest of the world. The
     union code above is untouched (bit for bit).
     ===================================================================== */
  var SIDES = ['A', 'B'];
  function partnerOf(x) { return x === 'A' ? 'B' : 'A'; }
  function duelParams(params) {
    var p = mergeParams(Object.assign({}, paramsFor('v2.0'), params || {}, { firms: true, prices: true, capital: true, eco: true }));
    p.duel = true;
    p.sR = 1;                 // every import comes from the partner
    p.ewMult = 0;             // no rest of the world: the two players are the world
    p.lambdaF1 = (params && params.lambdaF1) || 0.6;   // both sides' portfolios react: halved so that +1 pt on the policy rate moves e by ~6 %
    p.countries = [{ id: 'A', name: 'Country A', size: 100 }, { id: 'B', name: 'Country B', size: 100 }];
    if (params && params.sizeA) p.countries[0].size = params.sizeA;
    if (params && params.sizeB) p.countries[1].size = params.sizeB;
    p.rateMax = params && params.rateMax ? params.rateMax : 2;   // policy-rate lever bound, points
    p.forcedDeval = params && params.forcedDeval ? params.forcedDeval : 15;   // forced devaluation of an exhausted side, %
    return p;
  }
  /* reference state of one side: the v1.1/v1.3 calibration of a one-member economy whose trade partner is the other side */
  function calibrateDuel(params) {
    var p = params && params.duel ? params : duelParams(params);
    var tauc = p.tau / (1 + p.tau);
    var ref = { countries: {}, params: p, pair: {} };
    p.countries.forEach(function (c) {
      var Y = c.size, G = p.g * Y, TR = p.tr * Y;
      var K = p.kappaK * Y, I = p.delta * K, L = K, AF = p.delta * K;
      var C = Y - G - I, CE = C / (1 - tauc);
      var V = (1 - p.alpha1) / p.alpha2 * CE;
      var BhAll = V * billsShare(p, p.r);
      var Bf = p.bwShare * Y, Bh = BhAll - Bf;
      var M = (V - BhAll) * p.nu, H = (V - BhAll) * (1 - p.nu);
      var YF = Y - AF - p.r * L;
      var base = YF + p.r * (Bh + M) + p.r * Bf;
      var theta = 1 - (CE - TR) / base;
      var Bb = Math.max(0, M - L), A = Math.max(0, L - M);
      var IM = p.mu * Y;
      var R0 = (p.reserveMonths / 12) * IM;      // reserves of this side's central bank, in the partner's currency (e = 1)
      var Bcb = H - R0 - A;
      var T = theta * base + tauc * CE;
      ref.countries[c.id] = { id: c.id, name: c.name, size: c.size, Y: Y, G: G, TR: TR, theta: theta, tau: p.tau, tauc: tauc, C: C, CE: CE, YD: CE, V: V,
        Bh: Bh, Bf: Bf, Bw: Bf, lambdaF0: Bf / V, M: M, H: H, I: I, K: K, L: L, AF: AF, YF: YF, Bb: Bb, A: A, IM: IM, IMR: IM, IMU: 0, xR: IM, XR: IM, X: IM, IMV: IM,
        T: T, R0: R0, Bcb: Bcb, B: Bh + Bb + Bcb + Bf, Fcb: p.r * (Bcb + A), PB: 0, TB: 0, E0: p.ci0 * Y };
    });
    var E0 = ref.countries.A.E0 + ref.countries.B.E0;
    ref.pair = { e0: 1, r0: p.r, S0: p.s0Years * E0, E0: E0 };
    return ref;
  }
  function clampRate(v, mx) { return Math.max(-mx, Math.min(mx, num(v))); }
  /* simulateDuel({params, years, policies:{A:[...],B:[...]}, shocks:[{confidence, imports, disaster, regime, devalA, devalB, backstop, demandA, demandB}]}) */
  function simulateDuel(opts) {
    opts = opts || {};
    var p = duelParams(opts.params);
    if (opts.params && opts.params.damageOff) p.damageOff = true;
    var ref = calibrateDuel(p);
    var years = Math.max(1, Math.round(num(opts.years) || 1));
    var policies = opts.policies || {}, shocks = opts.shocks || [];
    var TOL = 1e-13, CAP = 500;
    var prev = {}, prevP = { e: 1, NWcb: { A: 0, B: 0 }, backstop: true, S: ref.pair.S0, r: { A: p.r, B: p.r }, CAp: { A: 0, B: 0 } };
    SIDES.forEach(function (id) {
      var rc = ref.countries[id];
      prev[id] = { Y: rc.Y, V: rc.V, Bh: rc.Bh, M: rc.M, B: rc.B, Bcb: rc.Bcb, A: rc.A, K: rc.K, L: rc.L, tau: rc.tau, P: 1, Prel: 1, Bf: rc.Bf, Bw: rc.Bw, Bb: rc.Bb, s: 0,
        ci: p.ci0, ctax: 0, green: 0, R: rc.R0, forced: false };
    });
    var out = { years: [], ref: ref, checks: { maxIdentityError: 0, maxIterations: 0 } };
    for (var t = 0; t < years; t++) {
      var sh = shocks && shocks[t] ? shocks[t] : {};
      var regime = sh.regime === 'float' ? 'float' : 'fixed';
      var a1 = p.alpha1 * (1 + shockAt(shocks, t, 'confidence') / 100);
      var muF = p.mu * (1 + shockAt(shocks, t, 'imports') / 100);
      var backstop = sh.backstop !== false, bsPrev = prevP.backstop;
      var D = p.damageOff ? 0 : Math.min(p.dMax, Math.max(0, (ref.pair.S0 > 0 ? p.chiD * (prevP.S - ref.pair.S0) / ref.pair.S0 : 0) + shockAt(shocks, t, 'disaster') / 100));
      var r = {}, r1 = {}, invF = {}, ci = {}, ctaxNow = {}, greenNow = {}, spread = {}, pressured = {}, priceLagF = {}, demandF = {};
      SIDES.forEach(function (id) {
        var pv = prev[id], z = partnerOf(id);
        r[id] = p.r + clampRate(lever(policies, id, t, 'rate'), p.rateMax) / 100;
        r1[id] = prevP.r[id];
        invF[id] = Math.max(p.ifloor, 1 - p.iota * (r1[id] - p.r));
        ci[id] = Math.max(p.ciMin * p.ci0, pv.ci * (1 - p.aC * pv.ctax - p.aG * pv.green / (1 + pv.green / p.gSat)));
        ctaxNow[id] = Math.max(0, lever(policies, id, t, 'ctax'));
        greenNow[id] = Math.max(0, lever(policies, id, t, 'green'));
        var d = pv.B / pv.Y;
        spread[id] = p.phi * Math.max(0, d - p.dstar);
        pressured[id] = d > p.dstar;
        demandF[id] = 1 + shockAt(shocks, t, 'demand' + id) / 100;
      });
      /* lagged relative prices: imports of X ∝ (xr_X,-1 · Prel_Z,-1 / Prel_X,-1)^(−ε), xr_A = e, xr_B = 1/e */
      var xrPrev = { A: prevP.e, B: 1 / prevP.e };
      SIDES.forEach(function (id) { var z = partnerOf(id); priceLagF[id] = Math.pow(xrPrev[id] * prev[z].Prel / prev[id].Prel, -p.eps); });
      /* forced devaluation of the side whose reserves are gone with a continuing current-account deficit (fixed regime) */
      var forced = { A: false, B: false };
      var eBase = prevP.e;
      if (regime === 'fixed') {
        if (prev.A.R <= 0 && prevP.CAp.A < 0) { forced.A = true; eBase = eBase * (1 + p.forcedDeval / 100); }
        if (prev.B.R <= 0 && prevP.CAp.B < 0) { forced.B = true; eBase = eBase / (1 + p.forcedDeval / 100); }
        eBase = eBase * (1 + shockAt(shocks, t, 'devalA') / 100) / (1 + shockAt(shocks, t, 'devalB') / 100);
      }

      function evalYear(e) {
        var xr = { A: e, B: 1 / e };
        var cur = {};
        SIDES.forEach(function (id) {
          var rc = ref.countries[id], pv = prev[id];
          var tau = rc.tau * (1 + lever(policies, id, t, 'vat') / 100);
          cur[id] = {
            G: rc.G * (1 + lever(policies, id, t, 'pubdem') / 100) * demandF[id] + greenNow[id] * p.greenUnit * rc.Y,
            GREEN: greenNow[id] * p.greenUnit * rc.Y, ctaxRate: ctaxNow[id] * p.ctaxUnit,
            TR: rc.TR * (1 + lever(policies, id, t, 'benefits') / 100),
            theta: rc.theta * (1 + lever(policies, id, t, 'inctax') / 100),
            tau: tau, tauc: tau / (1 + tau), I: rc.I * invF[id], AF: p.delta * rc.K, Y: pv.Y
          };
        });
        var extraInc = {}, capGain = {};
        SIDES.forEach(function (id) {
          var pv = prev[id], z = partnerOf(id);
          extraInc[id] = pv.s * (pv.Bh + pv.Bb) + (r1[z] + prev[z].s) * xr[id] * pv.Bf;   // interest on the partner's bills (its rate incl. its spread)
          capGain[id] = (xr[id] - xrPrev[id]) * pv.Bf;
        });
        var extraIM = {};
        SIDES.forEach(function (id) { extraIM[id] = Math.max(0, p.greenImport - p.mu) * Math.max(0, lever(policies, id, t, 'green')) * p.greenUnit * ref.countries[id].Y; });
        function imrOf(id, Y) { return (muF * Y + extraIM[id]) * priceLagF[id]; }   // the import content of green investment above mu goes to the partner
        function stepFrom(Yof) {
          var next = {};
          SIDES.forEach(function (id) {
            var c = cur[id], pv = prev[id], z = partnerOf(id), Yc = Yof(id);
            var IMR = imrOf(id, Yc), X = imrOf(z, Yof(z));
            var YF = Yc - c.AF - r1[id] * pv.L - c.ctaxRate * ci[id] * Yc;
            var base = YF + r1[id] * (pv.Bh + pv.M) + extraInc[id];
            var YD = (1 - c.theta) * base + c.TR;
            var CE = a1 * YD + p.alpha2 * pv.V;
            var C = (1 - c.tauc) * CE;
            next[id] = C + c.G + c.I + X - xr[id] * IMR;
          });
          return next;
        }
        var iter = 0, maxChange = Infinity, lastChange = Infinity, grow = 0, solved = false;
        while (maxChange > TOL && iter < CAP) {
          lastChange = maxChange; maxChange = 0;
          var next = stepFrom(function (id) { return cur[id].Y; });
          SIDES.forEach(function (id) { var ch = Math.abs(next[id] - cur[id].Y) / ref.countries[id].Y; if (ch > maxChange) maxChange = ch; });
          if (!solved && ((maxChange > lastChange && ++grow >= 2) || iter === 150)) { next = solveLinear(stepFrom, SIDES); solved = true; } else if (maxChange <= lastChange) grow = 0;
          SIDES.forEach(function (id) { cur[id].Y = next[id]; });
          iter++;
        }
        if (maxChange > TOL) throw new Error('OPENMU duel: fixed point did not converge in year ' + (t + 1));
        var year = { countries: {}, pair: {} }, newPrev = {}, acc = {};
        SIDES.forEach(function (id) {
          var c = cur[id], pv = prev[id], rc = ref.countries[id], z = partnerOf(id);
          var Y = c.Y, IMR = imrOf(id, Y), X = imrOf(z, cur[z].Y), IMV = xr[id] * IMR;
          var Tc = c.ctaxRate * ci[id] * Y;
          var YF = Y - c.AF - r1[id] * pv.L - Tc;
          var base = YF + r1[id] * (pv.Bh + pv.M) + extraInc[id];
          var YD = (1 - c.theta) * base + c.TR;
          var CE = a1 * YD + p.alpha2 * pv.V, C = (1 - c.tauc) * CE;
          var T = c.theta * base + c.tauc * CE + Tc;
          var V = pv.V + YD - CE + capGain[id];
          var govInt = r1[id] * pv.B + pv.s * (pv.B - (bsPrev ? pv.Bcb : 0));
          var Fcb = r1[id] * (pv.Bcb + pv.A) + (bsPrev ? 0 : pv.s * pv.Bcb);
          var B = pv.B + c.G + c.TR + govInt - T - Fcb;
          var PB = T + Fcb - c.G - c.TR - govInt;
          var K = pv.K + c.I - c.AF, L = pv.L + c.I - c.AF;
          acc[id] = { Y: Y, IMR: IMR, X: X, IMV: IMV, Tc: Tc, YF: YF, YD: YD, CE: CE, C: C, T: T, V: V, Fcb: Fcb, B: B, PB: PB, K: K, L: L, TB: X - IMV, c: c };
        });
        /* portfolios: each side's households hold the partner's bills (in the partner's currency); the partner's holdings of my bills are my "Bw" */
        var pf = {}, sEff = {}, unabsorbed = 0;
        SIDES.forEach(function (id) {
          var a = acc[id], rc = ref.countries[id], z = partnerOf(id), L = a.L, V = a.V;
          sEff[id] = spread[id];
          function portfolio(rEff) {
            var all = V * billsShare(p, rEff);
            var lamF = Math.max(0, Math.min(billsShare(p, rEff), rc.lambdaF0 + p.lambdaF1 * ((r[z] + spread[z]) - rEff)));
            var o = { Bf: lamF * V / xr[id], Bh: all - lamF * V };
            o.M = (V - all) * p.nu; o.H = (V - all) * (1 - p.nu);
            o.Bb = Math.max(0, o.M - L); o.A = Math.max(0, L - o.M);
            return o;
          }
          pf[id] = portfolio(r[id] + sEff[id]); pf[id].portfolio = portfolio;
        });
        SIDES.forEach(function (id) {
          var a = acc[id], pv = prev[id], z = partnerOf(id);
          var Bw = pf[z].Bf;   // partner households' holdings of my bills, in my currency
          if (!backstop && pressured[id]) {
            var target = a.B - pv.Bcb - Bw, portfolio = pf[id].portfolio;
            var f = function (rE) { var o = portfolio(rE); return o.Bh + o.Bb - target; };
            var lo = r[id] + sEff[id], hi = p.rEffMax;
            if (f(lo) >= 0) { pf[id] = Object.assign(portfolio(lo), { portfolio: portfolio }); }
            else if (f(hi) < 0) { var o2 = portfolio(hi); sEff[id] = hi - r[id]; unabsorbed += target - (o2.Bh + o2.Bb); pf[id] = Object.assign(o2, { portfolio: portfolio }); }
            else { for (var k = 0; k < 60; k++) { var mid = (lo + hi) / 2; if (f(mid) < 0) lo = mid; else hi = mid; } sEff[id] = hi - r[id]; pf[id] = Object.assign(portfolio(hi), { portfolio: portfolio }); }
          }
        });
        var excess = {}, CApS = {}, KAS = {}, sumE = 0;
        SIDES.forEach(function (id) {
          var a = acc[id], pv = prev[id], rc = ref.countries[id], z = partnerOf(id), o = pf[id];
          var Bw = pf[z].Bf, Bcb = a.B - o.Bh - o.Bb - Bw;
          var primInc = (r1[z] + prev[z].s) * xr[id] * pv.Bf - (r1[id] + pv.s) * pv.Bw;
          var CAp = a.TB + primInc, KA = (Bw - pv.Bw) - xr[id] * (o.Bf - pv.Bf);
          CApS[id] = CAp; KAS[id] = KA; excess[id] = CAp + KA;
          var gap = 100 * (a.Y / rc.Y - 1), gapD = 100 * (a.Y / (rc.Y * (1 - D)) - 1);
          var u = p.ustar + p.chiU * 100 * D - p.beta * gap;
          var pi = p.pistar + p.kappa * gapD + p.rho * (a.c.tau - pv.tau) * 100 + p.omega * 100 * (xr[id] - xrPrev[id]) / xrPrev[id] + p.rhoC * (ctaxNow[id] - pv.ctax);
          var P = pv.P * (1 + pi / 100), Prel = pv.Prel * (1 + pi / 100) / (1 + p.pistar / 100);
          var E = ci[id] * a.Y; sumE += E;
          year.countries[id] = { Y: a.Y, gap: gap, u: u, pi: pi, P: P, Prel: Prel, C: a.C, CE: a.CE, G: a.c.G, TR: a.c.TR, theta: a.c.theta, tau: a.c.tau, T: a.T, YD: a.YD,
            V: a.V, Bh: o.Bh, H: o.H, B: a.B, Bcb: Bcb, Fcb: a.Fcb, X: a.X, XR: a.X, IM: a.IMR, IMU: 0, IMR: a.IMR, IMV: a.IMV, PB: a.PB, TB: a.TB, pb: 100 * a.PB / a.Y, tb: 100 * a.TB / a.Y,
            saving: a.YD - a.CE, r: r[id], I: a.c.I, K: a.K, L: a.L, M: o.M, Bb: o.Bb, A: o.A, AF: a.c.AF, YF: a.YF, Bf: o.Bf, Bw: Bw, spread: sEff[id], rEff: r[id] + sEff[id],
            pressured: !!pressured[id], capGain: capGain[id], CAi: CAp, CAp: CAp, KA: KA, xr: xr[id], E: E, ci: ci[id], ctax: ctaxNow[id], green: greenNow[id], GREEN: a.c.GREEN, Tc: a.Tc, D: D,
            rate: 100 * (r[id] - p.r), forced: forced[id], compet: 0 };
          newPrev[id] = { Y: a.Y, V: a.V, Bh: o.Bh, M: o.M, B: a.B, Bcb: Bcb, A: o.A, K: a.K, L: a.L, tau: a.c.tau, P: P, Prel: Prel, Bf: o.Bf, Bw: Bw, Bb: o.Bb, s: sEff[id],
            ci: ci[id], ctax: ctaxNow[id], green: greenNow[id], R: pv.R, forced: forced[id] };
        });
        /* competitiveness: price level vs the partner's, in a common currency (A's) */
        var PA = year.countries.A.Prel, PB2 = year.countries.B.Prel * e;
        year.countries.A.compet = 100 * (PA / Math.sqrt(PA * PB2) - 1); year.countries.B.compet = 100 * (PB2 / Math.sqrt(PA * PB2) - 1);
        /* reserves (fixed): A's central bank holds B's currency, B's holds A's; the transfer is zero-sum in a common currency */
        var RA = prev.A.R, RB = prev.B.R;
        if (regime === 'fixed') { RA = prev.A.R + excess.A / e; RB = prev.B.R - excess.A; }
        newPrev.A.R = RA; newPrev.B.R = RB;
        var NWcbA = prevP.NWcb.A + (e - prevP.e) * prev.A.R, NWcbB = prevP.NWcb.B + (1 / e - 1 / prevP.e) * prev.B.R;
        var S = prevP.S + sumE;
        var monthsA = 12 * RA * e / year.countries.A.IMV, monthsB = 12 * RB / e / year.countries.B.IMV;
        year.pair = { e: e, de: 100 * (e - prevP.e) / prevP.e, regime: regime, RA: RA, RB: RB, R0A: ref.countries.A.R0, R0B: ref.countries.B.R0,
          alertA: regime === 'fixed' && RA < p.alertShare * ref.countries.A.R0, alertB: regime === 'fixed' && RB < p.alertShare * ref.countries.B.R0,
          monthsA: monthsA, monthsB: monthsB, CApA: CApS.A, CApB: CApS.B, KAA: KAS.A, KAB: KAS.B, excessA: excess.A, excessB: excess.B,
          S: S, Sshare: S / ref.pair.S0, D: D, EA: year.countries.A.E, EB: year.countries.B.E, Erel: 100 * (sumE / ref.pair.E0 - 1),
          backstop: backstop, forcedA: forced.A, forcedB: forced.B, iterations: iter, NWcbA: NWcbA, NWcbB: NWcbB, unabsorbed: unabsorbed, rA: r.A, rB: r.B };
        /* identities: CB balance sheets, sector balances = CA', wealth = assets, bilateral BoP (common currency) */
        var errs = [];
        SIDES.forEach(function (id) {
          var y = year.countries[id], a = acc[id], pv = prev[id];
          var R = id === 'A' ? RA : RB, NW = id === 'A' ? NWcbA : NWcbB;
          errs.push(Math.abs(y.H - (y.Bcb + y.A) - xr[id] * R + NW) / y.H);
          errs.push(Math.abs((a.YD - a.CE) + (a.c.AF - a.c.I) + a.PB - CApS[id]) / Math.max(1, Math.abs(CApS[id])));
          errs.push(Math.abs(y.Bh + y.M + y.H + xr[id] * y.Bf - y.V) / y.V);
          errs.push(Math.abs(KAS[id] - xr[id] * (R - pv.R) + CApS[id]) / Math.max(1, Math.abs(CApS[id]) + Math.abs(KAS[id])));
        });
        errs.push(Math.abs(excess.A + e * excess.B) / Math.max(1, Math.abs(excess.A)));   // BoP_A = −e·BoP_B
        year.pair.identityError = Math.max.apply(null, errs);
        return { year: year, newPrev: newPrev, excess: excess.A, iter: iter, NWcbA: NWcbA, NWcbB: NWcbB };
      }

      var res;
      if (regime === 'float') {
        var x0 = prevP.e, e0 = evalYear(x0).excess, lo = x0, hi = x0, elo = e0, ehi = e0, k2 = 0;
        if (e0 > 0) { while (elo > 0 && k2 < 60) { lo = lo / 1.05; elo = evalYear(lo).excess; k2++; } }
        else { while (ehi < 0 && k2 < 60) { hi = hi * 1.05; ehi = evalYear(hi).excess; k2++; } }
        if (elo > 0 || ehi < 0) throw new Error('OPENMU duel: no floating exchange rate clears the balance of payments in year ' + (t + 1));
        for (var k3 = 0; k3 < 80 && (hi - lo) > 1e-13 * hi; k3++) {
          var mid = Math.abs(ehi - elo) > 0 ? lo - elo * (hi - lo) / (ehi - elo) : (lo + hi) / 2;
          if (!(mid > lo && mid < hi)) mid = (lo + hi) / 2;
          var em = evalYear(mid).excess;
          if (em < 0) { lo = mid; elo = em; } else { hi = mid; ehi = em; }
          if (Math.abs(em) < 1e-12 * 100) { lo = hi = mid; elo = ehi = em; }
        }
        res = evalYear((lo + hi) / 2);
      } else res = evalYear(eBase);
      var year = res.year;
      if (res.iter > out.checks.maxIterations) out.checks.maxIterations = res.iter;
      if (year.pair.identityError > out.checks.maxIdentityError) out.checks.maxIdentityError = year.pair.identityError;
      out.years.push(year);
      SIDES.forEach(function (id) { prev[id] = res.newPrev[id]; });
      prevP = { e: year.pair.e, NWcb: { A: res.NWcbA, B: res.NWcbB }, backstop: backstop, S: year.pair.S, r: { A: r.A, B: r.B }, CAp: { A: year.pair.CApA, B: year.pair.CApB } };
    }
    return out;
  }
  /* reportDuel: deviations from the reference for both sides, split into shock / nat (own) / foreign (partner) / climate; plus the pair row */
  function reportDuel(opts) {
    opts = opts || {};
    var p = duelParams(opts.params);
    var years = Math.max(1, Math.round(num(opts.years) || 1));
    var policies = opts.policies || {}, shocks = opts.shocks || [];
    var KEYS = INDIC_ECO, zero = {}; KEYS.forEach(function (k) { zero[k] = 0; });
    var pOff = Object.assign({}, p, { damageOff: true });
    var runRef = simulateDuel({ params: pOff, years: years });
    var runShock = simulateDuel({ params: pOff, years: years, shocks: shocks });
    var runAllOff = simulateDuel({ params: pOff, years: years, policies: policies, shocks: shocks });
    var runAll = simulateDuel({ params: p, years: years, policies: policies, shocks: shocks });
    var runNat = {};
    SIDES.forEach(function (id) {
      if (policies[id] && policies[id].some(function (y) { return y && Object.keys(y).some(function (k) { return num(y[k]) !== 0; }); })) {
        var only = {}; only[id] = policies[id];
        runNat[id] = simulateDuel({ params: pOff, years: years, policies: only, shocks: shocks });
      } else runNat[id] = null;
    });
    var ref = runAll.ref, out = { years: [], ref: ref, params: p, version: VERSION, duel: true };
    for (var t = 0; t < years; t++) {
      var yr = { countries: {}, pair: {} };
      SIDES.forEach(function (id) {
        var rc = ref.countries[id];
        var iRef = indicators(runRef.years[t].countries[id], rc, p), iShock = indicators(runShock.years[t].countries[id], rc, p);
        var iAll = indicators(runAll.years[t].countries[id], rc, p), iAllOff = indicators(runAllOff.years[t].countries[id], rc, p);
        var total = diff(iAll, iRef, p), shock = diff(iShock, iRef, p);
        var nat = runNat[id] ? diff(indicators(runNat[id].years[t].countries[id], rc, p), iShock, p) : zero;
        var foreign = diff(diff(diff(iAllOff, iRef, p), shock, p), nat, p);
        var climate = diff(iAll, iAllOff, p);
        var detail = {};
        KEYS.forEach(function (k) { detail[k] = { shock: shock[k], nat: nat[k], foreign: foreign[k], climate: climate[k] }; });
        var cy = runAll.years[t].countries[id], pr = runAll.years[t].pair;
        detail.extra = { gap: cy.gap, debt: 100 * cy.B / cy.Y, wealth: 100 * cy.V / cy.Y, u: cy.u, pi: cy.pi, P: cy.P, inv: 100 * (cy.I / rc.I - 1), loans: 100 * cy.L / cy.Y, deposits: 100 * cy.M / cy.Y,
          compet: cy.compet, foreign: 100 * cy.xr * cy.Bf / cy.Y, spread: 100 * cy.spread, pressured: !!cy.pressured, E: 100 * (cy.E / rc.E0 - 1), ci: cy.ci / p.ci0, ctax: cy.ctax, green: cy.green, D: 100 * cy.D,
          rate: cy.rate, reserves: id === 'A' ? 100 * pr.RA / pr.R0A : 100 * pr.RB / pr.R0B, months: id === 'A' ? pr.monthsA : pr.monthsB, forced: cy.forced };
        var entry = { detail: detail, byPart: { total: total, shock: shock, nat: nat, foreign: foreign, climate: climate } };
        KEYS.forEach(function (k) { entry[k] = total[k]; });
        yr.countries[id] = entry;
      });
      var u = runAll.years[t].pair;
      yr.pair = { e: u.e, de: u.de, regime: u.regime, RA: u.RA, RB: u.RB, R0A: u.R0A, R0B: u.R0B, RshareA: u.RA / u.R0A, RshareB: u.RB / u.R0B, alertA: u.alertA, alertB: u.alertB,
        monthsA: u.monthsA, monthsB: u.monthsB, CApA: u.CApA, CApB: u.CApB, KAA: u.KAA, KAB: u.KAB, S: u.S, Sshare: u.Sshare, D: 100 * u.D, Erel: u.Erel, EA: u.EA, EB: u.EB,
        backstop: u.backstop, forcedA: u.forcedA, forcedB: u.forcedB, rA: 100 * u.rA, rB: 100 * u.rB, pressured: SIDES.filter(function (id) { return runAll.years[t].countries[id].pressured; }) };
      out.years.push(yr);
    }
    out.checks = runAll.checks;
    return out;
  }

  /* ---------- describe: parameters and reference state, for display ---------- */
  function describe(params) {
    var ref = calibrate(params);
    var p = ref.params;
    var countries = {};
    Object.keys(ref.countries).forEach(function (id) {
      var c = ref.countries[id];
      countries[id] = { name: c.name, Y: c.Y, G: c.G, TR: c.TR, theta: c.theta, tau: c.tau, V: c.V, B: c.B, debtRatio: c.B / c.Y,
        wealthRatio: c.V / c.Y, exportsRoW: c.xR, importsRoW: c.IMR, intraExports: c.X - c.xR,
        I: c.I || 0, investmentRatio: (c.I || 0) / c.Y, loansRatio: (c.L || 0) / c.Y, depositsRatio: (c.M || 0) / c.Y, billsShare: c.Bh / c.V };
    });
    var pp = clone(p); delete pp.countries;
    return { version: VERSION, params: pp, countries: countries,
      firms: p.firms ? { investment: 'I = I* · max(ifloor, 1 − iota·(r₋₁ − r*))', kappaK: p.kappaK, delta: p.delta, iota: p.iota, ifloor: p.ifloor,
        banks: 'loans = capital; deposits held by households; zero spread; bills or CB advances close the bank balance sheet' } : null,
      prices: p.prices ? { rule: 'P_i = P_i,-1 (1 + π_i/100); trade volumes respond to last year’s relative prices', eps: p.eps, eta: p.eta, epsU: p.epsU } : null,
      eco: p.eco ? { ci0: p.ci0, ciMin: p.ciMin, chiD: p.chiD, chiU: p.chiU, aC: p.aC, aG: p.aG, rhoC: p.rhoC, S0: ref.union.S0 } : null,
      capital: p.capital ? { bwShare: p.bwShare, chiW: p.chiW, chiS: p.chiS, lambdaF1: p.lambdaF1, phi: p.phi, dstar: p.dstar, psi: p.psi, rw: p.rw } : null,
      union: { R0: ref.union.R0, reserveMonths: p.reserveMonths, xr0: p.xr0, r0: p.r, alertShare: p.alertShare } };
  }

  return { VERSION: VERSION, INDICATORS: INDIC, INDICATORS_ECO: INDIC_ECO, defaultParams: defaultParams, paramsFor: paramsFor, calibrate: calibrate, simulate: simulate, report: report, describe: describe, shares: shares,
    duelParams: duelParams, calibrateDuel: calibrateDuel, simulateDuel: simulateDuel, reportDuel: reportDuel, SIDES: SIDES };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = OPENMU;
