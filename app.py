import json, sqlite3, os, io, csv, webbrowser, threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
import eos

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "history.db")
PORT = 8000

def db():
    c = sqlite3.connect(DB)
    c.execute("""create table if not exists hist(id integer primary key autoincrement,
        saved_at text default (datetime('now','localtime')), who text, gas text, model text,
        temp_k real, p_bar real, z real, v real, phi real, f real, h real, s real, phase text, note text)""")
    return c

def read(name):
    with open(os.path.join(HERE, "web", name), encoding="utf-8") as f:
        return f.read()

def calc(q):
    gas, model = q["gas"], q["model"]
    if gas not in eos.GASES or model not in eos.EOS:
        raise ValueError("Unknown gas or equation of state")
    try:
        T, P = float(q["T"]), float(q["P"])
    except (KeyError, ValueError):
        raise ValueError("Enter numbers for temperature and pressure")
    if T != T or P != P or abs(T) == float("inf") or abs(P) == float("inf"):
        raise ValueError("Enter finite numbers")
    unit = q.get("tunit", "K")
    if unit == "C":
        T += 273.15
    if q.get("punit", "bar") == "kPa":
        P /= 100
    elif q.get("punit") == "MPa":
        P *= 10
    elif q.get("punit") == "atm":
        P *= 1.01325
    if T <= 0:
        raise ValueError("Temperature must be above absolute zero")
    if P <= 0:
        raise ValueError("Pressure must be positive")
    if T > 5000 or P > 2000:
        raise ValueError("Outside the range of this program (T up to 5000 K, P up to 2000 bar)")
    s = eos.state(model, gas, T, P)
    b = s["best"]
    return dict(gas=gas, model=model, name=eos.EOS[model]["name"], T=T, P=P, Tr=s["Tr"], Pr=s["Pr"],
                A=s["A"], B=s["B"], q=s["q"], Z=b["Z"], V=b["V"], lnphi=b["lnphi"], phi=b["phi"], f=b["f"],
                HR=b["HR"], SR=b["SR"], Hid=s["Hid"], Sid=s["Sid"], H=s["H"], S=s["S"], phase=s["phase"], warnings=s["warnings"],
                roots=[dict(Z=r["Z"], V=r["V"], lnphi=r["lnphi"]) for r in s["roots"]])

def series(model, gas, xs, fixed, vary):
    out = []
    last = None
    for x in xs:
        T, P = (x, fixed) if vary == "T" else (fixed, x)
        s = eos.state(model, gas, T, P)
        b = s["best"]
        jump = last is not None and (b["Z"] / last > 1.4 or last / b["Z"] > 1.4)
        last = b["Z"]
        out.append(dict(x=x, jump=jump, Z=b["Z"], phi=b["phi"], f=b["f"], H=s["H"], S=s["S"], Hid=s["Hid"], Sid=s["Sid"]))
    return out

def curves(q):
    gas, model = q["gas"], q["model"]
    base = calc(q)
    T, P = base["T"], base["P"]
    tmax = eos.TMAX[gas]
    pmax = float(q.get("pmax") or max(2 * P, 10))
    t1 = float(q.get("t1") or max(eos.T0, T - 100))
    t2 = float(q.get("t2") or min(tmax, T + 200))
    if pmax <= 0 or pmax > 2000:
        raise ValueError("Maximum pressure must be between 0 and 2000 bar")
    t1 = max(t1, eos.T0)
    t2 = min(t2, tmax)
    if t2 <= t1:
        raise ValueError("Temperature range must lie between 298.15 K and %d K for this gas" % tmax)
    n = 80
    ps = [pmax * (i + 1) / n for i in range(n)]
    ts = [t1 + (t2 - t1) * i / (n - 1) for i in range(n)]
    return dict(T=T, P=P, pmax=pmax, t1=t1, t2=t2, tmax=tmax,
                vsP=series(model, gas, ps, T, "P"), vsT=series(model, gas, ts, P, "T"))

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, body, ctype="text/html; charset=utf-8", code=200):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def js(self, obj, code=200):
        self.send(json.dumps(obj), "application/json", code)

    def do_GET(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        if u.path == "/":
            return self.send(read("welcome.html"))
        if u.path == "/app":
            return self.send(read("app.html"))
        if u.path == "/logo.png" and os.path.exists(os.path.join(HERE, "web", "logo.png")):
            with open(os.path.join(HERE, "web", "logo.png"), "rb") as f:
                return self.send(f.read(), "image/png")
        if u.path in ("/style.css", "/app.js"):
            return self.send(read(u.path[1:]), "text/css" if u.path.endswith("css") else "application/javascript")
        if u.path == "/api/gases":
            return self.js({"gases": {k: dict(Tc=v["Tc"], Pc=v["Pc"], w=v["w"]) for k, v in eos.GASES.items()},
                            "models": {k: v["name"] for k, v in eos.EOS.items()}})
        if u.path == "/api/calc":
            try:
                return self.js(calc(q))
            except Exception as e:
                return self.js({"error": str(e)}, 400)
        if u.path == "/api/compare":
            try:
                return self.js([calc(dict(q, model=m)) for m in eos.EOS])
            except Exception as e:
                return self.js({"error": str(e)}, 400)
        if u.path == "/api/isotherm":
            r = calc(q)
            return self.js({"pts": eos.isotherm(q["model"], q["gas"], r["T"]), "T": r["T"], "P": r["P"], "V": r["V"],
                            "Pc": eos.GASES[q["gas"]]["Pc"]})
        if u.path == "/api/curves":
            try:
                return self.js(curves(q))
            except Exception as e:
                return self.js({"error": str(e)}, 400)
        if u.path == "/api/history":
            c = db()
            rows = c.execute("select id,saved_at,who,gas,model,temp_k,p_bar,z,v,phi,f,h,s,phase,note from hist order by id desc").fetchall()
            return self.js(rows)
        if u.path == "/api/history.csv":
            c = db()
            buf = io.StringIO()
            w = csv.writer(buf)
            w.writerow(["id", "time", "user", "gas", "model", "T_K", "P_bar", "Z", "V_cm3_mol", "phi", "f_bar", "H_J_mol", "S_J_mol_K", "phase", "note"])
            w.writerows(c.execute("select id,saved_at,who,gas,model,temp_k,p_bar,z,v,phi,f,h,s,phase,note from hist order by id").fetchall())
            return self.send(buf.getvalue(), "text/csv")
        self.send("not found", "text/plain", 404)

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        d = json.loads(self.rfile.read(n) or b"{}")
        u = urlparse(self.path)
        c = db()
        if u.path == "/api/save":
            r = d["result"]
            c.execute("insert into hist(who,gas,model,temp_k,p_bar,z,v,phi,f,h,s,phase,note) values(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                      (d.get("who") or "Guest", r["gas"], r["model"], r["T"], r["P"], r["Z"], r["V"], r["phi"], r["f"], r["H"], r["S"], r["phase"], d.get("note", "")))
            c.commit()
            return self.js({"ok": True})
        if u.path == "/api/delete":
            if d.get("id") == "all":
                c.execute("delete from hist")
            else:
                c.execute("delete from hist where id=?", (d["id"],))
            c.commit()
            return self.js({"ok": True})
        self.send("not found", "text/plain", 404)

if __name__ == "__main__":
    srv = HTTPServer(("127.0.0.1", PORT), Handler)
    print("Open http://127.0.0.1:%d in your browser (Ctrl+C to stop)" % PORT)
    threading.Timer(1, lambda: webbrowser.open("http://127.0.0.1:%d" % PORT)).start()
    srv.serve_forever()
