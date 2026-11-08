# OPEN-MU — specification (v1, fixed exchange rate; sections up to §12)

Game engine replacing MacSim 2 in the policy desk. Runs in the browser (admin console) and in Node (tests). Decided with Léo on 3 Nov 2026: option 1 (chapter-6 OPEN/REG logic extended to N countries in a monetary union, rest of the world exogenous), **fixed exchange rate with reserves**, devaluation decreed by the administrator near the alert threshold, two "thermometer" equations (unemployment, inflation) outside the dynamics, no sandbox, no tariffs in v1.

Working name: **OPEN-MU**. Interface name stays "Policy desk". Site folder stays `macsim/` (links already distributed).

## 1. Economy

- N member countries `i` (default 7: DEU, FRA, ITA, ESP, NLD, BEL, AUT; reference GDP sizes 100, 75, 60, 40, 30, 18, 14), one currency, one central bank (CB) setting the bill rate `r` (exogenous, shock), one stock of foreign reserves `R` (in world currency).
- Rest of the world (RoW): exogenous demand `YRoW`, world price = 1. Exchange rate `xr` = price of one unit of world currency in union currency (`xr` up = depreciation). **Fixed** in v1: `xr` only moves when the administrator decrees a devaluation.
- No prices inside the union (real flows, chapter 6). Prices appear only in trade with the RoW (import price in union currency = `xr`) and in the inflation thermometer.

## 2. Equations per country `i`, year `t` (lagged values marked `_1`)

Levers (relative variation in % of the reference level, bounded ±10): `pubdem` → G, `benefits` → TR, `inctax` → θ, `vat` → τ.

```
G_i   = G*_i   · (1 + pubdem_i/100)
TR_i  = TR*_i  · (1 + benefits_i/100)
θ_i   = θ*_i   · (1 + inctax_i/100)
τ_i   = τ*     · (1 + vat_i/100)            τc_i = τ_i/(1+τ_i)   (share of consumption spending taken by the consumption tax)

Imports (volume):     IM_i   = μ_i · (1 + shock.imports/100) · Y_i
  intra-union part:   IMU_i  = (1 − sR_i) · IM_i, split to partner j with share s_ij (gravity: s_ij ∝ size_j, j ≠ i, Σ_j s_ij = 1)
  from the RoW:       IMR_i  = sR_i · IM_i · (xr_1 / xr0)^(−ε)        (price effect with a one-year lag → J-curve)
  value in union currency: IMV_i = IMU_i + xr · IMR_i
Exports:              X_i    = Σ_j s_ji · IMU_j  +  XR_i
  to the RoW:         XR_i   = xR_i · (YRoW/YRoW0) · (1 + shock.world/100) · (xr / xr0)^(η)
Taxes:                T_i    = θ_i · (Y_i + r_1 · Bh_i_1) + τc_i · CE_i
Disposable income:    YD_i   = Y_i + r_1 · Bh_i_1 + TR_i − θ_i · (Y_i + r_1 · Bh_i_1)
Consumption spending: CE_i   = α1 · (1 + shock.confidence/100) · YD_i + α2 · V_i_1
Consumption (goods):  C_i    = (1 − τc_i) · CE_i
Output:               Y_i    = C_i + G_i + X_i − IMV_i          ← simultaneous in {Y_i}: solve by fixed-point iteration (linear, converges)
Wealth:               V_i    = V_i_1 + YD_i − CE_i
Portfolio:            Bh_i   = V_i · (λ0 + λ1 · r) ;  H_i = V_i − Bh_i
CB profit rebated:    Fcb_i  = r_1 · Bcb_i_1                         (reserves earn nothing: r_w = 0)
Government debt:      B_i    = B_i_1 + G_i + TR_i + r_1 · B_i_1 − T_i − Fcb_i
CB holdings:          Bcb_i  = B_i − Bh_i                             (the CB buys what households do not hold)
Public balance:       PB_i   = T_i + Fcb_i − G_i − TR_i − r_1 · B_i_1          (pt of GDP: 100·PB_i/Y_i)
Trade balance:        TB_i   = X_i − IMV_i                                      (pt of GDP: 100·TB_i/Y_i)
```

Union:
```
CA     = Σ_i (XR_i − xr · IMR_i)                 current account with the RoW, in union currency
R      = R_1 + CA / xr                           reserves in world currency (fixed rate: the CB absorbs the imbalance)
NWcb   = NWcb_1 + (xr − xr_1) · R_1              valuation gain of the CB on a devaluation (capital gain, not a flow)
Identity to test each year:  Σ_i H_i = Σ_i Bcb_i + xr · R − NWcb
Alert:  R < 0.25 · R0   (board + report show it);  devaluation = shock.deval (% jump of xr in that year, decreed by the admin)
Months of imports: 12 · R · xr / Σ_i (xr · IMR_i)
```

Thermometers (outside the dynamics; reported, not fed back):
```
gap_i = 100 · (Y_i / Y*_i − 1)
u_i   = u* − β · gap_i                                                  β = 0.4   (u* = 7)
π_i   = π* + κ · gap_i + ρ · (τ_i − τ_i_1)·100 + ω · 100·(xr − xr_1)/xr_1   κ = 0.3, ρ = 0.6, ω = 0.15 (π* = 2)
P_i   = P_i_1 · (1 + π_i/100)                                           price level, display only
```

## 3. Reference (stationary) state — calibration

Given per country: `Y*_i` (size), `g = G*/Y* = 0.20`, `tr = TR*/Y* = 0.15`, `τ* = 0.10`, `μ = 0.30`, `sR = 0.5`, `α1 = 0.75`, `α2 = 0.185`, `λ0 = 0.70`, `λ1 = 5`, `r = 0.03`, `ε = η = 0.7`, `xr0 = 1`, `YRoW0 = 1`.

```
G* = g·Y* ; TR* = tr·Y* ; C* = Y* − G* (trade balanced at the reference) ; CE* = C*/(1 − τc*)
V* = (1−α1)/α2 · CE*  (households at their wealth target: YD = CE)
Bh* = V*·(λ0 + λ1 r) ; H* = V* − Bh*
θ* = 1 − (CE* − TR*)/(Y* + r·Bh*)          (income identity at the stationary state; the budget then balances by the sectoral identity)
IM* = μ·Y* ; IMU* = (1−sR)·IM* ; IMR* = sR·IM* ; xR_i = IM*_i − Σ_j s_ji·IMU*_j   (exports to the RoW calibrated so that every member's trade is balanced; must be > 0 — assert)
R0 = 3 months of the union's RoW imports: R0 = 0.25 · Σ_i IMR*_i ; attributed to countries pro rata of size only for Bcb: Bcb*_i = H*_i − xr0·R0·size_i/Σsize ; B*_i = Bh*_i + Bcb*_i
```
Test: with no levers and no shocks, the simulation reproduces the reference state for 60 years to 1e-9 (relative); all identities hold each year; multiplier of `pubdem` +10 % (= G +2 pt of GDP) gives GDP ≈ +2.5 % in year 1 for a mid-size country (order of magnitude of MacSim), trade balance ≈ −0.8 pt, public balance ≈ −1.3 pt; devaluation of 10 % worsens CA in year 1 and improves it from year 2 (J-curve).

## 4. Engine API (`macsim/engine.js`, global `OPENMU`, also `module.exports`)

```js
OPENMU.VERSION                     // '1.0'
OPENMU.defaultParams()             // deep-copy of the defaults above (countries list included)
OPENMU.calibrate(params)           // → ref: {countries:{id:{Y,G,TR,theta,tau,C,CE,V,Bh,H,B,Bcb,IM,IMU,IMR,xR,X}}, union:{R0, xr0, YRoW0}}
OPENMU.simulate({params, years, policies, shocks})
   // policies: {countryId: [{pubdem, benefits, inctax, vat}, ...per year]}  (missing = 0)
   // shocks:   [{world, rate, confidence, imports, deval}, ...per year]    (missing = 0; rate in points, others in %)
   // → {years:[{countries:{id:{Y,gap,u,pi,P,C,G,TR,T,YD,V,Bh,H,B,Bcb,X,XR,IMV,IMR,PB,TB,pb,tb}}, union:{Y,CA,R,R0,xr,alert,months,NWcb}}], ref, checks:{maxIdentityError}}
OPENMU.report({params, years, policies, shocks})
   // → {years:[{countries:{id:{gdp,unemp,infl,pubbal,tradebal, detail:{gdp:{shock,nat,foreign}, unemp:{…}, …}}}, union:{…}}]}
   // deviations from the stationary reference: gdp in %, unemp/infl in points, pubbal/tradebal in points of GDP
   // decomposition: shock = run(shocks only) − ref ; nat_i = run(shocks + policies of i only) − run(shocks only) ; foreign = total − shock − nat
```
`report` is what the console feeds into `admin.results.set` (fields gdp, unemp, infl, pubbal, tradebal; R computed in the console with the class weights; `detail` JSON = the breakdown + `extra: {gap, debt: 100·B/Y, wealth: 100·V/Y}`), plus one row per year with key `UNION` whose `detail.extra` holds `{CA, R, R0, xr, alert, months}` for the union panel of the student page and the board.

Warm-up: one country (`state.warmup.country`, FRA) with a 3-year plan, every other member at reference, shocks as set by the admin → `report` per group. Game: year by year; the console replays all years from the stored decisions and shocks (deterministic), so no engine state is stored.

## 5. Console / pages (what changes)

- `core.js`: LEVERS = the 4 levers above (ids `pubdem`, `benefits`, `inctax`, `vat`), TARIFF/EURO/TFP options off by default; `defaultState()` gains `shocks: {}` (year → shock object) and `sim: {params overrides}`; `bounds.lever` stays 10. Backend `VERSION` → '1.2' (Code.gs to be re-pasted and redeployed once).
- Console: tab **Run** replaces Entry sheets + the PDF import: shocks editor for the current year (world demand %, CB rate pt, confidence %, import propensity %, devaluation %), union panel (reserves gauge with the 25 % alert), "Run warm-up for all submitted groups" / "Run year N", preview, "Save and publish all". Entry sheets / PDF import kept in code but hidden.
- Student page & board: union panel (reserves, alert, exchange rate), "MacSim 2" → "OPEN-MU" everywhere; results view unchanged (breakdown lines already there).
- Slides: Part A adapted (name, members, 4 levers, shocks), Part B rewritten for OPEN-MU (~6 slides, notation boxes), Parts C/D unchanged except the name.

## 6. v1.1 — Firms, investment and horizontalist banks (decided with Léo, 3 Nov 2026 evening)

Goal: a **contractionary** interest-rate channel through investment, financed by bank loans (endogenous money, class 2), without an accelerator. Behind a flag `params.firms` (true = v1.1, false = v1.0 behaviour, bit-for-bit).

Per country `i` (loans and deposits are national; the central bank is common):
```
Reference:   K*_i = κ · Y*_i   (κ = 1: capital financed by bank loans)   δ = 0.10   I*_i = δ · K*_i   L*_i = K*_i
Investment:  I_i   = I*_i · max(0.5, 1 − ι · (r_1 − r*))                    ι = 12 (see calibration notes) ; one-year lag ; floor at half the reference
Amortisation funds retained by firms:  AF_i = δ · K*_i   (straight-line at the reference, see calibration notes)
Capital:     K_i   = K_i_1 + I_i − AF_i
Loans:       L_i   = L_i_1 + I_i − AF_i                                  (⇒ L = K at all times)
Income distributed to households by firms:  YF_i = Y_i − AF_i − r_1 · L_i_1
Income tax base: YF_i + r_1 · (Bh_i_1 + M_i_1)
Taxes:       T_i   = θ_i · (YF_i + r_1 · (Bh_i_1 + M_i_1)) + τc_i · CE_i
YD_i   = YF_i + r_1 · (Bh_i_1 + M_i_1) + TR_i − θ_i · (YF_i + r_1 · (Bh_i_1 + M_i_1))
CE_i, C_i, V_i as before
Output:      Y_i   = C_i + G_i + I_i + X_i − IMV_i
Portfolio (three assets):  Bh_i = V_i · min(0.8, λ0 + λ1 · r) ;  M_i = (V_i − Bh_i) · ν ;  H_i = (V_i − Bh_i) · (1 − ν)       ν = 0.83
Banks (zero spread, zero profit):  Bb_i = max(0, M_i − L_i) ;  A_i = max(0, L_i − M_i)     (bills held by banks / advances from the CB)
CB profit rebated to government i:  Fcb_i = r_1 · (Bcb_i_1 + A_i_1)
Government:  B_i   = B_i_1 + G_i + TR_i + r_1 · B_i_1 − T_i − Fcb_i ;   Bcb_i = B_i − Bh_i − Bb_i
Public balance PB_i = T_i + Fcb_i − G_i − TR_i − r_1 · B_i_1 ; trade balance unchanged
```
Identities to test every year: (YD_i − CE_i) + (AF_i − I_i) + PB_i = TB_i for every i ; L_i + Bb_i = M_i + A_i ; Σ_i H_i = Σ_i (Bcb_i + A_i) + xr·R − NWcb ; Σ_i [(YD_i − CE_i) + (AF_i − I_i) + PB_i] = CA.

Calibration (stationary): C* = Y* − G* − I* ; CE* = C*/(1−τc*) ; V* = (1−α1)/α2 · CE* with α2 re-tuned so that deposits ≈ loans (M* ≈ 0.8–1.0 Y*) and government debt ≈ 100–110 % of GDP ; portfolio shares: λ0 set so that bills are ≈ 48 % of wealth at r* ; θ* = 1 − (CE* − TR*)/(YF* + r·(Bh* + M*)) ; Bcb*_i = H*_i − xr0·R0·size_i/Σsize − A*_i.

Expected magnitudes (France alone): CB rate +1 pt → year 1 unchanged (lag), year 2 GDP ≈ −1.2 %, unemployment +0.5 pt, public balance ≈ −1 pt (debt service), investment −10 % ; back to the reference within ~5 years after the rate returns to r* (no hysteresis, no oscillation). Fiscal multipliers unchanged at impact.

Reported extras per country: I (deviation in % of reference), K, L (firms' debt, % of GDP), M (deposits, % of GDP). Thermometers and decomposition unchanged.

### Calibration notes v1.1 (engine 1.1, measured 3 Nov 2026)

Final parameters (`defaultParams()`; `defaultParams(false)` keeps the v1.0 values α2 = 0.185, λ0 = 0.70):

| parameter | value | role |
|---|---|---|
| α1, α2 | 0.75, 0.092 | propensities to consume out of income and wealth (α2 lowered so that wealth ≈ 2.1 Y*, which makes room for deposits ≈ loans) |
| λ0, λ1, λcap | 0.33, 5, 0.8 | bills share of wealth = min(λcap, λ0 + λ1·r) = 0.48 at r* = 3 % |
| ν | 0.83 | deposits share of non-bill wealth (the rest is cash) |
| κ, δ | 1, 0.10 | K* = Y*, I* = δ·K* = 10 % of GDP, L* = K* |
| ι, ifloor | **12** (spec: 10), 0.5 | investment sensitivity to r₋₁ − r*, floor at half the reference |
| r* | 0.03 | unchanged |

Reference ratios (France, identical for every member up to size): wealth 209 % of GDP, bills 100 % (48.0 % of wealth), deposits 90 %, cash 19 %, loans 100 %, bank bills 0, CB advances to banks 9.7 %, CB bill holdings 5.1 % (> 0 in every member), public debt 105 %, θ* = 0.3313, PB* = TB* = 0.

Measured effects (France alone, deviations from the reference):

| | year | GDP % | unemp pt | infl pt | pub. bal. pt | trade bal. pt | DEU GDP % |
|---|---|---|---|---|---|---|---|
| public demand +10 % | 1 / 3 | +2.39 / +2.48 | −0.96 / −0.99 | +0.72 / +0.75 | −1.07 / −1.04 | −0.68 / −0.71 | +0.14 / +0.15 |
| benefits +10 % | 1 / 3 | +1.22 / +1.35 | −0.49 / −0.54 | +0.37 / +0.41 | −0.93 / −0.89 | −0.35 / −0.39 | +0.07 / +0.08 |
| income tax +10 % | 1 / 3 | −2.44 / −2.69 | +0.98 / +1.08 | −0.73 / −0.81 | +1.91 / +1.83 | +0.73 / +0.80 | −0.14 / −0.16 |
| VAT +10 % | 1 / 3 | −0.75 / −0.78 | +0.30 / +0.31 | +0.37 / −0.23 | +0.35 / +0.34 | +0.22 / +0.23 | −0.04 / −0.05 |
| CB rate +1 pt (all members) | 1 / 2 / 3 | 0 / −1.08 / −1.05 | 0 / +0.43 / +0.42 | 0 / −0.32 / −0.32 | 0 / −1.03 / −1.05 | 0 / +0.17 / +0.16 | 0 / −1.06 / −1.03 |

Rate +1 pt: investment −12.0 % from year 2, loans fall to 99.9 % of GDP, union current account +0.16 % of GDP (weaker imports). Rate +1 pt for years 1–3 then back to r*: FRA GDP path 0.00, −1.08, −1.05, −1.02, +0.07, +0.07, +0.08, +0.08, +0.08, +0.09, +0.09, +0.09 (years 1–12).

Deviations from section 6 (and why):

1. **ι = 12 instead of 10.** With ι = 10 the year-2 GDP effect of a +1 pt rate is only −0.79 %: the interest-income channel of v1.0 (higher coupons on bills and deposits, lower CB rebate) still pushes the other way and offsets a quarter of the investment effect. ι = 12 gives −1.08 % (investment −12 %), inside the target range −0.8 … −2.0.
2. **Amortisation at the reference rate, AF = δ·K\*, instead of δ·K₋₁.** With AF = δ·K₋₁ the capital stock, once lowered by a tightening, retained less depreciation forever (no production function ties output to K), so GDP settled at about +0.3 % above the reference after the rate returned and converged back only over decades. A stock-adjustment term on K (γ·(K* − K₋₁)) was tried and removed: it offset the tightening in years 3–4 and produced a +1.0–1.5 % overshoot in year 5. Straight-line amortisation at the reference keeps `K = K₋₁ + I − AF` and `L = K` exactly, removes the artefact, and leaves I = δ·K* at the reference as before.
3. **Small permanent residual after a tightening (+0.09 % of GDP).** The public debt accumulated during the episode (higher debt service) permanently raises the coupon income of bill holders, as in v1.0 after any fiscal episode; K and L are permanently lower by the cumulated investment shortfall (hysteresis in stocks, not in flows: I returns exactly to I*). Both are inherent to a stock-flow model without a production function and stay within the ±0.15 % tolerance of the reversibility test.
4. **VAT multiplier 15 % weaker than v1.0** (−0.75 % vs −0.89 % at impact), tolerance set at 20 % for this lever only: consumption is a smaller share of GDP once investment takes 10 % of it, and VAT acts only on consumption. The three other fiscal multipliers are within 3.3 % of v1.0.

Tests (`node dev/engine-test.js`): the full v1.0 suite runs for `firms:false` (bit-for-bit regression, |diff| = 0 on the FRA pubdem +10 effects) and for `firms:true`; plus stationarity (60 years, 5e-14), the four identities of section 6 over 20 seeds × 40 random years (≤ 3e-14, CB identity 1.5e-12 with devaluations), the rate channel, reversibility, boundedness over random rate shocks of ±10 pt (max |GDP gap| 29 %, investment never below the floor, ≤ 27 iterations), multipliers vs v1.0, report additivity and `describe()`.

## 7. Votes (decided with Léo, 3 Nov 2026 evening) — game phase only

Two collective decisions are taken by the member countries themselves, with their yearly decisions, **one country = one vote**, majority of the playing countries (strictly more than half of the groups that have a country; a country that did not submit counts as "hold" / "austerity"). Votes are secret while the round is open and revealed with the decisions once it is closed. Backend VERSION → '1.3'.

### 7.1 Central-bank rate
- Field in the decision payload: `votes.rate ∈ {cut, hold, hike}` (default `hold`).
- Tally at the run of year N: cuts > half → the policy rate moves by −`voteStep`; hikes > half → +`voteStep`; otherwise unchanged. `voteStep` = 0.5 pt (state.sim.voteStep).
- The change is **permanent** (a level): the console keeps a cumulative vote delta per year, `V_N = V_{N−1} + delta_N`, and the effective rate shock passed to the engine for year N is `shocks[N].rate (administrator, level for the year) + V_N`. Floor: the effective rate never goes below 0 (clip the shock so that r ≥ 0) nor above 10 %.
- The rate decided for year N applies in year N (interest flows and the investment lag follow the engine).

### 7.2 Reserves crisis: austerity or devaluation
- Active for year N only if the union's reserves at the end of year N−1 (in the replay, i.e. simulated, not published) are below the alert line (R < 0.25·R0). The student form shows the crisis vote only when the published union row of year N−1 has `alert = true` (same condition in practice).
- Field: `votes.crisis ∈ {austerity, devaluation}` (default `austerity`).
- Tally: devaluations > half → `shocks[N].deval += devalSize` (default 10 %). Otherwise **austerity programme**: for year N every member's `pubdem` and `benefits` are capped at `austerityCap` (default −5: at most 95 % of the reference; a lower submission is kept); the console applies the cap to the effective policies and marks the overridden countries.
- Reserves exhausted (R ≤ 0 at the end of N−1): forced devaluation of `forcedDeval` (default 15 %) in year N, whatever the vote (the central bank cannot sell what it no longer has), and the crisis vote is not held.
- When the alert is not active the crisis field is ignored.

### 7.3 Where it lives
- `core.js`: `validateDecision` accepts and cleans `payload.votes` (ignored in the warm-up); defaults in `defaultState().sim`: `{votes: true, voteStep: 0.5, austerityCap: -5, devalSize: 10, forcedDeval: 15}`.
- Console, game run (replay): for t = 1..N: simulate years 1..t−1 with the effective shocks/policies so far → read the union state at the end of t−1 (R, R0, alert) → tally the votes of year t among the latest decisions → build the effective `shocks[t]` (admin + cumulative rate delta, + deval if voted/forced) and effective policies (austerity caps) → continue. Final `OPENMU.report` with the effective inputs for the published rows. The UNION row's `detail.extra` gains `votes: {rate: {cut, hold, hike, outcome (−0.5/0/+0.5), level (rate in %)}, crisis: {active, austerity, devaluation, outcome ('austerity'|'devaluation'|'forced'|null)}}` and `caps: [countryIds]`.
- Student page: a "Votes at the central bank" card in the game form (radio buttons; the crisis question appears only when the latest published union row has `alert`); after the round closes, the "Everyone's decisions" table shows each country's votes as chips; the union panel shows the tally and outcome of the last run year.
- Board: tallies and outcomes of the last run year, next to the reserves gauge.
- Console Run tab: preview shows the tally, the outcome and the countries capped by austerity; parameters (voteStep, austerityCap, devalSize, forcedDeval, votes on/off) editable in Control → Parameters (saved in `state.sim`).
- Slides: Part D 'The real game' gains one slide, 'Two votes at the council': rules of the two votes.

### 7.4 Implementation notes (v1.3, 3 Nov 2026 evening — as shipped)
- Backend `VERSION = '1.3'`: `Code.gs` must be re-pasted and redeployed as a new version; on a v1.2 backend the `votes` field is silently dropped by the old `validateDecision`, so every country votes hold / austerity.
- Majority = strictly more than half of the groups **with a country** (not of the submitted decisions): `half = nPlaying / 2`, `cuts > half`.
- Rate clip in the replay: `rateShock = clip(adminShock + V_N, −r*·100, 10 − r*·100)` so that 0 ≤ r ≤ 10 % with r* = 3 %.
- Austerity caps apply to **every** playing country, including those without a decision (reference policy 0 > −5), so the capped list is usually the whole union; a submission already at or below −5 is kept.
- When votes are disabled (`state.sim.votes = false`), the rate tally is not computed (`votes.rate = null` in the UNION row), no crisis vote is held, but an exhausted reserve stock still forces the 15 % devaluation.
- The student form decides whether to show the crisis question from the published union row of year **N−1 exactly** (not the latest row), so that a closed round N whose results are already published does not switch to the year-N message; the "Everyone's decisions" table and the decision history show the crisis chip only for years in which a crisis vote was held (`votes.crisis.active` of the run of that year, or the alert at the end of the previous year before the run).
- The UNION row's `detail.extra` also stores `shock` (the effective shock of the year: admin + votes), for the record.
- The console refreshes its overview (`admin.overview`) before every run (warm-up and game), so decisions, votes and shocks saved from another device are always taken into account.
- Tests: `dev/gas-fake-test.js` (votes accepted / rejected / revealed through the backend, `sim` merge), `dev/e2e.js` (rate vote −0.5 permanent across years, alert after a world-demand shock, crisis vote austerity then devaluation, forced devaluation, votes disabled, parameters saved), all green with `engine-test.js`.

### §7.4 Votes annoncés au conseil (v1.4)

Un engagement (`pledge`) peut porter, en plus du texte et des chiffres optionnels, un **vote annoncé** `payload.votes = {rate?, crisis?}` (`rate` ∈ cut/hold/hike, `crisis` ∈ austerity/devaluation ; le backend ne garde que les valeurs admissibles, les autres clés sont ignorées). Les engagements étant publics, l'annonce l'est aussi ; le vote réel reste dans la décision, secret tant que le tour est ouvert. `MS.pledgeVerdict(pledgePayload, decisionPayload)` étend `pledgeKept` : un vote annoncé différent du vote réel (hold / austerity par défaut) rend l'engagement « broken ». Affichage : `UI.pledgeChipsHtml(payload)` — puces des chiffres non nuls, puces « Will vote: … », ou « words only » si l'engagement n'a ni chiffres ni vote annoncé. Backend `VERSION = '1.4'`.

### §7.5 Règle d'épuisement précisée (04/11)

Dévaluation forcée en année N **si et seulement si** à la fin de N−1 : R ≤ 0 **et** CA < 0 (les réserves nettes sont négatives — la banque centrale emprunte au reste du monde — et le solde courant creuse encore). Si R ≤ 0 mais CA ≥ 0, l'union rembourse : pas de dévaluation forcée, et comme R < 25 % R0 la question de crise (austerity / devaluation) est posée comme pour toute alerte. Motif : avec l'ancienne règle (R ≤ 0 suffisait), un solde courant redevenu positif après une dévaluation ne ramenait R au-dessus de zéro qu'au bout de plusieurs années, pendant lesquelles une dévaluation de 15 % était imposée chaque année quoi que fassent les pays. Ordres de grandeur sans réponse de politique économique (choc permanent sur la demande mondiale, R0 = 3 mois d'importations hors union) : −5 % → alerte fin d'année 5 ; −10 % → 69 % / 37 % / 7 % / −24 % (alerte fin d'année 2, épuisement fin d'année 4) ; −15 % → 53 % / 6 % / −40 % ; −20 % → 37 % / −25 % ; −25 % → 22 % / −56 %. Le seuil d'alerte peut donc être sauté quand le déficit d'une année dépasse le stock restant (par ex. 69 % restants puis une année à −25 % : −78 % de R0 en un an). Une dévaluation de 15 % dégrade le solde courant l'année même (courbe en J) et l'améliore d'environ 2 points de R0 par an ensuite (choc −10 % : CA −3,9 → −1,9).

### §7.6 Le vote de crise, tour à part (v1.5, 04/11)

Décision de Léo : le vote austerity / devaluation a lieu **au début de l'année N, avant toute décision**, puisque l'austérité contraint ces décisions. État : `state.crisis[N] = {status: 'open'|'closed'|'forced', austerity, devaluation, outcome}` (fusion à un niveau, comme `shocks` ; une année s'efface avec `{}`). Backend 1.5 : `submit` avec `phase: 'crisis'` et `payload: {crisis}` accepté seulement si `crisis[round].status === 'open'` (stocké dans Decisions, phase `crisis`) ; les décisions de l'année sont refusées tant que le vote est ouvert ; sous `outcome === 'austerity'`, `pubdem` et `benefits` ≤ `sim.austerityCap` (contrôle `MS.validateDecision`, côté page et backend) ; le champ `votes.crisis` des décisions n'existe plus (`votes.rate` reste). Console : carte « Reserves crisis · year N » (Control) calculée par rejeu des années 1..N−1 ; boutons Open / Close and announce (dépouillement `MS.tallyCrisis` : absent = austerity, dévaluation si > moitié des pays jouant) / Reopen / Record the forced devaluation ; « Open submissions » refusé tant que le vote est ouvert ; le rejeu du Run applique `crisis[y]` année par année et signale une année sous alerte sans tour enregistré. Page étudiants : carte de vote à la place du formulaire ; puis bandeau d'issue, plafonds `max` sur les champs ; les votes de crise de chaque pays sont révélés avec les décisions une fois le vote clos. Board : ligne « Crisis vote · year N » (en cours : k of n have voted ; clos : dépouillement). Engagements : le vote de crise annoncé n'est proposé que pendant un vote ouvert.

## 8. v1.2 — Price levels in trade, reserves halved (decided with Léo, 5 Nov 2026 evening)

Motivation (class 6 debrief): stimulus was almost free — inflation was a thermometer with no feedback, the only price-competitiveness channel was the exchange rate with the RoW, and 3 months of reserves made the external constraint slow. v1.2 adds the Humean channel inside the union and halves the reserves. No inflation inertia (Léo). Behind `params.prices` (true in `defaultParams(true, true)` / `OPENMU.paramsFor('v1.2')`); `paramsFor('v1.1')` = `defaultParams(true)` reproduces engine 1.1 bit for bit (regression test).

Per country `i`, year `t`:
```
π_i    = π* + κ·gap_i + ρ·Δτ_i·100 + ω·100·(xr − xr_1)/xr_1          unchanged (thermometer of the year, no inertia)
P_i    = P_i_1 · (1 + π_i/100)                                         display, as before
Prel_i = Prel_i_1 · (1 + π_i/100) / (1 + π*/100)                        price level RELATIVE to the reference path (world prices grow at π*); Prel* = 1
Trade (one-year lag on prices, like xr):
  IMR_i   = sR·μ·Y_i · (xr_1 / (xr0·Prel_i_1))^(−ε)                     dearer home market → more imports from the RoW
  XR_i    = xR*_i·(1 + world/100)·(xr / (xr0·Prel_i_1))^(η)             dearer home market → fewer exports to the RoW
  w_ij    = s_ij · (Prel_j_1 / Prel_i_1)^(−εU)                           weight of partner j in i's intra-union imports (not renormalised)
  IMU_i   = (1 − sR)·μ·Y_i · Σ_j w_ij ;  IMU_ij = (1 − sR)·μ·Y_i · w_ij
  X_i     = XR_i + Σ_j IMU_ji
compet_i = 100·(Prel_i / Prel_union − 1),  Prel_union = Σ_i Prel_i·Y*_i / Σ_i Y*_i       (reported in extra.compet; union.P)
```
All flows stay in volume; prices only reallocate trade volumes, so every identity of §6 holds unchanged (identity tests, 20 seeds × 40 years, pass for v1.2). Parameters: ε = η = εU = 0.7 ; reserveMonths = 1.5 (alert 0.25 unchanged); everything else as v1.1. Reference state unchanged (Prel* = 1).

Magnitudes (engine 1.2, no other change):
- France alone, pubdem +10 for 5 years: GDP +2.39 / +2.10 / +1.84 / +1.62 / +1.42 % (v1.1: +2.39 → +2.56) ; trade balance −0.68 / −0.88 / −1.05 / −1.19 / −1.32 pt (v1.1: −0.68 → −0.73) ; inflation +0.72 → +0.43 pt ; price level vs union +0.51 / +0.96 / +1.34 / +1.66 / +1.94 %. Symmetric for austerity (pubdem −10: GDP −2.39 → −1.42, TB +0.71 → +1.35, price level −0.52 → −1.93 %): internal devaluation.
- Union-wide pubdem +5 for 3 years: members keep equal price levels (max gap 0.05 %), CA −0.73 / −0.98 / −1.22, reserves 88 / 73 / 54 % of R0.
- Union-wide pubdem +10: reserves 77 / 46 / 7 %.
- World demand, no reaction: −3 % → 81 / 64 / 49 / 35 % ; −5 % → 69 / 40 / 15 (alert end of year 3) / −9 ; −7 % → 56 / 16 / −20 ; −10 % → 37 / −20 / −71 (exhausted in year 2 without passing the alert at a year-end).
- Devaluation 10 %: CA −1.20 / +0.84 / +0.76 (J-curve; the inflation it causes, +1.3 pt, eats part of the gain), FRA inflation +1.32 / +0.14 / +0.13.
- Reversibility: 20 years after a 3-year stimulus, France's GDP within 0.1 % of the reference, price gap 0.02 %.

Selection per class: `state.sim.model` = 'v1.1' | 'v1.2'. The console creates new classes with 'v1.2' (patch right after `admin.class.create`); a class without the key is 'v1.1' (the game in progress at class 7 start); Control → Parameters → « Model version » changes it. No backend change (sim merges unknown keys). Student page: ratios line shows « price level vs the union's » when present; board: « Price level % vs union » column in « Year N in detail ».

## 9. v1.3 — Capital flows and a floating exchange rate (chapter 12 logic), regime selectable and switchable (spec for validation, 06/11)

**Goal.** Add a rest-of-the-world (RoW) portfolio so that the union's balance of payments has a financial account, and let the exchange rate be either **fixed** (reserves absorb, as today) or **floating** (reserves frozen, xr clears the balance of payments). The regime is a per-year administrator decision (editor of shocks: row "Exchange-rate regime"), so a class can start in one regime and switch during the game; the replay applies the regime year by year. v1.3 = v1.2 + this block, selectable per class (`sim.model = 'v1.3'`); v1.1 and v1.2 bit-for-bit unchanged.

### 9.1 New sectors and assets
- **RoW**: exogenous income (as now) and an exogenous rate `r_w` (reference 3 % = r*; shock `worldRate` in points). It holds union government bills, `Bw` (union currency), allocated across governments pro rata of size; the bills it wants are a given amount of its own wealth in world currency: `Bw$ = Bw$* · (1 + χw·(r − r_w)) · (1 + shock.flows/100)`, `Bw = xr · Bw$`. `shock.flows` (%) is the portfolio-preference shock ("sudden stop" when negative).
- **Union households** (each country): a fourth asset, foreign bills `Bf_i` in world currency, union-currency value `xr·Bf_i`. Portfolio shares of wealth `V_i`: bills `λB = λ0 + λ1·r − λf1·(r_w − r)`, foreign bills `λF = λf0 + λf1·(r_w − r)`, the rest split deposits/cash by ν as now (static exchange-rate expectations, as in G&L ch. 12). Adding-up holds by construction. Interest `r_w,-1 · xr · Bf_i,-1` enters disposable income and the tax base; capital gain `(xr − xr_-1)·Bf_i,-1` enters wealth (not income).
- **Governments**: `B_i = Bh_i + Bb_i + Bcb_i + Bw_i` (the RoW holds part of the debt; the CB buys the residual as now).
- **Central bank**: `R` as now; valuation gain on a float move as now (NWcb).

### 9.2 Balance of payments (union currency)
```
CA'  = Σ_i (XR_i − xr·IMR_i)  +  r_w,-1·xr·Σ_i Bf_i,-1  −  r_-1·Bw_-1          current account incl. primary income
KA   = ΔBw − xr·Σ_i ΔBf_i                                                        financial account (inflows − outflows)
fixed:  xr given (parity, devaluations as now)  →  R = R_-1 + (CA' + KA)/xr
float:  R = R_-1                                →  xr solves CA'(xr) + KA(xr) = 0, inside the yearly fixed-point loop with Y
```
Identities to test: Σ sector balances = CA'; Σ_i H_i = Σ_i (Bcb_i + A_i) + xr·R − NWcb; households' wealth = sum of assets incl. xr·Bf; ΔBw, ΔBf, ΔR consistent with the flows. Stationarity: at r = r_w, xr = 1, flows zero, `Bw$*`, `Bf*` constant.

### 9.3 Calibration targets
`Bw$* = 0.30·Σ Y*` (RoW holds 30 % of union GDP in union bills — about a quarter of public debt), `λf0` such that foreign bills = 15 % of households' wealth, `χw`, `λf1` such that a 0.5 pt rate rise appreciates the floating xr by 3–5 % on impact (to calibrate; the contemporaneous trade effect of xr goes the wrong way — J-curve — so the capital side must dominate for the float equation to be well behaved; check monotonicity numerically). Reserves 1.5 months as in v1.2 (fixed regime only matters).

### 9.4 Game rules by regime
- **Fixed**: as today (reserves, alert, crisis vote austerity / devaluation, forced devaluation).
- **Float**: no reserves crisis. The rate vote becomes a currency decision: hike → inflows → appreciation → competitiveness loss and lower import prices (ω pass-through works both ways); cut → the reverse. A **currency crisis** card replaces the reserves card: if xr depreciated by more than `sim.crisisDepr` (10 %) over the previous year, the year opens with a vote before the decisions: *defend* (the rate is raised by `sim.defendStep`, 1 pt, for the year, on top of everything) or *let it float* (nothing). Administrator shock `flows` is the natural trigger (sudden stop).
- **Switching**: fixed → float at year N: xr endogenous from N, R frozen at its end-of-(N−1) value. Float → fixed at year N: the parity is the end-of-(N−1) xr (the administrator may add a devaluation shock the same year); R moves again. The union panel shows the regime, xr, R (fixed) or the yearly change of xr and the capital flows (float).

### 9.5 Reporting
Union row extra: `regime`, `xr`, `dxr` (% change), `KA`, `Bw`, `Bf`; per country: foreign assets % of GDP in the ratios line. Student page: the union panel adapts to the regime; the decision form's rate-vote hint mentions the exchange-rate effect in float. Board: same. Model page: §"Capital flows and the exchange rate". Slides: a class-8 deck (fixed vs floating, Mundell-Fleming in SFC form, chapter 12) — later.

### 9.6 Market pressure: a risk premium rising with public debt (validated 06/11)
- Spread per member: `s_i = φ · max(0, d_i − d*)` with `d_i = B_i/Y_i` (end of previous year), `d* = 1.10`, φ such that s = 1 pt at d = 1.30 (φ = 5). Paid on the bills held by households, banks and the RoW; **not** on the central bank's holdings (the backstop). Governments' interest bill: `r_-1·B_-1 + s_i,-1·(B_-1 − Bcb_-1)`; the spread received by households/banks is income (banks' part rebated to households as now); the spread received by the RoW is a primary-income outflow in CA'.
- Flight to quality: the RoW allocation of its union-bill holdings across members tilts away from high-spread members: `share_i ∝ size_i · exp(−ψ·s_i)` (ψ = 50 per unit of spread, i.e. −40 % of the member's share at s = 1 pt); the total `Bw$` also falls with the union-average spread (`− χs·s̄`).
- **Administrator shocks** (per year, in the shocks editor): `flows` (%, sudden stop when negative: the RoW cuts its desired holdings of union bills by that share — in fixed regime the reserves pay, in float the currency depreciates) and `backstop` (checkbox, default on): when off, the central bank stops buying the residual bills of members above d*: the spread applies to **all** their new debt, their rate on the whole stock becomes `r + s_i`, and the flight is not absorbed (full market pressure). Both are shocks of the year, replayed like the others.
- Reported: `spread` per member (pt) in the ratios line and in the union panel (members under pressure), `backstop` flag in the union row.

### 9.7 As implemented (engine 1.3, 06/11) — deviations from 9.1–9.6
- `params.capital` (paramsFor('v1.3') = v1.2 + capital); v1.1 and v1.2 reproduced bit for bit (regression tests). Spread unit: φ = 0.05 in rate terms (s = 1 pt at d = 1.30), ψ = 50, χs = 10, χw = 6, λf1 = 1.3 (rate +0.5 pt → appreciation 4.2 %; −0.5 → depreciation 4.3 %). Reference: Bw$* = 0.30·ΣY*, Bf* = 0.30·Y_i carved out of households' bills (bills + foreign = 48 % of wealth as before), θ* and B* unchanged.
- Households' foreign share `λF = λF0 + λf1·(r_w − r − s_i)` (the member's own bill rate, spread included); domestic bills = billsShare(r + s_i) − λF, deposits/cash unchanged.
- The float equation is solved by bracketing + secant on the balance-of-payments excess, which is increasing in xr (checked numerically on a grid: capital side dominates the J-curve); up to ~10 evaluations of the yearly fixed point.
- **No backstop**: implemented as a market-clearing bill rate for each pressured member (d > d*): r_i rises (capped at 25 %) until households and banks absorb B − Bcb₋₁ − Bw_i; the central bank's holdings are frozen; the member's spread becomes r_i − r and is paid on the whole stock next year (the CB part rebated through Fcb); the RoW flight weight is doubled. The test confirms the market always clears (no residual to the CB) in the scenarios run.
- Crisis record for the currency crisis: `state.crisis[N] = {status, kind: 'currency', austerity: n (defend), devaluation: n (float), outcome: 'defend'|'float'}` — the student votes are stored with the reserves-crisis codes (`austerity` = defend, `devaluation` = let it float) so that the backend (v1.5) needs no change; absent = defend; the austerity cap does not apply (outcome ≠ 'austerity'). The replay adds `sim.defendStep` to the year's rate when the outcome is defend. **No backend change**: Code.gs re-bundled only (core.js: sim defaults crisisDepr 10, defendStep 1).
- Reserves rules (alert, exhaustion) are evaluated with the regime of the year being run: fixed → as before (exhaustion test uses CA′ + KA < 0); float → no reserves card. Currency crisis requires float in year N−1 and N and dxr(N−1) > crisisDepr.
- Shocks editor rows for v1.3 only: regime (select), flows (%), worldRate (pt), backstop (checkbox); stored in the same per-year shock object.
- Magnitudes (engine-test): see the model page; sudden stop −30 % in fixed = −380 % of R0 (stocks are 30 % of GDP vs reserves 1.9 % of GDP): use −3 to −10 % in the fixed regime.

## 10. v2.0 — Emissions and a damage function (validated by Léo, 06/11)

**Scope (deliberately minimal).** (1) Production emits; (2) the stock of emissions damages the economy through a simple damage function; two new levers reduce the carbon intensity of production at a cost. Compressed time scale: damages must be visible within a 6–8 year game and hit the macro variables hard. Selectable per class as `sim.model = 'v2.0'` (= v1.3 + this block, behind `params.eco`); v1.x bit-for-bit unchanged.

### 10.1 Physical block
```
E_i   = ci_i · Y_i                                  emissions of member i (reference ci* = 1 per unit of reference output, E*_i = Y*_i)
E_w   = E_w* · (1 + shock.worldEmissions/100)       rest of the world, exogenous (E_w* = 3 · Σ E*_i)
S     = S_-1 + Σ_i E_i + E_w − δS · S_-1             global stock of pollution (δS = 0: no natural decay within the game)
D     = min(Dmax, χD · (S − S0) / S0)               damage, from 0 at the start (S0 = initial stock), Dmax = 0.25
ci_i  = max(ci_min, ci_i,-1 · (1 − a_c · ctax_i,-1 − a_g · green_i,-1 / 100))    carbon intensity, falls persistently with the levers (one-year lag), ci_min = 0.3
```
Business as usual (no lever, no shock): S grows linearly, D grows linearly — the reference path is **not** stationary ecologically; the stationarity test applies with emissions switched off (ci = 0), the identities always.

### 10.2 Damage channels (revised 06/11 — Léo: thermometers only)
```
Y*_i,t   = Y*_i · (1 − D)                       damaged potential; gap_D = 100·(Y_i / Y*_i,t − 1)
u_i      = u* + χu · 100·D − β · gap_i           structural unemployment rises with the damage (Okun on the original reference, as now)
π_i      = π* + κ · gap_D + ρ·Δτ·100 + ω·Δxr% + ρc · Δctax_i     inflation on the damaged potential + carbon-tax pass-through
```
No import-propensity channel, no forced repairs (removed). Calibration: χu = 0.4 so that BAU D ≈ 5 % at year 6 shifts u* by +2 pt; χD = 0.5 (D = 0.5·(S₋₁ − S₀)/S₀, ≈ +1 pt a year under BAU). Indirect effects follow from the thermometers: the extra inflation raises the price level (v1.2 channel), so competitiveness vs the rest of the world and GDP erode slowly (≈ −0.9 % by year 6 under BAU).

### 10.3 Levers (game and warm-up, bounded 0–10)
- `ctax` (points, 0–10): carbon tax. Revenue `ctax/100 · E_i` (in output units) to the budget (PB improves); pass-through to inflation ρc = 0.15 per point the year it changes; reduces ci next year by a_c = 0.04 per point (10 pt → ci −40 % per year, floor 0.3).
- `green` (% of reference GDP × 10, 0–10 → 0–2 pt of GDP): public green investment, added to G (demand, deficit), reduces ci next year by a_g = 0.025 per unit (10 → −25 %/yr).
Both are per member; the benefit (slower S) is a global public good — free-riding is the point.

### 10.4 Shocks (per year): `worldEmissions` (%, RoW emissions), `disaster` (%: one-off extra damage this year, D += disaster/100, e.g. 3).
### 10.5 Reporting and decomposition (revised 06/11)
Per country `E` (% of reference), `ci`, `ctax`, `green`, `D`; union: `S/S0`, `D` (%), `Eunion` (% of reference). Objective R unchanged (5 dimensions). **Decomposition gains a fourth part, `climate`**: for v2.0 rows `detail[ind] = {shock, nat, foreign, climate}` with climate = run(all policies + shocks, damage on) − run(same, damage forced to 0: emissions, intensities and levers still simulated), and shock / nat / foreign computed on damage-off runs as before; the four parts add up to the total. `report()` exposes it (`byPart.climate`); the console stores it and splits R over it too; the student page shows a fourth line « of which the climate » (the stacked-bar cumulative split follows); the « of which the shocks » label is unchanged.
### 10.6 Rules: no new vote. Elections presets gain "Green: inflation and the long run" (optional, not required).

### 10.7 As implemented (engine 2.0, 06/11, after Léo's revision of 10.2 and 10.5)
- `params.eco`, `paramsFor('v2.0')`, `OPENMU.VERSION = '2.0'`; v1.1–v1.3 bit-for-bit (regression tests). Fixed point: the plain iteration is kept (bit-for-bit) but a direct linear solve kicks in if it diverges or has not converged after 150 iterations (extreme xr while bracketing a float).
- Parameters: `chiD = 0.5` (the spec's 2.5 contradicted its own target: with S/S0 ≈ +10 % at the end of year 5, 0.5 gives D = 5 % in year 6); `ewMult = 1` (RoW emissions = the union's; with 3 the union's effort weighed a quarter of the flow); carbon-tax revenue `ctaxUnit = 0.002` per point (1 pt ≈ 0.2 % of GDP; `ctax/100·E` made 5 points a 5 %-of-GDP tax); the damage of year t uses the stock at the end of t−1 (plus the disaster of t), so D = 0 in year 1; the carbon tax is paid by firms out of distributed income (YF = Y − AF − rL − Tc), so the identities hold; green investment is inside G. `params.damageOff` forces D = 0 (report helper).
- Decomposition: reference, shocks and own-policy runs with the damage off; climate = damage-on − damage-off; parts add up (1e-16).
- Levers `ctax`/`green` in `MS.LEVERS` with `eco: true`; `MS.leversFor(state)`, `MS.isEcoModel(state)`; `bounds.eco = 10`; `validateDecision` refuses them outside a v2.0 class and outside 0–10 — this runs on the backend: **service 1.6, Code.gs to be redeployed** for v2.0 classes. Switching a class to v2.0 in Parameters adds the two levers to the warm-up's allowed list.
- Magnitudes (France, union-wide unless stated): BAU D 1 → 7 % over years 2–8; year 6: u +2.34 (structural +2.0, Okun +0.34), π +1.31, GDP −0.85, PB −0.32, TB −0.46; R 0 → −1.69 by year 8. Carbon tax 5: E −21 % (year 2) → −71 % (floor, year 7), D 5.5 % in year 8 vs 7.0; year 1 π +0.56, PB +0.38, GDP −0.65. Green 10: E −23 → −70 %, year 1 GDP +2.9, PB −0.9, π +0.9. France alone ctax 10: R −0.31 in year 1 vs 0 BAU, −1.06 in year 6 vs −1.06 BAU (Germany, free-riding, −1.02). Disaster 3: D +3 that year only.

### 10.8 Sixth dimension: emissions (validated 06/11, implemented)
`INDICATORS` gains `emis` (emissions in % of the reference, sign −1, `eco: true`); `MS.indicatorsFor(state)` returns five dimensions for v1.x classes and six for v2.0. The engine reports `emis` as a top-level indicator with its four-part split. **Class weight 0 by default** (`defaultState().weights.emis = 0`): R is unchanged until an election activates the dimension — preset `green` « Green: emissions first » (emis 0.40, the five others 0.12, shown only for v2.0 classes) — or the administrator sets the weight in Parameters. Pages: tables, breakdown, charts (series drawn only when the rows carry `emis`), the objective line (emis listed only when weighted), board detail column, console grids/CSV. Backend **1.7**: `emis` column appended at the END of the Results header; the adapter appends the missing header cell to an existing sheet on first use (positional mapping stays aligned; old rows read `emis` as '').

## 11. Arcade mode: duels (validated 06/11 — two currencies, pairs in parallel on one console with administrator shocks)

**Idea.** Two identical countries, A and B, each with its own currency, central bank, government, households, firms and banks (the full v2.0 economy of one member), trading only with each other (no rest of the world: sR = 1 and the "RoW" of A is B), with cross-holdings of bills (capital flows), a bilateral exchange rate e (A's currency per unit of B's) fixed or floating per year, and a closed climate block (S fed by E_A + E_B only). A class of kind `duel` holds N pairs played in parallel: every pair is its own world, the administrator's shocks of the year apply to all pairs, one Run simulates all pairs. Pedagogy: transparent interdependence, game theory in action, many rounds per hour, controlled symmetry.

### 11.1 Engine (`OPENMU.simulateDuel`, `OPENMU.reportDuel`; behind `params.duel`)
Each economy = the one-member v2.0 model; the exogenous RoW block is replaced by the partner: `XR_A = IMR_B` (B's imports from A, converted at e), `YRoW` replaced by the partner's actual demand, world price by the partner's price level (so relative prices = P_A·e/P_B), `r_w` by the partner's policy rate, RoW bill demand by the partner households' portfolio. The two economies are solved jointly each year (one fixed point over both outputs and, in float, over e). Regimes: **fixed** — both central banks intervene symmetrically: the deficit country's reserves fall by the BoP deficit, the surplus country's rise (each starts at 1.5 months of imports); alert at 25 % for either; exhausted reserves with a continuing deficit → forced devaluation of that currency by 15 % (automatic, no vote); the administrator may decree a devaluation of A or B (shock `devalA`, `devalB`). **Float** — e clears the joint BoP; no reserves move. Switching rules as in v1.3. Risk premium and backstop per country (each has its own CB). Climate as v2.0 with E_w = 0.
Levers per player: the four fiscal levers, ctax, green, **and the policy rate** (`rate`, points relative to r*, −2…+2, acts as in v1.1/v1.3: investment lag, debt service, capital flows). No votes (each player sets its own rate), no council. Elections apply (admin, per pair side or all). Shocks per year (all pairs): confidence, imports, worldEmissions = 0 (none), disaster, regime, devalA/devalB, backstop, plus an **asymmetric demand shock** `demandA`/`demandB` (% of public demand, e.g. a disaster or a boom in one country) to break the symmetry.

### 11.2 Platform
- Class kind `duel` (Control → New class → kind): groups are created in pairs (Groups tab: "Add N pairs" → groups "Pair 1 · A", "Pair 1 · B"…; each group has `pair` and `side` A|B). Result keys `p<pair>:<side>`; union-like rows `DUEL:p<pair>` (e, regime, reserves of both, S, D).
- No warm-up (optional: skip), rounds = years, timer per round, Run year N simulates every pair from the recorded decisions of both sides (a missing decision = reference policy), publish all. Elections card gains scope "all A sides / all B sides / pair k side".
- Students: same page; the form shows seven levers; results: own table, partner's table (after the round closes), the pair panel (exchange rate, both reserves, climate), the "of which" lines (own / partner / shocks / climate), the stacked-bar chart for both; ranking across all players by cumulative R, plus "your duel" (you vs partner).
- Board: grid of pairs (e, reserves bars, D) + global ranking; console: Run preview per pair (compact), Results tab per pair.
- Backend 1.8: groups carry pair/side; `state` for a duel group exposes partner decisions once closed and the pair rows; validation of the `rate` lever (duel only). One Code.gs paste.

### 11.3 As implemented (06/11, engine `OPENMU.simulateDuel`/`reportDuel`, backend v1.8)
Deviations from 11.1–11.2, all deliberate:
- **Trade valuation.** Imports of X are a volume `IMR_X = μF·Y_X·(xr_X,−1·Prel_Z,−1/Prel_X,−1)^(−ε)` (lagged relative prices, as in v1.2/v2.0); exports of X = the partner's import volume; the trade balance of A in A's currency is `XR_A − e·IMR_A`. No separate η: the partner's actual demand enters through its import function.
- **Capital flows.** `λF = λF0 + λf1·((r_Z + s_Z) − (r_X + s_X))` with **λf1 = 0.6 for duels** (1.3 in the union): both portfolios react, so the union value made +1 pt on the policy rate move e by 13 %; 0.6 gives ≈ 6 %. Cross holdings: `Bw_X = Bf_Z` (what the partner's households hold of X's bills).
- **Reserves (fixed).** `R_A += excess_A/e`, `R_B −= excess_A` (ΔR_B = −e·ΔR_A); each side starts at `reserveMonths/12` of its reference imports. **Float**: e bracketed then secant-solved on excess_A each year, jointly with the two outputs.
- **Forced devaluation.** At the start of year t, a side with `R ≤ 0` and `CA′ < 0` in t−1 sees its currency devalued by `forcedDeval` = 15 % (A: e ×1.15; B: e ÷1.15), flagged `forcedA/forcedB` in the pair row; fixed regime only. Administrator `devalA`/`devalB` apply the same way. No crisis vote.
- **Policy rate.** Lever `rate`, points around r*, clamped to ±`rateMax` = 2, step 0.25 in the form; validated by the backend (refused in non-duel classes). Risk premium and no-backstop market clearing per side as in v1.3.
- **Climate.** `S = S₋₁ + E_A + E_B`, S₀ = 50 years of the pair's reference emissions, no `worldEmissions` shock; `disaster` hits both sides. Compet = own price level vs the partner's in a common currency.
- **Shocks list** (every pair): confidence, imports, demandA, demandB, regime, devalA, devalB, backstop, disaster.
- **Report shape.** As `report`: per country rows (`key = 'p<k>:<side>'`, `detail = {shock, nat, foreign, climate}` — `foreign` is the partner's policy —, `extra` incl. compet, spread, E, ci, D, rate, reserves %, months, forced) plus one pair row keyed `DUEL:p<k>` (e, de, regime, RA/RB and shares, alerts, months, CA′/KA/excess per side, S, D, E_A/E_B, backstop, forced, policy rates, identityError). `duelParams()` = v2.0 params + {duel, sR 1, ewMult 0, lambdaF1 0.6, two countries of size 100, rateMax 2, forcedDeval 15}.
- **Platform.** `state.kind = 'duel'`; countries `'p<k>:<side>'` reused by every existing path (results keyed by country); `MS.duelOf(country)`; lever category `money` ("Monetary policy (duel)"); elections scopes `ALL`, `A`, `B` or a country; model forced to v2.0; no warm-up/council/crisis card. Tests: `dev/engine-test.js` (DUEL block: stationarity 2e-16, identities ≤ 1e-10 over 20 seeds × 20 years incl. bilateral BoP and reserves rule) and `dev/e2e-duel.js`.

### 10.9 Green investment rebalanced (06/11, validated by Léo)
Problem: green investment had the same multiplier and budget cost as public demand plus a free climate gain, so it dominated the ordinary lever. Two changes (v2.0 and duel engines; v1.x untouched):
1. **Import content 60 %**: `IM_green = (greenImport − μ)·GREEN = 0.30·GREEN` is added to the member's imports and split like the others (intra-union to partners by the gravity weights, RoW share to the rest of the world; in a duel, to the partner). Identities hold (the flow is a real import). France alone at green 10: GDP +1.7 % in year 1 vs +2.4 % for public demand +10, trade balance −1.1 vs −0.7 pt, public balance −1.3 pt. Union-wide, the intra part returns as partners' exports (union GDP +2.4 %).
2. **Diminishing returns**: `ci = max(0.3, ci₋₁·(1 − 0.04·ctax₋₁ − aG·green₋₁/(1 + green₋₁/gSat)))`, aG = 0.05, gSat = 5 → green 2 / 5 / 10: −7.1 / −12.5 / −16.7 % a year (was −5 / −12.5 / −25 % linear).
Desk: one sentence under the lever and in the rules line; model page: equations and magnitudes.

### §9.8 Recalibration of the reserves and the cross-holdings (validated by Léo, 07/11)
With the first calibration (reserves 1.5 months = 1.9 % of GDP inherited from v1.2, gross cross-holdings 30 % of GDP each way), portfolio moves dwarfed the reserves: a voted rate cut of 0.5 pt emptied them within a year, a devaluation refilled them to 300 % through repatriation (households' foreign bills, valued at λF·V in union currency, shrink in world currency when xr rises; the RoW tops up its union bills). The direction is chapter 12's; the magnitude was unplayable. From v1.3 on (v1.3, v2.0, duel): **reserveMonths = 3, bwShare = 0.15** (RoW holdings of union bills 15 % of union GDP, households' foreign bills ≈ 7 % of wealth), portfolio sensitivities re-tuned to **χw = 3, λf1 = 0.7** (duel: λf1 = 0.25) so that a 0.5 pt rate step still moves a floating rate by ≈ 3.7 % (duel: ≈ 7 % per point). v1.2 keeps 1.5 months (no capital flows); v1.1 keeps 3 months. Magnitudes after the change (France / union, v1.3): float rate +0.5 → xr −3.7 % on impact, union GDP −0.9 % next year; float sudden stop −20 % → depreciation 13 %, −30 % → 21 %, inflation +1.7 / +2.8 pt; fixed sudden stop −5 % → reserves 80 %, −30 % → exhausted in a year; fixed rate cut −0.5 → 74 %; world demand −5 % → 85 / 71 / 58 / 47 %, −10 % → 69 / 41 / 16 %; devaluation 10 % in fixed → reserves refill to ≈ 160 %; union-wide stimulus +5 → 94 / 86 / 76 %. Duel, A alone +10 (fixed): A's reserves 93, 84, 74, 64, 52, 40, 28 % (alert in year 8); float: e +3.9 % → +23 % over five years; A's rate +1 (float): e −6.9 %.

## 12. Leaving the union — sortie de l'union monétaire (validée par Léo, 07/11 ; implémentée, moteur 2.0 + `simulateExit`, backend 1.9)

Statut : **validée et implémentée** (voir 12.9 pour les écarts « as implemented » et la correction de signe du TARGET). Validé par Léo le 07/11 : bilans à la sortie (12.3) avec redénomination de **toute** la dette publique, y compris celle détenue par le reste du monde ; soldes TARGET ; sortie unilatérale ; régime de change choisi par le pays sortant ; la banque centrale de l'union **garde les titres de X** qu'elle détient, ce qui permet au conseil de les vendre ; montants des représailles (tarif, part vendue) votés par le conseil ; plusieurs sorties possibles dans une partie, toutes irréversibles ; transmission complète du change aux prix de toutes les importations du pays sorti. Pas de coûts de transition automatiques : ils passent par des chocs administrateur et par un conseil de représailles (12.5). Les ordres de grandeur marqués « cible » sont à mesurer avec `dev/engine-test.js` ; ceux marqués « mesuré » viennent de l'état de référence actuel (v2.0).

### 12.0 Avant cette version

Le champ `euro: 'leave'|'join'` et la case `game.allowEuro` existaient (hérités de MacSim) sans effet dans le moteur. Depuis le backend 1.9, `join` est refusé, `leave` n'est accepté que si `MS.exitAllowed(state)` (v1.3/v2.0 et `sim.exit`), et la case de la console pilote `sim.exit` (elle est désactivée si le modèle n'est pas v1.3 ou v2.0).

### 12.1 Objectif pédagogique

Montrer ce qu'une sortie rend (un taux et un change à soi, la dévaluation externe au lieu de la dévaluation interne), ce qu'elle coûte (inflation importée, perte de la part des réserves communes, solde TARGET, réaction des marchés et des partenaires) et ce qu'elle impose aux autres (commerce, réserves, votes). Les coûts qui dépendent des réactions (marchés, partenaires) ne sont pas automatiques : l'administrateur et le conseil les décident, ce qui en fait un objet de négociation.

### 12.2 Règle de jeu

- **Décision unilatérale** de l'équipe : choix `leave` avec les décisions de l'année N (secret tant que le tour est ouvert, révélé à la publication comme les votes). Pas de vote du conseil sur la sortie elle-même.
- **Calendrier** : N est l'année de l'annonce (le pays est encore membre). La sortie est **effective au 1er janvier de N+1** : nouvelle monnaie, banque centrale nationale. Au début de N+1, avant les décisions, se tient le **conseil de représailles** (12.5).
- **Irréversible** dans la partie (pas de `join`).
- **Plusieurs sorties** possibles dans la même partie, chacune irréversible : chaque pays sorti a sa monnaie et son change contre l'euro ; les taux croisés entre deux pays sortis passent par l'euro (`e_Y / e_X`), et leurs échanges suivent les mêmes règles que ceux d'un pays sorti avec l'union. Chaque sortie ouvre son propre conseil de représailles. Les membres restants votent ; un pays sorti ne vote pas sur les représailles visant un autre pays sorti.
- **Après la sortie**, le pays : choisit chaque année son **régime de change** (flottant ou parité contre l'euro) et, en parité, peut dévaluer ou réévaluer (12.4) ; obtient le levier `rate` du mode duel (points autour de r*, ±2, pas 0,25) ; garde les six autres leviers ; ne vote plus au conseil (taux, crise de réserves, crise de change) — les majorités se comptent sur les membres restants ; reste classé avec le même R.
- **Disponibilité** : classes v1.3 et v2.0 seulement (il faut le compte financier et le change flottant de §9). Pas en v1.1/v1.2, pas en duel. Activation par classe : `sim.exit = true` (Control → Parameters), qui remplace `game.allowEuro`.

### 12.3 Bilans au moment de la sortie (début de N+1) — validé

Notation : X le pays sortant, NC sa nouvelle monnaie, `e_X` = prix d'un euro en NC (`e_X` ↑ = dépréciation de la NC), `e_X = 1` à la sortie.

**Redénomination 1 pour 1 de toute la dette publique et de tout ce qui relève du droit national** : billets `H_X`, dépôts `M_X`, prêts `L_X`, titres publics détenus par les ménages `Bh_X`, les banques `Bb_X`, la banque centrale `Bcb_X` **et le reste du monde `Bw_X`**, avances `A_X`. Aucun effet de richesse à la sortie.

**Ce qui reste en monnaie étrangère** : les titres étrangers des ménages `Bf_X` (en monnaie mondiale), le solde TARGET (en euros, ci-dessous).

**Ce qui change de détenteur** : rien d'autre que la banque centrale. Les titres de X détenus par la banque centrale de l'union, notés désormais `BcbU_X`, restent à son actif (en NC, redénominés comme le reste de la dette) : l'union devient un créancier de X en NC.

**Conséquences de la redénomination de `Bw_X`** (mesuré à la référence : `Bw_X` = 15 % du PIB, `Bf_X` = 15 % du PIB) :
- la dette publique de X est entièrement en NC : une dépréciation ne l'alourdit pas ; le ratio dette/PIB et la prime de risque de §9.6 ne bougent que par les flux ;
- une dépréciation **améliore** la position extérieure nette de X : ses avoirs (`Bf_X`) prennent de la valeur en NC, ses engagements envers le reste du monde (`Bw_X`) n'en prennent pas. Une dépréciation de 20 % ≈ +3 points de PIB de position nette, au profit des ménages ;
- le perdant est le **reste du monde**, dont la créance sur X se déprécie avec la NC. Pour lui, c'est un défaut partiel : la raison naturelle d'une vente des titres de X, que l'administrateur peut déclencher (12.5).

**Banque centrale nationale (BCN_X)** : reprend `H_X` au passif, `A_X` à l'actif (mais pas les titres publics, qui restent à l'union), plus une **part des réserves communes** `R_X = R · Y*_X / ΣY*` (clé de capital = taille de référence). Le solde de son bilan est un **solde TARGET** envers la banque centrale de l'union, en euros :

```
T2_X = A_X + xr · R_X − H_X                  (en euros, à la date de sortie ; > 0 : BCN_X doit à l'union) — signe corrigé, voir 12.9
```

Mesuré à la référence : `H − A` = 8,8 % du PIB, part des réserves 3,75 % → **T2_X ≈ −5,1 % du PIB : c'est l'union qui doit à la BCN_X exactement les titres de X qu'elle garde** (`Bcb` = 5,1 %), la contrepartie des billets de X que ces titres couvraient. À la sortie, l'union détient 5 % du PIB de X en titres en NC et doit autant en euros à la BCN_X : la créance nette de l'union sur X (`BcbU_X + T2_X`) est nulle. Elle est égale, en général, au déficit cumulé de la balance des paiements de X au-delà de sa part (identité vérifiée : pour chaque membre, Δ(H − Bcb − A) = son excédent de balance des paiements) : un pays qui a fait fuir ses capitaux avant de sortir sort avec plus de titres détenus par l'union. `T2_X` est un stock en euros, rémunéré au taux de l'union `r`, non remboursé sauf décision du conseil (12.5). Une dépréciation de la NC fait perdre l'union deux fois à la référence : ses titres valent moins en euros, et sa dette TARGET pèse plus en NC pour la BCN_X qui la reçoit.

**Après la sortie** :
- `BcbU_X` est constant en NC (renouvelé à l'échéance), rémunéré au taux de X `r_X + s_X`, sauf vente décidée par le conseil (12.5). Les intérêts sont un revenu primaire versé par X à l'union ; le bénéfice de la banque centrale de l'union est reversé aux membres restants.
- La BCN_X est le prêteur en dernier ressort de X : elle achète les titres nouveaux que ni les ménages, ni les banques, ni le reste du monde ne prennent (`BcbN_X`, en NC, partant de 0) ; son bénéfice est reversé au gouvernement de X. La prime de risque de §9.6 s'applique à X comme à un membre avec backstop.

**Union** : `R` diminue de `R_X` ; la banque centrale de l'union porte `T2_X` en créance (ou dette) sur la BCN_X, en euros, et `BcbU_X` en NC. Identité de l'union (sans X) : `Σ_{i≠X} H_i = Σ_{i≠X} (Bcb_i + A_i) + xr · R + T2_X + BcbU_X / e_X − NWcb` (`NWcb` inclut désormais la perte de valeur de `BcbU_X`).

### 12.4 Le change du pays sorti

### Un seul prix à résoudre, deux taux à lire

X échange avec deux partenaires qui ont chacun leur monnaie : l'union (euro) et le reste du monde (monnaie mondiale). Il y a donc deux taux de change pour X :
- `e_X` : prix d'un euro en NC — **c'est le taux que X choisit de laisser flotter ou de fixer** ;
- `e_X · xr` : prix d'une unité de monnaie mondiale en NC — **le taux croisé**, qui n'est pas choisi séparément. Il découle de `e_X` et du taux de l'union `xr` (prix de la monnaie mondiale en euros). Par arbitrage, il n'existe qu'un prix du dollar en NC : celui qu'on obtient en passant par l'euro.

Conséquence : X ne contrôle que `e_X`. Si l'union se déprécie contre le monde (`xr` ↑), la NC se déprécie aussi contre le monde, du même pourcentage, à `e_X` donné. C'est la situation du Danemark ou de la Bulgarie aujourd'hui.

### Régime flottant

La BCN_X n'intervient pas : ses réserves `R_X` sont gelées. `e_X` est le prix qui équilibre la balance des paiements de X, chaque année, conjointement avec les PIB (comme `xr` en v1.3) :

```
CA'_X(e_X) + KA_X(e_X) = 0
CA'_X = X_X − e_X·IMU_X − e_X·xr·IMR_X + r_w,−1·e_X·xr·Bf_X,−1 − (r_X,−1 + s_X,−1)·(Bw_X,−1 + BcbU_X,−1) − r_−1·e_X·T2_X
KA_X  = ΔBw_X + ΔBcbU_X − e_X·xr·ΔBf_X + e_X·ΔT2_X          (ΔBcbU_X < 0 quand l'union vend ; ΔT2_X < 0 quand la BCN_X règle le TARGET)
```

Ce qui fait bouger `e_X` : ses déficits commerciaux (avec l'union et avec le monde), l'écart de son taux `r_X` avec ceux de l'union et du monde (flux de capitaux), les chocs de l'administrateur (12.5). Une baisse de `r_X` de 1 point fait sortir des capitaux et déprécie la NC ; ordre de grandeur cible : 5 à 8 % (calibrage du duel : ≈ 7 % par point).

Si l'union flotte elle aussi, les deux prix `xr` et `e_X` sont résolus ensemble chaque année (boucle externe sur `xr`, boucle interne sur `e_X`, encadrement + sécante comme aujourd'hui).

### Régime de parité (« parité en variante »)

X fixe `e_X` contre l'euro — un currency board ou un système type mécanisme de change européen. La BCN_X défend la parité avec ses réserves `R_X` (la part reçue à la sortie) : elle achète ou vend de la NC pour que `e_X` ne bouge pas, et ses réserves absorbent le solde de la balance des paiements :

```
e_X donné (parité choisie par l'équipe)
R_X = R_X,−1 + (CA'_X + KA_X) / (e_X · xr)
```

- **Parité de départ** : 1 (la conversion 1 pour 1), ou le dernier `e_X` si X passait du flottant à la parité.
- **Dévaluation ou réévaluation** : décision de l'équipe (champ `peg` : variation de la parité en %, bornée ±20), effective l'année même.
- **Alerte** : `R_X < 25 %` de sa part initiale, affichée au pays sorti.
- **Épuisement** (`R_X ≤ 0` et déficit à la fin de N) : dévaluation forcée de 15 % en N+1, comme en duel, sans vote.
- Le taux croisé contre le monde suit toujours l'union : `e_X · xr`.

La parité garde l'ancrage (pas d'inflation importée venant de l'union) mais redonne une contrainte de réserves, sans les réserves communes. Le flottant supprime la contrainte de réserves mais fait varier les prix à l'importation.

### Choix du régime

Décision de l'équipe X chaque année, dans son formulaire (champ `fx: 'float'|'peg'`, défaut `float`, plus `peg` pour une variation de parité). Le passage flottant → parité fige le taux de l'année précédente ; parité → flottant libère `e_X` et gèle `R_X`.

### Autres équations de X après la sortie

Mêmes équations qu'un membre de v1.3/v2.0, avec :

**Taux** : `r_X = r* + rate_X/100` (levier), plus la prime `s_X` de §9.6 sur la dette en NC. Le choc de taux de l'administrateur et le vote de la BCE ne touchent plus X.

**Commerce** — même convention que pour le reste du monde aujourd'hui (prix en monnaie du producteur, effets prix avec un an de retard, élasticités inchangées) :
```
importations de X depuis j ∈ union :  volume IMU_Xj = (1 − sR)·μ·Y_X · s_Xj · (e_X,−1 · Prel_j,−1 / Prel_X,−1)^(−εU)                 coût en NC : e_X · IMU_Xj
importations de j depuis X :          volume IMU_jX = (1 − sR)·μ·Y_j · s_jX · ((1 + tU)·Prel_X,−1 / (e_X,−1 · Prel_j,−1))^(−εU)    coût en euros : IMU_jX / e_X
importations de X depuis le RdM :     IMR_X = sR·μ·Y_X · (e_X,−1·xr_−1 / (xr0·Prel_X,−1))^(−ε)                                    coût en NC : e_X·xr·IMR_X
exportations de X vers le RdM :       XR_X = xR*_X · monde · (e_X·xr / (xr0·Prel_X,−1))^η
```
`tU` : tarif de représailles de l'union sur les importations venant de X (12.5), 0 par défaut ; recette versée aux gouvernements des membres importateurs.

**Inflation** (thermomètre) : la transmission du change vaut désormais pour toutes les importations de X, au même degré par unité de part importée qu'aujourd'hui :
```
π_X = … + ω · 100·Δ(e_X·xr)/(e_X·xr)_−1 + ω·((1 − sR)/sR) · 100·Δe_X/e_X,−1
```
Transmission complète (validé) : avec sR = 0,5 (mesuré), une dépréciation de 10 % de la NC contre l'euro ajoute ≈ 3 points d'inflation l'année même (≈ 1,5 par les importations venant du reste du monde, ≈ 1,5 par celles venant de l'union). Elle est nulle en parité tenue contre l'euro (seul `xr` joue).

**Portefeuilles** : ménages de X : `λF = λF0 + λf1·(r_w − r_X − s_X)` (anticipations statiques, comme ch. 12). Reste du monde : demande de titres de X, en NC, `Bw_X = e_X · xr · Bw$*_X · (1 + χw·(r_X − r_w) − χs·s_X) · (1 + flowsX/100)`, avec `flowsX` le choc administrateur propre à X (12.5).

**Union** : ses échanges avec X deviennent extérieurs. Son compte courant inclut le solde avec X et les intérêts sur `T2_X` ; en fixe, `R` absorbe tout le solde extérieur de l'union (RdM et X) ; en flottant, `xr` le solde. Les agrégats de l'union (PIB, niveau des prix, alerte, mois d'importations) excluent X à partir de N+1.

### 12.5 Ce qui rend la sortie difficile : administrateur et conseil

Aucun coût automatique. Deux sources, au choix de l'administrateur et des autres équipes.

### Chocs administrateur propres au pays sorti

Nouvelles lignes de l'éditeur de chocs, actives dès qu'une sortie est annoncée, par année (y compris l'année d'annonce N), appliquées à X seulement :

| Choc | Effet | Exemple |
|---|---|---|
| `exitConfidence` (%) | propension à consommer des ménages de X, `α1 × (1 + exitConfidence/100)` | −3 en N+1 |
| `exitFlows` (%) | demande du reste du monde pour les titres de X (`flowsX`) : vente des titres redénominés | −20 en N+1 |
| `exitRun` (points de richesse) | l'année d'annonce, les ménages de X sortent leurs dépôts vers les titres étrangers (`λF0_X + exitRun`) ; en change fixe, ce sont les réserves communes qui paient | 5 en N |

Le choc de confiance générique existant continue de toucher toute l'union.

### Conseil de représailles, automatique au début de N+1

Un tour à part, comme le vote de crise de §7.6 : ouvert par la console au début de N+1, avant les décisions ; seuls les membres restants votent. **Les montants sont votés** : chaque membre choisit un niveau sur une échelle courte, et l'issue est la **médiane** des votes exprimés (absent = 0). La médiane est le seul niveau qu'aucune majorité ne préfère changer dans un sens ou dans l'autre ; avec un vote oui/non, elle revient à la majorité des votants, comme pour les autres votes du conseil.

1. **Tarif sur les importations venant de X** : `tU` ∈ {0, 5, 10, 20} %, voté, sur les importations de tous les membres venant de X. Il renchérit les produits de X dans l'union (volume) et rapporte une recette aux importateurs, mais il renchérit aussi la consommation de l'union. Le tarif reste en place jusqu'à ce qu'un conseil ultérieur le change : l'administrateur peut rouvrir le conseil n'importe quelle année. Cette question câble l'option `allowTariff` aujourd'hui morte.
2. **Règlement immédiat du solde TARGET** (oui/non, proposé seulement si `T2_X > 0`) : la BCN_X doit payer `T2_X` dans l'année, en réserves `R_X` d'abord ; ce qui manque la force à vendre de la NC contre des euros, donc à déprécier (flottant) ou à épuiser ses réserves (parité). Les réserves de l'union augmentent d'autant.
3. **Vente des titres de X détenus par l'union** (validé) : la banque centrale de l'union vend dans l'année une part votée de `BcbU_X`, ∈ {0, 25, 50, 100} %. Deux effets, comme pour une attaque contre une monnaie :
   - **sur le taux de X** : les titres vendus doivent trouver preneur dans X. Par défaut, ce sont les ménages et les banques de X, et le taux de X monte jusqu'à ce qu'ils les absorbent (mécanisme de marché « sans backstop » de §9.7, appliqué au seul montant vendu ; plafond 25 %). L'équipe X peut décider que sa BCN les rachète (champ `absorb` de son formulaire, oui/non) : le taux ne monte pas, mais la BCN crée la NC correspondante ;
   - **sur le change de X** : l'union convertit la NC reçue en euros, ce qui est une sortie de capitaux pour X (`ΔBcbU_X < 0` dans `KA_X`) : la NC se déprécie (flottant) ou la BCN_X perd des réserves (parité).

   Le dilemme pour X est donc entre un taux plus élevé (investissement, dette, prime) et une monnaie plus faible (inflation importée), mais il ne peut pas éviter le second. La vente se répète chaque année au taux voté tant qu'un conseil ne le change pas, jusqu'à épuisement des titres. Ordres de grandeur cibles pour la France (vente de 50 % ≈ 2,5 % du PIB de X en un an) : dépréciation 3 à 8 % en flottant, ou une perte de la moitié de `R_X` en parité ; sans rachat par la BCN, taux de X +1 à +3 points.

Le conseil est un lieu de négociation : X peut prendre des engagements (§7.4) avant le vote, par exemple garder une parité ou rembourser le TARGET.

### 12.6 Affichage et plateforme

- **Page étudiants** : option « Leave the union at the end of this year » avec avertissement (irréversible) et confirmation ; après la sortie, levier « Policy rate », choix du régime (`fx`) et de la parité (`peg`), choix `absorb` quand l'union vend ses titres, plus de votes du conseil, panneau « Your currency » (`e_X`, taux croisé `e_X·xr`, variations, `T2_X`, titres détenus par l'union `BcbU_X`, réserves `R_X` et alerte en parité, tarif de l'union s'il y en a un). Pour les membres restants : carte de vote du conseil de représailles au début de N+1.
- **Conseil / board** : bandeau « X announced its exit (effective year N+1) » à la publication de N ; résultat du conseil de représailles ; pays sortis grisés dans le panneau de l'union, avec leur change ; majorités sur les membres restants.
- **Console** : le rejeu lit `euro: 'leave'` dans les décisions et construit `opts.exits = {X: N+1}` ; carte « Retaliation council · year N+1 » (Open / Close and announce / Reopen, comme la carte de crise) ; nouvelles lignes de chocs (12.5) ; la console enregistre `state.exits` et `state.retaliation[N]` à la publication.
- **Décomposition** : la sortie, le régime et la parité sont des politiques de X : « own policy » pour X, « foreign » pour les autres ; les mesures de représailles sont des politiques des autres : « foreign » pour X.
- **Page du modèle** : section dépliable « Leaving the union », équations ci-dessus et ordres de grandeur mesurés.
- **Backend** (1.9 ou suivante) : `validateDecision` accepte `rate`, `fx`, `peg` et `absorb` pour un pays présent dans `state.exits` à partir de son année de sortie ; refuse les votes du conseil d'un pays sorti et un second `leave` ; nouveau tour `phase: 'retaliation'` (sur le modèle de `phase: 'crisis'`). Un collage de `Code.gs`.

### 12.7 Moteur et tests

- `params.exit` dans `simulateV11` : aucun pays sorti → chemin actuel inchangé ; v1.1–v2.0 et duel reproduits **au bit près** (tests de régression).
- `dev/engine-test.js`, bloc EXIT : sortie à la référence sans choc → rien ne bouge (`e_X` = 1, `T2_X` = −`BcbU_X`) ; identités sur 20 graines × 40 ans : bilan de la BCN_X, identité de l'union avec `T2_X` et `BcbU_X`, somme des balances des paiements union + X + RdM = 0, richesse des ménages de X = actifs (en NC), en flottant et en parité ; ordres de grandeur imprimés : baisse de `r_X` d'un point, chocs `exitFlows` −20 et `exitConfidence` −3, tarif de 10 %, règlement du TARGET, vente de 50 % des titres avec et sans rachat par la BCN_X, dévaluation de 10 % en parité.
- `dev/e2e-exit.js` : annonce en année 2, conseil de représailles et sortie effective en 3, levier `rate`, passage flottant → parité, votes à six, panneau de change, board.

### 12.8 Décisions

Tranché le 07/11 : part vendue et tarif votés par le conseil (médiane) ; plusieurs sorties possibles, irréversibles ; pas de réintégration ; transmission complète du change à toutes les importations du pays sorti.

Reste à mesurer en codant : coût de calcul au-delà de deux sorties en flottant (un change de plus à résoudre par pays sorti) : à mesurer, sans doute acceptable jusqu'à trois.

### 12.9 As implemented (07/11) — écarts et précisions

- **Signe du TARGET** (corrigé après validation, signalé à Léo) : `T2_X = A_X + xr·R_X − H_X`, > 0 quand la BCN_X doit à l'union. À la référence il vaut −`BcbU_X` (−5,05 % du PIB) : l'union doit à X. La question « règlement immédiat » du conseil (proposée seulement si `T2_X > 0`) ne s'ouvre donc qu'après un choc qui gonfle les réserves de l'union avant la sortie (dévaluation de 30 % → T2 = +1,5 %). La créance nette pertinente est `BcbU_X + T2_X` (déficit cumulé de X au-delà de sa part) : 4,9 % du PIB après une fuite des dépôts de 3 pt de richesse pendant l'année d'annonce.
- **Moteur** : `OPENMU.simulateExit(p, opts)`, appelé par `simulate` seulement si `p.capital` et qu'une politique contient `leave` (année d'annonce ; sortie l'année suivante). `simulateV11` n'est pas modifié : v1.1–v2.0 et duel au bit près. Sans sortie effective dans l'horizon, `simulateExit` reproduit l'union à 4·10⁻¹² (tolérance des racines). Entrées : politiques du pays sorti `rate` (points, ±2), `peg` (1 = parité), `pegChange` (%), `absorb` (1 = la BCN rachète) ; `opts.retaliation[t][X] = {tariff, sale, settle}` ; `shocks[t].exitShocks[X] = {confidence, flows, run}`. `params.forcedDevalExit` = 15.
- **Change** : `E` par pays (1 pour les membres), taux croisé `E·xr` ; Gauss-Seidel sur les pays sortis flottants (encadrement + sécante en 1D), à l'intérieur de la racine en `xr` si l'union flotte. Deux sorties flottantes + union flottante, 8 ans, `report` complet : ≈ 1,3 s.
- **Commerce** : poids intra `w_ij = s_ij·((P_j/E_j)·E_i/P_i·(1+tU))^(−εU)` (prix décalés d'un an, change décalé d'un an comme `xr`) ; valeur des importations de i depuis j : volume × `E_i/E_j` ; tarif de l'union : recette des membres importateurs (impôt sur la dépense : `C = (1−τc)·CE − tarif`), identités inchangées.
- **Taux** : pour X, prêts, dépôts et titres au taux `r_X` (décalé d'un an comme `r`) ; la BCN ne perçoit pas la prime sur ses propres titres (elle est le backstop) ; le choc de confiance général et le choc `flows` de l'union ne touchent plus X (ses chocs propres le font).
- **Vente** : la part vendue de `BcbU_X` doit être absorbée par les ménages et les banques de X au-dessus de leur portefeuille au taux de marché (le taux de X monte, plafond 25 %) sauf `absorb` (la BCN l'achète) ; dans les deux cas la conversion en euros est une sortie de capitaux de X.
- **Fuite des dépôts** (`run`) : déplacement **durable** de `λF0` (cumulé depuis l'annonce ; une valeur négative rapatrie), sinon le rapatriement automatique de l'année de sortie faisait apprécier la NC de 40 %.
- **Décomposition** : sortie, régime, parité, taux, rachat et chocs propres à X = « own policy » de X ; représailles = « foreign » pour X (elles ne sont passées qu'aux runs complets de `report`).
- **Agrégats** : la ligne UNION porte sur les membres restants (PIB comparé à la référence des seuls membres) et ajoute `exited`, `members`, `announced`, `exitInfo`, `retaliation` ; la ligne du pays sorti ajoute `fx, dfx, fxWorld, peg, forced, rate, rEff, tariff, sold, settled, T2, BcbU` (% du PIB) et `RXshare`, `RXalert`.
- **Plateforme** : `MS.exitAllowed(state)` (v1.3/v2.0, `sim.exit`), `state.exits` enregistré par la console à la publication, `state.retaliation[N][X] = {status, settleOpen, outcome:{tariff, sale, settle}, votes, playing}` ; `MS.retaliationIn(state, X, y)` (dernier conseil clos ≤ y ; règlement l'année du vote seulement) ; `MS.tallyRetaliation` (médiane basse, absents = 0). Backend 1.9 : tour `phase: 'retaliation'` (un vote par cible), refus des décisions pendant un conseil, refus des votes (taux, crise, représailles) d'un pays sorti, `rate/fx/pegChange/absorb` acceptés seulement pour un pays sorti.
- **Ordres de grandeur** (France, v1.3, années 2–5, imprimés par `engine-test`) : taux −1 pt en flottant → NC +10,9 %, π +2,6 pt, PIB −2,3 % puis +1,4 % ; relance +5 en flottant → NC +2 → +11 %, π +0,8 → +1,0 ; en parité → réserves 90, 78, 64, 47, 29 % de la part ; dévaluation de 10 % en parité → π +2,4 pt ; RdM −20 % → NC +20 %, π +4,7 ; confiance −3 % → PIB −1,3 % ; fuite des dépôts de 1 pt pendant l'annonce → réserves communes 88 % de R0 ; tarif 10 % → PIB −1,9 %, réserves de l'union en hausse ; vente de la moitié des titres → NC +12 % (taux +0,2 pt ; avec rachat : NC +14 %, taux inchangé).



## 13. Tariffs — droits de douane (07–08/11, Léo : options 1 et 2)

Activation par classe : `sim.tariffs` (Control → Parameters → « tariffs »), union seulement (pas en duel). Remplace l'option morte héritée de MacSim (`game.allowTariff`, tarifs par partenaire jamais lus par le moteur), désormais toujours désactivée. Avec tous les tarifs à 0, le moteur est identique au bit près : l'activation en cours de partie ne change pas les années publiées (vérifié par `e2e-exit.js`).

### 13.1 Tarif extérieur commun (TEC)
- **Vote** : chaque année, avec ses décisions, chaque membre (pas un pays sorti) choisit 0, 5, 10 ou 20 % (`votes.cet`). Niveau de l'année = **médiane basse des votes exprimés** ; sans aucun vote, le niveau précédent reste. Le formulaire propose par défaut le niveau en vigueur. La console le calcule au rejeu et le passe au moteur comme choc de l'année `shocks[t].cet`.
- **Moteur** : importations d'un membre venant du RdM `IMR_i × (1 + cet)^(−ε)` (l'année même) ; recette `cet·xr·IMR_i` au gouvernement importateur, payée par ses ménages (impôt sur la dépense : `C = (1−τc)·CE − recette`, `T += recette`). Pas de transmission à l'inflation (comme le tarif de représailles). Un pays sorti n'est pas concerné.
- **Riposte du RdM** : choc administrateur `worldTariff` (%) : exportations des membres vers le RdM `× (1 + wt)^(−η)` ; la recette va au RdM (rien pour l'union).

### 13.2 Tarif d'un pays sorti sur les produits de l'union
- Levier `tariffU` (0–20 %, `bounds.tariffU`), proposé seulement à un pays sorti quand `sim.tariffs` est actif. Facteur `(1 + tariffU)` sur le prix relatif des importations du pays sorti venant des membres (même équation que le tarif de représailles de l'union, §12.5) ; recette en monnaie nationale pour son gouvernement, payée par ses ménages.

### 13.3 Ordres de grandeur (v1.3, France ; imprimés par `engine-test`)
- CET 10 % for 4 y, France: GDP -0.62 -0.58 -0.54 -0.50 | PB +1.17 +1.18 +1.20 +1.21 | TB +1.06 +1.10 +1.12 +1.15 | reserves % 128 157 187 218
- CET 10 % + RoW tariff 10 %, France: GDP -2.03 -1.90 -1.77 -1.65 | PB +0.62 +0.67 +0.72 +0.76 | TB +0.27 +0.38 +0.47 +0.56
- exited Italy, tariff 10 % on the union: ITA GDP +0.83 +0.53 +0.31 | ITA PB +1.61 +1.49 +1.39 | ITA currency -6.0 -11.5 -16.7 % | DEU GDP -0.57 -0.54 -0.52
- Lecture : un TEC de 10 % est **récessif** pour l'union tant que la recette n'est pas dépensée (les ménages paient ≈ 1,4 % du PIB, les importations ne baissent que de 7 %), mais il améliore fortement le solde public, le solde commercial et les réserves (+28 % de R0 la première année en change fixe). Une riposte du RdM de 10 % annule le gain commercial et alourdit la récession. Le pays sorti qui taxe l'union gagne du PIB et des recettes, mais sa monnaie s'apprécie (−6 % puis −17 % sur trois ans), ce qui rend une partie du gain.

### 13.4 Plateforme
`MS.tariffsOn(state)`, `MS.CET_LEVELS`, levier `tariffU` (`exitOnly`) ; backend **1.10** : `votes.cet` validé (0/5/10/20, ignoré si `sim.tariffs` est inactif, retiré pour un pays sorti), `tariffU` refusé hors d'un pays sorti ou hors `sim.tariffs`, borné à 20 %. Console : rejeu (médiane), ligne d'aperçu « Common external tariff: … → N % », ligne de choc « Rest of the world: tariff on union exports ». Pages : question « The common external tariff » dans le bloc des votes, ligne dans le panneau de l'union (`votes.cet`, `worldTariff`), levier et ligne « Your tariff on goods from the union » pour le pays sorti ; recette en `detail.extra.tariffRev` (% du PIB).

