/* v2.0 vs v2.1 prototype (climate + modest/wealthy households): fiscal levers, carbon tax and its recycling, green investment.
   France alone, years 1/2/3/5. Run: node dev/proto-v14/bench21.js */
const O = require('./engine14.js');
const z = { world: 0, rate: 0, confidence: 0, imports: 0, deval: 0 };
const N = 5, YRS = [0, 1, 2, 4];
/* inequality: disposable income of the modest half / the wealthy half */
const pp = c => c.YDP / c.YDR;
function run(p, pol) {
  const shocks = Array(N).fill(z), policies = pol ? { FRA: Array(N).fill(pol) } : {};
  const base = O.simulate({ params: p, years: N, policies: {}, shocks }), s = O.simulate({ params: p, years: N, policies, shocks });
  return YRS.map(t => {
    const c = s.years[t].countries.FRA, b = base.years[t].countries.FRA;
    return { gdp: 100 * (c.Y / b.Y - 1), pb: c.pb - b.pb, E: 100 * (c.E / b.E - 1), Tc: c.Tc / c.Y,
      ratio: p.hetero ? pp(c) - pp(b) : undefined };
  });
}
const f = (a, k, d = 2) => a.map(x => x[k] === undefined ? '—' : (x[k] >= 0 ? '+' : '') + x[k].toFixed(d)).join(' / ');
const VERS = { 'v2.0': O.paramsFor('v2.0'), 'v2.1': O.paramsFor('v2.1') };
for (const [v, p] of Object.entries(VERS)) {
  const rc = O.simulate({ params: p, years: 1, policies: {}, shocks: [z] }).ref.countries.FRA;
  const incTax = rc.T - rc.tauc * rc.CE, Y = rc.Y;
  const L = { pubdem: 100 * 0.01 * Y / rc.G, benefits: 100 * 0.01 * Y / rc.TR, inctax: -100 * 0.01 * Y / incTax };
  console.log(`\n=== ${v}` + (p.hetero ? `: rate on the wealthy ${(100 * rc.theta).toFixed(1)} %, disposable income bottom/top ${(rc.YDP / rc.YDR).toFixed(3)}` : '') + '   (gaps to the no-policy path, years 1/2/3/5)');
  const row = (lab, a) => console.log(`  ${lab.padEnd(34)} GDP ${f(a, 'gdp')} | pub.bal ${f(a, 'pb')} | emissions ${f(a, 'E', 1)}` + (p.hetero ? ` | ratio ${f(a, 'ratio', 3)}` : ''));
  row('public demand, 1 % GDP', run(p, { pubdem: L.pubdem }));
  row('benefits, 1 % GDP', run(p, { benefits: L.benefits }));
  row('income tax cut, 1 % GDP', run(p, { inctax: L.inctax }));
  row('benefits financed by income tax', run(p, { benefits: L.benefits, inctax: -L.inctax }));
  const ct = run(p, { ctax: 5 });
  row('carbon tax 5', ct);
  const rev = O.simulate({ params: p, years: 1, policies: { FRA: [{ ctax: 5 }] }, shocks: [z] }).years[0].countries.FRA.Tc;
  const bRec = 100 * rev / rc.TR, tRec = -100 * rev / incTax;
  row(`carbon tax 5 → benefits (+${bRec.toFixed(1)})`, run(p, { ctax: 5, benefits: bRec }));
  row(`carbon tax 5 → income tax (${tRec.toFixed(1)})`, run(p, { ctax: 5, inctax: tRec }));
  row('green investment 5', run(p, { green: 5 }));
  row('VAT +5', run(p, { vat: 5 }));
}
