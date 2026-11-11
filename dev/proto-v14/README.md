# Prototypes v1.4 and v2.1 — modest and wealthy households (in development, not used by the site)

`engine14.js` is generated: `python3 dev/proto-v14/make.py` = `engine.js` + `paramsFor('v1.4')` (v1.3 + households) and
`paramsFor('v2.1')` (v2.0, climate block, + households), both through `params.hetero`.
Union and exit paths only; the duel model and v1.1–v2.0 are unchanged (checked bit for bit).

- Two halves of the population per country. **Modest (bottom 50 %)**: 35 % of the wages (wages = 65 % of the income
  distributed by firms, the rest = profits) + all benefits, no income tax, wealth held as cash; propensity to consume
  out of income 0.90 (v1.3: 0.75). **Wealthy (top 50 %)**: 65 % of the wages + all profits and asset income, all the
  income tax, the financial portfolio; propensity 0.60.
- Calibrated so that the reference stays the v1.3 one (consumption, wealth 209 % of GDP, debt 105 %, balanced budget):
  income-tax rate of the wealthy 41.3 %; propensity to consume out of wealth 0.092 for the modest, 0.0985 for the wealthy.
- Reference inequality: disposable income bottom/top 0.824 (bottom share 45.2 %); bottom share of wealth 18.1 %.
- Levers unchanged: benefits → modest, income tax → wealthy, VAT → both through consumption.

Run `node dev/proto-v14/bench.js` (v1.3 vs v1.4, France alone, union shocks, an exit) and `node dev/proto-v14/bench21.js`
(v2.0 vs v2.1: fiscal levers, carbon tax and its recycling into benefits or income tax, green investment).
v2.1: the carbon tax is passed on to consumer prices (`ctaxPass`): it cuts households' real consumption instead of the
income distributed by firms. Its burden is split by consumption, a modest euro of spending carrying 1.7 times more carbon
(`ctaxWeightP`: energy weighs more in modest budgets); `carbP`/`carbR` in the results. Limit: at the stationary reference
both halves consume exactly their income (consumption out of wealth fills the gap), so VAT is proportional, not regressive.
