/* =====================================================================
   OPEN-MU — the two matrices of the model (balance sheet, transactions
   flow), with their values for one year of a simulation, for the union
   as a whole (the members added up, the common central bank, the rest
   of the world). Intra-union trade nets out at that level.
   accounts(sim, t) → {flows: rows, stocks: rows, Y}; each row:
   {label, sym: {sector: symbol}, val: {sector: value}} in units of the
   model (the page divides by Y for % of GDP). Sectors: h households,
   fc firms (current), fk firms (capital), b banks, g governments,
   cb common central bank, w rest of the world. Sign conventions of
   Godley & Lavoie: flows + = source of funds, − = use of funds;
   stocks + = asset, − = liability. ES5, no dependency.
   ===================================================================== */
var OPENMU_ACCOUNTS = (function () {
  'use strict';
  var SECTORS = ['h', 'fc', 'fk', 'b', 'g', 'cb', 'w'];
  var SECTORS_BS = ['h', 'f', 'b', 'g', 'cb', 'w'];

  function accounts(sim, t) {
    var y = sim.years[t], ref = sim.ref, p = ref.params;
    var ids = Object.keys(y.countries).filter(function (id) { return !y.countries[id].exited; });
    var u = y.union, uPrev = t > 0 ? sim.years[t - 1].union : null;
    var xr = u.xr, xr1 = uPrev ? uPrev.xr : ref.union.xr0;
    var r1 = uPrev ? uPrev.r : ref.union.r0, rw1 = uPrev ? (uPrev.rw !== undefined ? uPrev.rw : p.rw) : p.rw;
    var R = u.R, R1 = uPrev ? uPrev.R : ref.union.R0;
    var S = {};
    function add(k, v) { S[k] = (S[k] || 0) + v; }
    ids.forEach(function (id) {
      var c = y.countries[id];
      var pv = t > 0 ? sim.years[t - 1].countries[id] : ref.countries[id];
      var s1 = t > 0 ? (pv.spread || 0) : 0;
      var tauc = c.tau / (1 + c.tau);
      var vat = tauc * c.CE, tariff = c.tariffRev || 0, Tc = c.Tc || 0;
      add('Y', c.Y); add('CE', c.CE); add('C', c.C); add('vat', vat + tariff); add('G', c.G); add('I', c.I); add('AF', c.AF);
      add('XR', c.XR); add('IMR', xr * c.IMR); add('YF', c.YF); add('Tc', Tc); add('TR', c.TR);
      add('incTax', c.T - vat - tariff - Tc);
      add('intL', r1 * pv.L); add('intM', r1 * pv.M); add('intA', r1 * pv.A);
      add('intBh', (r1 + s1) * pv.Bh); add('intBb', (r1 + s1) * pv.Bb); add('spreadBb', s1 * pv.Bb); add('intBw', (r1 + s1) * (pv.Bw || 0));
      add('Fcb', c.Fcb); add('intBcb', c.Fcb - r1 * pv.A);
      add('intBf', rw1 * xr * (pv.Bf || 0));
      add('govInt', c.T + c.Fcb - c.G - c.TR - c.PB);
      add('dH', c.H - pv.H); add('dM', c.M - pv.M); add('dL', c.L - pv.L); add('dA', c.A - pv.A);
      add('dBh', c.Bh - pv.Bh); add('dBb', c.Bb - pv.Bb); add('dBcb', c.Bcb - pv.Bcb); add('dBw', (c.Bw || 0) - (pv.Bw || 0)); add('dB', c.B - pv.B);
      add('dBf', xr * ((c.Bf || 0) - (pv.Bf || 0)));
      /* stocks, end of year */
      add('H', c.H); add('M', c.M); add('L', c.L); add('A', c.A); add('K', c.K);
      add('Bh', c.Bh); add('Bb', c.Bb); add('Bcb', c.Bcb); add('Bw', c.Bw || 0); add('B', c.B); add('Bf', xr * (c.Bf || 0)); add('V', c.V);
    });
    var dR = xr * (R - R1);
    var cap = !!p.capital, eco = !!p.eco;
    function row(label, sym, val, note) { return { label: label, sym: sym, val: val, note: note || '' }; }
    var flows = [
      { block: 'Current account' },
      row('Consumption (and the taxes on it)', { h: '−CE', fc: '+C', g: '+τc·CE' }, { h: -S.CE, fc: S.C, g: S.vat }, 'C = (1 − τc)·CE: households spend CE, firms receive C, governments the consumption tax' + (S.vat - (S.CE - S.C) > 1e-9 ? ' and the tariffs' : '')),
      row('Government spending', { fc: '+G', g: '−G' }, { fc: S.G, g: -S.G }),
      row('Investment', { fc: '+I', fk: '−I' }, { fc: S.I, fk: -S.I }),
      row('Exports to the rest of the world', { fc: '+XR', w: '−XR' }, { fc: S.XR, w: -S.XR }, 'trade between members nets out for the union'),
      row('Imports from the rest of the world', { fc: '−xr·IMR', w: '+xr·IMR' }, { fc: -S.IMR, w: S.IMR }),
      row('Wages and distributed profits', { h: '+YF', fc: '−YF' }, { h: S.YF, fc: -S.YF }, 'YF = Y − AF − r₋₁·L' + (eco ? ' − carbon tax' : '')),
      row('Amortisation funds', { fc: '−AF', fk: '+AF' }, { fc: -S.AF, fk: S.AF })
    ];
    if (eco) flows.push(row('Carbon tax', { fc: '−Tc', g: '+Tc' }, { fc: -S.Tc, g: S.Tc }));
    flows.push(
      row('Income tax', { h: '−θ·base', g: '+θ·base' }, { h: -S.incTax, g: S.incTax }),
      row('Social benefits', { h: '+TR', g: '−TR' }, { h: S.TR, g: -S.TR }),
      row('Interest on loans', { fc: '−r₋₁·L₋₁', b: '+r₋₁·L₋₁' }, { fc: -S.intL, b: S.intL }),
      row('Interest on deposits', { h: '+r₋₁·M₋₁', b: '−r₋₁·M₋₁' }, { h: S.intM, b: -S.intM }),
      row('Interest on central-bank advances', { b: '−r₋₁·A₋₁', cb: '+r₋₁·A₋₁' }, { b: -S.intA, cb: S.intA }),
      row('Interest on government bills', cap ? { h: '+(r₋₁+s)·Bh₋₁', b: '+(r₋₁+s)·Bb₋₁', g: '−interest', cb: '+r₋₁·Bcb₋₁', w: '+(r₋₁+s)·Bw₋₁' } : { h: '+r₋₁·Bh₋₁', b: '+r₋₁·Bb₋₁', g: '−r₋₁·B₋₁', cb: '+r₋₁·Bcb₋₁' },
        { h: S.intBh, b: S.intBb, g: -S.govInt, cb: S.intBcb, w: cap ? -S.intBw : 0 }, cap ? 's: the risk premium of a member above 110 % of debt, not paid on the central bank’s holdings' : ''));
    if (cap) flows[flows.length - 1].val.w = S.intBw, flows[flows.length - 1].sym.w = '+(r₋₁+s)·Bw₋₁';
    if (cap) flows.push(row('Banks’ spread income passed to households', { h: '+s·Bb₋₁', b: '−s·Bb₋₁' }, { h: S.spreadBb, b: -S.spreadBb }));
    flows.push(row('Central-bank profits to governments', { g: '+Fcb', cb: '−Fcb' }, { g: S.Fcb, cb: -S.Fcb }));
    if (cap) flows.push(row('Interest on foreign bills', { h: '+r_w·xr·Bf₋₁', w: '−r_w·xr·Bf₋₁' }, { h: S.intBf, w: -S.intBf }));
    flows.push({ block: 'Flow of funds (changes in stocks)' },
      row('Cash', { h: '−ΔH', cb: '+ΔH' }, { h: -S.dH, cb: S.dH }),
      row('Deposits', { h: '−ΔM', b: '+ΔM' }, { h: -S.dM, b: S.dM }),
      row('Loans', { fk: '+ΔL', b: '−ΔL' }, { fk: S.dL, b: -S.dL }),
      row('Central-bank advances', { b: '+ΔA', cb: '−ΔA' }, { b: S.dA, cb: -S.dA }),
      row('Government bills', cap ? { h: '−ΔBh', b: '−ΔBb', g: '+ΔB', cb: '−ΔBcb', w: '−ΔBw' } : { h: '−ΔBh', b: '−ΔBb', g: '+ΔB', cb: '−ΔBcb' }, { h: -S.dBh, b: -S.dBb, g: S.dB, cb: -S.dBcb, w: -S.dBw }));
    if (cap) flows.push(row('Foreign bills', { h: '−xr·ΔBf', w: '+xr·ΔBf' }, { h: -S.dBf, w: S.dBf }));
    flows.push(row('Foreign reserves', { cb: '−xr·ΔR', w: '+xr·ΔR' }, { cb: -dR, w: dR }));

    var NWcb = u.NWcb || 0;
    var stocks = [
      row('Cash', { h: '+H', cb: '−H' }, { h: S.H, cb: -S.H }),
      row('Deposits', { h: '+M', b: '−M' }, { h: S.M, b: -S.M }),
      row('Loans', { f: '−L', b: '+L' }, { f: -S.L, b: S.L }),
      row('Central-bank advances', { b: '−A', cb: '+A' }, { b: -S.A, cb: S.A }),
      row('Government bills', cap ? { h: '+Bh', b: '+Bb', g: '−B', cb: '+Bcb', w: '+Bw' } : { h: '+Bh', b: '+Bb', g: '−B', cb: '+Bcb' }, { h: S.Bh, b: S.Bb, g: -S.B, cb: S.Bcb, w: S.Bw })
    ];
    if (cap) stocks.push(row('Foreign bills', { h: '+xr·Bf', w: '−xr·Bf' }, { h: S.Bf, w: -S.Bf }));
    stocks.push(
      row('Foreign reserves', { cb: '+xr·R', w: '−xr·R' }, { cb: xr * R, w: -xr * R }),
      row('Capital', { f: '+K' }, { f: S.K }, 'the only real asset: the Σ column is not zero here'),
      { sum: true, label: 'Net worth', sym: { h: '+V', f: 'K − L = 0', b: '0', g: '−B', cb: 'NWcb', w: cap ? 'Bw − xr·(Bf + R)' : '−xr·R' }, val: {}, note: 'NWcb: the central bank’s valuation gains on its reserves when the exchange rate moves' });
    /* sums */
    flows.forEach(function (r) { if (r.block) return; r.sum = SECTORS.reduce(function (a, k) { return a + (r.val[k] || 0); }, 0); });
    stocks.forEach(function (r) { if (!r.sum) r.sumRow = SECTORS_BS.reduce(function (a, k) { return a + (r.val[k] || 0); }, 0); });
    var colF = {}; SECTORS.forEach(function (k) { colF[k] = flows.reduce(function (a, r) { return a + (r.block ? 0 : (r.val[k] || 0)); }, 0); });
    var colS = {}; SECTORS_BS.forEach(function (k) { colS[k] = stocks.filter(function (r) { return !r.sum; }).reduce(function (a, r) { return a + (r.val[k] || 0); }, 0); });
    /* the net-worth row is each column's sum (assets − liabilities); checks: households' V, governments' −B */
    var nw = stocks[stocks.length - 1]; SECTORS_BS.forEach(function (k) { nw.val[k] = colS[k]; }); nw.sumRow = SECTORS_BS.reduce(function (a, k) { return a + colS[k]; }, 0);
    var checks = { V: Math.abs(colS.h - S.V), B: Math.abs(colS.g + S.B), K: Math.abs(nw.sumRow - S.K) };
    return { flows: flows, stocks: stocks, colFlows: colF, colStocks: colS, checks: checks, Y: S.Y, xr: xr, xr1: xr1, NWcb: NWcb, reval: (xr - xr1) * (R1 || 0) };
  }
  return { accounts: accounts, SECTORS: SECTORS, SECTORS_BS: SECTORS_BS };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = OPENMU_ACCOUNTS;
