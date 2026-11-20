"""Tabla de AUM de fondos Balanz por ACDI (slide 41), en millones de ARS.
Meses dic-25..mes: AUM USD de dax_clientes.txt (clientes con 'ACDI' en el nombre) x dólar MEP de fin de mes (procesado/dolar.csv).
Cierres dic-19..dic-24: histórico fijo tomado del informe de sep-26 (acdi_orig.json)."""
import json, re, sys, difflib, os
import pandas as pd
AQ = os.path.dirname(os.path.abspath(__file__))
DAX = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/ig_ppt/int/dax_clientes.txt"
DOL = sys.argv[2] if len(sys.argv) > 2 else "/home/claude/cafci/procesado/dolar.csv"
MES = sys.argv[3] if len(sys.argv) > 3 else "2026-09"
O = json.load(open(os.path.join(AQ, "acdi_orig.json")))
hdr_hist = ["dic-24", "dic-23", "dic-22", "dic-21", "dic-20", "dic-19"]
num = lambda s: float(str(s).replace(".", "").replace(",", ".") or 0)
hist = {r[0]: [num(v) for v in r[-6:]] for r in O[1:-1]}
orig = {r[0]: [num(v) for v in r[1:11]] for r in O[1:-1]}           # sep..dic-25 del informe original (para validar)
d = pd.read_csv(DAX, sep="\t", encoding="utf-8-sig")
d.columns = [c.split("[")[-1].rstrip("]") if "[" in c else c for c in d.columns]
d["m"] = pd.to_datetime(d["Fecha Mes"], format="mixed").dt.strftime("%Y-%m")
d = d[d.nombre.astype(str).str.upper().str.contains(r"\bACDI\b", regex=True)]
fx = pd.read_csv(DOL); fx["m"] = fx.fecha.str[:7]; mep = fx.dropna(subset=["mep"]).groupby("m").mep.last()
meses = [m for m in pd.period_range("2025-12", MES, freq="M").strftime("%Y-%m")][::-1]   # mes .. dic-25
p = d[d.m.isin(meses)].pivot_table(index="nombre", columns="m", values="aum", aggfunc="sum").reindex(columns=meses).fillna(0)
ars = p.mul([mep[m] for m in meses], axis=1) / 1e6
def norm(s):        # clave por empresa: sin "(ACDI)", mercado (Matba Rofex, Byma, bilateral, plataforma) ni forma societaria
    s = s.upper()
    s = re.sub(r"\(ACDI[^)]*\)|\bACDI\b|MATBA|ROFEX|\bBYMA\b|BILATERAL|\bPLAT\b|WALLET \d+|\(|\)|-", " ", s)
    s = re.sub(r"\bS\.?\s?A\.?\s?U?\.?(?=\s|$)|\bSRL\b|\bALYC\b|\bSAU\b", " ", s)
    return re.sub(r"[^A-Z0-9]", "", s)
on = {norm(k): k for k in hist}
def par(n):
    k = norm(n)
    if k in on: return on[k]
    return None
filas = {}
for n, r in ars.iterrows():
    o = par(n) or n
    filas[o] = [a + b for a, b in zip(filas.get(o, [0] * len(meses)), r.values)]
for o in hist:
    filas.setdefault(o, [0] * len(meses))
lab = [pd.Period(m).strftime("%b-%y").lower().replace("jan", "ene").replace("apr", "abr").replace("aug", "ago").replace("dec", "dic") for m in meses]
df = pd.DataFrame({o: v + hist.get(o, [0] * 6) for o, v in filas.items()}, index=lab + hdr_hist).T
df = df.sort_values(df.columns[0], ascending=False)
df.loc["Total general"] = df.sum()
df.to_csv(os.path.join(AQ, "acdi.csv"))
# validación contra el informe original (mismos meses)
ok = [(o, orig[o][0], df.loc[o].iloc[0]) for o in orig if o in df.index]
tot_o = [num(v) for v in O[-1][1:11]]
print("Total original vs nuevo:", [f"{l}: {a:,.0f} vs {b:,.0f} ({b / a - 1:+.1%})" for l, a, b in zip(lab, tot_o, df.loc['Total general'].iloc[:len(lab)]) if a])
dif = sorted(((abs(b - a), o, a, b) for o, a, b in ok if max(a, b) > 1000), reverse=True)[:8]
print("Mayores diferencias en el mes:", [(o, round(a), round(b)) for _, o, a, b in dif])
print("sin pareja en el original:", [n for n in ars.index if not par(n)][:10])
