var TC = (function () {
  var R = 8.314;
  var T0 = 298.15, P0 = 1.0;

  var EOS = {
    "vdW": { name: "van der Waals", eps: 0.0, sig: 0.0, omega: 1 / 8, psi: 27 / 64 },
    "RK":  { name: "Redlich-Kwong", eps: 0.0, sig: 1.0, omega: 0.08664, psi: 0.42748 },
    "SRK": { name: "Soave-Redlich-Kwong", eps: 0.0, sig: 1.0, omega: 0.08664, psi: 0.42748 },
    "PR":  { name: "Peng-Robinson", eps: 1 - Math.sqrt(2), sig: 1 + Math.sqrt(2), omega: 0.07780, psi: 0.45724 }
  };

  var GASES = {
    "Methane":        { Tc: 190.6, Pc: 45.99, w: 0.012, cp: [1.702, 9.081e-3, -2.164e-6, 0.0] },
    "Ethane":         { Tc: 305.3, Pc: 48.72, w: 0.100, cp: [1.131, 19.225e-3, -5.561e-6, 0.0] },
    "Propane":        { Tc: 369.8, Pc: 42.48, w: 0.152, cp: [1.213, 28.785e-3, -8.824e-6, 0.0] },
    "n-Butane":       { Tc: 425.1, Pc: 37.96, w: 0.200, cp: [1.935, 36.915e-3, -11.402e-6, 0.0] },
    "Ethylene":       { Tc: 282.3, Pc: 50.40, w: 0.087, cp: [1.424, 14.394e-3, -4.392e-6, 0.0] },
    "Carbon dioxide": { Tc: 304.2, Pc: 73.83, w: 0.224, cp: [5.457, 1.045e-3, 0.0, -1.157e5] },
    "Nitrogen":       { Tc: 126.2, Pc: 34.00, w: 0.038, cp: [3.280, 0.593e-3, 0.0, 0.040e5] },
    "Oxygen":         { Tc: 154.6, Pc: 50.43, w: 0.022, cp: [3.639, 0.506e-3, 0.0, -0.227e5] },
    "Hydrogen":       { Tc: 33.19, Pc: 13.13, w: -0.216, cp: [3.249, 0.422e-3, 0.0, 0.083e5] },
    "Ammonia":        { Tc: 405.7, Pc: 112.8, w: 0.253, cp: [3.578, 3.020e-3, 0.0, -0.186e5] },
    "Water":          { Tc: 647.1, Pc: 220.55, w: 0.345, cp: [3.470, 1.450e-3, 0.0, 0.121e5] }
  };

  var TMAX = { "Methane": 1500, "Ethane": 1500, "Propane": 1500, "n-Butane": 1500, "Ethylene": 1500, "Carbon dioxide": 2000, "Nitrogen": 2000, "Oxygen": 2000, "Hydrogen": 3000, "Ammonia": 1800, "Water": 2000 };

  function alpha_terms(model, Tr, w) {
    if (model === "vdW") return [1.0, 0.0];
    if (model === "RK") return [Math.pow(Tr, -0.5), -0.5];
    var k;
    if (model === "SRK") k = 0.480 + 1.574 * w - 0.176 * w * w;
    else k = 0.37464 + 1.54226 * w - 0.26992 * w * w;
    var s = 1 + k * (1 - Math.sqrt(Tr));
    return [s * s, -k * Math.sqrt(Tr) / s];
  }

  function cubic_roots(c2, c1, c0) {
    var p = c1 - c2 * c2 / 3;
    var q = 2 * Math.pow(c2, 3) / 27 - c2 * c1 / 3 + c0;
    var sh = -c2 / 3;
    var d = Math.pow(q / 2, 2) + Math.pow(p / 3, 3);
    if (d > 1e-14) {
      var u = -q / 2 + Math.sqrt(d);
      var v = -q / 2 - Math.sqrt(d);
      return [Math.cbrt(u) + Math.cbrt(v) + sh];
    }
    if (Math.abs(d) <= 1e-14 && Math.abs(p) < 1e-12) return [sh];
    var r = 2 * Math.sqrt(-p / 3);
    var arg = Math.max(-1.0, Math.min(1.0, 3 * q / (p * r)));
    var th = Math.acos(arg) / 3;
    return [0, 1, 2].map(function (k) { return r * Math.cos(th - 2 * Math.PI * k / 3) + sh });
  }

  function round12(x) { return Math.round(x * 1e12) / 1e12 }

  function solve(model, gas, T, P) {
    var g = GASES[gas], m = EOS[model];
    var Tr = T / g.Tc;
    var ald = alpha_terms(model, Tr, g.w), al = ald[0], dla = ald[1];
    var B = m.omega * (P / g.Pc) / Tr;
    var q = m.psi * al / (m.omega * Tr);
    var A = q * B;
    var s = m.eps + m.sig, pr = m.eps * m.sig;
    var c2 = s * B - 1 - B;
    var c1 = pr * B * B - (1 + B) * s * B + A;
    var c0 = -(1 + B) * pr * B * B - A * B;
    var roots = cubic_roots(c2, c1, c0).filter(function (z) { return z > B });
    roots = roots.map(function (z) {
      for (var i = 0; i < 30; i++) {
        var f = Math.pow(z, 3) + c2 * z * z + c1 * z + c0;
        var df = 3 * z * z + 2 * c2 * z + c1;
        if (df === 0) break;
        z -= f / df;
      }
      return z;
    });
    var seen = {}, uniq = [];
    roots.forEach(function (z) {
      if (z > B * (1 + 1e-6)) { var k = round12(z); if (!seen[k]) { seen[k] = 1; uniq.push(k) } }
    });
    uniq.sort(function (a, b) { return a - b });
    var out = uniq.map(function (z) {
      var I;
      if (m.sig === m.eps) I = B / z;
      else I = Math.log((z + m.sig * B) / (z + m.eps * B)) / (m.sig - m.eps);
      var lnphi = z - 1 - Math.log(z - B) - q * I;
      var hr = (z - 1 + (dla - 1) * q * I) * R * T;
      var sr = (Math.log(z - B) + dla * q * I) * R;
      return { Z: z, V: z * R * T / P * 10.0, lnphi: lnphi, phi: Math.exp(lnphi), f: Math.exp(lnphi) * P, HR: hr, SR: sr };
    });
    return { model: model, gas: gas, T: T, P: P, Tr: Tr, Pr: P / g.Pc, A: A, B: B, q: q, roots: out };
  }

  function ideal_part(gas, T, P) {
    var cp = GASES[gas].cp, a = cp[0], b = cp[1], c = cp[2], d = cp[3];
    var h = a * (T - T0) + b / 2 * (T * T - T0 * T0) + c / 3 * (Math.pow(T, 3) - Math.pow(T0, 3)) - d * (1 / T - 1 / T0);
    var s = a * Math.log(T / T0) + b * (T - T0) + c / 2 * (T * T - T0 * T0) - d / 2 * (1 / Math.pow(T, 2) - 1 / Math.pow(T0, 2));
    return [h * R, s * R - R * Math.log(P / P0)];
  }

  function state(model, gas, T, P) {
    var r = solve(model, gas, T, P);
    var ro = r.roots;
    var best = ro.reduce(function (a, x) { return x.lnphi < a.lnphi ? x : a });
    var phase;
    if (ro.length === 1) phase = r.Tr >= 1 ? "Supercritical (single root)" : "Single real root";
    else phase = best.Z === Math.max.apply(0, ro.map(function (x) { return x.Z })) ? "Vapour" : "Liquid";
    var hid = ideal_part(gas, T, P), Hid = hid[0], Sid = hid[1];
    var warn = [];
    if (T < T0 || T > TMAX[gas]) warn.push("T is outside 298.15 K to " + TMAX[gas] + " K, the range of the Cp constants (Table C.1). H and S are less reliable.");
    if (Math.abs(r.Tr - 1) < 0.05 && Math.abs(r.Pr - 1) < 0.3) warn.push("Close to the critical point (Tr = " + r.Tr.toFixed(2) + ", Pr = " + r.Pr.toFixed(2) + "). Cubic equations are least accurate here.");
    if (r.Pr > 3) warn.push("Pr is above 3. Treat the result as a rough estimate.");
    if (ro.length > 1) {
      var diff = Math.abs(ro[0].lnphi - ro[ro.length - 1].lnphi);
      if (diff < 2e-3) warn.push("Liquid and vapour fugacities are nearly equal (within 0.2 percent), so the pressure is close to the saturation pressure for this equation. This program does not find the exact saturation point, so do not treat it as a confirmed two-phase state.");
      else warn.push("Three real roots. The program reports the root with the lowest ln phi, which is the stable phase. The other roots are metastable or unstable.");
    }
    r.best = best; r.phase = phase; r.Hid = Hid; r.Sid = Sid; r.warnings = warn;
    r.H = Hid + best.HR; r.S = Sid + best.SR;
    return r;
  }

  function isotherm(model, gas, T, vmin_factor, n) {
    vmin_factor = vmin_factor || 1.0; n = n || 600;
    var g = GASES[gas], m = EOS[model];
    var Tr = T / g.Tc;
    var al = alpha_terms(model, Tr, g.w)[0];
    var b = m.omega * R * g.Tc / (g.Pc * 1e5);
    var a = m.psi * al * Math.pow(R * g.Tc, 2) / (g.Pc * 1e5);
    var pts = [];
    var v = b * 1.05;
    var vmax = b * 60;
    var k = Math.pow(vmax / v, 1 / (n - 1));
    for (var i = 0; i < n; i++) {
      var p = R * T / (v - b) - a / ((v + m.eps * b) * (v + m.sig * b));
      pts.push([v * 1e6, p / 1e5]);
      v *= k;
    }
    return pts;
  }

  return { R: R, T0: T0, P0: P0, EOS: EOS, GASES: GASES, TMAX: TMAX, alpha_terms: alpha_terms, cubic_roots: cubic_roots, solve: solve, ideal_part: ideal_part, state: state, isotherm: isotherm };
})();
if (typeof module !== "undefined") module.exports = TC;
