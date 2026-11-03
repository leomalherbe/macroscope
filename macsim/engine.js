/* =====================================================================
   OPEN-MU — game engine (v1, fixed exchange rate)
   N member countries in a monetary union (chapter-6 OPEN/REG logic:
   real flows, households' wealth target, government bills, one central
   bank), rest of the world exogenous, reserves absorb the union's
   current account, two reporting "thermometers" (unemployment,
   inflation) outside the dynamics.
   Spec: docs/openmu-spec.md. Runs in the browser (global OPENMU) and in
   Node (module.exports). No dependencies. Nothing is rounded here.
   ===================================================================== */
var OPENMU = (function () {
  'use strict';
  var VERSION = '1.0';

  /* ---------- defaults ---------- */
  function defaultParams() {
    return {
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
      xr0: 1,           // reference exchange rate (union currency per unit of world currency)
      YRoW0: 1,         // reference RoW demand index
      reserveMonths: 3, // initial reserves, in months of the union's RoW imports
      alertShare: 0.25, // alert when R < alertShare * R0
      /* households and portfolio */
      alpha1: 0.75,     // propensity to consume out of disposable income
      alpha2: 0.185,    // propensity to consume out of wealth
      lambda0: 0.70,    // bills share of wealth at r = 0
      lambda1: 5,       // sensitivity of the bills share to r
      r: 0.03,          // central-bank bill rate
      /* thermometers (reported, not fed back) */
      ustar: 7,  beta: 0.4,
      pistar: 2, kappa: 0.3, rho: 0.6, omega: 0.15
    };
  }

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function mergeParams(params) {
    var p = defaultParams();
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

  /* ---------- one simulation ---------- */
  function lever(policies, id, t, key) {
    var arr = policies && policies[id];
    if (!arr) return 0;
    var y = arr[t];
    return y ? num(y[key]) : 0;
  }
  function shockAt(shocks, t, key) {
    var y = shocks && shocks[t];
    return y ? num(y[key]) : 0;
  }

  function simulate(opts) {
    opts = opts || {};
    var p = mergeParams(opts.params);
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
          pb: 100 * PB / Y, tb: 100 * TB / Y, saving: YD - CE, r: r };
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

  /* ---------- report: deviations from the stationary reference, decomposed ---------- */
  var INDIC = ['gdp', 'unemp', 'infl', 'pubbal', 'tradebal'];
  function indicators(cy, rc, p) {
    return {
      gdp: 100 * (cy.Y / rc.Y - 1),
      unemp: cy.u - p.ustar,
      infl: cy.pi - p.pistar,
      pubbal: cy.pb,       // reference public balance is 0
      tradebal: cy.tb      // reference trade balance is 0
    };
  }
  function diff(a, b) { var d = {}; INDIC.forEach(function (k) { d[k] = a[k] - b[k]; }); return d; }

  function report(opts) {
    opts = opts || {};
    var p = mergeParams(opts.params);
    var years = Math.max(1, Math.round(num(opts.years) || 1));
    var policies = opts.policies || {}, shocks = opts.shocks || [];
    var ids = p.countries.map(function (c) { return c.id; });
    var zero = {}; INDIC.forEach(function (k) { zero[k] = 0; });

    var runRef = simulate({ params: p, years: years });
    var runShock = simulate({ params: p, years: years, shocks: shocks });
    var runAll = simulate({ params: p, years: years, policies: policies, shocks: shocks });
    var runNat = {};
    ids.forEach(function (id) {
      if (policies[id] && policies[id].some(function (y) { return y && Object.keys(y).some(function (k) { return num(y[k]) !== 0; }); })) {
        var only = {}; only[id] = policies[id];
        runNat[id] = simulate({ params: p, years: years, policies: only, shocks: shocks });
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
        var total = diff(iAll, iRef);
        var shock = diff(iShock, iRef);
        var nat = runNat[id] ? diff(indicators(runNat[id].years[t].countries[id], rc, p), iShock) : zero;
        var foreign = diff(diff(total, shock), nat);
        var detail = {};
        INDIC.forEach(function (k) { detail[k] = { shock: shock[k], nat: nat[k], foreign: foreign[k] }; });
        var cy = runAll.years[t].countries[id];
        detail.extra = { gap: cy.gap, debt: 100 * cy.B / cy.Y, wealth: 100 * cy.V / cy.Y, u: cy.u, pi: cy.pi, P: cy.P };
        var entry = { detail: detail, byPart: { total: total, shock: shock, nat: nat, foreign: foreign } };
        INDIC.forEach(function (k) { entry[k] = total[k]; });
        yr.countries[id] = entry;
      });
      var u = runAll.years[t].union, uRef = runRef.years[t].union;
      yr.union = { Y: u.Y, CA: u.CA, R: u.R, R0: u.R0, xr: u.xr, r: u.r, alert: u.alert, months: u.months,
        gdp: 100 * (u.Y / uRef.Y - 1), CAref: uRef.CA, Rshare: u.R / u.R0 };
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
        wealthRatio: c.V / c.Y, exportsRoW: c.xR, importsRoW: c.IMR, intraExports: c.X - c.xR };
    });
    var pp = clone(p); delete pp.countries;
    return { version: VERSION, params: pp, countries: countries,
      union: { R0: ref.union.R0, reserveMonths: p.reserveMonths, xr0: p.xr0, r0: p.r, alertShare: p.alertShare } };
  }

  return { VERSION: VERSION, INDICATORS: INDIC, defaultParams: defaultParams, calibrate: calibrate, simulate: simulate, report: report, describe: describe, shares: shares };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = OPENMU;
