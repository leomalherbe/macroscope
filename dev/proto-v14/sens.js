const O = require('./engine14.js');
const z = { world: 0, rate: 0, confidence: 0, imports: 0, deval: 0 };
function g1(p, pol, sh, yr) { const shocks = [0, 1, 2].map(t => Object.assign({}, z, sh ? sh(t) : {})); const r = O.report({ params: p, years: 3, policies: pol ? { FRA: Array(3).fill(pol) } : {}, shocks }); return r.years[yr || 0].countries.FRA.gdp; }
console.log('omegaP alpha1P alpha1R | thetaR | GDP/1%: benefits  inctax | balanced | rate+1 yr2');
for (const [om, a1p, a1r] of [[0.35, 0.95, 0.55], [0.35, 0.95, 0.45], [0.35, 0.95, 0.65], [0.30, 0.95, 0.55], [0.40, 0.95, 0.55], [0.35, 0.90, 0.60]]) {
  const p = Object.assign(O.paramsFor('v1.3'), { hetero: true, omegaP: om, alpha1P: a1p, alpha2P: 0.1, alpha1R: a1r });
  const rc = O.simulate({ params: p, years: 1, policies: {}, shocks: [z] }).ref.countries.FRA;
  const it = rc.T - rc.tauc * rc.CE, Lb = 100 * 0.01 * rc.Y / rc.TR, Lt = -100 * 0.01 * rc.Y / it;
  console.log(`${om}   ${a1p}   ${a1r}    | ${(100 * rc.theta).toFixed(0)} %  | ${g1(p, { benefits: Lb }).toFixed(2)}  ${g1(p, { inctax: Lt }).toFixed(2)} | ${g1(p, { benefits: Lb, inctax: -Lt }).toFixed(2)} | ${g1(p, null, () => ({ rate: 1 }), 1).toFixed(2)}`);
}
