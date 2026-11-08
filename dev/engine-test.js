/* OPEN-MU engine tests — node dev/engine-test.js (exit 1 on failure)
   The generic suite runs twice: firms:false (v1.0 behaviour, bit-for-bit) and firms:true (v1.1, the default).
   Then the v1.1-specific checks (regression, rate channel, reversibility, boundedness, multipliers vs v1.0). */
const OPENMU = require('../macroscope/engine.js');
let failed = 0;
function must(cond, msg) { console.log((cond ? 'ok   - ' : 'FAIL - ') + msg); if (!cond) failed++; }
const f = (v, d) => (v >= 0 ? '+' : '') + v.toFixed(d === undefined ? 3 : d);
const IDS = OPENMU.defaultParams().countries.map(c => c.id);
function rng(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; }
function randomInputs(rnd, years, rateAmp, cap, eco) {
  const policies = {}; IDS.forEach(id => { policies[id] = []; for (let t = 0; t < years; t++) policies[id].push({ pubdem: (rnd() * 2 - 1) * 10, benefits: (rnd() * 2 - 1) * 10, inctax: (rnd() * 2 - 1) * 10, vat: (rnd() * 2 - 1) * 10 }); });
  const shocks = []; for (let t = 0; t < years; t++) shocks.push({ world: (rnd() * 2 - 1) * 10, rate: (rnd() * 2 - 1) * (rateAmp || 2), confidence: (rnd() * 2 - 1) * 5, imports: (rnd() * 2 - 1) * 10, deval: rnd() < 0.15 ? 10 : 0 });
  if (cap) shocks.forEach(sh => { sh.regime = rnd() < 0.4 ? 'float' : 'fixed'; sh.flows = (rnd() * 2 - 1) * 15; sh.worldRate = (rnd() * 2 - 1) * 1; sh.backstop = rnd() >= 0.15; });
  if (eco) { IDS.forEach(id => policies[id].forEach(y => { y.ctax = rnd() < 0.3 ? rnd() * 10 : 0; y.green = rnd() < 0.3 ? rnd() * 10 : 0; })); shocks.forEach(sh => { sh.worldEmissions = (rnd() * 2 - 1) * 30; sh.disaster = rnd() < 0.1 ? 3 : 0; }); }   // the two eco levers are one-sided (0–10): drawn a third of the time so that 40-year random runs stay in a sane range
  return { policies, shocks };
}

/* v1.0 reference numbers (engine v1.0, FRA +10 % on one lever, year 1) */
const V10 = {
  pubdem: { gdp: 2.4748708683082654, unemp: -0.9899483473233062, infl: 0.7424612604924796, pubbal: -1.1310636966862992, tradebal: -0.7032801471277355, deu: 0.14546952197493912 },
  benefits: { gdp: 1.2655589667462497, unemp: -0.5062235866984999, infl: 0.3796676900238749, pubbal: -0.9556053734399512, tradebal: -0.3639266125036717 },
  inctax: { gdp: -2.473035452391248, unemp: 0.9892141809564992, infl: -0.7419106357173744, pubbal: 1.9389365487054122, tradebal: 0.7384121412913991 },
  vat: { gdp: -0.8870681511520706, unemp: 0.35482726046082824, infl: 0.33387955465437935, pubbal: 0.4191587755529642, tradebal: 0.26062727165925115 }
};

/* ======================================================================
   Generic suite, parametrised by the base params
   ====================================================================== */
function suite(base, label) {
  const P = (extra) => Object.assign({}, base, extra || {});
  console.log('\n===== ' + label + ' =====');
  const ref = OPENMU.calibrate(P());
  const firms = !!ref.params.firms, cap = !!ref.params.capital;

  /* calibration */
  must(IDS.every(id => ref.countries[id].xR > 0), 'calibration: exports to the RoW positive for every member (' + IDS.map(id => id + ' ' + (ref.countries[id].xR / ref.countries[id].Y * 100).toFixed(1) + '%').join(', ') + ')');
  must(IDS.every(id => Math.abs(ref.countries[id].PB) < 1e-9 && Math.abs(ref.countries[id].TB) < 1e-9), 'calibration: budget and trade balanced at the reference in every member');
  must(IDS.every(id => ref.countries[id].Bcb > 0 && ref.countries[id].theta > 0 && ref.countries[id].theta < 1), 'calibration: CB holdings positive, income-tax rate in (0,1) (θ* = ' + ref.countries.FRA.theta.toFixed(4) + ')');
  {
    let H = 0, BcbA = 0; IDS.forEach(id => { H += ref.countries[id].H; BcbA += ref.countries[id].Bcb + (ref.countries[id].A || 0); });
    must(Math.abs(H - BcbA - ref.union.xr0 * ref.union.R0) < 1e-9, 'calibration: Σ H = Σ (Bcb + A) + xr·R0 at the reference');
  }
  if (firms) {
    const c = ref.countries.FRA;
    must(Math.abs(c.L - c.K) < 1e-12 && Math.abs(c.I - ref.params.delta * c.K) < 1e-12, 'calibration v1.1: loans = capital, investment = depreciation (I* = ' + (100 * c.I / c.Y).toFixed(1) + ' % of GDP)');
    must(IDS.every(id => Math.abs(ref.countries[id].L + ref.countries[id].Bb - ref.countries[id].M - ref.countries[id].A) < 1e-9), 'calibration v1.1: bank balance sheet L + Bb = M + A in every member');
    const ratios = { deposits: c.M / c.Y, loans: c.L / c.Y, debt: c.B / c.Y, bills: (c.Bh + (cap ? c.Bf : 0)) / c.V, wealth: c.V / c.Y };   // v1.3: domestic + foreign bills
    must(ratios.deposits >= 0.8 && ratios.deposits <= 1.0 && Math.abs(ratios.loans - 1) < 1e-9 && ratios.debt >= 1.0 && ratios.debt <= 1.1 && Math.abs(ratios.bills - 0.48) < 0.01,
      'calibration v1.1: deposits ' + (100 * ratios.deposits).toFixed(0) + ' % of GDP, loans ' + (100 * ratios.loans).toFixed(0) + ' %, public debt ' + (100 * ratios.debt).toFixed(0) + ' %, bills' + (cap ? ' (incl. foreign ' + (100 * c.Bf / c.V).toFixed(0) + ' %)' : '') + ' ' + (100 * ratios.bills).toFixed(0) + ' % of wealth, wealth ' + (100 * ratios.wealth).toFixed(0) + ' % of GDP');
  }

  /* stationarity */
  {
    const run = OPENMU.simulate({ params: P(), years: 60 });
    let maxRel = 0;
    const keys = ['Y', 'C', 'CE', 'G', 'TR', 'T', 'YD', 'V', 'Bh', 'H', 'B', 'Bcb', 'X', 'IMV'].concat(firms ? ['I', 'K', 'L', 'M', 'A'] : []).concat(cap ? ['Bf', 'Bw'] : []);
    run.years.forEach(y => IDS.forEach(id => keys.forEach(k => {
      const a = y.countries[id][k], b = ref.countries[id][k === 'YD' ? 'CE' : k];
      maxRel = Math.max(maxRel, Math.abs(a - b) / Math.max(1e-9, Math.abs(b)));
    })));
    run.years.forEach(y => { maxRel = Math.max(maxRel, Math.abs(y.union.R - ref.union.R0) / ref.union.R0, Math.abs(y.union.xr - 1)); });
    must(maxRel < 1e-9, 'stationarity: no levers, no shocks → reference state kept for 60 years (max relative deviation ' + maxRel.toExponential(2) + ')');
    must(run.years.every(y => Math.abs(y.countries.FRA.u - 7) < 1e-9 && Math.abs(y.countries.FRA.pi - 2) < 1e-9), 'stationarity: thermometers at u* = 7 and π* = 2');
  }

  /* identities under random levers and shocks, 20 seeds × 40 years */
  {
    let maxSector = 0, maxBank = 0, maxCB = 0, maxDebt = 0, maxRes = 0, maxTBCA = 0, maxUnion = 0, maxIter = 0;
    for (let seedN = 1; seedN <= 20; seedN++) {
      const years = 40;
      const { policies, shocks } = randomInputs(rng(1000 + seedN), years, undefined, cap, !!ref.params.eco);
      const run = OPENMU.simulate({ params: P(), years, policies, shocks });
      let prevB = {}, prevR = ref.union.R0; IDS.forEach(id => { prevB[id] = ref.countries[id].B; });
      run.years.forEach(y => {
        let sumBal = 0;
        IDS.forEach(id => {
          const c = y.countries[id];
          const bal = (c.YD - c.CE) + (c.AF - c.I) + c.PB;                           // (1) sector balances: households + firms + government = trade balance (+ primary income in v1.3)
          maxSector = Math.max(maxSector, Math.abs(bal - (cap ? c.CAi : c.TB)) / c.Y);
          sumBal += bal;
          maxBank = Math.max(maxBank, Math.abs(c.L + c.Bb - c.M - c.A) / c.Y);          // (2) bank balance sheet
          maxDebt = Math.max(maxDebt, Math.abs((c.B - prevB[id]) + c.PB) / c.Y);        // ΔB = −PB
          prevB[id] = c.B;
        });
        maxCB = Math.max(maxCB, y.union.identityError);                                  // (3) Σ H = Σ (Bcb + A) + xr·R − NWcb
        maxUnion = Math.max(maxUnion, Math.abs(sumBal - (cap ? y.union.CAp : y.union.CA)) / y.union.Y);        // (4) Σ balances = CA (CA' in v1.3)
        maxTBCA = Math.max(maxTBCA, Math.abs(y.union.sumTB - y.union.CA) / y.union.Y);
        if (cap) {
          const dR = y.union.regime === 'float' ? 0 : (y.union.CAp + y.union.KA) / y.union.xr;   // fixed: reserves absorb; float: frozen
          maxRes = Math.max(maxRes, Math.abs(y.union.R - prevR - dR) / ref.union.R0, y.union.regime === 'float' ? Math.abs(y.union.CAp + y.union.KA) / y.union.Y : 0, y.union.sectorError);
        } else maxRes = Math.max(maxRes, Math.abs(y.union.R - prevR - y.union.CA / y.union.xr) / ref.union.R0);
        prevR = y.union.R;
      });
      maxIter = Math.max(maxIter, run.checks.maxIterations);
    }
    must(maxSector < 1e-10, 'identities: (YD − CE) + (AF − I) + PB = TB, every country, every year, 20 seeds (max ' + maxSector.toExponential(2) + ')');
    must(maxBank < 1e-10, 'identities: bank balance sheet L + Bb = M + A (max ' + maxBank.toExponential(2) + ')');
    must(maxCB < 1e-10, 'identities: CB balance sheet Σ H = Σ (Bcb + A) + xr·R − NWcb, incl. devaluations (max ' + maxCB.toExponential(2) + ')');
    must(maxUnion < 1e-10, 'identities: Σ sector balances = union current account (max ' + maxUnion.toExponential(2) + ')');
    must(maxDebt < 1e-10 && maxTBCA < 1e-10 && maxRes < 1e-9, 'identities: ΔB = −PB, Σ TB = CA, ΔR = CA/xr' + (cap ? ' (v1.3: ΔR = (CA′ + KA)/xr fixed, BoP = 0 float, wealth = assets)' : '') + ' (max ' + Math.max(maxDebt, maxTBCA, maxRes).toExponential(2) + ')');
    must(maxIter < 100, 'convergence under random inputs: at most ' + maxIter + ' iterations per year');
  }

  /* multiplier: FRA pubdem +10 alone */
  {
    const rep = OPENMU.report({ params: P(), years: 3, policies: { FRA: [{ pubdem: 10 }, { pubdem: 10 }, { pubdem: 10 }] } });
    const y1 = rep.years[0].countries;
    must(y1.FRA.gdp > 1.5 && y1.FRA.gdp < 4, 'multiplier: FRA public demand +10 % (= G +2 pt of GDP) → FRA GDP ' + f(y1.FRA.gdp, 2) + ' % in year 1 (in [1.5, 4])');
    must(y1.FRA.tradebal < 0 && y1.FRA.pubbal < 0, 'multiplier: FRA trade balance ' + f(y1.FRA.tradebal, 2) + ' pt, public balance ' + f(y1.FRA.pubbal, 2) + ' pt (both negative)');
    must(IDS.filter(id => id !== 'FRA').every(id => y1[id].gdp > 0), 'multiplier: every other member gains GDP through trade (DEU ' + f(y1.DEU.gdp, 3) + ' %, BEL ' + f(y1.BEL.gdp, 3) + ' %)');
    must(IDS.filter(id => id !== 'FRA').every(id => Math.abs(y1[id].detail.gdp.nat) < 1e-12 && Math.abs(y1[id].detail.gdp.foreign - y1[id].gdp) < 1e-12), 'multiplier: for the others the whole effect is "foreign policies"');
  }

  /* devaluation 10 %, no policy */
  {
    const years = 4;
    const run = OPENMU.simulate({ params: P(), years, shocks: [{ deval: 10 }] });
    const base = OPENMU.simulate({ params: P(), years });
    const ca = run.years.map(y => y.union.CA - base.years[0].union.CA);
    must(ca[0] < 0, 'devaluation: union current account worse in year 1 (' + f(ca[0] / run.years[0].union.Y * 100, 3) + ' % of GDP) — J-curve');
    must(ca[1] > 0 && ca[2] > 0, 'devaluation: current account better from year 2 (' + f(ca[1] / run.years[1].union.Y * 100, 3) + ' %, ' + f(ca[2] / run.years[2].union.Y * 100, 3) + ' % of GDP)');
    const p = ref.params;
    const fra = run.years[0].countries.FRA;
    must(Math.abs(fra.pi - p.pistar - p.kappa * fra.gap - 1.5) < 1e-9, 'devaluation: inflation pass-through +1.5 pt in that year, none the year after');
  }

  /* report additivity */
  {
    const policies = { FRA: [{ pubdem: 10, vat: -5 }, { pubdem: 5 }], DEU: [{ inctax: -10 }, { benefits: 10 }] };
    const shocks = [{ world: -5, rate: 1 }, { deval: 10, confidence: -3 }];
    const rep = OPENMU.report({ params: P(), years: 2, policies, shocks });
    let maxErr = 0, natZero = true;
    rep.years.forEach(y => IDS.forEach(id => OPENMU.INDICATORS.forEach(k => {
      const d = y.countries[id].detail[k];
      maxErr = Math.max(maxErr, Math.abs(d.shock + d.nat + d.foreign - y.countries[id][k]));
      if (!policies[id] && Math.abs(d.nat) > 1e-12) natZero = false;
    })));
    must(maxErr < 1e-9, 'report: shock + nat + foreign = total for every indicator (max error ' + maxErr.toExponential(2) + ')');
    must(natZero, 'report: "own policy" is zero for countries without a policy');
    const ex = rep.years[0].countries.FRA.detail.extra;
    must(['gap', 'debt', 'wealth', 'inv', 'loans', 'deposits'].every(k => typeof ex[k] === 'number' && isFinite(ex[k])), 'report: extras present (gap, debt, wealth, inv, loans, deposits)');
    must(typeof rep.years[0].union.R === 'number' && typeof rep.years[0].union.alert === 'boolean', 'report: union panel present (R, alert, xr, months)');
  }

  /* reserves alert reachability (info) */
  {
    const years = 12;
    const pol = {}; IDS.forEach(id => { pol[id] = []; for (let t = 0; t < years; t++) pol[id].push({ pubdem: 10, benefits: 10 }); });
    const run = OPENMU.simulate({ params: P(), years, policies: pol });
    const firstAlert = run.years.findIndex(y => y.union.alert);
    console.log('info - generalised stimulus (G +10 %, TR +10 % everywhere): reserves ' + run.years.map(y => (100 * y.union.R / y.union.R0).toFixed(0) + '%').join(' ') + (firstAlert >= 0 ? ' → alert in year ' + (firstAlert + 1) : ' → no alert within ' + years + ' years'));
  }
}

suite({ firms: false }, 'v1.0 path (firms: false)');
suite({ firms: true }, 'v1.1 path (firms: true, default)');
suite({ firms: true, prices: true }, 'v1.2 path (firms: true, prices: true)');
suite({ firms: true, prices: true, capital: true }, 'v1.3 path (capital flows, regimes, market pressure)');
suite({ firms: true, prices: true, capital: true, eco: true, ci0: 0 }, 'v2.0 path with emissions switched off (ci0 = 0: stationarity, identities with the carbon-tax and green levers active)');

/* ======================================================================
   v1.1-specific checks
   ====================================================================== */
console.log('\n===== v1.1 specifics =====');
must(OPENMU.VERSION === '2.0' && OPENMU.defaultParams().firms === true && OPENMU.defaultParams().prices === false && OPENMU.defaultParams().capital === false && OPENMU.defaultParams().eco === false, 'version 2.0; defaultParams() = v1.1 parameters (firms on, prices off, eco off)');

/* (a) regression of the v1.0 path */
{
  const rep = OPENMU.report({ params: { firms: false }, years: 1, policies: { FRA: [{ pubdem: 10 }] } });
  const c = rep.years[0].countries.FRA, d = rep.years[0].countries.DEU;
  const err = Math.max(Math.abs(c.gdp - V10.pubdem.gdp), Math.abs(c.unemp - V10.pubdem.unemp), Math.abs(c.pubbal - V10.pubdem.pubbal), Math.abs(c.tradebal - V10.pubdem.tradebal), Math.abs(d.gdp - V10.pubdem.deu));
  must(err < 1e-6, 'regression: firms:false reproduces the v1.0 FRA pubdem +10 effects (max |diff| ' + err.toExponential(1) + ')');
  must(Math.abs(OPENMU.defaultParams(false).alpha2 - 0.185) < 1e-12 && Math.abs(OPENMU.defaultParams(false).lambda0 - 0.70) < 1e-12, 'regression: defaultParams(false) carries the v1.0 values of alpha2 and lambda0');
}

/* (d) rate channel */
{
  const rep = OPENMU.report({ years: 3, shocks: [{ rate: 1 }, { rate: 1 }, { rate: 1 }] });
  const y1 = rep.years[0].countries, y2 = rep.years[1].countries;
  must(Math.abs(y1.FRA.gdp) < 1e-9 && Math.abs(y1.FRA.pubbal) < 1e-9, 'rate +1 pt: no effect in year 1 (one-year lag on investment and on interest flows)');
  must(y2.FRA.gdp < -0.8 && y2.FRA.gdp > -2.0, 'rate +1 pt: FRA GDP ' + f(y2.FRA.gdp, 2) + ' % in year 2 (in [−2.0, −0.8])');
  must(y2.FRA.unemp > 0 && y2.FRA.pubbal < 0, 'rate +1 pt: unemployment ' + f(y2.FRA.unemp, 2) + ' pt, public balance ' + f(y2.FRA.pubbal, 2) + ' pt (debt service) in year 2');
  must(Math.abs(y2.FRA.detail.extra.inv + 12) < 1e-9, 'rate +1 pt: investment deviation ' + f(y2.FRA.detail.extra.inv, 1) + ' % (ι = 12)');
  must(IDS.every(id => y2[id].gdp < 0), 'rate +1 pt: every member\'s GDP down in year 2 (common rate; DEU ' + f(y2.DEU.gdp, 2) + ' %)');
}

/* (e) reversibility */
{
  const rep = OPENMU.report({ years: 12, shocks: [{ rate: 1 }, { rate: 1 }, { rate: 1 }] });
  const path = rep.years.map(y => y.countries.FRA.gdp);
  const after = path.slice(4);                                   // years 5..12
  const back = after.every(v => Math.abs(v) <= 0.15);
  const signs = after.map(v => Math.sign(v));
  const noOsc = signs.every(s => s === signs[0]);
  must(back, 'reversibility: rate +1 for years 1–3 then 0 → FRA GDP within ±0.15 % of the reference from year 5 to 12 (path ' + path.map(v => f(v, 2)).join(' ') + ')');
  must(noOsc, 'reversibility: no sign oscillation after year 4 (residual ' + f(after[after.length - 1], 2) + ' %: the debt accumulated during the episode slightly raises the long-run income of bill holders)');
  const inv = rep.years.map(y => y.countries.FRA.detail.extra.inv);
  must(Math.abs(inv[4]) < 1e-9 && Math.abs(inv[11]) < 1e-9, 'reversibility: investment back at its reference from year 5 (no hysteresis in I)');
}

/* (f) boundedness */
{
  let maxGap = 0, nan = false, floorOK = true, resTracked = true, maxIter = 0;
  for (let seedN = 1; seedN <= 10; seedN++) {
    const { policies, shocks } = randomInputs(rng(500 + seedN), 40, 10);   // rate shocks up to ±10 pt
    const run = OPENMU.simulate({ years: 40, policies, shocks });
    const ref = run.ref;
    run.years.forEach(y => IDS.forEach(id => {
      const c = y.countries[id];
      Object.keys(c).forEach(k => { if (typeof c[k] === 'number' && !isFinite(c[k])) nan = true; });
      maxGap = Math.max(maxGap, Math.abs(c.gap));
      if (c.I < ref.params.ifloor * ref.countries[id].I - 1e-9) floorOK = false;
    }));
    run.years.forEach(y => { if (!isFinite(y.union.R) || !isFinite(y.union.xr)) resTracked = false; });
    maxIter = Math.max(maxIter, run.checks.maxIterations);
  }
  must(!nan, 'boundedness: no NaN over 10 × 40 random years (levers ±10, rate ±10 pt, devaluations)');
  must(maxGap < 40, 'boundedness: |GDP deviation| stays below 40 % (max ' + maxGap.toFixed(1) + ' %)');
  must(floorOK, 'boundedness: investment never below its floor (ifloor × I*)');
  must(resTracked && maxIter < 100, 'boundedness: reserves and exchange rate finite, fixed point converges (max ' + maxIter + ' iterations)');
}

/* (g) fiscal multipliers at impact vs v1.0 */
{
  ['pubdem', 'benefits', 'inctax', 'vat'].forEach(l => {
    const x = OPENMU.report({ years: 1, policies: { FRA: [{ [l]: 10 }] } }).years[0].countries.FRA;
    const rel = Math.abs(x.gdp / V10[l].gdp - 1);
    const tol = l === 'vat' ? 0.20 : 0.10;   // vat: consumption is a smaller share of GDP once investment takes 10 % of it → ≈ 15 % weaker, documented in the spec
    must(rel <= tol, 'multipliers vs v1.0: ' + l + ' +10 % → GDP ' + f(x.gdp, 3) + ' % (v1.0 ' + f(V10[l].gdp, 3) + ' %, ' + (100 * rel).toFixed(1) + ' % apart, tolerance ' + (100 * tol) + ' %)');
  });
}

/* (h) report additivity with firms and a rate shock */
{
  const rep = OPENMU.report({ years: 3, policies: { FRA: [{ pubdem: 10 }, { vat: 5 }, {}], ITA: [{ benefits: 10 }, {}, { inctax: -10 }] }, shocks: [{ rate: 1 }, { rate: 1, world: -5 }, { deval: 10 }] });
  let maxErr = 0;
  rep.years.forEach(y => IDS.forEach(id => OPENMU.INDICATORS.forEach(k => { const d = y.countries[id].detail[k]; maxErr = Math.max(maxErr, Math.abs(d.shock + d.nat + d.foreign - y.countries[id][k])); })));
  must(maxErr < 1e-9, 'report v1.1: decomposition additive with a rate shock, policies and a devaluation (max error ' + maxErr.toExponential(2) + ')');
  must(rep.years[1].countries.DEU.detail.gdp.shock < 0 && Math.abs(rep.years[1].countries.DEU.detail.gdp.nat) < 1e-12, 'report v1.1: for Germany (no policy) the rate shock is in the "shocks" line only');
  const d = OPENMU.describe();
  must(d.version === '2.0' && d.firms && d.countries.FRA.loansRatio > 0.99 && d.countries.FRA.depositsRatio > 0.8, 'describe(): mentions firms/banks, loans and deposits ratios');
}

/* orders of magnitude for the slides (v1.1) */
{
  const levers = ['pubdem', 'benefits', 'inctax', 'vat'];
  console.log('\nv1.1 — effect of each lever at +10 % in France alone (deviations from the reference; GDP in %, others in points):');
  console.log('lever      | yr | FRA gdp  unemp   infl  pubbal tradebal | DEU gdp');
  levers.forEach(l => {
    const pol = { FRA: [{ [l]: 10 }, { [l]: 10 }, { [l]: 10 }] };
    const rep = OPENMU.report({ years: 3, policies: pol });
    [0, 2].forEach(t => {
      const c = rep.years[t].countries.FRA, d = rep.years[t].countries.DEU;
      console.log(l.padEnd(10) + ' | ' + (t + 1) + '  | ' + [c.gdp, c.unemp, c.infl, c.pubbal, c.tradebal].map(v => f(v, 2).padStart(6)).join(' ') + ' | ' + f(d.gdp, 3));
    });
  });
  const sh = [['world', 10], ['rate', 1], ['confidence', 5], ['imports', 10], ['deval', 10]];
  console.log('\nv1.1 — effect of each administrator shock (years 1, 2 and 3, FRA; GDP %, others pt; investment % of ref.; union CA in % of union GDP):');
  sh.forEach(([k, v]) => {
    const rep = OPENMU.report({ years: 3, shocks: [{ [k]: v }, { [k]: k === 'deval' ? 0 : v }, { [k]: k === 'deval' ? 0 : v }] });
    [0, 1, 2].forEach(t => {
      const c = rep.years[t].countries.FRA, u = rep.years[t].union;
      console.log((k + ' ' + (v > 0 ? '+' : '') + v).padEnd(14) + ' | ' + (t + 1) + '  | ' + [c.gdp, c.unemp, c.infl, c.pubbal, c.tradebal].map(x => f(x, 2).padStart(6)).join(' ') + ' | inv ' + f(c.detail.extra.inv, 1).padStart(6) + ' | CA ' + f(100 * u.CA / u.Y, 2) + ' | R ' + (100 * u.R / u.R0).toFixed(1) + '%');
    });
  });
}

/* ======================================================================
   v1.2-specific checks: price levels in trade, reserves 1.5 months
   ====================================================================== */
console.log('\n===== v1.2 specifics =====');
{
  /* regression: the v1.1 parameters (prices off) reproduce the engine 1.1 numbers bit for bit (reference taken from engine 1.1, FRA pubdem +10 for 3 years, shocks world −5 / deval 10 + rate 1 / imports 5) */
  const V11 = { y1: { gdp: 1.2916057163136596, unemp: -0.5166422865254638, infl: 0.3874817148940979, pubbal: -1.4938638677796903, tradebal: -1.2807046404669502, deu: -1.0536500992480602, R: 10.332052357395805, CA: -2.3054476426041965 },
    y3: { gdp: 1.0989923628037301, unemp: -0.43959694512149206, infl: 0.32969770884111904, pubbal: -2.1786806687950353, tradebal: -0.6898620582406305, deu: -1.111410676852742, R: 8.742831298723207, CA: -0.20195932927873717 } };
  const rep = OPENMU.report({ params: OPENMU.paramsFor('v1.1'), years: 3, policies: { FRA: [{ pubdem: 10 }, { pubdem: 10 }, { pubdem: 10 }] }, shocks: [{ world: -5 }, { deval: 10, rate: 1 }, { imports: 5 }] });
  let err = 0;
  [[0, 'y1'], [2, 'y3']].forEach(([t, k]) => { const c = rep.years[t].countries.FRA, d = rep.years[t].countries.DEU, u = rep.years[t].union;
    ['gdp', 'unemp', 'infl', 'pubbal', 'tradebal'].forEach(q => { err = Math.max(err, Math.abs(c[q] - V11[k][q])); }); err = Math.max(err, Math.abs(d.gdp - V11[k].deu), Math.abs(u.R - V11[k].R), Math.abs(u.CA - V11[k].CA)); });
  must(err < 1e-9, 'regression: paramsFor(\'v1.1\') reproduces engine 1.1 bit for bit (max |diff| ' + err.toExponential(1) + ')');
  const p12 = OPENMU.paramsFor('v1.2');
  must(p12.prices === true && p12.reserveMonths === 1.5 && p12.epsU === 0.7 && OPENMU.paramsFor('v1.1').reserveMonths === 3, 'paramsFor(\'v1.2\'): prices on, reserves 1.5 months, intra-union elasticity 0.7');

  /* France alone, pubdem +10 for 5 years: competitiveness erodes, the trade balance keeps deteriorating, the GDP gain shrinks */
  const fr = OPENMU.report({ params: p12, years: 5, policies: { FRA: [1, 2, 3, 4, 5].map(() => ({ pubdem: 10 })) } });
  const tb = fr.years.map(y => y.countries.FRA.tradebal), gdp = fr.years.map(y => y.countries.FRA.gdp), pi = fr.years.map(y => y.countries.FRA.infl), comp = fr.years.map(y => y.countries.FRA.detail.extra.compet);
  must(tb[4] < tb[0] - 0.2 && gdp[4] < gdp[0] - 0.2 && comp[4] > comp[0] + 1, 'v1.2 France pubdem +10 for 5 years: trade balance worsens (' + f(tb[0], 2) + ' → ' + f(tb[4], 2) + '), GDP gain shrinks (' + f(gdp[0], 2) + ' → ' + f(gdp[4], 2) + '), price level vs union ' + f(comp[4], 2) + ' %');
  console.log('   France alone pubdem +10, years 1–5: GDP ' + gdp.map(v => f(v, 2)).join(' / ') + ' | TB ' + tb.map(v => f(v, 2)).join(' / ') + ' | infl ' + pi.map(v => f(v, 2)).join(' / ') + ' | compet ' + comp.map(v => f(v, 2)).join(' / '));
  /* the same in v1.1 for comparison */
  const fr11 = OPENMU.report({ params: OPENMU.paramsFor('v1.1'), years: 5, policies: { FRA: [1, 2, 3, 4, 5].map(() => ({ pubdem: 10 })) } });
  console.log('   (v1.1 for comparison)          GDP ' + fr11.years.map(y => f(y.countries.FRA.gdp, 2)).join(' / ') + ' | TB ' + fr11.years.map(y => f(y.countries.FRA.tradebal, 2)).join(' / '));

  /* union-wide stimulus: no intra-union reallocation (equal relative prices), RoW balance worsens */
  const all = {}; IDS.forEach(id => { all[id] = [1, 2, 3].map(() => ({ pubdem: 5 })); });
  const un = OPENMU.report({ params: p12, years: 3, policies: all });
  const compSpread = Math.max(...un.years.map(y => Math.max(...IDS.map(id => Math.abs(y.countries[id].detail.extra.compet)))));
  must(compSpread < 0.05 && un.years[2].union.CA < un.years[0].union.CA, 'v1.2 union-wide pubdem +5: members keep equal price levels (max gap ' + compSpread.toFixed(3) + ' %), the RoW current account worsens over time');
  console.log('   union-wide pubdem +5, CA years 1–3: ' + un.years.map(y => f(y.union.CA, 2)).join(' / ') + ' | R % of R0: ' + un.years.map(y => (100 * y.union.R / y.union.R0).toFixed(0)).join(' / '));

  /* reserves: world −10 % → alert at the end of year 1, exhausted in year 2 */
  const w = OPENMU.report({ params: p12, years: 3, shocks: [{ world: -10 }, { world: -10 }, { world: -10 }] });
  must(100 * w.years[0].union.R / w.years[0].union.R0 < 40 && w.years[1].union.R <= 0, 'v1.2 world −10 %, no reaction: ~37 % left after year 1, reserves exhausted in year 2');
  const w5 = OPENMU.report({ params: p12, years: 3, shocks: [{ world: -5 }, { world: -5 }, { world: -5 }] });
  must(!w5.years[1].union.alert && w5.years[2].union.alert && w5.years[2].union.R > 0, 'v1.2 world −5 %, no reaction: alert at the end of year 3 (' + w5.years.map(y => (100 * y.union.R / y.union.R0).toFixed(0)).join(' / ') + ' % left)');
  console.log('   world −10 %, R % of R0 years 1–3: ' + w.years.map(y => (100 * y.union.R / y.union.R0).toFixed(0)).join(' / '));
  const dv = OPENMU.report({ params: p12, years: 3, shocks: [{ deval: 10 }, {}, {}] });
  must(dv.years[0].union.CA < 0 && dv.years[1].union.CA > 0, 'v1.2 devaluation 10 %: J-curve (CA worse in year 1, better from year 2)');
  console.log('   devaluation 10 %, CA years 1–3: ' + dv.years.map(y => f(y.union.CA, 2)).join(' / ') + ' | FRA infl ' + dv.years.map(y => f(y.countries.FRA.infl, 2)).join(' / '));
  /* reversibility: after 3 years of stimulus and 20 years at the reference, France converges back (price gap included) */
  const rv = OPENMU.simulate({ params: p12, years: 23, policies: { FRA: [{ pubdem: 10 }, { pubdem: 10 }, { pubdem: 10 }] } });
  const last = rv.years[22].countries.FRA, rc = rv.ref.countries.FRA;
  must(Math.abs(last.Y / rc.Y - 1) < 0.01 && Math.abs(last.compet) < 3, 'v1.2 reversibility: 20 years after a 3-year stimulus, France’s GDP within 1 % of the reference (' + f(100 * (last.Y / rc.Y - 1), 2) + ' %), price gap ' + f(last.compet, 2) + ' %');
}

/* ======================================================================
   v1.3-specific checks: capital flows, exchange-rate regimes, market pressure (spec section 9)
   ====================================================================== */
console.log('\n===== v1.3 specifics =====');
{
  const p13 = OPENMU.paramsFor('v1.3'), p12 = OPENMU.paramsFor('v1.2');
  must(p13.capital === true && p13.prices === true && p13.reserveMonths === 3 && p13.bwShare === 0.15 && OPENMU.paramsFor('v1.2').capital === false && OPENMU.paramsFor('v1.2').reserveMonths === 1.5, 'paramsFor(\'v1.3\'): capital on, prices on, reserves back to 3 months, cross-holdings 15 % of GDP (v1.2 keeps 1.5 months)');
  /* regression: v1.2 numbers unchanged by the v1.3 code (capital off) — compared with the engine 1.2 reference run below */
  {
    /* reference taken from engine 1.2 (FRA pubdem +10 for 3 years, shocks world −5 / deval 10 + rate 1 / imports 5) */
    const V12 = { gdp: [1.2916057163136596, 1.5154346512313621, 0.1378484178553574], tb: [-1.2807046404669502, -1.1783554728463728, -1.2146814933629075], R: [4.0133023573958075, 2.676263618319215, 1.7833127359118912], deu: [-0.31609502977442805, 1.4421300283595606, -0.4227750567117339] };
    const rep = OPENMU.report({ params: p12, years: 3, policies: { FRA: [{ pubdem: 10 }, { pubdem: 10 }, { pubdem: 10 }] }, shocks: [{ world: -5 }, { deval: 10, rate: 1 }, { imports: 5 }] });
    let err = 0; rep.years.forEach((y, t) => { err = Math.max(err, Math.abs(y.countries.FRA.gdp - V12.gdp[t]), Math.abs(y.countries.FRA.tradebal - V12.tb[t]), Math.abs(y.union.R - V12.R[t]), Math.abs(y.countries.DEU.infl - V12.deu[t])); });
    must(err < 1e-9, 'regression: paramsFor(\'v1.2\') reproduces engine 1.2 bit for bit (max |diff| ' + err.toExponential(1) + ')');
  }
  const Z = () => ({});
  const F = (o) => Object.assign({ regime: 'float' }, o || {});
  /* float: a rate rise appreciates the currency (3–5 % on impact), lowers GDP next year and import-price inflation at once */
  {
    const run = OPENMU.report({ params: p13, years: 3, shocks: [F({ rate: 0.5 }), F({ rate: 0.5 }), F({ rate: 0.5 })] });
    const xr = run.years.map(y => y.union.xr), gdp = run.years.map(y => y.union.gdp), pi = run.years.map(y => y.countries.FRA.infl);
    must(xr[0] < 0.97 && xr[0] > 0.95, 'v1.3 float, rate +0.5 pt: appreciation on impact ' + ((1 - xr[0]) * 100).toFixed(1) + ' % (target 3–5 %)');
    must(gdp[1] < gdp[0] - 0.3 && pi[0] < 0, 'v1.3 float, rate +0.5 pt: GDP lower in year 2 (' + f(gdp[1], 2) + ' vs ' + f(gdp[0], 2) + '), inflation lower at once (' + f(pi[0], 2) + ' pt)');
    console.log('   float rate +0.5, years 1–3: xr ' + xr.map(v => v.toFixed(3)).join(' / ') + ' | union GDP ' + gdp.map(v => f(v, 2)).join(' / ') + ' | FRA infl ' + pi.map(v => f(v, 2)).join(' / '));
    const cut = OPENMU.report({ params: p13, years: 2, shocks: [F({ rate: -0.5 }), F({ rate: -0.5 })] });
    must(cut.years[0].union.xr > 1.03, 'v1.3 float, rate −0.5 pt: depreciation ' + ((cut.years[0].union.xr - 1) * 100).toFixed(1) + ' %');
  }
  /* sudden stop: fixed → reserves fall; float → depreciation, inflation, then a better current account */
  {
    const fx = OPENMU.report({ params: p13, years: 3, shocks: [{ flows: -30 }, { flows: -30 }, { flows: -30 }] });
    const Rp = fx.years.map(y => 100 * y.union.R / y.union.R0);
    must(Rp[0] < 25, 'v1.3 sudden stop −30 %, fixed: reserves fall below the alert line in year 1 (' + Rp.map(v => v.toFixed(0)).join(' / ') + ' % of R0)');
    const fl = OPENMU.report({ params: p13, years: 3, shocks: [F({ flows: -30 }), F({ flows: -30 }), F({ flows: -30 })] });
    const dxr = fl.years.map(y => y.union.dxr), pi = fl.years.map(y => y.countries.FRA.infl), ca = fl.years.map(y => y.union.CA);
    must(dxr[0] > 10 && pi[0] > 1 && ca[1] > ca[0] && ca[2] > ca[0], 'v1.3 sudden stop −30 %, float: depreciation ' + dxr[0].toFixed(1) + ' %, FRA inflation +' + pi[0].toFixed(2) + ' pt, current account improves afterwards');
    console.log('   sudden stop −30 % fixed: R % of R0 ' + Rp.map(v => v.toFixed(0)).join(' / ') + ' | float: dxr ' + dxr.map(v => f(v, 1)).join(' / ') + ' %, FRA infl ' + pi.map(v => f(v, 2)).join(' / ') + ', CA ' + ca.map(v => f(v, 2)).join(' / '));
    const fx5 = OPENMU.report({ params: p13, years: 2, shocks: [{ flows: -5 }, { flows: -5 }] });
    console.log('   sudden stop −5 % fixed: R % of R0 ' + fx5.years.map(y => (100 * y.union.R / y.union.R0).toFixed(0)).join(' / ') + ' | world −5 % fixed (v1.3): ' + OPENMU.report({ params: p13, years: 3, shocks: [{ world: -5 }, { world: -5 }, { world: -5 }] }).years.map(y => (100 * y.union.R / y.union.R0).toFixed(0)).join(' / '));
  }
  /* market pressure: France stimulates for 8 years → debt passes 110 %, a spread appears, the public balance worsens more than in v1.2; without the backstop the spread is larger */
  {
    const pol = { FRA: [1, 2, 3, 4, 5, 6, 7, 8].map(() => ({ pubdem: 10, benefits: 10 })) };
    const on = OPENMU.report({ params: p13, years: 8, policies: pol });
    const off = OPENMU.report({ params: p13, years: 8, policies: pol, shocks: [1, 2, 3, 4, 5, 6, 7, 8].map(() => ({ backstop: false })) });
    const v12 = OPENMU.report({ params: p12, years: 8, policies: pol });
    const d = on.years.map(y => y.countries.FRA.detail.extra.debt), sp = on.years.map(y => y.countries.FRA.detail.extra.spread), pb = on.years.map(y => y.countries.FRA.pubbal);
    const spOff = off.years.map(y => y.countries.FRA.detail.extra.spread), pbOff = off.years.map(y => y.countries.FRA.pubbal), pb12 = v12.years.map(y => y.countries.FRA.pubbal);
    const first = d.findIndex(x => x > 110);
    must(first >= 0 && sp[7] > 0 && pb[7] < pb12[7] - 0.05, 'v1.3 market pressure: France +10/+10 for 8 years → debt > 110 % from year ' + (first + 1) + ', spread ' + sp[7].toFixed(2) + ' pt in year 8, public balance ' + f(pb[7], 2) + ' vs ' + f(pb12[7], 2) + ' in v1.2');
    must(spOff[7] > sp[7] && pbOff[7] < pb[7], 'v1.3 no backstop: larger spread (' + spOff[7].toFixed(2) + ' vs ' + sp[7].toFixed(2) + ' pt) and worse public balance (' + f(pbOff[7], 2) + ' vs ' + f(pb[7], 2) + ')');
    must(on.years.every(y => y.union.unabsorbed === 0) && off.years.every(y => y.union.unabsorbed === 0), 'v1.3 no backstop: the market clears the pressured member’s bills (no residual left to the CB)');
    console.log('   France +10/+10 ×8 (backstop on):  debt ' + d.map(v => v.toFixed(0)).join(' / ') + ' % | spread ' + sp.map(v => v.toFixed(2)).join(' / ') + ' pt | PB ' + pb.map(v => f(v, 2)).join(' / '));
    console.log('   France +10/+10 ×8 (backstop off): spread ' + spOff.map(v => v.toFixed(2)).join(' / ') + ' pt | PB ' + pbOff.map(v => f(v, 2)).join(' / ') + ' | union R % ' + off.years.map(y => (100 * y.union.R / y.union.R0).toFixed(0)).join(' / '));
    console.log('   (v1.2 for comparison)             PB ' + pb12.map(v => f(v, 2)).join(' / '));
  }
  /* regime switch mid-run: fixed → float → fixed, identities hold, R frozen while floating, parity = last float value */
  {
    const run = OPENMU.simulate({ params: p13, years: 6, shocks: [{ world: -5 }, { world: -5 }, F({ world: -5 }), F({ world: -5 }), { world: -5 }, { world: -5, deval: 5 }] });
    const R = run.years.map(y => y.union.R), xr = run.years.map(y => y.union.xr);
    must(Math.abs(R[2] - R[1]) < 1e-12 && Math.abs(R[3] - R[2]) < 1e-12 && R[4] !== R[3], 'v1.3 regime switch: reserves frozen while floating (years 3–4), moving again once fixed');
    must(xr[2] !== xr[1] && Math.abs(xr[4] - xr[3]) < 1e-12 && Math.abs(xr[5] / xr[4] - 1.05) < 1e-12, 'v1.3 regime switch: xr endogenous in years 3–4, parity = last floating value in year 5, devaluation 5 % in year 6');
    must(run.checks.maxIdentityError < 1e-10 && run.years.every(y => y.union.sectorError < 1e-9), 'v1.3 regime switch: identities hold throughout (max ' + run.checks.maxIdentityError.toExponential(1) + ')');
    console.log('   switch fixed→float→fixed, world −5 %: R ' + R.map(v => v.toFixed(2)).join(' / ') + ' | xr ' + xr.map(v => v.toFixed(3)).join(' / '));
  }
  /* float equation: the balance-of-payments excess is increasing in xr around the solution (monotone, well posed) */
  {
    const base = OPENMU.simulate({ params: p13, years: 1, shocks: [F({ flows: -20, world: -5 })] });
    const xr = base.years[0].union.xr;
    const ex = (x) => OPENMU.simulate({ params: p13, years: 1, shocks: [{ regime: 'fixed', flows: -20, world: -5, deval: 100 * (x - 1) }] }).years[0].union.excess;
    const grid = [0.8, 0.9, 1.0, 1.1, 1.2, 1.4].map(x => ex(x));
    must(grid.every((v, i) => i === 0 || v > grid[i - 1]), 'v1.3 float: the balance-of-payments excess is increasing in xr (' + grid.map(v => f(v, 1)).join(' < ') + ')');
    console.log('   float solution xr = ' + xr.toFixed(4) + ' for flows −20 %, world −5 %');
  }
}

/* ======================================================================
   v2.0-specific checks: emissions, damage, carbon tax and green investment (spec section 10)
   ====================================================================== */
console.log('\n===== v2.0 specifics =====');
{
  const p20 = OPENMU.paramsFor('v2.0'), p13 = OPENMU.paramsFor('v1.3');
  must(p20.eco === true && p20.capital === true && p20.prices === true && p13.eco === false && OPENMU.VERSION === '2.0', 'paramsFor(\'v2.0\'): eco on top of v1.3; v1.3 params unchanged (eco off)');
  /* regression: v1.3 numbers unchanged by the v2.0 code */
  {
    const F = (o) => Object.assign({ regime: 'float' }, o || {});
    const a = OPENMU.report({ params: p13, years: 4, policies: { FRA: [{ pubdem: 10 }, { pubdem: 10 }, { pubdem: 5 }, {}], DEU: [{ vat: 5 }, {}, {}, {}] }, shocks: [{ world: -5 }, F({ flows: -20 }), F({ rate: 0.5 }), { backstop: false, deval: 5 }] });
    const b = OPENMU.report({ params: Object.assign({}, p20, { eco: false }), years: 4, policies: { FRA: [{ pubdem: 10 }, { pubdem: 10 }, { pubdem: 5 }, {}], DEU: [{ vat: 5 }, {}, {}, {}] }, shocks: [{ world: -5 }, F({ flows: -20 }), F({ rate: 0.5 }), { backstop: false, deval: 5 }] });
    let err = 0; a.years.forEach((y, t) => IDS.forEach(id => OPENMU.INDICATORS.forEach(k => { err = Math.max(err, Math.abs(y.countries[id][k] - b.years[t].countries[id][k])); })));
    must(err < 1e-12, 'regression: the v1.3 path is unchanged by the v2.0 code (eco off; max |diff| ' + err.toExponential(1) + ')');
  }
  /* identities with emissions on: random levers (incl. carbon tax, green), shocks (incl. world emissions, disasters), 20 seeds × 12 years */
  {
    const ref = OPENMU.calibrate(p20);
    let maxSector = 0, maxUnion = 0, maxCB = 0, maxDebt = 0, maxS = 0, maxWealth = 0;
    for (let seedN = 1; seedN <= 20; seedN++) {
      const { policies, shocks } = randomInputs(rng(3000 + seedN), 12, undefined, true, true);   // 12 years (game horizon + margin): beyond that the random runs leave the sane range (damage capped at 25 %, debt > 250 %)
      const run = OPENMU.simulate({ params: p20, years: 12, policies, shocks });
      let prevB = {}, prevS = ref.union.S0; IDS.forEach(id => { prevB[id] = ref.countries[id].B; });
      run.years.forEach(y => {
        let sumBal = 0, sumE = 0;
        IDS.forEach(id => {
          const c = y.countries[id];
          const bal = (c.YD - c.CE) + (c.AF - c.I) + c.PB;
          maxSector = Math.max(maxSector, Math.abs(bal - c.CAi) / c.Y); sumBal += bal; sumE += c.E;
          maxDebt = Math.max(maxDebt, Math.abs((c.B - prevB[id]) + c.PB) / c.Y); prevB[id] = c.B;
        });
        maxCB = Math.max(maxCB, y.union.identityError, y.union.sectorError);
        maxUnion = Math.max(maxUnion, Math.abs(sumBal - y.union.CAp) / y.union.Y);
        maxS = Math.max(maxS, Math.abs(y.union.S - prevS - sumE - y.union.Ew) / ref.union.S0); prevS = y.union.S;
      });
    }
    must(maxSector < 1e-10 && maxUnion < 1e-10, 'v2.0 identities with emissions, carbon taxes, green investment and repairs: sector balances = CA′, Σ = CA′ (max ' + Math.max(maxSector, maxUnion).toExponential(2) + ')');
    must(maxCB < 1e-9 && maxDebt < 1e-10, 'v2.0 identities: CB balance sheet, wealth = assets, BoP, ΔB = −PB (max ' + Math.max(maxCB, maxDebt).toExponential(2) + ')');
    must(maxS < 1e-12, 'v2.0 matter conservation: ΔS = union emissions + world emissions every year (max ' + maxS.toExponential(2) + ')');
  }
  /* business as usual: damage rises, hits the thermometers */
  const run8 = (pol, shs) => OPENMU.report({ params: p20, years: 8, policies: pol || {}, shocks: shs || [] });
  const bau = run8();
  const D = bau.years.map(y => y.union.D), fr = bau.years.map(y => y.countries.FRA);
  must(D.every((d, i) => i === 0 || d > D[i - 1]) && D[5] >= 4 && D[5] <= 6, 'v2.0 BAU: damage rises every year and reaches ' + D[5].toFixed(1) + ' % in year 6 (target 4–6)');
  must(Math.abs(p20.chiU * D[5] - 2) < 0.1 && fr[5].unemp > 1.8 && fr[5].unemp < 2.6 && fr[5].infl > 1 && fr[5].infl < 2, 'v2.0 BAU year 6, France: structural unemployment +' + (p20.chiU * D[5]).toFixed(2) + ' pt at D = ' + D[5].toFixed(1) + ' % (target +2), total +' + fr[5].unemp.toFixed(2) + ' pt with Okun, inflation +' + fr[5].infl.toFixed(2) + ' pt, GDP ' + f(fr[5].gdp, 2) + ' %, public balance ' + f(fr[5].pubbal, 2) + ', trade balance ' + f(fr[5].tradebal, 2));
  must(bau.years.every(y => IDS.every(id => OPENMU.INDICATORS.every(k => { const d = y.countries[id].detail[k]; return Math.abs(d.nat) < 1e-12 && Math.abs(d.shock) < 1e-12 && Math.abs(d.foreign) < 1e-12 && Math.abs(d.climate - y.countries[id][k]) < 1e-12; }))), 'v2.0 BAU: the whole damage sits in the "climate" part of the decomposition (shock, own and foreign parts are zero)');
  {
    const mix = run8({ FRA: Array(8).fill({ pubdem: 5, ctax: 3 }), DEU: Array(8).fill({ green: 5 }) }, [{ world: -3 }, { rate: 0.5 }, { disaster: 2 }]);
    let err = 0; mix.years.forEach(y => IDS.forEach(id => OPENMU.INDICATORS.forEach(k => { const d = y.countries[id].detail[k]; err = Math.max(err, Math.abs(d.shock + d.nat + d.foreign + d.climate - y.countries[id][k])); })));
    must(err < 1e-9, 'v2.0 decomposition: shock + own + foreign + climate = total for every indicator, country and year (max ' + err.toExponential(1) + ')');
  }
  /* carbon tax: emissions, revenue, future damage, pass-through */
  const allPol = (y) => { const o = {}; IDS.forEach(id => { o[id] = Array(8).fill(y); }); return o; };
  const ct = run8(allPol({ ctax: 5 })), gr = run8(allPol({ green: 10 }));
  const E = (r, t) => r.years[t].union.Erel, ci = (r, t) => r.years[t].countries.FRA.detail.extra.ci;
  must(E(ct, 1) < -15 && E(ct, 5) < -60 && ci(ct, 7) >= p20.ciMin - 1e-12 && Math.abs(ci(ct, 7) - p20.ciMin) < 1e-9, 'v2.0 carbon tax 5 pt everywhere: union emissions ' + f(E(ct, 1), 0) + ' % in year 2, ' + f(E(ct, 5), 0) + ' % in year 6; intensity floor ' + p20.ciMin + ' reached by year 8');
  must(ct.years[7].union.D < D[7] - 1, 'v2.0 carbon tax: damage in year 8 ' + ct.years[7].union.D.toFixed(1) + ' % vs ' + D[7].toFixed(1) + ' % under BAU');
  must(ct.years[0].countries.FRA.pubbal > fr[0].pubbal + 0.3 && ct.years[0].countries.FRA.infl > fr[0].infl + 0.3, 'v2.0 carbon tax year 1: revenue improves the public balance (' + f(ct.years[0].countries.FRA.pubbal, 2) + ' vs ' + f(fr[0].pubbal, 2) + '), pass-through lifts inflation (' + f(ct.years[0].countries.FRA.infl, 2) + ' vs ' + f(fr[0].infl, 2) + ')');
  must(E(gr, 1) < -14 && E(gr, 1) > -20 && gr.years[0].countries.FRA.pubbal < fr[0].pubbal - 0.5 && gr.years[0].countries.FRA.gdp > fr[0].gdp + 1, 'v2.0 green investment 10 everywhere (intra-union leak comes back as partners\' exports): emissions ' + f(E(gr, 1), 0) + ' % in year 2, public balance ' + f(gr.years[0].countries.FRA.pubbal, 2) + ' (worse), GDP ' + f(gr.years[0].countries.FRA.gdp, 2) + ' % (demand)');
  /* green investment alone (spec §10.9): 60 % import content → about half the GDP effect of public demand, a worse trade balance; diminishing returns on ci */
  const gAlone = run8({ FRA: Array(8).fill({ green: 10 }) }), pAlone = run8({ FRA: Array(8).fill({ pubdem: 10 }) });
  const g1 = gAlone.years[0].countries.FRA, p1 = pAlone.years[0].countries.FRA;
  must(g1.gdp > 0.9 && g1.gdp < 0.8 * p1.gdp && g1.tradebal < p1.tradebal - 0.3, 'v2.0 green 10 alone vs public demand +10 alone, year 1: GDP ' + f(g1.gdp, 2) + ' vs ' + f(p1.gdp, 2) + ' %, trade balance ' + f(g1.tradebal, 2) + ' vs ' + f(p1.tradebal, 2) + ' pt (60 % import content)');
  const ciPath = (lvl) => { const r = run8({ FRA: Array(8).fill({ green: lvl }) }); return 100 * (r.years[1].countries.FRA.detail.extra.ci / r.years[0].countries.FRA.detail.extra.ci - 1); };
  must(Math.abs(ciPath(10) + 16.7) < 0.3 && Math.abs(ciPath(5) + 12.5) < 0.3 && Math.abs(ciPath(2) + 7.1) < 0.3, 'v2.0 diminishing returns on the carbon intensity: green 2 / 5 / 10 → ' + ciPath(2).toFixed(1) + ' / ' + ciPath(5).toFixed(1) + ' / ' + ciPath(10).toFixed(1) + ' % per year');
  console.log('v2.0 — green 10 alone, France (GDP / TB / PB / E vs ref over 5 years): ' + gAlone.years.slice(0, 5).map(y => { const c = y.countries.FRA; return f(c.gdp, 2) + ' / ' + f(c.tradebal, 2) + ' / ' + f(c.pubbal, 2) + ' / ' + f(c.detail.extra.E, 0) + ' %'; }).join(' | '));
  console.log('v2.0 — public demand +10 alone, France (GDP / TB / PB): ' + pAlone.years.slice(0, 5).map(y => { const c = y.countries.FRA; return f(c.gdp, 2) + ' / ' + f(c.tradebal, 2) + ' / ' + f(c.pubbal, 2); }).join(' | '));
  /* disaster */
  const dis = run8({}, [{}, {}, { disaster: 3 }]);
  must(Math.abs(dis.years[2].union.D - D[2] - 3) < 1e-9 && Math.abs(dis.years[3].union.D - D[3]) < 0.2, 'v2.0 disaster 3 in year 3: damage +3 pt that year (' + dis.years[2].union.D.toFixed(1) + ' %), back on its path afterwards');
  /* free rider: one member alone */
  const solo = run8({ FRA: Array(8).fill({ ctax: 10 }) });
  const R = (c) => 0.2 * (c.gdp - c.unemp - c.infl + c.pubbal + c.tradebal);
  const printL = (r, c) => r.years.map(y => { const k = y.countries[c]; return 'D ' + y.union.D.toFixed(1) + ' | u ' + f(k.unemp, 2) + ' π ' + f(k.infl, 2) + ' GDP ' + f(k.gdp, 2) + ' PB ' + f(k.pubbal, 2) + ' TB ' + f(k.tradebal, 2) + ' E ' + f(k.detail.extra.E, 0) + ' % | R ' + f(R(k), 2); }).join('\n      ');
  console.log('\nv2.0 — business as usual, France (union GDP ' + bau.years.map(y => f(y.union.gdp, 1)).join(' / ') + ' %):\n      ' + printL(bau, 'FRA'));
  console.log('v2.0 — carbon tax 5 pt everywhere, France (S/S0 ' + ct.years.map(y => y.union.Sshare.toFixed(3)).join(' / ') + '):\n      ' + printL(ct, 'FRA'));
  console.log('v2.0 — green investment 10 everywhere, France:\n      ' + printL(gr, 'FRA'));
  console.log('v2.0 — France alone, carbon tax 10 (free rider): R France ' + solo.years.map(y => f(R(y.countries.FRA), 2)).join(' / ') + '\n      R Germany ' + solo.years.map(y => f(R(y.countries.DEU), 2)).join(' / ') + '\n      R BAU     ' + bau.years.map(y => f(R(y.countries.FRA), 2)).join(' / '));
  console.log('v2.0 — disaster 3 in year 3, France: ' + dis.years.map(y => 'D ' + y.union.D.toFixed(1) + '/u ' + f(y.countries.FRA.unemp, 1)).join(' · '));
}


/* ===================== DUEL (arcade mode, spec section 11) ===================== */
{
  const f = (v, d) => (v > 0 ? '+' : '') + v.toFixed(d === undefined ? 2 : d);
  const R = c => 0.2 * (c.gdp - c.unemp - c.infl + c.pubbal + c.tradebal);
  /* regression: the union engine is untouched */
  const regU = OPENMU.report({ params: OPENMU.paramsFor('v2.0'), years: 4, policies: { FRA: [{ pubdem: 10 }, { pubdem: 10 }, {}, {}] }, shocks: [{ world: -5, regime: 'float' }, {}, {}, {}] });
  must(regU.years.length === 4 && typeof regU.years[1].countries.FRA.emis === 'number', 'duel: union report still runs (v2.0 path untouched)');
  /* stationarity with emissions off; symmetric reference */
  const st = OPENMU.simulateDuel({ years: 40, params: { ci0: 0 } });
  let mx = 0;
  st.years.forEach(y => ['A', 'B'].forEach(id => { const c = y.countries[id], rc = st.ref.countries[id]; mx = Math.max(mx, Math.abs(c.Y / rc.Y - 1), Math.abs(c.V / rc.V - 1), Math.abs(c.B / rc.B - 1), Math.abs(c.Bf / rc.Bf - 1), Math.abs(y.pair.e - 1), Math.abs(y.pair.RA / y.pair.R0A - 1)); }));
  must(mx < 1e-12, 'duel: stationarity (emissions off): two identical economies, e = 1, balanced trade, no net flows, 40 years (max ' + mx.toExponential(2) + ')');
  must(Math.abs(st.ref.countries.A.Bf - st.ref.countries.B.Bf) < 1e-12 && st.ref.countries.A.TB === 0, 'duel: symmetric reference (equal cross-holdings, balanced trade)');
  /* identities under random levers, shocks and regimes, 20 seeds × 20 years */
  let maxId = 0, maxBop = 0, maxRes = 0, fails = 0;
  for (let seedN = 1; seedN <= 20; seedN++) {
    const rnd = rng(7000 + seedN), years = 20, policies = { A: [], B: [] }, shocks = [];
    for (let t = 0; t < years; t++) {
      ['A', 'B'].forEach(id => policies[id].push({ pubdem: (rnd() - 0.5) * 10, benefits: (rnd() - 0.5) * 10, inctax: (rnd() - 0.5) * 10, vat: (rnd() - 0.5) * 10, ctax: rnd() * 6, green: rnd() * 6, rate: (rnd() - 0.5) * 4 }));
      shocks.push({ regime: rnd() < 0.5 ? 'float' : 'fixed', confidence: (rnd() - 0.5) * 6, imports: (rnd() - 0.5) * 6, disaster: rnd() < 0.1 ? 2 : 0, backstop: rnd() > 0.15, demandA: (rnd() - 0.5) * 6, demandB: (rnd() - 0.5) * 6, devalA: rnd() < 0.05 ? 5 : 0, devalB: rnd() < 0.05 ? 5 : 0 });
    }
    try {
      const run = OPENMU.simulateDuel({ years, policies, shocks });
      run.years.forEach((y, t) => {
        maxId = Math.max(maxId, y.pair.identityError);
        const prevRA = t ? run.years[t - 1].pair.RA : run.ref.countries.A.R0, prevRB = t ? run.years[t - 1].pair.RB : run.ref.countries.B.R0;
        if (y.pair.regime === 'fixed') maxRes = Math.max(maxRes, Math.abs((y.pair.RB - prevRB) + y.pair.e * (y.pair.RA - prevRA)) / Math.max(1, Math.abs(y.pair.RA - prevRA)));
        else maxRes = Math.max(maxRes, Math.abs(y.pair.RA - prevRA) + Math.abs(y.pair.RB - prevRB));
        maxBop = Math.max(maxBop, Math.abs(y.pair.excessA + y.pair.e * y.pair.excessB) / Math.max(1, Math.abs(y.pair.excessA)));
      });
    } catch (e) { fails++; console.log('     duel seed ' + seedN + ': ' + e.message); }
  }
  must(fails === 0 && maxId < 1e-9, 'duel: identities (CB balance sheets, sector balances = CA′, wealth = assets, BoP) under random levers/shocks/regimes, 20 seeds × 20 y (max ' + maxId.toExponential(2) + ')');
  must(maxBop < 1e-9, 'duel: bilateral BoP: BoP_A = −e·BoP_B every year (max ' + maxBop.toExponential(2) + ')');
  must(maxRes < 1e-9, 'duel: reserves: ΔR_B = −e·ΔR_A under fixed, frozen under float (max ' + maxRes.toExponential(2) + ')');
  /* magnitudes */
  const yrs = 5, fx = Array(yrs).fill({ regime: 'fixed' }), fl = Array(yrs).fill({ regime: 'float' });
  const stimFx = OPENMU.reportDuel({ years: yrs, policies: { A: Array(yrs).fill({ pubdem: 10 }) }, shocks: fx });
  const stimFl = OPENMU.reportDuel({ years: yrs, policies: { A: Array(yrs).fill({ pubdem: 10 }) }, shocks: fl });
  must(stimFx.years[0].countries.A.gdp > 2 && stimFx.years[0].countries.B.gdp > 0.5 && stimFx.years[4].pair.RA < 0.6 * stimFx.ref.countries.A.R0 && !stimFx.years[4].pair.alertA, 'duel: A stimulates +10 (fixed): both grow, A′s reserves drained to about half by year 5 (alert in year 8 with 3 months of reserves)');
  must(stimFl.years[yrs - 1].pair.e > 1.05 && stimFl.years[yrs - 1].pair.RA === stimFl.ref.countries.A.R0, 'duel: A stimulates +10 (float): A′s currency depreciates, reserves frozen');
  console.log('duel — A public demand +10 for 5 y, FIXED: GDP A ' + stimFx.years.map(y => f(y.countries.A.gdp, 1)).join(' ') + ' | GDP B ' + stimFx.years.map(y => f(y.countries.B.gdp, 1)).join(' ') + ' | TB A ' + stimFx.years.map(y => f(y.countries.A.tradebal, 1)).join(' ') + ' | reserves A % ' + stimFx.years.map(y => (100 * y.pair.RshareA).toFixed(0)).join(' ') + ' | B % ' + stimFx.years.map(y => (100 * y.pair.RshareB).toFixed(0)).join(' '));
  console.log('duel — A public demand +10 for 5 y, FLOAT: e ' + stimFl.years.map(y => y.pair.e.toFixed(3)).join(' ') + ' | GDP A ' + stimFl.years.map(y => f(y.countries.A.gdp, 1)).join(' ') + ' | GDP B ' + stimFl.years.map(y => f(y.countries.B.gdp, 1)).join(' ') + ' | TB A ' + stimFl.years.map(y => f(y.countries.A.tradebal, 1)).join(' '));
  const hike = OPENMU.reportDuel({ years: 4, policies: { A: Array(4).fill({ rate: 1 }) }, shocks: Array(4).fill({ regime: 'float' }) });
  must(hike.years[0].pair.e < 0.97 && hike.years[1].countries.A.gdp < -1 && hike.years[1].countries.A.infl < hike.years[1].countries.B.infl + 0.5, 'duel: A hikes +1 pt (float): A appreciates, A′s GDP falls next year');
  console.log('duel — A policy rate +1 pt (float): e ' + hike.years.map(y => y.pair.e.toFixed(3)).join(' ') + ' | GDP A ' + hike.years.map(y => f(y.countries.A.gdp, 1)).join(' ') + ' | GDP B ' + hike.years.map(y => f(y.countries.B.gdp, 1)).join(' ') + ' | π A ' + hike.years.map(y => f(y.countries.A.infl, 1)).join(' '));
  const ct = OPENMU.reportDuel({ years: 8, policies: { A: Array(8).fill({ ctax: 5 }) }, shocks: Array(8).fill({ regime: 'fixed' }) });
  const bau = OPENMU.reportDuel({ years: 8, shocks: Array(8).fill({ regime: 'fixed' }) });
  must(ct.years[7].countries.A.emis < -60 && ct.years[7].pair.D < bau.years[7].pair.D && R(ct.years[0].countries.A) < R(ct.years[0].countries.B), 'duel: A alone taxes carbon: its emissions fall, the shared damage falls, A pays first');
  console.log('duel — A carbon tax 5 alone, 8 y: R A ' + ct.years.map(y => f(R(y.countries.A), 2)).join(' ') + ' | R B ' + ct.years.map(y => f(R(y.countries.B), 2)).join(' ') + ' | D % ' + ct.years.map(y => y.pair.D.toFixed(1)).join(' ') + ' (BAU ' + bau.years[7].pair.D.toFixed(1) + ') | emis A ' + ct.years.map(y => f(y.countries.A.emis, 0)).join(' '));
  const sp = ct.years[2].countries.A; const sum = ['gdp', 'emis', 'infl'].every(k => Math.abs(sp.detail[k].shock + sp.detail[k].nat + sp.detail[k].foreign + sp.detail[k].climate - sp[k]) < 1e-9);
  must(sum, 'duel: four-part split (shock / own / partner / climate) adds up to the total');
  const sw = OPENMU.simulateDuel({ years: 6, policies: { A: Array(6).fill({ pubdem: 8 }) }, shocks: [{ regime: 'fixed' }, { regime: 'fixed' }, { regime: 'float' }, { regime: 'float' }, { regime: 'fixed' }, { regime: 'fixed' }] });
  must(sw.years[2].pair.RA === sw.years[1].pair.RA && sw.years[3].pair.e !== 1 && sw.years[4].pair.e === sw.years[3].pair.e && sw.checks.maxIdentityError < 1e-9, 'duel: regime switch fixed → float → fixed: reserves frozen in float, parity carried over, identities hold');
  const fd = OPENMU.simulateDuel({ years: 9, policies: { A: Array(9).fill({ pubdem: 10, benefits: 10 }) }, shocks: Array(9).fill({ regime: 'fixed' }) });
  const fy = fd.years.findIndex(y => y.pair.forcedA);
  must(fy > 0 && fd.years[fy].pair.e > fd.years[fy - 1].pair.e * 1.14, 'duel: A exhausts its reserves → forced devaluation of A′s currency (year ' + (fy + 1) + ')');
}

/* ===================== EXIT (leaving the union, spec section 12) ===================== */
console.log('\n===== EXIT (spec section 12) =====');
{
  const maxDiff = (a, b) => { let m = 0; a.years.forEach((y, t) => { IDS.forEach(id => ['Y', 'B', 'V', 'pi', 'tb', 'pb', 'M', 'H', 'Bf', 'Bw'].forEach(k => { const d = Math.abs(y.countries[id][k] - b.years[t].countries[id][k]) / Math.max(1, Math.abs(b.years[t].countries[id][k])); if (d > m) m = d; })); ['R', 'xr'].forEach(k => { const d = Math.abs(y.union[k] - b.years[t].union[k]); if (d > m) m = d; }); }); return m; };
  /* (a) the exit engine without an effective exit reproduces the union engine */
  ['v1.3', 'v2.0'].forEach(v => {
    const P = OPENMU.paramsFor(v), rnd = rng(77), inp = randomInputs(rnd, 8, 1, true, v === 'v2.0');
    const base = OPENMU.simulate({ params: P, years: 8, policies: inp.policies, shocks: inp.shocks });
    const pol2 = JSON.parse(JSON.stringify(inp.policies)); pol2.AUT[9] = { leave: 1 };
    const gen = OPENMU.simulate({ params: P, years: 8, policies: pol2, shocks: inp.shocks });
    must(gen.exits && gen.exits.AUT === 10 && maxDiff(gen, base) < 1e-9, 'exit (' + v + '): the exit engine with no exit inside the horizon reproduces the union engine under random levers/shocks/regimes (max ' + maxDiff(gen, base).toExponential(2) + ')');
  });
  must(OPENMU.simulate({ params: OPENMU.paramsFor('v1.2'), years: 3, policies: { FRA: [{ leave: 1 }] } }).exits === undefined, 'exit: ignored before v1.3 (no capital account): the union engine runs');
  /* (b) an exit at the reference with no shock changes nothing; balance sheets at the exit date */
  const P3 = OPENMU.paramsFor('v1.3');
  ['float', 'peg'].forEach(reg => {
    const pol = { FRA: [{ leave: 1 }] }; for (let t = 1; t < 10; t++) pol.FRA[t] = reg === 'peg' ? { peg: 1 } : {};
    const r = OPENMU.simulate({ params: P3, years: 10, policies: pol });
    let m = 0; r.years.forEach(y => IDS.forEach(id => { const c = y.countries[id], rc = r.ref.countries[id]; m = Math.max(m, Math.abs(c.Y / rc.Y - 1), Math.abs(c.pi - 2) / 100, Math.abs(c.pb) / 100, Math.abs(c.fx - 1)); }));
    const y = r.years[2].countries.FRA, rc = r.ref.countries.FRA;
    must(m < 1e-10 && Math.abs(y.BcbU - rc.Bcb) < 1e-9 && Math.abs(y.T2 + rc.Bcb) < 1e-9 && Math.abs(y.RX - r.ref.union.R0 * 75 / 337) < 1e-9 && Math.abs(r.years[2].union.R - r.ref.union.R0 * 262 / 337) < 1e-9,
      'exit (' + reg + '): at the reference, nothing moves (max ' + m.toExponential(1) + '); the union keeps France′s bills (' + (100 * y.BcbU / y.Y).toFixed(2) + ' % of GDP) and owes its BCN the same in TARGET (' + (100 * y.T2 / y.Y).toFixed(2) + ' %); reserves split by size');
  });
  /* (c) identities under random levers, shocks, regimes, pegs, two exits and retaliation */
  {
    let maxId = 0, maxSec = 0, fails = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const rnd = rng(seed * 31), Y = 12, v = seed % 2 ? 'v1.3' : 'v2.0';
      const inp = randomInputs(rnd, Y, 1, true, v === 'v2.0');
      const x1 = IDS[1 + Math.floor(rnd() * 6)], x2 = seed % 3 === 0 ? IDS[(IDS.indexOf(x1) % 6) + 1] : null, a1 = 1 + Math.floor(rnd() * 3);
      inp.policies[x1][a1].leave = 1; if (x2) inp.policies[x2][a1 + 2].leave = 1;
      [x1, x2].forEach(x => { if (x) inp.policies[x].forEach((y, t) => { if (t > a1) { y.rate = (rnd() - 0.5) * 4; y.peg = rnd() < 0.4 ? 1 : 0; y.pegChange = y.peg && rnd() < 0.3 ? (rnd() - 0.3) * 20 : 0; y.absorb = rnd() < 0.5 ? 1 : 0; } }); });
      const ret = [];
      inp.shocks.forEach((s, t) => { s.exitShocks = {}; s.exitShocks[x1] = { confidence: (rnd() - 0.5) * 6, flows: (rnd() - 0.5) * 30, run: rnd() < 0.3 ? (rnd() - 0.3) * 2 : 0 }; const rr = {}; rr[x1] = { tariff: rnd() < 0.5 ? 10 : 0, sale: rnd() < 0.4 ? 50 : 0, settle: rnd() < 0.3 ? 1 : 0 }; if (x2) rr[x2] = { tariff: 20, sale: 25 }; ret.push(rr); });
      try {
        const r = OPENMU.simulate({ params: OPENMU.paramsFor(v), years: Y, policies: inp.policies, shocks: inp.shocks, retaliation: ret });
        maxId = Math.max(maxId, r.checks.maxIdentityError); r.years.forEach(y => { maxSec = Math.max(maxSec, y.union.sectorError); });
      } catch (e) { fails++; console.log('  seed ' + seed + ': ' + e.message); }
    }
    must(fails === 0 && maxId < 1e-9 && maxSec < 1e-9, 'exit: identities (union CB with its claims on exited countries, each BCN balance sheet, sector balances = CA′ for the union and for each exited country, wealth = assets, BoP) under random levers/shocks/regimes/pegs/retaliation, two exits, 20 seeds × 12 y (max ' + maxId.toExponential(2) + ' / ' + maxSec.toExponential(2) + ')');
  }
  /* (d) properties and magnitudes, France, v1.3 (no climate drift) */
  const Y = 6;
  const run = (polX, sh, ret) => { const pol = { FRA: [{ leave: 1 }] }; for (let t = 1; t < Y; t++) pol.FRA[t] = Object.assign({}, (polX && (polX[t] || polX.all)) || {}); return OPENMU.report({ params: P3, years: Y, policies: pol, shocks: sh || [], retaliation: ret || [] }); };
  const xF = (r, t) => r.years[t].countries.FRA, ex = (r, t) => xF(r, t).detail.extra;
  const show = (name, r) => console.log('exit — ' + name + ': E ' + r.years.slice(1, 5).map((y, i) => ex(r, i + 1).fx.toFixed(3)).join(' ') + ' | GDP ' + r.years.slice(1, 5).map(y => f(y.countries.FRA.gdp, 2)).join(' ') + ' | π ' + r.years.slice(1, 5).map(y => f(y.countries.FRA.infl, 2)).join(' ') + ' | TB ' + r.years.slice(1, 5).map(y => f(y.countries.FRA.tradebal, 2)).join(' ') + ' | PB ' + r.years.slice(1, 5).map(y => f(y.countries.FRA.pubbal, 2)).join(' ') + ' | DEU GDP ' + r.years.slice(1, 3).map(y => f(y.countries.DEU.gdp, 2)).join(' '));
  const cut = run({ all: { rate: -1 } }), hike = run({ all: { rate: 1 } });
  must(ex(cut, 1).fx > 1.05 && xF(cut, 1).infl > 1.5 && xF(cut, 2).gdp > 0.5 && ex(hike, 1).fx < 0.95 && xF(hike, 2).gdp < -0.5, 'exit (float): a rate cut of 1 pt depreciates the new currency (' + f(100 * (ex(cut, 1).fx - 1), 1) + ' %), imported inflation, GDP up the year after (J-curve first); a hike does the reverse');
  show('rate −1 pt, float', cut); show('rate +1 pt, float', hike);
  const stim = run({ all: { pubdem: 5 } }), stimPeg = run({ all: { peg: 1, pubdem: 5 } });
  must(ex(stim, 4).fx > ex(stim, 1).fx && ex(stim, 1).fx > 1 && ex(stimPeg, 4).fx === 1 && ex(stimPeg, 4).RXshare < 0.7, 'exit: public demand +5 for good: the currency slides in a float, the reserves drain in a peg (' + (100 * ex(stimPeg, 4).RXshare).toFixed(0) + ' % of the share after 4 years)');
  show('public demand +5, float', stim); show('public demand +5, peg', stimPeg);
  console.log('exit — public demand +5, peg: reserves % of the share received ' + stimPeg.years.slice(1).map((y, i) => (100 * ex(stimPeg, i + 1).RXshare).toFixed(0)).join(' '));
  const dv = []; dv[1] = { peg: 1, pegChange: 10 }; for (let t = 2; t < Y; t++) dv[t] = { peg: 1 };
  const deval = run(dv);
  must(Math.abs(ex(deval, 1).fx - 1.1) < 1e-12 && xF(deval, 1).infl > 2 && ex(deval, 2).RXshare > 1, 'exit (peg): a 10 % devaluation decided by the team moves the parity, imports inflation (' + f(xF(deval, 1).infl, 1) + ' pt), refills the reserves by revaluation');
  show('peg, devaluation 10 % in year 2', deval);
  const fp = []; for (let t = 1; t < 12; t++) fp[t] = { peg: 1, pubdem: 10, benefits: 10 };
  const fdx = (() => { const pol = { FRA: [{ leave: 1 }] }; for (let t = 1; t < 12; t++) pol.FRA[t] = fp[t]; return OPENMU.simulate({ params: P3, years: 12, policies: pol }); })();
  const fy = fdx.years.findIndex(y => y.countries.FRA.forced);
  must(fy > 1 && fdx.years[fy].countries.FRA.fx > fdx.years[fy - 1].countries.FRA.fx * 1.14, 'exit (peg): reserves exhausted with a deficit → forced devaluation of 15 % (year ' + (fy + 1) + ')');
  let sh = []; sh[1] = { exitShocks: { FRA: { flows: -20 } } }; const flight = run({}, sh);
  sh = []; sh[1] = { exitShocks: { FRA: { confidence: -3 } } }; const conf = run({}, sh);
  must(ex(flight, 1).fx > 1.1 && xF(flight, 1).infl > 2 && Math.abs(flight.years[1].countries.DEU.detail.gdp.shock) < 1e-12 && xF(conf, 1).gdp < -1, 'exit: administrator shocks hit the exited country only: RoW sells 20 % of its bills → depreciation ' + f(100 * (ex(flight, 1).fx - 1), 1) + ' %; household confidence −3 % → GDP ' + f(xF(conf, 1).gdp, 2) + ' %');
  show('RoW sells 20 % of French bills in year 2 (one year)', flight); show('confidence −3 % in year 2', conf);
  sh = []; sh[0] = { exitShocks: { FRA: { run: 1 } } }; const dep = run({}, sh);
  const noRun = run({});
  must(dep.years[0].union.Rshare < noRun.years[0].union.Rshare - 0.05 && dep.years[2].union.Rshare < noRun.years[2].union.Rshare - 0.05, 'exit: a deposit run of 1 pt of wealth in the announcement year drains the COMMON reserves (' + (100 * dep.years[0].union.Rshare).toFixed(0) + ' % of R0 vs ' + (100 * noRun.years[0].union.Rshare).toFixed(0) + ' %), and it lasts');
  let ret = []; for (let t = 1; t < Y; t++) ret[t] = { FRA: { tariff: 10 } }; const tariff = run({}, [], ret);
  must(xF(tariff, 1).gdp < -1 && xF(tariff, 1).detail.gdp.foreign < -1 && Math.abs(xF(tariff, 1).detail.gdp.nat) < 1e-9 && tariff.years[3].union.Rshare > noRun.years[3].union.Rshare, 'exit: a union tariff of 10 % on French goods: France′s GDP ' + f(xF(tariff, 1).gdp, 2) + ' % (counted as the others′ policy), the union′s reserves rise');
  show('union tariff 10 % from year 2', tariff);
  ret = []; ret[1] = { FRA: { sale: 50 } };
  const sale = run({}, [], ret), saleAbs = run({ all: { absorb: 1 } }, [], ret);
  must(ex(sale, 1).fx > 1.05 && ex(sale, 1).rEff > 3.1 && Math.abs(ex(saleAbs, 1).rEff - 3) < 1e-9 && ex(saleAbs, 1).fx > 1.05 && Math.abs(ex(sale, 1).BcbU - ex(noRun, 1).BcbU / 2) < 0.2, 'exit: the union sells half of its French bills: depreciation ' + f(100 * (ex(sale, 1).fx - 1), 1) + ' % and bill rate ' + ex(sale, 1).rEff.toFixed(2) + ' %; if the BCN buys them back, no rate rise but the depreciation stays (' + f(100 * (ex(saleAbs, 1).fx - 1), 1) + ' %)');
  show('the union sells 50 % of its French bills in year 2', sale); show('same, bought back by the BCN', saleAbs);
  /* the union's net claim on an exited country (its bills + TARGET) = the country's cumulative balance-of-payments deficit beyond its
     share: a deposit run while a member is charged to it through the bills the union keeps */
  sh = []; sh[0] = { exitShocks: { FRA: { run: 3 } } };
  const pre = run({}, sh), net = r => ex(r, 1).BcbU + ex(r, 1).T2;
  must(Math.abs(net(noRun)) < 1e-9 && net(pre) > 3, 'exit: net claim of the union on France at the exit (bills + TARGET, % of GDP): 0 at the reference, ' + net(pre).toFixed(2) + ' after a deposit run of 3 pts of wealth while a member (TARGET alone ' + ex(pre, 1).T2.toFixed(2) + ' %)');
  /* settlement of a TARGET debt (the BCN owes the union: here after a 30 % devaluation of the union just before the exit) */
  const dv30 = [{ deval: 30 }];
  const owe = run({}, dv30); ret = []; ret[2] = { FRA: { settle: 1 } }; const settled = run({}, dv30, ret);
  must(ex(owe, 1).T2 > 1 && Math.abs(ex(settled, 2).T2) < 1e-12 && settled.years[2].union.R > owe.years[2].union.R, 'exit: settlement voted by the council: the BCN pays its TARGET debt (' + ex(owe, 1).T2.toFixed(2) + ' % of GDP) out of its reserves, the union′s reserves rise');
  const dec = cut.years[2].countries.FRA, decD = tariff.years[2].countries.DEU;
  must(['gdp', 'infl', 'tradebal'].every(k => Math.abs(dec.detail[k].shock + dec.detail[k].nat + dec.detail[k].foreign - dec[k]) < 1e-9 && Math.abs(decD.detail[k].shock + decD.detail[k].nat + decD.detail[k].foreign - decD[k]) < 1e-9), 'exit: the decomposition adds up (exit and its policies: own; retaliation: foreign for the exited country)');
  const u2 = cut.years[2].union;
  must(u2.exited && u2.exited[0] === 'FRA' && u2.members.length === 6 && Math.abs(noRun.years[2].union.gdp) < 1e-9, 'exit: union aggregates (GDP, reserves) on the six remaining members');
  /* two exits: the rate between two exited countries goes through the euro */
  {
    const pol = { FRA: [{ leave: 1 }, { rate: -1 }, { rate: -1 }, { rate: -1 }], ITA: [{}, { leave: 1 }, { rate: 1 }, { rate: 1 }] };
    const t0 = Date.now();
    const r = OPENMU.report({ params: OPENMU.paramsFor('v2.0'), years: 8, policies: pol, shocks: Array(8).fill({ regime: 'float' }) });
    const ms = Date.now() - t0, y = r.years[3];
    must(y.union.exited.length === 2 && ex(r, 3).fx > 1 && y.countries.ITA.detail.extra.fx < 1 && r.checks.maxIdentityError < 1e-9, 'exit: two exits (France cuts, Italy hikes, union floating): ' + y.union.members.length + ' members, E FRA ' + ex(r, 3).fx.toFixed(3) + ', E ITA ' + y.countries.ITA.detail.extra.fx.toFixed(3) + ' (cross rate ' + (ex(r, 3).fx / y.countries.ITA.detail.extra.fx).toFixed(3) + ')');
    must(ms < 15000, 'exit: report of 8 years with two floating exits and a floating union in ' + ms + ' ms');
  }
}

/* ===================== TARIFFS (spec section 13) ===================== */
console.log('\n===== TARIFFS (spec section 13) =====');
{
  const P3 = OPENMU.paramsFor('v1.3');
  /* identities with a common external tariff, a RoW tariff and, in exit runs, the exited country's tariff */
  let maxId = 0, maxSec = 0, fails = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const rnd = rng(seed * 57), Y = 10, v = ['v1.1', 'v1.2', 'v1.3', 'v2.0'][seed % 4];
    const inp = randomInputs(rnd, Y, 1, v === 'v1.3' || v === 'v2.0', v === 'v2.0');
    inp.shocks.forEach(s => { s.cet = rnd() < 0.6 ? [0, 5, 10, 20][Math.floor(rnd() * 4)] : 0; s.worldTariff = rnd() < 0.3 ? rnd() * 20 : 0; });
    let ret;
    if ((v === 'v1.3' || v === 'v2.0') && seed % 2) {
      inp.policies.ITA[1].leave = 1; for (let t = 2; t < Y; t++) { inp.policies.ITA[t].tariffU = rnd() * 20; inp.policies.ITA[t].peg = rnd() < 0.4 ? 1 : 0; }
      ret = []; for (let t = 0; t < Y; t++) ret.push({ ITA: { tariff: rnd() < 0.5 ? 10 : 0 } });
    }
    try {
      const r = OPENMU.simulate({ params: OPENMU.paramsFor(v), years: Y, policies: inp.policies, shocks: inp.shocks, retaliation: ret });
      maxId = Math.max(maxId, r.checks.maxIdentityError); r.years.forEach(y => { maxSec = Math.max(maxSec, y.union.sectorError); });
    } catch (e) { fails++; console.log('  seed ' + seed + ': ' + e.message); }
  }
  must(fails === 0 && maxId < 1e-9 && maxSec < 1e-9, 'tariffs: identities with a common external tariff, a RoW tariff and an exited country′s tariff (v1.1–v2.0, 20 seeds × 10 y; max ' + maxId.toExponential(2) + ' / ' + maxSec.toExponential(2) + ')');
  /* magnitudes: common external tariff of 10 % (union, v1.3, fixed) */
  const base = OPENMU.report({ params: P3, years: 4 });
  const cet = OPENMU.report({ params: P3, years: 4, shocks: Array(4).fill({ cet: 10 }) });
  const F = (r, t) => r.years[t].countries.FRA;
  must(F(cet, 0).pubbal > 0.3 && F(cet, 0).detail.extra.tariffRev > 0.3 && cet.years[0].union.Rshare > base.years[0].union.Rshare && F(cet, 0).tradebal > 0.5 && F(cet, 0).gdp < 0, 'common external tariff 10 % (a tax on the members′ consumers): revenue ' + F(cet, 0).detail.extra.tariffRev.toFixed(2) + ' % of GDP (France), public balance ' + f(F(cet, 0).pubbal, 2) + ' pt, GDP ' + f(F(cet, 0).gdp, 2) + ' %, the union′s reserves ' + (100 * cet.years[0].union.Rshare).toFixed(0) + ' % of R0');
  console.log('tariffs — CET 10 % for 4 y, France: GDP ' + cet.years.map((y, i) => f(F(cet, i).gdp, 2)).join(' ') + ' | PB ' + cet.years.map((y, i) => f(F(cet, i).pubbal, 2)).join(' ') + ' | TB ' + cet.years.map((y, i) => f(F(cet, i).tradebal, 2)).join(' ') + ' | reserves % ' + cet.years.map(y => (100 * y.union.Rshare).toFixed(0)).join(' '));
  const both = OPENMU.report({ params: P3, years: 4, shocks: Array(4).fill({ cet: 10, worldTariff: 10 }) });
  must(F(both, 0).gdp < F(cet, 0).gdp && F(both, 0).tradebal < F(cet, 0).tradebal, 'the rest of the world retaliates with 10 %: the gain in GDP and trade balance is wiped out (GDP ' + f(F(both, 0).gdp, 2) + ' %, TB ' + f(F(both, 0).tradebal, 2) + ' pt)');
  console.log('tariffs — CET 10 % + RoW tariff 10 %, France: GDP ' + both.years.map((y, i) => f(F(both, i).gdp, 2)).join(' ') + ' | PB ' + both.years.map((y, i) => f(F(both, i).pubbal, 2)).join(' ') + ' | TB ' + both.years.map((y, i) => f(F(both, i).tradebal, 2)).join(' '));
  /* an exited Italy taxes the union's goods */
  const pol0 = { ITA: [{ leave: 1 }, {}, {}, {}] }, pol1 = { ITA: [{ leave: 1 }, { tariffU: 10 }, { tariffU: 10 }, { tariffU: 10 }] };
  const a0 = OPENMU.report({ params: P3, years: 4, policies: pol0 }), a1 = OPENMU.report({ params: P3, years: 4, policies: pol1 });
  const I = (r, t) => r.years[t].countries.ITA;
  must(I(a1, 1).pubbal > I(a0, 1).pubbal && Math.abs(I(a1, 1).detail.extra.tariffU - 10) < 1e-9 && a1.years[1].countries.DEU.gdp < a0.years[1].countries.DEU.gdp && Math.abs(a1.years[1].countries.DEU.detail.gdp.nat) < 1e-9, 'exited Italy taxes the union′s goods at 10 %: its budget gains ' + f(I(a1, 1).pubbal - I(a0, 1).pubbal, 2) + ' pt, German GDP ' + f(a1.years[1].countries.DEU.gdp - a0.years[1].countries.DEU.gdp, 2) + ' % (counted as a foreign policy)');
  console.log('tariffs — exited Italy, tariff 10 % on the union: ITA GDP ' + [1, 2, 3].map(t => f(I(a1, t).gdp - I(a0, t).gdp, 2)).join(' ') + ' | ITA PB ' + [1, 2, 3].map(t => f(I(a1, t).pubbal - I(a0, t).pubbal, 2)).join(' ') + ' | ITA currency ' + [1, 2, 3].map(t => f(100 * (I(a1, t).detail.extra.fx / I(a0, t).detail.extra.fx - 1), 1)).join(' ') + ' % | DEU GDP ' + [1, 2, 3].map(t => f(a1.years[t].countries.DEU.gdp - a0.years[t].countries.DEU.gdp, 2)).join(' '));
}

console.log(failed ? '\n' + failed + ' CHECK(S) FAILED' : '\nENGINE OK');
process.exit(failed ? 1 : 0);
