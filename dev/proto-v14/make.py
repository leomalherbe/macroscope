# Builds dev/proto-v14/engine14.js from engine.js (v1.3) + the v1.4 households prototype. Run: python3 dev/proto-v14/make.py
import os
here = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(here, '..', '..', 'engine.js'), encoding='utf-8').read()
def r(a, b, n=1):
    global s
    # only the union and exit paths are changed: the duel model (after 'function simulateDuel') is left as it is
    k = s.index('  function simulateDuel('); head, tail = s[:k], s[k:]
    c = head.count(a); assert c == n, (a[:90], c); s = head.replace(a, b) + tail

# helper: the two household groups
r("""  function billsShare(p, r) { return Math.min(p.lambdaCap, p.lambda0 + p.lambda1 * r); }""",
"""  function billsShare(p, r) { return Math.min(p.lambdaCap, p.lambda0 + p.lambda1 * r); }
  /* v1.4 prototype (params.hetero): modest households = bottom 50 % (share wP of the income distributed by firms + all benefits,
     no income tax, wealth held as cash) and wealthy households = top 50 % (the rest + all asset income, all the income tax,
     the financial portfolio). Propensity to consume out of wealth: alpha2 for the modest, alpha2R (calibrated, ≈ alpha2) for the
     wealthy. conf = confidence factor a1/alpha1. */
  function households(p, rc, YF, assetInc, theta, TR, conf, VP, VR) {
    if (!p.hetero) { var b0 = YF + assetInc, yd0 = (1 - theta) * b0 + TR; return { base: b0, YD: yd0, CE: conf * p.alpha1 * yd0 + p.alpha2 * (VP + VR), YDP: 0, YDR: yd0, CEP: 0, CER: 0 }; }
    var ydp = rc.wP * YF + TR, base = (1 - rc.wP) * YF + assetInc, ydr = (1 - theta) * base;
    var cep = conf * p.alpha1P * ydp + p.alpha2 * VP, cer = conf * p.alpha1R * ydr + rc.alpha2R * VR;
    return { base: base, YD: ydp + ydr, CE: cep + cer, YDP: ydp, YDR: ydr, CEP: cep, CER: cer };
  }""")

# calibration (union and exit share calibrateV11)
r("""      var BhAll = V * billsShare(p, p.r);      // domestic + foreign bills (v1.3): the foreign share is carved out of this total
      var Bf = p.capital ? p.bwShare * Y : 0;  // v1.3: foreign bills (world currency, xr0 = 1) — same amount as the RoW holds of this government's bills
      var Bh = BhAll - Bf;
      var M = (V - BhAll) * p.nu, H = (V - BhAll) * (1 - p.nu);
      var YF = Y - AF - p.r * L;               // income distributed to households by firms
      var base = YF + p.r * (Bh + M) + p.rw * Bf;   // income-tax base (foreign interest = domestic interest forgone: θ* unchanged)
      var theta = 1 - (CE - TR) / base;""",
"""      var YF = Y - AF - p.r * L;               // income distributed to households by firms
      /* v1.4: the modest households get omegaP of the wages (wageShare of the income distributed by firms; the rest is profits,
         to the wealthy) and all benefits; each group at its own wealth target; the wealthy's alpha2R and income-tax rate are what
         keep the same aggregate CE, V and public balance as v1.3 */
      var het = !!p.hetero, YDP = 0, VP = 0, VR = V, wP = 0, alpha2R = p.alpha2;
      if (het) { wP = p.omegaP * p.wageShare; YDP = wP * YF + TR; VP = (1 - p.alpha1P) / p.alpha2 * YDP; VR = V - VP; alpha2R = (1 - p.alpha1R) * (CE - YDP) / VR; }
      var BhAll = VR * billsShare(p, p.r);
      var Bf = p.capital ? p.bwShare * Y : 0;
      var Bh = BhAll - Bf;
      var M = (VR - BhAll) * p.nu, H = (VR - BhAll) * (1 - p.nu) + VP;
      var base = (1 - wP) * YF + p.r * (Bh + M) + p.rw * Bf;
      var theta = het ? 1 - (CE - YDP) / base : 1 - (CE - TR) / base;""")
r("""        C: C, CE: CE, YD: CE, V: V, Bh: Bh, Bf: Bf, Bw: Bf, lambdaF0: p.capital ? Bf / V : 0,""",
"""        C: C, CE: CE, YD: CE, V: V, VP: VP, VR: VR, YDP: YDP, YDR: CE - YDP, wP: wP, alpha2R: alpha2R, Bh: Bh, Bf: Bf, Bw: Bf, lambdaF0: p.capital ? Bf / VR : 0,""")
r("""      rc.T = rc.theta * (rc.YF + p.r * (rc.Bh + rc.M) + p.rw * rc.Bf) + rc.tauc * rc.CE;""",
"""      rc.T = rc.theta * ((1 - rc.wP) * rc.YF + p.r * (rc.Bh + rc.M) + p.rw * rc.Bf) + rc.tauc * rc.CE;""")

# prev (union and exit)
r("""      prev[id] = { Y: rc.Y, V: rc.V, Bh: rc.Bh, M: rc.M, B: rc.B, Bcb: rc.Bcb, A: rc.A, K: rc.K, L: rc.L, tau: rc.tau, P: 1, Prel: 1,
        Bf: rc.Bf || 0,""", """      prev[id] = { Y: rc.Y, V: rc.V, VP: rc.VP || 0, VR: rc.VR !== undefined ? rc.VR : rc.V, Bh: rc.Bh, M: rc.M, B: rc.B, Bcb: rc.Bcb, A: rc.A, K: rc.K, L: rc.L, tau: rc.tau, P: 1, Prel: 1,
        Bf: rc.Bf || 0,""", 2)

# union path: fixed point and accounts
r("""            var base = cap ? YF + r1 * (pv.Bh + pv.M) + extraInc[id] : YF + r1 * (pv.Bh + pv.M);
            var YD = (1 - c.theta) * base + c.TR;
            var CE = a1 * YD + p.alpha2 * pv.V;""",
"""            var hh = households(p, ref.countries[id], YF, r1 * (pv.Bh + pv.M) + (cap ? extraInc[id] : 0), c.theta, c.TR, a1 / p.alpha1, pv.VP, pv.VR);
            var YD = hh.YD, CE = hh.CE;""")
r("""          var base = cap ? YF + r1 * (pv.Bh + pv.M) + extraInc[id] : YF + r1 * (pv.Bh + pv.M);
          var YD = (1 - c.theta) * base + c.TR;
          var CE = a1 * YD + p.alpha2 * pv.V;""",
"""          var hh = households(p, rc, YF, r1 * (pv.Bh + pv.M) + (cap ? extraInc[id] : 0), c.theta, c.TR, a1 / p.alpha1, pv.VP, pv.VR);
          var base = hh.base, YD = hh.YD, CE = hh.CE;""")
r("""          var V = cap ? pv.V + YD - CE + capGain[id] : pv.V + YD - CE;""",
"""          var V = cap ? pv.V + YD - CE + capGain[id] : pv.V + YD - CE;
          var VP = pv.VP + hh.YDP - hh.CEP, VR = V - VP;""")
r("""          function portfolio(rEff) {
            var all = V * billsShare(p, rEff);
            var lamF = cap ? Math.max(0, Math.min(billsShare(p, rEff), rc.lambdaF0 + p.lambdaF1 * (rw - rEff))) : 0;
            var o = {};
            o.Bf = cap ? lamF * V / xr : 0;               // world currency
            o.Bh = cap ? all - lamF * V : all;
            o.M = (V - all) * p.nu; o.H = (V - all) * (1 - p.nu);""",
"""          function portfolio(rEff) {
            var all = VR * billsShare(p, rEff);
            var lamF = cap ? Math.max(0, Math.min(billsShare(p, rEff), rc.lambdaF0 + p.lambdaF1 * (rw - rEff))) : 0;
            var o = {};
            o.Bf = cap ? lamF * VR / xr : 0;               // world currency
            o.Bh = cap ? all - lamF * VR : all;
            o.M = (VR - all) * p.nu; o.H = (VR - all) * (1 - p.nu) + VP;""")
r("""          year.countries[id] = { Y: Y, gap: gap, u: u, pi: pi, P: P, Prel: Prel, C: C, CE: CE, G: c.G, TR: c.TR, theta: c.theta, tau: c.tau, T: T, YD: YD,
            V: V, Bh: Bh,""", """          year.countries[id] = { YDP: hh.YDP, YDR: hh.YDR, CEP: hh.CEP, CER: hh.CER, VP: VP, VR: VR, carbP: p.ctaxPass && Tc ? Tc * p.ctaxWeightP * hh.CEP / (p.ctaxWeightP * hh.CEP + hh.CER) : 0, carbR: p.ctaxPass && Tc ? Tc * hh.CER / (p.ctaxWeightP * hh.CEP + hh.CER) : 0, Y: Y, gap: gap, u: u, pi: pi, P: P, Prel: Prel, C: C, CE: CE, G: c.G, TR: c.TR, theta: c.theta, tau: c.tau, T: T, YD: YD,
            V: V, Bh: Bh,""")
r("""          newPrev[id] = { Y: Y, V: V, Bh: Bh,""", """          newPrev[id] = { Y: Y, V: V, VP: VP, VR: VR, Bh: Bh,""")

# exit path
r("""            var base = YF + pv.rb * (pv.Bh + pv.M) + extraInc[id];
            var YD = (1 - c.theta) * base + c.TR;
            var CE = a1[id] * YD + p.alpha2 * pv.V;""",
"""            var hh = households(p, ref.countries[id], YF, pv.rb * (pv.Bh + pv.M) + extraInc[id], c.theta, c.TR, a1[id] / p.alpha1, pv.VP, pv.VR);
            var YD = hh.YD, CE = hh.CE;""")
r("""          var base = YF + pv.rb * (pv.Bh + pv.M) + extraInc[id];
          var YD = (1 - c.theta) * base + c.TR;
          var CE = a1[id] * YD + p.alpha2 * pv.V;""",
"""          var hh = households(p, rc, YF, pv.rb * (pv.Bh + pv.M) + extraInc[id], c.theta, c.TR, a1[id] / p.alpha1, pv.VP, pv.VR);
          var base = hh.base, YD = hh.YD, CE = hh.CE;""")
r("""          var V = pv.V + YD - CE + capGain[id];""", """          var V = pv.V + YD - CE + capGain[id];
          var VP = pv.VP + hh.YDP - hh.CEP, VR = V - VP;""")
r("""          function portfolio(rE) {
            var all = V * billsShare(p, rE);
            var lamF = Math.max(0, Math.min(billsShare(p, rE), rc.lambdaF0 + run + p.lambdaF1 * (rw - rE)));
            var o = { Bf: lamF * V / (Ei * xr), Bh: all - lamF * V, M: (V - all) * p.nu, H: (V - all) * (1 - p.nu) };""",
"""          function portfolio(rE) {
            var all = VR * billsShare(p, rE);
            var lamF = Math.max(0, Math.min(billsShare(p, rE), rc.lambdaF0 + run + p.lambdaF1 * (rw - rE)));
            var o = { Bf: lamF * VR / (Ei * xr), Bh: all - lamF * VR, M: (VR - all) * p.nu, H: (VR - all) * (1 - p.nu) + VP };""")
r("""          year.countries[id] = { Y: Y, gap: gap, u: u, pi: pi, P: P, Prel: Prel, C: C, CE: CE, G: c.G, TR: c.TR, theta: c.theta, tau: c.tau, T: T, YD: YD,""",
"""          year.countries[id] = { YDP: hh.YDP, YDR: hh.YDR, CEP: hh.CEP, CER: hh.CER, VP: VP, VR: VR, carbP: p.ctaxPass && Tc ? Tc * p.ctaxWeightP * hh.CEP / (p.ctaxWeightP * hh.CEP + hh.CER) : 0, carbR: p.ctaxPass && Tc ? Tc * hh.CER / (p.ctaxWeightP * hh.CEP + hh.CER) : 0, Y: Y, gap: gap, u: u, pi: pi, P: P, Prel: Prel, C: C, CE: CE, G: c.G, TR: c.TR, theta: c.theta, tau: c.tau, T: T, YD: YD,""")
r("""          newPrev[id] = { Y: Y, V: V, Bh: pf.Bh,""", """          newPrev[id] = { Y: Y, V: V, VP: VP, VR: VR, Bh: pf.Bh,""")


# v2.1: carbon tax passed on to consumer prices (params.ctaxPass) instead of being paid by firms out of the income they distribute.
# Its burden is split between the two halves by their consumption, the modest's euro of spending weighing ctaxWeightP times
# more in carbon (energy takes a larger share of a modest budget): carbP / carbR in the results (purchasing-power indicator).
r("""            var YF = Yc - c.AF - r1 * pv.L - (eco ? c.ctaxRate * ci[id] * Yc : 0);""",
"""            var YF = Yc - c.AF - r1 * pv.L - (eco && !p.ctaxPass ? c.ctaxRate * ci[id] * Yc : 0);""")
r("""            var C = cetR ? (1 - c.tauc) * CE - cetR * xr * IMR : (1 - c.tauc) * CE;""",
"""            var C = (cetR ? (1 - c.tauc) * CE - cetR * xr * IMR : (1 - c.tauc) * CE) - (eco && p.ctaxPass ? c.ctaxRate * ci[id] * Yc : 0);""")
r("""          var YF = Y - c.AF - r1 * pv.L - Tc;""", """          var YF = Y - c.AF - r1 * pv.L - (p.ctaxPass ? 0 : Tc);""")
r("""          var C = cetR ? (1 - c.tauc) * CE - Tcet : (1 - c.tauc) * CE;""", """          var C = (cetR ? (1 - c.tauc) * CE - Tcet : (1 - c.tauc) * CE) - (p.ctaxPass ? Tc : 0);""")
r("""            var YF = Yc - c.AF - pv.rb * pv.L - (eco ? c.ctaxRate * ci[id] * Yc : 0);""",
"""            var YF = Yc - c.AF - pv.rb * pv.L - (eco && !p.ctaxPass ? c.ctaxRate * ci[id] * Yc : 0);""")
r("""            var C = (1 - c.tauc) * CE - tariffRev(id, Yc);""", """            var C = (1 - c.tauc) * CE - tariffRev(id, Yc) - (eco && p.ctaxPass ? c.ctaxRate * ci[id] * Yc : 0);""")
r("""          var YF = Y - c.AF - pv.rb * pv.L - Tc;""", """          var YF = Y - c.AF - pv.rb * pv.L - (p.ctaxPass ? 0 : Tc);""")
r("""          var C = (1 - c.tauc) * CE - Tt;""", """          var C = (1 - c.tauc) * CE - Tt - (p.ctaxPass ? Tc : 0);""")

# paramsFor('v1.4') = v1.3 + households
r("""  function paramsFor(version) {""", """  var HOUSEHOLDS = { hetero: true, omegaP: 0.35, wageShare: 0.65, alpha1P: 0.90, alpha1R: 0.60 };   // v1.4 / v2.1 prototype
  function paramsFor(version) {
    if (version === 'v1.4') return Object.assign(paramsFor('v1.3'), HOUSEHOLDS);
    if (version === 'v2.1') return Object.assign(paramsFor('v2.0'), HOUSEHOLDS, { ctaxPass: true, ctaxWeightP: 1.7 });   // v2.0 (climate) + the two household groups""")
open(os.path.join(here, 'engine14.js'), 'w', encoding='utf-8').write(s)
print('engine14.js written')
