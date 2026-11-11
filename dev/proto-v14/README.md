# Prototype v1.4 — modest and wealthy households (not used by the site)

`engine14.js` = `engine.js` (v1.3) + `params.hetero`: two household groups per country.
- Modest: share `omegaP` of the income distributed by firms + all benefits, untaxed, wealth held as cash; consumption `alpha1P·YD + alpha2P·V`.
- Wealthy: the rest of that income + all asset income, pay all the income tax (rate recalibrated, ≈ 49 %), hold the financial portfolio; consumption `alpha1R·YD + alpha2R·V`, `alpha2R` calibrated so that the reference stays stationary.
- Same aggregates as v1.3 at the reference (debt 105 % of GDP, wealth, consumption); identities hold to 1e-14.
- Only the union path (`simulateV11`) is changed; exit and duel paths are not.

Run: `node dev/proto-v14/bench.js` (v1.3 vs prototype, France alone) and `node dev/proto-v14/sens.js` (sensitivity).
Defaults: `omegaP 0.35, alpha1P 0.95, alpha2P 0.1, alpha1R 0.55`.
