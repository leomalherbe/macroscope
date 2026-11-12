/* Prototype bench: flat segment of the Phillips curve (phillipsBand = h).
   node dev/proto-phillips/bench.js [--json]
   Cases, for h = 0, 0.5, 1, 1.5 and the two models (v1 · Trade, v2 · Finance):
     A. France alone, public demand +10 for 5 years
     B. France alone, public demand −10 for 5 years (austerity / internal devaluation)
     C. France leaves (v2 only: exit is a Finance option), pegs, devalues by 10 % in year 3 (vs the same run without the devaluation)
     D. Gang class replay, years 1–2 (v1.3, DEU/FRA/ITA, float)
     E. France +10 combined with a world-demand shock −5 (decomposition stress)
   For each: inflation (π − π*), relative price (compet), GDP, the "foreign" part, the non-additive residual inside it, R,
   and the number of country-years inside the band. */
'use strict';
const OPENMU = require('../../engine.js');
const MS = require('../../core.js');

const HS = [0, 0.5, 1, 1.5];
const Y = 5;
const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
const f = (v, d = 2) => (v >= 0 ? '+' : '') + v.toFixed(d);

function params(model, h, members) {
  const p = OPENMU.paramsFor(model);
  p.phillipsBand = h;
  if (members) p.countries = p.countries.filter(c => members.indexOf(c.id) >= 0);
  return p;
}
/* gap on which the demand term is computed (gapD in the climate option; = gap otherwise) */
function gapD(cy, rc) { return cy.D ? 100 * (cy.Y / (rc.Y * (1 - cy.D)) - 1) : cy.gap; }
function inBand(sim, h) {
  let n = 0, tot = 0;
  sim.years.forEach(y => Object.keys(y.countries).forEach(id => {
    const g = gapD(y.countries[id], sim.ref.countries[id]); tot++;
    if (h > 0 && Math.abs(g) <= h && Math.abs(g) > 1e-9) n++;
  }));
  return { n, tot };
}
/* the non-additive residual of the decomposition: foreign − (others' policies alone, on top of the shocks) */
function residual(p, years, policies, shocks, id) {
  const rep = OPENMU.report({ params: p, years, policies, shocks });
  const others = {}; Object.keys(policies).forEach(k => { if (k !== id) others[k] = policies[k]; });
  const sOth = OPENMU.simulate({ params: p, years, policies: others, shocks });
  const sSh = OPENMU.simulate({ params: p, years, shocks });
  let maxG = 0, maxI = 0;
  for (let t = 0; t < years; t++) {
    const d = rep.years[t].countries[id].detail;
    const pureG = 100 * (sOth.years[t].countries[id].Y - sSh.years[t].countries[id].Y) / sim0Y(rep, id);
    const pureI = sOth.years[t].countries[id].pi - sSh.years[t].countries[id].pi;
    maxG = Math.max(maxG, Math.abs(d.gdp.foreign - pureG)); maxI = Math.max(maxI, Math.abs(d.infl.foreign - pureI));
  }
  return { rep, maxG, maxI };
}
function sim0Y(rep, id) { return rep.ref.countries[id].Y; }

const out = { cases: [] };
function row(caseName, model, h, o) { out.cases.push(Object.assign({ case: caseName, model, h }, o)); }

['v1', 'v2'].forEach(model => {
  HS.forEach(h => {
    const p = params(model, h);
    /* A / B: France alone, ±10 for 5 years */
    [10, -10].forEach(dG => {
      const pol = { FRA: Array.from({ length: Y }, () => ({ pubdem: dG })) };
      const rep = OPENMU.report({ params: p, years: Y, policies: pol });
      const sim = OPENMU.simulate({ params: p, years: Y, policies: pol });
      const fr = rep.years.map(y => y.countries.FRA);
      const de = rep.years.map(y => y.countries.DEU);
      const R = fr.map(c => MS.scoreR(c, {}));
      row(dG > 0 ? 'A FRA pubdem +10' : 'B FRA pubdem −10', model, h, {
        infl1: fr[0].infl, inflAvg: avg(fr.map(c => c.infl)), compet5: fr[Y - 1].detail.extra.compet,
        gdp1: fr[0].gdp, gdpAvg: avg(fr.map(c => c.gdp)), tb5: fr[Y - 1].tradebal,
        DEUgdpForeignAvg: avg(de.map(c => c.detail.gdp.foreign)), FRAforeignMax: Math.max(...fr.map(c => Math.abs(c.detail.gdp.foreign))),
        Ravg: avg(R), RinflAvg: avg(fr.map(c => -0.2 * c.infl)), band: inBand(sim, h)
      });
    });
    /* E: decomposition stress: France +10 with world −5, plus Italy −5 */
    {
      const pol = { FRA: Array.from({ length: Y }, () => ({ pubdem: 10 })), ITA: Array.from({ length: Y }, () => ({ pubdem: -5 })) };
      const shocks = Array.from({ length: Y }, () => ({ world: -5 }));
      const r = residual(p, Y, pol, shocks, 'FRA');
      const r2 = residual(p, Y, pol, shocks, 'DEU');
      row('E FRA +10, ITA −5, world −5', model, h, { residFRAgdp: r.maxG, residFRAinfl: r.maxI, residDEUgdp: r2.maxG, residDEUinfl: r2.maxI,
        FRAinflForeignAvg: avg(r.rep.years.map(y => y.countries.FRA.detail.infl.foreign)), band: inBand(OPENMU.simulate({ params: p, years: Y, policies: pol, shocks }), h) });
    }
  });
});

/* C: France leaves (Finance), pegs from year 2, devalues 10 % in year 3; compared to the same peg without the devaluation */
HS.forEach(h => {
  const p = params('v2', h);
  const mk = dev => { const a = [{ leave: 1 }]; for (let t = 1; t < 7; t++) a[t] = { peg: 1, pegChange: dev && t === 2 ? 10 : 0 }; return { FRA: a }; };
  const rD = OPENMU.report({ params: p, years: 7, policies: mk(true) }), r0 = OPENMU.report({ params: p, years: 7, policies: mk(false) });
  const d = (t, k) => rD.years[t].countries.FRA[k] - r0.years[t].countries.FRA[k];
  const dc = t => rD.years[t].countries.FRA.detail.extra.compet - r0.years[t].countries.FRA.detail.extra.compet;
  row('C FRA exit, peg, −10 % in year 3 (diff vs no devaluation)', 'v2', h, {
    dInfl3: d(2, 'infl'), dInfl4: d(3, 'infl'), dCompet3: dc(2), dCompet6: dc(5), dGdp3: d(2, 'gdp'), dGdp6: d(5, 'gdp'), dTb6: d(5, 'tradebal'),
    band: inBand(OPENMU.simulate({ params: p, years: 7, policies: mk(true) }), h)
  });
});

/* D: Gang replay, years 1–2 */
const GANG_SHOCKS = [{ regime: 'float', confidence: 3, cet: 5 }, { regime: 'float', world: -5, worldTariff: 5, cet: 5 }];
const GANG_POL = { DEU: [{ benefits: 2, inctax: 2 }, { pubdem: 5, inctax: -2, vat: -2 }], FRA: [{}, { pubdem: 2, benefits: 1, vat: -1 }], ITA: [{ benefits: -2, vat: -3 }, { pubdem: 5, vat: -2 }] };
let gang0 = null;
HS.forEach(h => {
  const p = params('v1.3', h, ['DEU', 'FRA', 'ITA']);
  const rep = OPENMU.report({ params: p, years: 2, policies: GANG_POL, shocks: GANG_SHOCKS });
  const sim = OPENMU.simulate({ params: p, years: 2, policies: GANG_POL, shocks: GANG_SHOCKS });
  if (h === 0) gang0 = rep;
  const o = { band: inBand(sim, h) };
  ['DEU', 'FRA', 'ITA'].forEach(id => [0, 1].forEach(t => {
    const c = rep.years[t].countries[id];
    o[id + (t + 1)] = { infl: c.infl, compet: c.detail.extra.compet, gdp: c.gdp, gap: c.detail.extra.gap, foreignInfl: c.detail.infl.foreign, foreignGdp: c.detail.gdp.foreign, R: MS.scoreR(c, {}),
      dR: MS.scoreR(c, {}) - MS.scoreR(gang0.years[t].countries[id], {}) };
  }));
  ['DEU', 'FRA', 'ITA'].forEach(id => { const r = residual(p, 2, GANG_POL, GANG_SHOCKS, id); o['resid' + id] = { gdp: r.maxG, infl: r.maxI }; });
  row('D Gang years 1–2', 'v1.3', h, o);
});

if (process.argv.includes('--json')) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }

/* text tables */
const by = name => out.cases.filter(c => c.case.startsWith(name));
const bandS = b => b.n + '/' + b.tot;
['A', 'B'].forEach(k => ['v1', 'v2'].forEach(m => {
  const rs = by(k).filter(r => r.model === m); console.log('\n' + rs[0].case + ' · ' + m);
  console.log('  h    π1     π̄     compet5  GDP1   GDP̄   TB5    R̄      R̄infl  DEU foreign GDP̄  in band');
  rs.forEach(r => console.log('  ' + r.h.toFixed(1) + '  ' + [f(r.infl1), f(r.inflAvg), f(r.compet5), f(r.gdp1), f(r.gdpAvg), f(r.tb5), f(r.Ravg, 3), f(r.RinflAvg, 3), f(r.DEUgdpForeignAvg, 3)].join('  ') + '  ' + bandS(r.band)));
}));
['v1', 'v2'].forEach(m => {
  const rs = by('E').filter(r => r.model === m); console.log('\n' + rs[0].case + ' · ' + m + ' — non-additive residual in the "foreign" part (max over years)');
  rs.forEach(r => console.log('  h ' + r.h.toFixed(1) + '  FRA gdp ' + r.residFRAgdp.toExponential(2) + ' infl ' + r.residFRAinfl.toExponential(2) + '  · DEU gdp ' + r.residDEUgdp.toExponential(2) + ' infl ' + r.residDEUinfl.toExponential(2) + '  · FRA foreign infl avg ' + f(r.FRAinflForeignAvg, 3) + '  in band ' + bandS(r.band)));
});
{
  const rs = by('C'); console.log('\n' + rs[0].case);
  console.log('  h    Δπ3    Δπ4    Δcompet3 Δcompet6 ΔGDP3  ΔGDP6  ΔTB6   in band');
  rs.forEach(r => console.log('  ' + r.h.toFixed(1) + '  ' + [f(r.dInfl3), f(r.dInfl4), f(r.dCompet3), f(r.dCompet6), f(r.dGdp3), f(r.dGdp6), f(r.dTb6)].join('  ') + '  ' + bandS(r.band)));
}
{
  const rs = by('D'); console.log('\n' + rs[0].case + ' (v1.3, DEU/FRA/ITA)');
  console.log('  h    country-year  gap     π       compet  GDP     R       ΔR vs h=0  foreign π  resid gdp / infl');
  rs.forEach(r => ['DEU', 'FRA', 'ITA'].forEach(id => [1, 2].forEach(t => {
    const c = r[id + t]; console.log('  ' + r.h.toFixed(1) + '  ' + id + t + '          ' + [f(c.gap), f(c.infl), f(c.compet), f(c.gdp), f(c.R, 3), f(c.dR, 3) + '    ', f(c.foreignInfl, 3) + '    '].join('  ') + (t === 2 ? r['resid' + id].gdp.toExponential(1) + ' / ' + r['resid' + id].infl.toExponential(1) : ''));
  })) || console.log('  in band: ' + bandS(r.band)));
}
