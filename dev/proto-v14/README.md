# Prototype v1.4 — modest and wealthy households (in development, not used by the site)

`engine14.js` is generated: `python3 dev/proto-v14/make.py` = `engine.js` (v1.3) + `paramsFor('v1.4')` (`params.hetero`).
Union and exit paths only; the duel model and v1.1–v1.3 are unchanged (checked bit for bit).

- Two halves of the population per country. **Modest (bottom 50 %)**: 35 % of the wages (wages = 65 % of the income
  distributed by firms, the rest = profits) + all benefits, no income tax, wealth held as cash; propensity to consume
  out of income 0.90 (v1.3: 0.75). **Wealthy (top 50 %)**: 65 % of the wages + all profits and asset income, all the
  income tax, the financial portfolio; propensity 0.60.
- Calibrated so that the reference stays the v1.3 one (consumption, wealth 209 % of GDP, debt 105 %, balanced budget):
  income-tax rate of the wealthy 41.3 %; propensity to consume out of wealth 0.092 for the modest, 0.0985 for the wealthy.
- Reference inequality: disposable income bottom/top 0.824 (bottom share 45.2 %); bottom share of wealth 18.1 %.
- Levers unchanged: benefits → modest, income tax → wealthy, VAT → both through consumption.

Run `node dev/proto-v14/bench.js` (v1.3 vs v1.4, France alone, union shocks, an exit).
