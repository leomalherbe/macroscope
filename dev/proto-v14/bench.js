const O = require('./engine14.js');
const HET = { hetero: true, omegaP: +(process.env.OMEGA || 0.35), alpha1P: +(process.env.A1P || 0.95), alpha2P: 0.1, alpha1R: +(process.env.A1R || 0.55) };
const models = { 'v1.3': O.paramsFor('v1.3'), 'v1.4': Object.assign(O.paramsFor('v1.3'), HET) };
const z = { world: 0, rate: 0, confidence: 0, imports: 0, deval: 0 };
const N = 3;
function run(p, pol, sh) {
  const shocks = []; for (let t = 0; t < N; t++) shocks.push(Object.assign({}, z, sh ? sh(t) : {}));
  const policies = pol ? { FRA: Array(N).fill(pol) } : {};
  const r = O.report({ params: p, years: N, policies, shocks });
  return r.years.map(y => y.countries.FRA);
}
const fmt = (a, k, d = 2) => a.map(x => x[k].toFixed(d)).join(' / ');
for (const [name, p] of Object.entries(models)) {
  const rc = O.simulate({ params: p, years: 1, policies: {}, shocks: [z] }).ref.countries.FRA;
  const incTax = rc.T - rc.tauc * rc.CE, Y = rc.Y;
  const L = { pubdem: 100 * 0.01 * Y / rc.G, benefits: 100 * 0.01 * Y / rc.TR, inctax: -100 * 0.01 * Y / incTax };
  console.log(`\n=== ${name}  (income tax ${(100 * incTax / Y).toFixed(1)} % of GDP${p.hetero ? ', paid by the wealthy at ' + (100 * rc.theta).toFixed(0) + ' %' : ''})`);
  console.log('Cost 1 % of GDP, France alone, years 1/2/3:');
  for (const k of ['pubdem', 'benefits', 'inctax']) { const a = run(p, { [k]: L[k] }); console.log(`  ${k.padEnd(9)} lever ${L[k].toFixed(2).padStart(6)} | GDP ${fmt(a, 'gdp')} | pub.bal ${fmt(a, 'pubbal')} | trade ${fmt(a, 'tradebal')}`); }
  const bb = run(p, { benefits: L.benefits, inctax: -L.inctax }); console.log(`  balanced: benefits +1 % GDP financed by income tax | GDP ${fmt(bb, 'gdp')} | pub.bal ${fmt(bb, 'pubbal')} | trade ${fmt(bb, 'tradebal')}`);
  console.log('Austerity, saving 1 % of GDP:');
  for (const [lab, pol] of [['cut public demand', { pubdem: -L.pubdem }], ['cut benefits', { benefits: -L.benefits }], ['raise income tax', { inctax: -L.inctax }]]) { const a = run(p, pol); console.log(`  ${lab.padEnd(17)} | GDP ${fmt(a, 'gdp')} | unemp ${fmt(a, 'unemp')} | pub.bal ${fmt(a, 'pubbal')}`); }
  console.log('Same lever entry (±5):');
  for (const [lab, pol] of [['pubdem +5', { pubdem: 5 }], ['benefits +5', { benefits: 5 }], ['inctax −5', { inctax: -5 }]]) { const a = run(p, pol); console.log(`  ${lab.padEnd(12)} | GDP ${fmt(a, 'gdp')} | pub.bal ${fmt(a, 'pubbal')}`); }
  console.log('Union-wide shocks (no policy):');
  for (const [lab, sh] of [['rate +1 pt (yr 1)', t => t === 0 ? { rate: 1 } : { rate: 1 }], ['world demand −5', () => ({ world: -5 })], ['confidence −3', () => ({ confidence: -3 })]]) { const a = run(p, null, sh); console.log(`  ${lab.padEnd(17)} | GDP ${fmt(a, 'gdp')} | pub.bal ${fmt(a, 'pubbal')}`); }
}
