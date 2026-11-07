var info = {}, last = null;
var $ = function (i) { return document.getElementById(i) };
$('who').textContent = 'Hi, ' + (localStorage.getItem('tc_user') || 'Guest');
function fmt(x, d) {
  if (x === 0) return '0';
  var a = Math.abs(x);
  if (a >= 1e5 || a < 1e-3) return x.toExponential(3);
  return x.toFixed(d === undefined ? 4 : d);
}
function qs() {
  return 'gas=' + encodeURIComponent($('gas').value) + '&model=' + $('model').value + '&T=' + $('T').value +
    '&P=' + $('P').value + '&tunit=' + $('tu').value + '&punit=' + $('pu').value;
}
document.querySelectorAll('#tabs button').forEach(function (b) {
  b.onclick = function () {
    document.querySelectorAll('#tabs button').forEach(function (x) { x.classList.remove('on') });
    b.classList.add('on');
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.add('hide') });
    $(b.dataset.t).classList.remove('hide');
    if (b.dataset.t == 'cmp') compare();
    if (b.dataset.t == 'iso') plot();
    if (b.dataset.t == 'gr') graphs();
    if (b.dataset.t == 'his') history();
  };
});
fetch('/api/gases').then(function (r) { return r.json() }).then(function (d) {
  info = d;
  Object.keys(d.gases).forEach(function (g) { $('gas').innerHTML += '<option>' + g + '</option>' });
  Object.keys(d.models).forEach(function (m) { $('model').innerHTML += '<option value="' + m + '">' + d.models[m] + '</option>' });
  $('gas').value = 'n-Butane'; $('model').value = 'PR';
  showCrit(); $('gas').onchange = showCrit;
});
function showCrit() {
  var g = info.gases[$('gas').value];
  $('crit').innerHTML = 'Tc = ' + g.Tc + ' K<br>Pc = ' + g.Pc + ' bar<br>Acentric factor = ' + g.w;
}
function tile(k, v, u, e) {
  return '<div class="tile"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="u">' + u + '</div><div class="e">' + e + '</div></div>';
}
function run() {
  $('err').classList.add('hide');
  fetch('/api/calc?' + qs()).then(function (r) { return r.json() }).then(function (r) {
    if (r.error) { $('err').textContent = r.error; $('err').classList.remove('hide'); return }
    last = r;
    var roots = r.roots.map(function (x) { return 'Z = ' + fmt(x.Z) }).join(', ');
    var h = '<div class="card"><h3>' + r.gas + ' &nbsp;<span class="badge">' + r.phase + '</span> <span class="note">' + r.name + ', T = ' + fmt(r.T, 2) + ' K, P = ' + fmt(r.P, 4) + ' bar (Tr = ' + fmt(r.Tr, 3) + ', Pr = ' + fmt(r.Pr, 3) + ')</span></h3><div class="tiles">' +
      tile('Compressibility Z', fmt(r.Z), 'dimensionless', 'Z = PV/RT. Z = 1 means ideal gas; below 1 attraction between molecules dominates.') +
      tile('Molar volume V', fmt(r.V, 2), 'cm&sup3;/mol', 'Real-gas volume at this T and P. The ideal gas value would be ' + fmt(r.V / r.Z, 2) + '.') +
      tile('Fugacity coefficient &phi;', fmt(r.phi), 'dimensionless', '&phi; = f/P. It shows how far the gas is from ideal behaviour in terms of Gibbs energy.') +
      tile('Fugacity f', fmt(r.f), 'bar', 'The "effective pressure" of the gas: f = &phi;P.') +
      tile('Enthalpy H', fmt(r.H, 1), 'J/mol', 'H = H<sup>ig</sup> + H<sup>R</sup>. Ideal part ' + fmt(r.Hid, 1) + ', residual part ' + fmt(r.HR, 1) + '.') +
      tile('Entropy S', fmt(r.S, 3), 'J/(mol K)', 'S = S<sup>ig</sup> + S<sup>R</sup>. Ideal part ' + fmt(r.Sid, 3) + ', residual part ' + fmt(r.SR, 3) + '.') +
      '</div>' + (r.warnings.length ? '<div class="warn">' + r.warnings.join('<br>') + '</div>' : '') + '<div class="note" style="margin-top:12px">Roots of the cubic: ' + roots + '. ' +
      (r.roots.length > 1 ? 'ln &phi; of the roots: ' + r.roots.map(function (x) { return fmt(x.lnphi) }).join(', ') + '.' : 'Only one real root at these conditions.') +
      '</div><div class="row" style="margin-top:12px"><input id="nt" placeholder="Add a note (optional)"><button class="btn sm" onclick="save()" style="flex:0 0 140px">Save to history</button></div><div id="saved" class="note"></div></div>';
    $('out').innerHTML = h;
  });
}
function save() {
  fetch('/api/save', { method: 'POST', body: JSON.stringify({ who: localStorage.getItem('tc_user') || 'Guest', result: last, note: $('nt').value }) })
    .then(function () { $('saved').textContent = 'Saved. See the History tab.' });
}
function compare() {
  fetch('/api/compare?' + qs()).then(function (r) { return r.json() }).then(function (a) {
    if (a.error) { $('cmpout').textContent = a.error; return }
    var h = '<table><tr><th>Model</th><th>Z</th><th>V (cm&sup3;/mol)</th><th>&phi;</th><th>f (bar)</th><th>H (J/mol)</th><th>S (J/mol K)</th></tr>';
    a.forEach(function (r) {
      h += '<tr><td>' + r.name + '</td><td>' + fmt(r.Z) + '</td><td>' + fmt(r.V, 2) + '</td><td>' + fmt(r.phi) + '</td><td>' + fmt(r.f) + '</td><td>' + fmt(r.H, 1) + '</td><td>' + fmt(r.S, 3) + '</td></tr>';
    });
    $('cmpout').innerHTML = h + '</table>';
  });
}
function plot() {
  fetch('/api/isotherm?' + qs()).then(function (r) { return r.json() }).then(function (d) {
    if (d.error) return;
    var W = 760, H = 380, m = 55, pts = d.pts.filter(function (p) { return p[1] < d.Pc * 3 && p[1] >= 0 });
    var vx = pts.map(function (p) { return Math.log10(p[0]) });
    var x0 = Math.min.apply(0, vx), x1 = Math.max.apply(0, vx);
    var ymax = Math.max(d.Pc * 2, d.P * 1.3), ymin = Math.min(0, Math.min.apply(0, pts.map(function (p) { return p[1] })));
    var X = function (v) { return m + (Math.log10(v) - x0) / (x1 - x0) * (W - 2 * m) };
    var Y = function (p) { return H - m - (Math.min(p, ymax) - ymin) / (ymax - ymin) * (H - 2 * m) };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-width:820px;background:#fffafb;border:1px solid #f0d3dd;border-radius:8px">';
    s += '<line x1="' + m + '" y1="' + (H - m) + '" x2="' + (W - m) + '" y2="' + (H - m) + '" stroke="#999"/><line x1="' + m + '" y1="' + m + '" x2="' + m + '" y2="' + (H - m) + '" stroke="#999"/>';
    for (var i = 0; i <= 4; i++) {
      var pv = ymin + (ymax - ymin) * i / 4;
      s += '<text x="6" y="' + (Y(pv) + 4) + '" font-size="11" fill="#666">' + pv.toFixed(0) + '</text><line x1="' + m + '" x2="' + (W - m) + '" y1="' + Y(pv) + '" y2="' + Y(pv) + '" stroke="#f1dce4"/>';
      var vv = Math.pow(10, x0 + (x1 - x0) * i / 4);
      s += '<text x="' + (X(vv) - 14) + '" y="' + (H - m + 16) + '" font-size="11" fill="#666">' + vv.toFixed(vv < 100 ? 1 : 0) + '</text>';
    }
    var seg = [], segs = [];
    d.pts.forEach(function (p) {
      if (p[1] >= 0 && p[1] < d.Pc * 3) { seg.push(X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)) }
      else if (seg.length) { segs.push(seg); seg = [] }
    });
    if (seg.length) { segs.push(seg) }
    segs.forEach(function (g) { s += '<polyline fill="none" stroke="#c2185b" stroke-width="2" points="' + g.join(' ') + '"/>' });
    s += '<circle cx="' + X(d.V) + '" cy="' + Y(d.P) + '" r="6" fill="#2d2430"/><text x="' + (X(d.V) + 9) + '" y="' + (Y(d.P) - 8) + '" font-size="12">P = ' + d.P.toFixed(2) + ' bar</text>';
    s += '<text x="' + (W / 2 - 80) + '" y="' + (H - 8) + '" font-size="12" fill="#444">Molar volume (cm3/mol, log scale)</text>';
    s += '<text x="14" y="18" font-size="12" fill="#444">Pressure (bar)</text></svg>';
    $('plot').innerHTML = s + '<div class="note">This is the curve of the cubic equation itself. The hump or dip (when present) is the van der Waals loop. Its rising part is unstable and not physical. In a real fluid the path goes straight along a horizontal line at the saturation pressure between the liquid and vapour volumes. This program does not draw that line. Parts of the curve with negative pressure are not drawn.</div>';
  });
}
function history() {
  fetch('/api/history').then(function (r) { return r.json() }).then(function (rows) {
    if (!rows.length) { $('hisout').innerHTML = '<div class="note">Nothing saved yet. Use "Save to history" after a calculation.</div>'; return }
    var h = '<table><tr><th>Time</th><th>User</th><th>Gas</th><th>Model</th><th>T (K)</th><th>P (bar)</th><th>Z</th><th>&phi;</th><th>H (J/mol)</th><th>S (J/mol K)</th><th>Note</th><th></th></tr>';
    rows.forEach(function (r) {
      h += '<tr><td>' + r[1] + '</td><td>' + r[2] + '</td><td>' + r[3] + '</td><td>' + r[4] + '</td><td>' + fmt(r[5], 2) + '</td><td>' + fmt(r[6], 3) + '</td><td>' + fmt(r[7]) + '</td><td>' + fmt(r[9]) + '</td><td>' + fmt(r[11], 1) + '</td><td>' + fmt(r[12], 3) + '</td><td>' + (r[14] || '').replace(/</g, '&lt;') + '</td><td><button class="btn alt sm" onclick="del(' + r[0] + ')">x</button></td></tr>';
    });
    $('hisout').innerHTML = h + '</table>';
  });
}
function del(id) { fetch('/api/delete', { method: 'POST', body: JSON.stringify({ id: id }) }).then(history) }
function clearAll() { if (confirm('Delete all saved calculations?')) del('all') }
$('learntxt').innerHTML = '<h3>How the numbers are calculated</h3>' +
  '<p class="note">All four equations are written in the generic cubic form (Smith, Van Ness, Abbott and Swihart, Sec. 3.6, Table 3.1):</p>' +
  '<div class="eq">P = RT/(V &minus; b) &minus; a(T)/[(V + &epsilon;b)(V + &sigma;b)]</div>' +
  '<p class="note">Dimensionless form: &beta; = &Omega;Pr/Tr, q = &Psi;&alpha;(Tr)/(&Omega;Tr), and Z = 1 + &beta; &minus; q&beta;(Z &minus; &beta;)/[(Z + &epsilon;&beta;)(Z + &sigma;&beta;)]. It is solved as a cubic in Z. The largest root is the vapour, the smallest is the liquid.</p>' +
  '<div class="eq">I = [1/(&sigma; &minus; &epsilon;)] ln[(Z + &sigma;&beta;)/(Z + &epsilon;&beta;)] &nbsp; (I = &beta;/Z for van der Waals)</div>' +
  '<p><b>Fugacity coefficient</b></p><div class="eq">ln &phi; = Z &minus; 1 &minus; ln(Z &minus; &beta;) &minus; qI</div>' +
  '<p><b>Residual properties</b></p><div class="eq">H<sup>R</sup>/RT = Z &minus; 1 + [d ln&alpha;/d ln Tr &minus; 1] qI<br>S<sup>R</sup>/R = ln(Z &minus; &beta;) + [d ln&alpha;/d ln Tr] qI</div>' +
  '<p><b>Real-gas H and S</b> (from the ideal-gas reference at T0 = 298.15 K, P0 = 1 bar)</p>' +
  '<div class="eq">H = &int;Cp<sup>ig</sup> dT + H<sup>R</sup><br>S = &int;(Cp<sup>ig</sup>/T) dT &minus; R ln(P/P0) + S<sup>R</sup></div>' +
  '<p class="note">Cp<sup>ig</sup>/R = A + BT + CT<sup>2</sup> + DT<sup>-2</sup> with constants from Table C.1. Critical constants and acentric factors are from Table B.1.</p>';

function lineChart(title, xlab, ylab, xs, series, marker, expl) {
  var W = 560, H = 300, m = 58, mt = 22;
  var all = [];
  series.forEach(function (s) { s.y.forEach(function (v) { if (v !== null) all.push(v) }) });
  var x0 = Math.min.apply(0, xs), x1 = Math.max.apply(0, xs);
  var y0 = Math.min.apply(0, all), y1 = Math.max.apply(0, all);
  if (y1 == y0) { y1 = y0 + 1 }
  var pad = (y1 - y0) * 0.06; y0 -= pad; y1 += pad;
  var X = function (v) { return m + (v - x0) / (x1 - x0) * (W - m - 14) };
  var Y = function (v) { return H - 44 - (v - y0) / (y1 - y0) * (H - 44 - mt) };
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;background:#fffafb;border:1px solid #f0d3dd;border-radius:8px">';
  s += '<text x="' + m + '" y="15" font-size="12" font-weight="600" fill="#2d2430">' + title + '</text>';
  for (var i = 0; i <= 4; i++) {
    var yv = y0 + (y1 - y0) * i / 4, xv = x0 + (x1 - x0) * i / 4;
    s += '<line x1="' + m + '" x2="' + (W - 14) + '" y1="' + Y(yv) + '" y2="' + Y(yv) + '" stroke="#f1dce4"/>';
    s += '<text x="' + (m - 5) + '" y="' + (Y(yv) + 4) + '" font-size="10" text-anchor="end" fill="#666">' + fmt(yv, Math.abs(yv) < 10 ? 2 : 0) + '</text>';
    s += '<text x="' + X(xv) + '" y="' + (H - 28) + '" font-size="10" text-anchor="middle" fill="#666">' + fmt(xv, xv < 10 ? 1 : 0) + '</text>';
  }
  s += '<line x1="' + m + '" y1="' + (H - 44) + '" x2="' + (W - 14) + '" y2="' + (H - 44) + '" stroke="#999"/><line x1="' + m + '" y1="' + mt + '" x2="' + m + '" y2="' + (H - 44) + '" stroke="#999"/>';
  series.forEach(function (sr) {
    var seg = [], segs = [];
    xs.forEach(function (x, i) {
      if (sr.y[i] === null || sr.brk[i]) { if (seg.length) { segs.push(seg); seg = [] } }
      if (sr.y[i] !== null) { seg.push(X(x).toFixed(1) + ',' + Y(sr.y[i]).toFixed(1)) }
    });
    if (seg.length) { segs.push(seg) }
    segs.forEach(function (g) { s += '<polyline fill="none" stroke="' + sr.c + '" stroke-width="2"' + (sr.dash ? ' stroke-dasharray="5,4"' : '') + ' points="' + g.join(' ') + '"/>' });
  });
  if (marker && marker.x >= x0 && marker.x <= x1) { s += '<circle cx="' + X(marker.x) + '" cy="' + Y(marker.y) + '" r="5" fill="#2d2430"/>' }
  s += '<text x="' + (m + (W - m) / 2 - 60) + '" y="' + (H - 8) + '" font-size="11" fill="#444">' + xlab + '</text>';
  s += '<text x="6" y="' + (mt + 2) + '" font-size="11" fill="#444" transform="rotate(-90 10 ' + (H / 2) + ')" text-anchor="middle"></text>';
  s += '<text x="' + (W - 14) + '" y="15" font-size="11" text-anchor="end" fill="#444">' + ylab + '</text>';
  var lx = m + 8;
  s += '<rect x="' + (m + 3) + '" y="' + (mt + 1) + '" width="150" height="' + (series.length * 14 + 6) + '" fill="#fffafb" fill-opacity="0.9"/>';
  series.forEach(function (sr, k) { s += '<line x1="' + lx + '" x2="' + (lx + 18) + '" y1="' + (mt + 10 + k * 14) + '" y2="' + (mt + 10 + k * 14) + '" stroke="' + sr.c + '" stroke-width="2"' + (sr.dash ? ' stroke-dasharray="5,4"' : '') + '/><text x="' + (lx + 22) + '" y="' + (mt + 14 + k * 14) + '" font-size="10" fill="#444">' + sr.n + '</text>' });
  return '<div class="card"><div style="max-width:620px">' + s + '</svg></div><div class="note" style="margin-top:8px">' + expl + '</div></div>';
}
function graphs() {
  $('gerr').textContent = '';
  var extra = '&pmax=' + $('pmax').value + '&t1=' + $('t1').value + '&t2=' + $('t2').value;
  fetch('/api/curves?' + qs() + extra).then(function (r) { return r.json() }).then(function (d) {
    if (d.error) { $('gerr').textContent = d.error; $('gout').innerHTML = ''; return }
    if (!$('pmax').value) { $('pmax').value = d.pmax.toFixed(1); $('t1').value = d.t1.toFixed(1); $('t2').value = d.t2.toFixed(1) }
    var P = d.vsP, T = d.vsT, xp = P.map(function (r) { return r.x }), xt = T.map(function (r) { return r.x });
    var col = function (a, k) { return a.map(function (r) { return r[k] }) };
    var brk = function (a) { return a.map(function (r) { return r.jump }) };
    var jumpNote = ' A sudden jump in a curve means the stable root switched between the vapour and liquid roots of the cubic (liquid-vapour phase change). The line is deliberately broken there.';
    var h = lineChart('Compressibility factor Z vs pressure at T = ' + fmt(d.T, 1) + ' K', 'Pressure (bar)', 'Z', xp,
      [{ n: 'Z (real gas)', c: '#c2185b', y: col(P, 'Z'), brk: brk(P) }, { n: 'Z = 1 (ideal gas)', c: '#999', dash: 1, y: xp.map(function () { return 1 }), brk: xp.map(function () { return false }) }],
      { x: d.P, y: P.reduce(function (a, r) { return Math.abs(r.x - d.P) < Math.abs(a.x - d.P) ? r : a }).Z },
      'Z measures how far the gas is from ideal behaviour. Below 1 the attractive forces dominate, above 1 the repulsion (molecule size) dominates.' + jumpNote);
    h += lineChart('Fugacity vs pressure at T = ' + fmt(d.T, 1) + ' K', 'Pressure (bar)', 'f (bar)', xp,
      [{ n: 'f (real gas)', c: '#c2185b', y: col(P, 'f'), brk: brk(P) }, { n: 'f = P (ideal gas)', c: '#999', dash: 1, y: xp, brk: xp.map(function () { return false }) }],
      null, 'Fugacity is the effective pressure of the gas. At low pressure f is close to P. The gap between the curves shows the non-ideality; f below P means attraction dominates.' + jumpNote);
    h += lineChart('Fugacity coefficient vs pressure at T = ' + fmt(d.T, 1) + ' K', 'Pressure (bar)', 'phi = f/P', xp,
      [{ n: 'phi', c: '#c2185b', y: col(P, 'phi'), brk: brk(P) }, { n: 'phi = 1 (ideal gas)', c: '#999', dash: 1, y: xp.map(function () { return 1 }), brk: xp.map(function () { return false }) }],
      null, 'phi = f/P. It goes to 1 as pressure goes to zero. A value below 1 means the real gas has lower Gibbs energy than an ideal gas at the same T and P.' + jumpNote);
    h += lineChart('Enthalpy vs temperature at P = ' + fmt(d.P, 2) + ' bar', 'Temperature (K)', 'H (J/mol)', xt,
      [{ n: 'H (real gas)', c: '#c2185b', y: col(T, 'H'), brk: brk(T) }, { n: 'H ideal gas', c: '#999', dash: 1, y: col(T, 'Hid'), brk: xt.map(function () { return false }) }],
      null, 'H is measured from the reference state (ideal gas, 298.15 K, 1 bar, H = 0), so only differences matter. The distance between the curves is the residual enthalpy. Range is limited to 298.15 K up to ' + d.tmax + ' K, where the Cp fit is valid.' + jumpNote);
    h += lineChart('Entropy vs temperature at P = ' + fmt(d.P, 2) + ' bar', 'Temperature (K)', 'S (J/mol K)', xt,
      [{ n: 'S (real gas)', c: '#c2185b', y: col(T, 'S'), brk: brk(T) }, { n: 'S ideal gas', c: '#999', dash: 1, y: col(T, 'Sid'), brk: xt.map(function () { return false }) }],
      null, 'S is measured from the same reference state (ideal gas, 298.15 K, 1 bar, S = 0). Entropy rises with temperature and falls with pressure. The gap to the ideal curve is the residual entropy.' + jumpNote);
    $('gout').innerHTML = '<div class="gg">' + h + '</div>';
  });
}
