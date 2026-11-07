(function () {
  if (typeof TC === "undefined") { console.error("eos.js must load before pages_shim.js"); return }

  function apiCalc(q) {
    var gas = q.gas, model = q.model;
    if (!TC.GASES[gas] || !TC.EOS[model]) throw new Error("Unknown gas or equation of state");
    var T = parseFloat(q.T), P = parseFloat(q.P);
    if (isNaN(T) || isNaN(P)) throw new Error("Enter numbers for temperature and pressure");
    if (!isFinite(T) || !isFinite(P)) throw new Error("Enter finite numbers");
    if (q.tunit === "C") T += 273.15;
    if (q.punit === "kPa") P /= 100;
    else if (q.punit === "MPa") P *= 10;
    else if (q.punit === "atm") P *= 1.01325;
    if (T <= 0) throw new Error("Temperature must be above absolute zero");
    if (P <= 0) throw new Error("Pressure must be positive");
    if (T > 5000 || P > 2000) throw new Error("Outside the range of this program (T up to 5000 K, P up to 2000 bar)");
    var s = TC.state(model, gas, T, P), b = s.best;
    return { gas: gas, model: model, name: TC.EOS[model].name, T: T, P: P, Tr: s.Tr, Pr: s.Pr,
      A: s.A, B: s.B, q: s.q, Z: b.Z, V: b.V, lnphi: b.lnphi, phi: b.phi, f: b.f,
      HR: b.HR, SR: b.SR, Hid: s.Hid, Sid: s.Sid, H: s.H, S: s.S, phase: s.phase, warnings: s.warnings,
      roots: s.roots.map(function (r) { return { Z: r.Z, V: r.V, lnphi: r.lnphi } }) };
  }

  function apiSeries(model, gas, xs, fixed, vary) {
    var out = [], last = null;
    xs.forEach(function (x) {
      var T = vary === "T" ? x : fixed, P = vary === "T" ? fixed : x;
      var s = TC.state(model, gas, T, P), b = s.best;
      var jump = last !== null && (b.Z / last > 1.4 || last / b.Z > 1.4);
      last = b.Z;
      out.push({ x: x, jump: jump, Z: b.Z, phi: b.phi, f: b.f, H: s.H, S: s.S, Hid: s.Hid, Sid: s.Sid });
    });
    return out;
  }

  function apiCurves(q) {
    var gas = q.gas, model = q.model;
    var base = apiCalc(q);
    var T = base.T, P = base.P;
    var tmax = TC.TMAX[gas];
    var pmax = parseFloat(q.pmax) || Math.max(2 * P, 10);
    var t1 = parseFloat(q.t1) || Math.max(TC.T0, T - 100);
    var t2 = parseFloat(q.t2) || Math.min(tmax, T + 200);
    if (pmax <= 0 || pmax > 2000) throw new Error("Maximum pressure must be between 0 and 2000 bar");
    t1 = Math.max(t1, TC.T0); t2 = Math.min(t2, tmax);
    if (t2 <= t1) throw new Error("Temperature range must lie between 298.15 K and " + tmax + " K for this gas");
    var n = 80, ps = [], ts = [];
    for (var i = 0; i < n; i++) ps.push(pmax * (i + 1) / n);
    for (i = 0; i < n; i++) ts.push(t1 + (t2 - t1) * i / (n - 1));
    return { T: T, P: P, pmax: pmax, t1: t1, t2: t2, tmax: tmax,
      vsP: apiSeries(model, gas, ps, T, "P"), vsT: apiSeries(model, gas, ts, P, "T") };
  }

  function apiGases() {
    var gases = {}, models = {};
    Object.keys(TC.GASES).forEach(function (k) { var v = TC.GASES[k]; gases[k] = { Tc: v.Tc, Pc: v.Pc, w: v.w } });
    Object.keys(TC.EOS).forEach(function (k) { models[k] = TC.EOS[k].name });
    return { gases: gases, models: models };
  }

  var HKEY = "tc_hist";
  function hRead() { try { return JSON.parse(localStorage.getItem(HKEY) || "[]") } catch (e) { return [] } }
  function hWrite(rows) { localStorage.setItem(HKEY, JSON.stringify(rows)) }
  function nowStr() {
    var d = new Date(), p = function (x) { return String(x).padStart(2, "0") };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }
  function hSave(d) {
    var rows = hRead(), r = d.result;
    var id = rows.reduce(function (a, x) { return Math.max(a, x[0]) }, 0) + 1;
    rows.push([id, nowStr(), d.who || "Guest", r.gas, r.model, r.T, r.P, r.Z, r.V, r.phi, r.f, r.H, r.S, r.phase, d.note || ""]);
    hWrite(rows);
    return { ok: true };
  }
  function hDelete(d) {
    if (d.id === "all") hWrite([]);
    else hWrite(hRead().filter(function (r) { return r[0] !== d.id }));
    return { ok: true };
  }
  function hRows() { return hRead().slice().reverse() }

  function csvCell(x) {
    x = String(x == null ? "" : x);
    return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x;
  }
  function historyCsv() {
    var head = ["id", "time", "user", "gas", "model", "T_K", "P_bar", "Z", "V_cm3_mol", "phi", "f_bar", "H_J_mol", "S_J_mol_K", "phase", "note"];
    var lines = [head.join(",")];
    hRead().forEach(function (r) { lines.push(r.map(csvCell).join(",")) });
    return lines.join("\r\n") + "\r\n";
  }
  function downloadCsv() {
    var blob = new Blob([historyCsv()], { type: "text/csv" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "history.csv";
    document.body.appendChild(a); a.click(); a.remove();
  }

  function jsonResp(obj, code) {
    return Promise.resolve(new Response(JSON.stringify(obj), { status: code || 200, headers: { "Content-Type": "application/json" } }));
  }

  var realFetch = window.fetch.bind(window);
  window.fetch = function (url, opts) {
    try {
      var u = new URL(url, location.href);
      if (u.pathname.indexOf("/api/") !== 0) return realFetch(url, opts);
      var q = {};
      u.searchParams.forEach(function (v, k) { q[k] = v });
      var path = u.pathname;
      if (path === "/api/gases") return jsonResp(apiGases());
      if (path === "/api/calc") { try { return jsonResp(apiCalc(q)) } catch (e) { return jsonResp({ error: String(e.message || e) }, 400) } }
      if (path === "/api/compare") {
        try { return jsonResp(Object.keys(TC.EOS).map(function (m) { return apiCalc(Object.assign({}, q, { model: m })) })) }
        catch (e) { return jsonResp({ error: String(e.message || e) }, 400) }
      }
      if (path === "/api/isotherm") {
        try {
          var r = apiCalc(q);
          return jsonResp({ pts: TC.isotherm(q.model, q.gas, r.T), T: r.T, P: r.P, V: r.V, Pc: TC.GASES[q.gas].Pc });
        } catch (e) { return jsonResp({ error: String(e.message || e) }, 400) }
      }
      if (path === "/api/curves") { try { return jsonResp(apiCurves(q)) } catch (e) { return jsonResp({ error: String(e.message || e) }, 400) } }
      if (path === "/api/history") return jsonResp(hRows());
      if (path === "/api/history.csv") {
        return Promise.resolve(new Response(historyCsv(), { status: 200, headers: { "Content-Type": "text/csv" } }));
      }
      if (path === "/api/save" || path === "/api/delete") {
        var body = opts && opts.body ? JSON.parse(opts.body) : {};
        return jsonResp(path === "/api/save" ? hSave(body) : hDelete(body));
      }
      return Promise.resolve(new Response("not found", { status: 404 }));
    } catch (e) {
      return jsonResp({ error: String(e.message || e) }, 400);
    }
  };

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll('a[href="/api/history.csv"]').forEach(function (a) {
      a.addEventListener("click", function (ev) { ev.preventDefault(); downloadCsv() });
    });
  });
})();
