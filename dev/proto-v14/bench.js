/* v1.3 vs v1.4 prototype: fiscal levers at equal cost, balanced-budget redistribution, austerity, rate, shocks, exit; inequality.
   Run: node dev/proto-v14/bench.js */
const O = require('./engine14.js');
const z = { world: 0, rate: 0, confidence: 0, imports: 0, deval: 0 };
const N = 3;
const ineq = c => ({ ratio: c.YDP / c.YDR, share: 100 * c.YDP / (c.YDP + c.YDR) });
function run(p, pol, sh, who) {
  who = who || 'FRA';
  const shocks = []; for (let t = 0; t < N; t++) shocks.push(Object.assign({}, z, sh ? sh(t) : {}));
  const policies = pol ? { [who]: Array(N).fill(pol) } : {};
  const r = O.report({ params: p, years: N, policies, shocks }), s = O.simulate({ params: p, years: N, policies, shocks });
  return r.years.map((y, t) => Object.assign({}, y.countries[who], p.hetero ? ineq(s.years[t].countries[who]) : {}));
}
const f = (a, k, d = 2) => a.map(x => x[k] === undefined ? '—' : x[k].toFixed(d)).join(' / ');
for (const v of ['v1.3', 'v1.4']) {
  const p = O.paramsFor(v);
  const rc = O.simulate({ params: p, years: 1, policies: {}, shocks: [z] }).ref.countries.FRA;
  const incTax = rc.T - rc.tauc * rc.CE, Y = rc.Y;
  const L = { pubdem: 100 * 0.01 * Y / rc.G, benefits: 100 * 0.01 * Y / rc.TR, inctax: -100 * 0.01 * Y / incTax };
  console.log(`\n=== ${v}: income tax ${(100 * incTax / Y).toFixed(1)} % of GDP` + (p.hetero ? `, rate on the wealthy ${(100 * rc.theta).toFixed(1)} %, alpha2 wealthy ${rc.alpha2R.toFixed(4)}; bottom/top disposable income ${(rc.YDP / rc.YDR).toFixed(3)}, bottom share ${(100 * rc.YDP / rc.CE).toFixed(1)} %, bottom share of wealth ${(100 * rc.VP / rc.V).toFixed(1)} %` : ''));
  const row = (lab, a) => console.log(`  ${lab.padEnd(30)} GDP ${f(a, 'gdp')} | pub.bal ${f(a, 'pubbal')} | unemp ${f(a, 'unemp')}` + (p.hetero ? ` | ratio ${f(a, 'ratio', 3)}` : ''));
  console.log(' France alone, years 1/2/3 — cost 1 % of GDP:');
  for (const k of ['pubdem', 'benefits', 'inctax']) row(`${k} (lever ${L[k].toFixed(2)})`, run(p, { [k]: L[k] }));
  row('benefits + income tax (balanced)', run(p, { benefits: L.benefits, inctax: -L.inctax }));
  console.log(' austerity, saving 1 % of GDP:');
  row('cut public demand', run(p, { pubdem: -L.pubdem })); row('cut benefits', run(p, { benefits: -L.benefits })); row('raise income tax', run(p, { inctax: -L.inctax }));
  console.log(' same entry ±5:');
  row('pubdem +5', run(p, { pubdem: 5 })); row('benefits +5', run(p, { benefits: 5 })); row('inctax −5', run(p, { inctax: -5 })); row('vat −5', run(p, { vat: -5 }));
  console.log(' union-wide, no policy:');
  row('rate +1 pt (kept)', run(p, null, () => ({ rate: 1 }))); row('world demand −5', run(p, null, () => ({ world: -5 }))); row('confidence −3', run(p, null, () => ({ confidence: -3 })));
  row('float + sudden stop −20', run(p, null, () => ({ regime: 'float', flows: -20 })));
  console.log(' Italy leaves the union in year 2 (floating) and cuts its rate by 1 pt, Italy:');
  const pe = { ITA: [{ leave: 1 }, { rate: -1, benefits: 5 }, { rate: -1, benefits: 5 }] };
  const re = O.report({ params: p, years: N, policies: pe, shocks: [z, z, z] }), se = O.simulate({ params: p, years: N, policies: pe, shocks: [z, z, z] });
  const a = re.years.map((y, t) => Object.assign({}, y.countries.ITA, p.hetero ? ineq(se.years[t].countries.ITA) : {}));
  row('exit, rate −1, benefits +5', a);
  console.log('  checks: max identity error', se.checks.maxIdentityError.toExponential(1));
}
