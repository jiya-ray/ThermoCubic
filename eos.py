import math

R = 8.314

EOS = {
    "vdW": dict(name="van der Waals", eps=0.0, sig=0.0, omega=1/8, psi=27/64),
    "RK":  dict(name="Redlich-Kwong", eps=0.0, sig=1.0, omega=0.08664, psi=0.42748),
    "SRK": dict(name="Soave-Redlich-Kwong", eps=0.0, sig=1.0, omega=0.08664, psi=0.42748),
    "PR":  dict(name="Peng-Robinson", eps=1-math.sqrt(2), sig=1+math.sqrt(2), omega=0.07780, psi=0.45724),
}

GASES = {
    "Methane":        dict(Tc=190.6, Pc=45.99, w=0.012, cp=(1.702, 9.081e-3, -2.164e-6, 0.0)),
    "Ethane":         dict(Tc=305.3, Pc=48.72, w=0.100, cp=(1.131, 19.225e-3, -5.561e-6, 0.0)),
    "Propane":        dict(Tc=369.8, Pc=42.48, w=0.152, cp=(1.213, 28.785e-3, -8.824e-6, 0.0)),
    "n-Butane":       dict(Tc=425.1, Pc=37.96, w=0.200, cp=(1.935, 36.915e-3, -11.402e-6, 0.0)),
    "Ethylene":       dict(Tc=282.3, Pc=50.40, w=0.087, cp=(1.424, 14.394e-3, -4.392e-6, 0.0)),
    "Carbon dioxide": dict(Tc=304.2, Pc=73.83, w=0.224, cp=(5.457, 1.045e-3, 0.0, -1.157e5)),
    "Nitrogen":       dict(Tc=126.2, Pc=34.00, w=0.038, cp=(3.280, 0.593e-3, 0.0, 0.040e5)),
    "Oxygen":         dict(Tc=154.6, Pc=50.43, w=0.022, cp=(3.639, 0.506e-3, 0.0, -0.227e5)),
    "Hydrogen":       dict(Tc=33.19, Pc=13.13, w=-0.216, cp=(3.249, 0.422e-3, 0.0, 0.083e5)),
    "Ammonia":        dict(Tc=405.7, Pc=112.8, w=0.253, cp=(3.578, 3.020e-3, 0.0, -0.186e5)),
    "Water":          dict(Tc=647.1, Pc=220.55, w=0.345, cp=(3.470, 1.450e-3, 0.0, 0.121e5)),
}

T0 = 298.15
P0 = 1.0


def alpha_terms(model, Tr, w):
    if model == "vdW":
        return 1.0, 0.0
    if model == "RK":
        return Tr ** -0.5, -0.5
    if model == "SRK":
        k = 0.480 + 1.574 * w - 0.176 * w * w
    else:
        k = 0.37464 + 1.54226 * w - 0.26992 * w * w
    s = 1 + k * (1 - math.sqrt(Tr))
    return s * s, -k * math.sqrt(Tr) / s


def cubic_roots(c2, c1, c0):
    p = c1 - c2 * c2 / 3
    q = 2 * c2 ** 3 / 27 - c2 * c1 / 3 + c0
    sh = -c2 / 3
    d = (q / 2) ** 2 + (p / 3) ** 3
    if d > 1e-14:
        u = -q / 2 + math.sqrt(d)
        v = -q / 2 - math.sqrt(d)
        cb = lambda x: math.copysign(abs(x) ** (1 / 3), x)
        return [cb(u) + cb(v) + sh]
    if abs(d) <= 1e-14 and abs(p) < 1e-12:
        return [sh]
    r = 2 * math.sqrt(-p / 3)
    arg = max(-1.0, min(1.0, 3 * q / (p * r)))
    th = math.acos(arg) / 3
    return [r * math.cos(th - 2 * math.pi * k / 3) + sh for k in range(3)]


def solve(model, gas, T, P):
    g = GASES[gas]
    m = EOS[model]
    Tr = T / g["Tc"]
    al, dla = alpha_terms(model, Tr, g["w"])
    B = m["omega"] * (P / g["Pc"]) / Tr
    q = m["psi"] * al / (m["omega"] * Tr)
    A = q * B
    s = m["eps"] + m["sig"]
    pr = m["eps"] * m["sig"]
    c2 = s * B - 1 - B
    c1 = pr * B * B - (1 + B) * s * B + A
    c0 = -(1 + B) * pr * B * B - A * B
    roots = [z for z in cubic_roots(c2, c1, c0) if z > B]
    for i, z in enumerate(roots):
        for _ in range(30):
            f = z ** 3 + c2 * z * z + c1 * z + c0
            df = 3 * z * z + 2 * c2 * z + c1
            if df == 0:
                break
            z -= f / df
        roots[i] = z
    roots = sorted(set(round(z, 12) for z in roots if z > B * (1 + 1e-6)))
    out = []
    for z in roots:
        if m["sig"] == m["eps"]:
            I = B / z
        else:
            I = math.log((z + m["sig"] * B) / (z + m["eps"] * B)) / (m["sig"] - m["eps"])
        lnphi = z - 1 - math.log(z - B) - q * I
        hr = (z - 1 + (dla - 1) * q * I) * R * T
        sr = (math.log(z - B) + dla * q * I) * R
        out.append(dict(Z=z, V=z * R * T / P * 10.0,
                        lnphi=lnphi, phi=math.exp(lnphi), f=math.exp(lnphi) * P,
                        HR=hr, SR=sr))
    return dict(model=model, gas=gas, T=T, P=P, Tr=Tr, Pr=P / g["Pc"], A=A, B=B, q=q, roots=out)


def ideal_part(gas, T, P):
    a, b, c, d = GASES[gas]["cp"]
    h = a * (T - T0) + b / 2 * (T * T - T0 * T0) + c / 3 * (T ** 3 - T0 ** 3) - d * (1 / T - 1 / T0)
    s = a * math.log(T / T0) + b * (T - T0) + c / 2 * (T * T - T0 * T0) - d / 2 * (1 / T ** 2 - 1 / T0 ** 2)
    return h * R, s * R - R * math.log(P / P0)


def state(model, gas, T, P):
    r = solve(model, gas, T, P)
    ro = r["roots"]
    best = min(ro, key=lambda x: x["lnphi"])
    if len(ro) == 1:
        phase = "Supercritical (single root)" if r["Tr"] >= 1 else "Single real root"
    else:
        phase = "Vapour" if best["Z"] == max(x["Z"] for x in ro) else "Liquid"
    Hid, Sid = ideal_part(gas, T, P)
    warn = []
    if T < T0 or T > TMAX[gas]:
        warn.append("T is outside 298.15 K to %d K, the range of the Cp constants (Table C.1). H and S are less reliable." % TMAX[gas])
    if abs(r["Tr"] - 1) < 0.05 and abs(r["Pr"] - 1) < 0.3:
        warn.append("Close to the critical point (Tr = %.2f, Pr = %.2f). Cubic equations are least accurate here." % (r["Tr"], r["Pr"]))
    if r["Pr"] > 3:
        warn.append("Pr is above 3. Treat the result as a rough estimate.")
    if len(ro) > 1:
        diff = abs(ro[0]["lnphi"] - ro[-1]["lnphi"])
        if diff < 2e-3:
            warn.append("Liquid and vapour fugacities are nearly equal (within 0.2 percent), so the pressure is close to the saturation pressure for this equation. This program does not find the exact saturation point, so do not treat it as a confirmed two-phase state.")
        else:
            warn.append("Three real roots. The program reports the root with the lowest ln phi, which is the stable phase. The other roots are metastable or unstable.")
    if len(ro) == 1 and r["Tr"] < 1 and r["roots"][0]["Z"] > 0.5:
        pass
    r.update(best=best, phase=phase, Hid=Hid, Sid=Sid, warnings=warn,
             H=Hid + best["HR"], S=Sid + best["SR"])
    return r


def isotherm(model, gas, T, vmin_factor=1.0, n=600):
    g = GASES[gas]
    m = EOS[model]
    Tr = T / g["Tc"]
    al, _ = alpha_terms(model, Tr, g["w"])
    b = m["omega"] * R * g["Tc"] / (g["Pc"] * 1e5)
    a = m["psi"] * al * (R * g["Tc"]) ** 2 / (g["Pc"] * 1e5)
    pts = []
    v = b * 1.05
    vmax = b * 60
    k = (vmax / v) ** (1 / (n - 1))
    for _ in range(n):
        p = R * T / (v - b) - a / ((v + m["eps"] * b) * (v + m["sig"] * b))
        pts.append((v * 1e6, p / 1e5))
        v *= k
    return pts


TMAX = {'Methane': 1500, 'Ethane': 1500, 'Propane': 1500, 'n-Butane': 1500, 'Ethylene': 1500, 'Carbon dioxide': 2000, 'Nitrogen': 2000, 'Oxygen': 2000, 'Hydrogen': 3000, 'Ammonia': 1800, 'Water': 2000}
