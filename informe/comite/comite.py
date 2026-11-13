"""Informe de Gestión FCI – versión Comité Ejecutivo (Slides artifact): gráficos + textos 100% calculados.

Uso:
  python3 comite.py --mes AAAA-MM --cafci /ruta/clon/cafci --internos internos.json --dax carpeta_dax --hist hist_area.csv --out salida

Entradas:
  --cafci     clon del repo público mfriedB/cafci (procesado/informe/industria_*.csv y procesado/clases_diario)
  --internos  internos.json (comisiones del reporte "Rporte de Comision por Fondos v2", lo arma informe/internos.py)
  --dax       carpeta con dax_mes_unidad.txt, dax_mes_unidad_fondo.txt, dax_clientes.txt, dax_inversores.txt
              (consultas de consultas_dax.dax sobre el modelo "DS Fondos - AM - Comisiones - Volumen - CuotaPartes")
  --hist      hist_area.csv: AUM por área nov-19 → sep-26 (fijo, digitalizado del informe anterior)
Salida (--out):
  png/*.png             gráficos (se suben como assets del artifact)
  project/...           deck.json, deck.css y project/slides/*.html con src="ASSET:<nombre>.png" (reemplazar por /_blob/<id>)
  resumen.json          cifras clave + controles (ok / faltantes)
Los datos internos nunca se suben a GitHub: este script sólo vive en el repo, los datos entran por argumentos.
"""
import argparse, json, os, re, subprocess, sys, textwrap
import numpy as np, pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm

AQUI = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument("--mes"); ap.add_argument("--cafci", required=True); ap.add_argument("--internos", required=True)
ap.add_argument("--dax", required=True); ap.add_argument("--hist", required=True); ap.add_argument("--out", required=True)
ap.add_argument("--chequear", action="store_true", help="sólo controla que estén los datos del mes y termina")
A_ = ap.parse_args()
OUT = A_.out; PNG = os.path.join(OUT, "png"); os.makedirs(PNG, exist_ok=True); os.makedirs(os.path.join(OUT, "project", "slides"), exist_ok=True)

# ------------------------------------------------------------------ formato
MES_ES = {1: "ene", 2: "feb", 3: "mar", 4: "abr", 5: "may", 6: "jun", 7: "jul", 8: "ago", 9: "sep", 10: "oct", 11: "nov", 12: "dic"}
MES_L = {1: "enero", 2: "febrero", 3: "marzo", 4: "abril", 5: "mayo", 6: "junio", 7: "julio", 8: "agosto", 9: "septiembre", 10: "octubre", 11: "noviembre", 12: "diciembre"}
lab = lambda m: f"{MES_ES[int(str(m)[5:7])]}-{str(m)[2:4]}"


def ar(x, d=1):
    s = f"{x:,.{d}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def pct(x, d=1, sign=False):
    if x is None or (isinstance(x, float) and (np.isnan(x) or np.isinf(x))): return "n/d"
    return ("+" if sign and x > 0 else ("−" if x < 0 else "")) + ar(abs(x) * 100, d) + "%"


def pp(x, d=1): return ("+" if x > 0 else "−" if x < 0 else "") + ar(abs(x) * 100, d) + " pp"
def bn(x, d=2): return ("−" if x < 0 else "") + "$" + ar(abs(x) / 1e6, d) + " bn"          # x en millones de $
def mill(x, d=0): return ("−" if x < 0 else "") + "$" + ar(abs(x), d) + "M"                 # x en millones de $
def usdm(x, d=0): return ("−" if x < 0 else "") + "USD " + ar(abs(x) / 1e6, d) + "M"        # x en USD
def esc(s): return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# ------------------------------------------------------------------ industria (CAFCI/CNV)
BANC = [s.upper() for s in ["Galicia", "Santander", "BBVA", "HSBC", "ICBC", "MACRO", "Pellegrini", "BIND", "Provinfondos", "Patagonia",
        "Proahorro", "Supervielle", "BACS", "Bancor", "Mariva", "Ciudad", "CMF", "SAM Arg", "Chaco"]]


def cat2(c, s):
    s = str(s)
    if s == "MM USD Clásico": return "Money Market USD"
    if s in ("MM ARS Clásico", "MM ARS Dinámico"): return "Money Market ARS"
    return c


def cat3(c, s):
    s = str(s); x = cat2(c, s)
    if x != c: return x
    if c == "Renta Fija" and "USD" in s and "Linked" not in s: return "Renta Fija USD"
    if c == "Renta Fija": return "Renta Fija ARS"
    return c


def load_ind(f):
    a = pd.read_csv(os.path.join(A_.cafci, "procesado", "informe", f))
    a = a[a.Categoria.notna()].copy()
    a["t"] = np.where(a.Gerente.astype(str).str.upper().isin(BANC), "Bancarias", "Independientes")
    a["c2"] = [cat2(c, s) for c, s in zip(a.Categoria, a.Subcategoria)]
    a["c3"] = [cat3(c, s) for c, s in zip(a.Categoria, a.Subcategoria)]
    a["mes"] = a.Fecha.str[:7]
    return a


A0 = load_ind("industria_ars.csv"); U0 = load_ind("industria_usd.csv")
MESES_IND = sorted(A0.mes.unique())
I = json.load(open(A_.internos))
co = pd.DataFrame(I["comisiones"]); co["m"] = co.mes.str[:7]
cf = pd.DataFrame(I["comisiones_fondo"]); cf["m"] = cf.mes.str[:7]


def leer_dax(nombre):
    p = os.path.join(A_.dax, nombre)
    if not os.path.exists(p): return None
    d = pd.read_csv(p, sep="\t", encoding="utf-8-sig")
    d.columns = [re.findall(r"\[([^\]]+)\]", c)[-1] if "[" in c else c for c in d.columns]
    d["mes"] = pd.to_datetime(d["Fecha Mes"], format="mixed", dayfirst=False).dt.strftime("%Y-%m")
    return d


u, f_, c, iv = (leer_dax(n) for n in ("dax_mes_unidad.txt", "dax_mes_unidad_fondo.txt", "dax_clientes.txt", "dax_inversores.txt"))

# ------------------------------------------------------------------ mes a informar + controles
def mes_default():
    hoy = pd.Timestamp.today(); m = (hoy.replace(day=1) - pd.Timedelta(days=1))
    return m.strftime("%Y-%m")


MES = A_.mes or mes_default()
falt = []
if MES not in MESES_IND: falt.append(f"industria CAFCI ({MES}) en procesado/informe")
if MES not in set(co.m): falt.append(f"comisiones internas ({MES}) en internos.json")
for n_, d_ in (("dax_mes_unidad", u), ("dax_mes_unidad_fondo", f_), ("dax_clientes", c), ("dax_inversores", iv)):
    if d_ is None: falt.append(f"{n_}.txt (no existe)")
    elif not (d_[d_.mes == MES].select_dtypes("number").abs().sum().sum() > 0): falt.append(f"{n_}.txt sin datos de {MES}")
if falt or A_.chequear:
    json.dump({"mes": MES, "ok": not falt, "faltantes": falt}, open(os.path.join(OUT, "resumen.json"), "w"), ensure_ascii=False, indent=1)
    print(json.dumps({"mes": MES, "ok": not falt, "faltantes": falt}, ensure_ascii=False))
    sys.exit(0 if not falt else 2)

Y, MN = int(MES[:4]), int(MES[5:7])
P = lambda k: (pd.Period(MES, "M") - k).strftime("%Y-%m")       # mes k meses antes
SE, M3, M12_ = P(1), P(3), P(12)
DIC = f"{Y - 1}-12"
mes_end = lambda m: A0[A0.mes == m].Fecha.max()
O, S, D, JL = mes_end(MES), mes_end(SE), mes_end(DIC), mes_end(M3)
A = A0[A0.Fecha <= O]; U = U0[U0.Fecha <= O]
MESL, MESC = f"{MES_L[MN]} {Y}", lab(MES)
o, s, d = A[A.Fecha == O], A[A.Fecha == S], A[A.Fecha == D]
T = lambda x: x.AUM_Final.sum()
BZ = lambda x: x[x.Gerente == "Balanz"]
K = {"mes": MES}

# ------------------------------------------------------------------ estilo de gráficos (marca Balanz, fondo blanco)
for ff in fm.findSystemFonts():
    if "inter" in ff.lower(): fm.fontManager.addfont(ff)
plt.rcParams.update({"font.family": ["Inter", "DejaVu Sans"], "font.size": 15, "axes.spines.left": False, "axes.spines.top": False,
                     "axes.spines.right": False, "axes.edgecolor": "#c9d1de", "xtick.color": "#4a5568", "ytick.color": "#07153A"})
NAVY, BLUE, SOFT, NEG, INK, POS, MUT = "#07153A", "#4AA4E2", "#d5ddea", "#d65a4a", "#07153A", "#1f8a4c", "#5b6577"


def sv(fig, n):
    fig.savefig(os.path.join(PNG, n), dpi=150, bbox_inches="tight", transparent=True); plt.close(fig)


def clean(ax):
    ax.tick_params(axis="both", length=0); ax.set_yticks([]); ax.grid(False)


def hbars(ax, ser, colors, fmt, xpad=.02, fs=13, bold=lambda k: False):
    ax.barh(range(len(ser)), ser, color=colors, height=.64)
    mx, mn = ser.max(), min(ser.min(), 0)
    for i, (k, v) in enumerate(ser.items()):
        ax.text(v + (mx - mn) * xpad * (1 if v >= 0 else -1), i, fmt(v, k), va="center", ha="left" if v >= 0 else "right", fontsize=fs, color=INK,
                fontweight="bold" if bold(k) else "normal")
    ax.set_xticks([]); ax.tick_params(length=0)


# ================================================================== INDUSTRIA
M13 = [m for m in MESES_IND if m <= MES][-13:]
aum = pd.Series({m: A[A.Fecha == mes_end(m)].AUM_Final.sum() / 1e6 for m in M13})
fig, ax = plt.subplots(figsize=(11, 5.2))
ax.bar(range(len(aum)), aum, color=[SOFT] * (len(aum) - 1) + [NAVY], width=.7)
for i, v in enumerate(aum): ax.text(i, v + aum.max() * .015, ar(v, 1), ha="center", fontsize=12.5, color=INK if i == len(aum) - 1 else MUT, fontweight="bold" if i == len(aum) - 1 else "normal")
ax.set_xticks(range(len(aum))); ax.set_xticklabels([lab(m) for m in M13], fontsize=11); clean(ax); sv(fig, "ind_aum.png")
K.update(aum_ind=T(o), aum_ind_var=T(o) / T(s) - 1, aum_12m=aum.iloc[-1] / aum.iloc[0] - 1)
uo, us = U[U.Fecha == U[U.mes == MES].Fecha.max()], U[U.Fecha == U[U.mes == SE].Fecha.max()]
K.update(aum_usd=T(uo), aum_usd_var=T(uo) / T(us) - 1, var_banc=T(o[o.t == "Bancarias"]) / T(s[s.t == "Bancarias"]) - 1,
         var_indep=T(o[o.t == "Independientes"]) / T(s[s.t == "Independientes"]) - 1)

fc = (o.groupby("c2").Susc_Netas.sum() / 1e3).sort_values()
fig, ax = plt.subplots(figsize=(8.6, 5.2))
hbars(ax, fc, [NAVY if v >= 0 else NEG for v in fc], lambda v, k: ("+" if v > 0 else "") + ar(v, 0), fs=14)
ax.set_yticks(range(len(fc))); ax.set_yticklabels(fc.index, fontsize=14); ax.axvline(0, color="#9aa5b8", lw=1)
ax.set_xlim(fc.min() - (fc.max() - fc.min()) * .2, fc.max() * 1.25); sv(fig, "ind_flujo.png")
fl = o.Susc_Netas.sum(); mmf = fc.reindex(["Money Market USD", "Money Market ARS"]).fillna(0).sum() * 1e3
K.update(flujo_ind=fl, flujo_ind_prev=s.Susc_Netas.sum(), flujo_banc=o[o.t == "Bancarias"].Susc_Netas.sum(), flujo_indep=o[o.t == "Independientes"].Susc_Netas.sum(),
         flujo_mm_share=mmf / fl if fl > 0 else np.nan, flujo_top=list(fc.sort_values(ascending=False).index[:2]))
ytd = A[(A.Fecha > D) & (A.Fecha <= O)]
K.update(flujo_ytd=ytd.Susc_Netas.sum(), flujo_ytd_pct=ytd.Susc_Netas.sum() / T(d))

# ================================================================== POSICIONAMIENTO
ga = o.groupby("Gerente").AUM_Final.sum().sort_values(ascending=False) / 1e6
gi = o[o.t == "Independientes"].groupby("Gerente").AUM_Final.sum().sort_values(ascending=False)
ex = o[~o.c2.str.startswith("Money")]; ge = ex.groupby("Gerente").AUM_Final.sum().sort_values(ascending=False)
gei = ex[ex.t == "Independientes"].groupby("Gerente").AUM_Final.sum().sort_values(ascending=False)
K.update(bz_aum=T(BZ(o)), bz_var=T(BZ(o)) / T(BZ(s)) - 1, bz_flujo=BZ(o).Susc_Netas.sum(), rank=list(ga.index).index("Balanz") + 1, n_sg=len(ga),
         rank_sgi=list(gi.index).index("Balanz") + 1, n_sgi=len(gi), sgi1=gi.index[0], rank_exmm=list(ge.index).index("Balanz") + 1, exmm1=ge.index[0],
         rank_exmm_sgi=list(gei.index).index("Balanz") + 1, share_exmm_sgi=gei["Balanz"] / gei.sum())
top = ga.head(max(10, K["rank"]))[::-1] if K["rank"] <= 12 else pd.concat([ga.head(9), ga[["Balanz"]]])[::-1]
fig, ax = plt.subplots(figsize=(8.2, 5.6))
pos_ = [list(ga.index).index(g) + 1 for g in top.index]
hbars(ax, top, [NAVY if g == "Balanz" else SOFT for g in top.index], lambda v, k: f"$ {ar(v, 1)} bn  ·  {ar(v / ga.sum() * 100, 1)}%", xpad=.01, fs=12.5, bold=lambda k: k == "Balanz")
ax.set_yticks(range(len(top))); ax.set_yticklabels([f"{p_}. {g}" for p_, g in zip(pos_, top.index)], fontsize=13.5)
for t_ in ax.get_yticklabels():
    if "Balanz" in t_.get_text(): t_.set_fontweight("bold")
ax.set_xlim(0, top.max() * 1.45); sv(fig, "rank.png")

gy = ytd.groupby("Gerente").Susc_Netas.sum().sort_values(ascending=False) / 1e6
ini = d.groupby("Gerente").AUM_Final.sum() / 1e6
tipo = o.groupby("Gerente").t.first()
iy = gy[tipo.reindex(gy.index) == "Independientes"]
K.update(bz_ytd=gy["Balanz"] * 1e6, bz_ytd_pct=gy["Balanz"] / ini["Balanz"], bz_ytd_share=gy["Balanz"] * 1e6 / K["flujo_ytd"],
         ytd_rank=list(gy.index).index("Balanz") + 1, ytd_rank_sgi=list(iy.index).index("Balanz") + 1)
t8 = gy.head(8) if "Balanz" in gy.head(8).index else pd.concat([gy.head(7), gy[["Balanz"]]])
t8 = t8[::-1]
fig, ax = plt.subplots(figsize=(8.2, 5.6))
hbars(ax, t8, [NAVY if g == "Balanz" else ("#93c9ef" if tipo.get(g) == "Independientes" else SOFT) for g in t8.index],
      lambda v, k: f"$ {ar(v, 2)} bn  ·  {pct(v / ini[k], 0, True) if ini.get(k, 0) > 0 else ''} s/AUM ini.", xpad=.01, fs=12.5, bold=lambda k: k == "Balanz")
ax.set_yticks(range(len(t8))); ax.set_yticklabels(t8.index, fontsize=13.5)
for t_ in ax.get_yticklabels():
    if t_.get_text() == "Balanz": t_.set_fontweight("bold")
ax.set_xlim(min(0, t8.min()), t8.max() * 1.75); sv(fig, "flujo_ytd.png")

# fondos Balanz que traccionan el flujo del año
gfd = BZ(ytd).groupby("Fondo").Susc_Netas.sum().sort_values(ascending=False) / 1e3
t8f = gfd.head(8)[::-1]
fig, ax = plt.subplots(figsize=(9.4, 6.0))
hbars(ax, t8f, [NAVY if i >= len(t8f) - 3 else BLUE for i in range(len(t8f))],
      lambda v, k: f"$ {ar(v * 1000, 0)}M" + (f"  ·  {ar(v / gfd.sum() * 100, 0)}%" if gfd.sum() > 0 else ""), xpad=.01, fs=13)
ax.set_yticks(range(len(t8f))); ax.set_yticklabels([x.strip().replace("Balanz ", "").replace("Dolares", "Dólares") for x in t8f.index], fontsize=14)
ax.set_xlim(min(0, t8f.min()), t8f.max() * 1.55); sv(fig, "fondos_flujo.png")
nom = lambda x: x.strip().replace("Balanz ", "").replace("Dolares", "Dólares")
K.update(fondos_top3=[nom(x) for x in gfd.index[:3]], fondos_top3_share=gfd.head(3).sum() / gfd.sum() if gfd.sum() > 0 else np.nan,
         fondos_top1=(nom(gfd.index[0]), gfd.iloc[0] * 1e3), fondos_pos=int((gfd > 0.5).sum()), fondos_n=len(gfd),
         fondos_peor=(nom(gfd.index[-1]), gfd.iloc[-1] * 1e3))

ms = pd.Series({m: BZ(A[A.Fecha == mes_end(m)]).AUM_Final.sum() / A[A.Fecha == mes_end(m)].AUM_Final.sum() for m in M13})
mi = pd.Series({m: BZ(A[A.Fecha == mes_end(m)]).AUM_Final.sum() / A[(A.Fecha == mes_end(m)) & (A.t == "Independientes")].AUM_Final.sum() for m in M13})
fig, ax = plt.subplots(figsize=(11, 5.0))
for ser, col, nm in ((mi, BLUE, "entre independientes"), (ms, NAVY, "total industria")):
    ax.plot(range(len(ser)), ser * 100, color=col, lw=3.2, marker="o", ms=7)
    ax.text(len(ser) - .65, ser.iloc[-1] * 100, f"{ar(ser.iloc[-1] * 100, 1)}%\n{nm}", va="center", fontsize=13.5, color=col, fontweight="bold")
    ax.text(-.35, ser.iloc[0] * 100, f"{ar(ser.iloc[0] * 100, 1)}%", va="center", ha="right", fontsize=12.5, color=col)
ax.set_xticks(range(0, len(ms), 2)); ax.set_xticklabels([lab(m) for m in M13][::2], fontsize=12.5); clean(ax); ax.set_xlim(-1.3, len(ms) + 1.6)
ax.set_ylim(0, max(mi.max(), ms.max()) * 118); sv(fig, "ms.png")
K.update(ms=ms.iloc[-1], ms_ini=ms.iloc[0], ms_mm=ms.iloc[-1] - ms.iloc[-2], mi=mi.iloc[-1], mi_ini=mi.iloc[0])

cats = ["Money Market ARS", "T+1", "Money Market USD", "Renta Fija ARS", "Renta Fija USD", "Renta Mixta", "Renta Variable", "Destino Esp."]
cc = {"Money Market ARS": "#cfe6f8", "T+1": "#93c9ef", "Money Market USD": "#4AA4E2", "Renta Fija ARS": "#1f5fa8", "Renta Fija USD": "#07153A",
      "Renta Mixta": "#e9c46a", "Renta Variable": "#f08a7e", "Destino Esp.": "#a9b4c6"}
mi_ = o.groupby("c3").AUM_Final.sum(); mb = BZ(o).groupby("c3").AUM_Final.sum()
mix = pd.DataFrame({"Industria": mi_ / mi_.sum(), "Balanz": mb / mb.sum()}).reindex(cats).fillna(0).T
fig, ax = plt.subplots(figsize=(14, 3.0)); left = np.zeros(2)
for cat in cats:
    v = mix[cat].values; ax.barh([1, 0], v, left=left, color=cc[cat], height=.62, label=cat, edgecolor="white", lw=1.5)
    for j, (x0, w) in enumerate(zip(left, v)):
        if w > .045: ax.text(x0 + w / 2, [1, 0][j], f"{ar(w * 100, 0)}%", ha="center", va="center", fontsize=13, color=INK if cat in ("Money Market ARS", "T+1", "Renta Mixta") else "white", fontweight="bold")
    left += v
ax.set_yticks([1, 0]); ax.set_yticklabels(["Industria", "Balanz"], fontsize=15, fontweight="bold"); ax.set_xticks([]); ax.tick_params(length=0); ax.set_xlim(0, 1)
ax.legend(ncol=8, loc="upper center", bbox_to_anchor=(.5, -.02), frameon=False, fontsize=11.5, handlelength=1, columnspacing=1.2); sv(fig, "mix.png")
usdf = lambda x: x[x.Subcategoria.astype(str).str.contains("USD") & ~x.Subcategoria.astype(str).str.contains("Linked")]
K.update(usd_bz=T(usdf(BZ(o))) / T(BZ(o)), usd_ind=T(usdf(o)) / T(o), mix_bz_top=(mix.loc["Balanz"].idxmax(), mix.loc["Balanz"].max()),
         mix_ind_top=(mix.loc["Industria"].idxmax(), mix.loc["Industria"].max()))

# ================================================================== NEGOCIO PROPIO (modelo semántico + comisiones)
for x in (u, f_, c, iv): x.drop(x[x.mes > MES].index, inplace=True)
M12 = [m for m in sorted(u.mes.unique()) if P(11) <= m <= MES]
au = u[u.mes.isin(M12)].groupby("mes").aum_orig.sum() / 1e6
au = au[au > 0]
fig, ax = plt.subplots(figsize=(11, 5.0))
ax.fill_between(range(len(au)), au, color=BLUE, alpha=.12); ax.plot(range(len(au)), au, color=NAVY, lw=3.2, marker="o", ms=7)
for i, v in enumerate(au):
    if i in (0, len(au) - 1) or (len(au) - 1 - i) % 2 == 0: ax.text(i, v + au.max() * .04, ar(v, 0), ha="center", fontsize=12.5, color=INK, fontweight="bold" if i == len(au) - 1 else "normal")
ax.set_xticks(range(len(au))); ax.set_xticklabels([lab(m) for m in au.index], fontsize=12.5); clean(ax); ax.set_ylim(0, au.max() * 1.18); sv(fig, "aum_int.png")
exm = u[(u.unidad != "BLNZ") & (u.mes <= MES)].groupby("mes")[["aum_orig", "flujo"]].sum()
K.update(aum_int=au.iloc[-1] * 1e6, aum_int_mm=au.iloc[-1] / au.iloc[-2] - 1, aum_exmeli=exm.loc[MES, "aum_orig"], flujo_exmeli=exm.loc[MES, "flujo"],
         flujo_exmeli_ytd=exm.loc[f"{Y}-01":MES, "flujo"].sum(), aum_int_max=au.idxmax() == MES, aum_int_maxmes=au.idxmax())

tot = co.groupby("m").comisiones.sum() / 1e6
mm_ = [f"{i:02d}" for i in range(1, MN + 1)]
f1 = [tot.get(f"{Y - 1}-{x}", np.nan) for x in mm_]; f2 = [tot.get(f"{Y}-{x}", np.nan) for x in mm_]
fig, ax = plt.subplots(figsize=(11, 5.0)); xx = np.arange(len(mm_))
ax.bar(xx - .2, f1, .38, color=SOFT, label=str(Y - 1)); ax.bar(xx + .2, f2, .38, color=NAVY, label=str(Y))
for i, v in enumerate(f2): ax.text(i + .2, v + np.nanmax(f2) * .015, ar(v, 1), ha="center", fontsize=12, color=INK, fontweight="bold" if i == len(f2) - 1 else "normal")
ax.set_xticks(xx); ax.set_xticklabels([MES_ES[int(x)] for x in mm_], fontsize=13); clean(ax); ax.legend(frameon=False, fontsize=13, loc="upper left"); sv(fig, "fact.png")
K.update(fact=tot[MES] * 1e6, fact_mm=tot[MES] / tot[SE] - 1, fact_yy=tot[MES] / tot[M12_] - 1 if M12_ in tot else np.nan,
         fact_ytd=np.nansum(f2) * 1e6, fact_ytd_yy=np.nansum(f2) / np.nansum(f1) - 1 if np.nansum(f1) > 0 else np.nan,
         fact_record=tot[MES] >= tot.max() - 1e-9)

p_ = co.pivot_table(index="m", columns="unidad", values="comisiones", aggfunc="sum").fillna(0)
REN = {"BLNZ": "Otros (ML FCIC)", "Productores": "Productores Exclusivos", "Wealth Management Uruguay": "WM UY", "IB-Banca de Inversión": "Banca de Inversión",
       "Academy Inversiones": "University Inversiones"}
yy = ((p_.loc[MES] - p_.loc[M12_]) / 1e3).sort_values() if M12_ in p_.index else (p_.loc[MES] / 1e3).sort_values()
yys = pd.concat([yy.head(2), yy.tail(7)]).sort_values() if len(yy) > 9 else yy
fig, ax = plt.subplots(figsize=(8.4, 5.4))
hbars(ax, yys, [NAVY if v >= 0 else NEG for v in yys], lambda v, k: ("+" if v > 0 else "") + ar(v, 0), fs=13)
ax.set_yticks(range(len(yys))); ax.set_yticklabels([REN.get(x, x) for x in yys.index], fontsize=13.5); ax.axvline(0, color="#9aa5b8", lw=1)
ax.set_xlim(yys.min() - (yys.max() - yys.min()) * .25, yys.max() * 1.3); sv(fig, "fact_contrib.png")
dyy = (tot[MES] - tot.get(M12_, np.nan)) * 1e3
K.update(fact_dyy=dyy * 1e3, fact_top2=[REN.get(x, x) for x in yy.index[::-1][:2]], fact_top2_share=yy.iloc[::-1][:2].sum() / dyy if dyy > 0 else np.nan,
         fact_top1=(REN.get(yy.index[-1], yy.index[-1]), yy.iloc[-1] * 1e3), fact_units_up=int((yy > 0).sum()), fact_units=int((p_.loc[MES] > 0).sum()))

MAPA = {"BLNZ": "Otros", "Academy Inversiones": "University Inversiones", "Productores": "Productores Exclusivos",
        "IB-Banca de Inversión": "Banca de Inversión", "Wealth Management Uruguay": "WM UY", "Cordoba GDP": "Otros"}
u["area"] = u.unidad.map(lambda x: MAPA.get(x, x))
pa_ = u.pivot_table(index="mes", columns="area", values="aum_orig", aggfunc="sum").fillna(0) / 1e6
pa_ = pa_[pa_.sum(axis=1) > 0]
hist = pd.read_csv(A_.hist, index_col=0).drop(columns="Total", errors="ignore")
pv = pd.concat([hist[~hist.index.isin(pa_.index)], pa_]).fillna(0).sort_index(); pv = pv.loc[:, pv.max() > 0.5]
a_o = pa_.loc[MES]; a_s = pv.loc[SE]; a_y = pv.loc[M12_] if M12_ in pv.index else None; a_d = pv.loc[DIC] if DIC in pv.index else None
t30 = pd.DataFrame({"aum": a_o, "yy": a_o / a_y.reindex(a_o.index).replace(0, np.nan) - 1 if a_y is not None else np.nan})
t30 = t30[t30.aum > 0.05].sort_values("aum", ascending=False)
top5 = list(t30.index[:5])
pts = [f"{y}-12" for y in range(int(pv.index[0][:4]), Y) if f"{y}-12" in pv.index] + [MES]
pp_ = pv.loc[pts]; pp_ = pd.concat([pp_[top5], pp_.drop(columns=top5).sum(axis=1).rename("Resto")], axis=1)
acol = ["#07153A", "#1f5fa8", "#4AA4E2", "#93c9ef", "#cfe6f8", "#dfe4ec"]
fig, ax = plt.subplots(figsize=(10.5, 5.6)); b = np.zeros(len(pp_))
for col, cl in zip(pp_.columns, acol):
    ax.bar(range(len(pp_)), pp_[col], bottom=b, color=cl, width=.66, label=col, edgecolor="white", lw=.8); b += pp_[col].values
for i, v in enumerate(b): ax.text(i, v + b.max() * .015, ar(v, 0), ha="center", fontsize=13, color=INK, fontweight="bold" if i == len(b) - 1 else "normal")
ax.set_xticks(range(len(pp_))); ax.set_xticklabels([lab(m) for m in pp_.index], fontsize=12.5); clean(ax)
h_, l_ = ax.get_legend_handles_labels(); ax.legend(h_[::-1], l_[::-1], frameon=False, fontsize=12, loc="upper left"); sv(fig, "area_hist.png")
K.update(area_hist=(lab(pp_.index[0]), b[0], b[-1]), area_top2=top5[:2], area_top2_share=t30.aum.iloc[:2].sum() / t30.aum.sum())

ta = t30.head(10)[::-1]
fig, ax = plt.subplots(figsize=(8.4, 5.6))
ax.barh(range(len(ta)), ta.aum, color=NAVY, height=.64)
for i, (n, r_) in enumerate(ta.iterrows()):
    yv = r_.yy; s_ = pct(yv, 0, True) if pd.notna(yv) and abs(yv) < 50 else "nuevo"
    ax.text(r_.aum + ta.aum.max() * .01, i, f"{ar(r_.aum, 0)}  ", va="center", fontsize=13, color=INK, fontweight="bold")
    ax.text(ta.aum.max() * 1.22, i, s_ + " y/y", va="center", fontsize=12.5, color=POS if (pd.notna(yv) and yv > 0) else NEG, ha="left")
ax.set_yticks(range(len(ta))); ax.set_yticklabels(ta.index, fontsize=13.5); ax.set_xticks([]); ax.tick_params(length=0); ax.set_xlim(0, ta.aum.max() * 1.55)
sv(fig, "area_oct.png")
t10 = t30.head(10); yv = t10.yy.replace([np.inf, -np.inf], np.nan).dropna()
fast = t10.yy.replace([np.inf, -np.inf], np.nan).dropna(); fast = fast[fast < 50]
K.update(area1=(t30.index[0], t30.aum.iloc[0], t30.aum.iloc[0] / t30.aum.sum()), area_yy_min=yv.min() if len(yv) else np.nan,
         area_up=int((yv > 0).sum()), area_n=len(t10), area_fast=(fast.idxmax(), fast.max()) if len(fast) else None)

# 3 meses por área (dinámica interna)
gr = (pa_.loc[MES] / pa_.loc[M3] - 1).where(pa_.loc[M3] > 20).dropna().sort_values() if M3 in pa_.index else pd.Series(dtype=float)
gr = gr[gr.index != "Sector Público"]
if len(gr):
    fig, ax = plt.subplots(figsize=(8.6, 6.0))
    hbars(ax, gr * 100, [NAVY if v >= .2 else (SOFT if v >= 0 else NEG) for v in gr], lambda v, k: ("+" if v > 0 else "") + ar(v, 0) + "%", fs=12.5, bold=lambda k: gr[k] >= .2)
    ax.set_yticks(range(len(gr))); ax.set_yticklabels([x.replace("Institucionales No Regulados 2", "Inst. No Regulados 2") for x in gr.index], fontsize=12.5)
    ax.axvline(0, color="#9aa5b8", lw=1); ax.set_xlim(gr.min() * 100 - 18, gr.max() * 100 + 18); sv(fig, "areas3m.png")
pf_ = f_.pivot_table(index="mes", columns="nombre_corto_fdo_ok", values="fact", aggfunc="sum").fillna(0)
q3 = pf_.loc[P(2):MES].sum() - pf_.loc[P(5):P(3)].sum()
dq = q3.sort_values()
K.update(din=list(gr.index[::-1][:2]) if len(gr) else [], din_g=list(gr.iloc[::-1][:2]) if len(gr) else [],
         din_aum=(pa_.loc[M3, gr.index[-1]], pa_.loc[MES, gr.index[-1]]) if len(gr) else None,
         dq_top=(dq.index[-1], dq.iloc[-1]), dq_bot=(dq.index[0], dq.iloc[0]), din_neg=[(k_, v_) for k_, v_ in gr.items() if v_ < 0][:2])

# inversores
nn = iv.pivot_table(index="mes", columns="tipopersona", values="n", aggfunc="sum").loc[P(11):MES]
fig, ax = plt.subplots(figsize=(11, 5.2))
ax.bar(range(len(nn)), nn.PF / 1e3, .62, color=[SOFT] * (len(nn) - 1) + [NAVY])
for i, v in enumerate(nn.PF / 1e3): ax.text(i, v + nn.PF.max() / 1e3 * .015, ar(v, 0) + "k", ha="center", fontsize=12.5, color=INK, fontweight="bold" if i == len(nn) - 1 else "normal")
ax.set_xticks(range(len(nn))); ax.set_xticklabels([lab(m) for m in nn.index], fontsize=12); clean(ax); ax.set_ylim(0, nn.PF.max() / 1e3 * 1.15); sv(fig, "inversores.png")
base_n = DIC if DIC in nn.index else nn.index[0]
K.update(pf=(nn.PF.loc[base_n], nn.PF.loc[MES], lab(base_n)), pj=(nn.PJ.loc[base_n], nn.PJ.loc[MES]), pf_3m=nn.PF.loc[MES] / nn.PF.loc[M3] - 1 if M3 in nn.index else np.nan)

# clientes y ACDIs
fo_ = u[u.mes == MES].fact.sum()
cm = c[c.mes == MES].groupby("nombre").fact.sum().sort_values(ascending=False)
c10 = cm.head(10)[::-1]
fig, ax = plt.subplots(figsize=(8.4, 5.6))
hbars(ax, c10 / 1e3, [BLUE] * 10, lambda v, k: f"{ar(v, 0)}k  ·  {ar(v * 1e3 / fo_ * 100, 1)}%", xpad=.01, fs=12.5)
ax.set_yticks(range(len(c10))); ax.set_yticklabels([textwrap.shorten(x.title(), 30, placeholder="…") for x in c10.index], fontsize=12.5)
ax.set_xlim(0, c10.max() / 1e3 * 1.45); sv(fig, "clientes.png")
ac = c[c.nombre.str.contains("ACDI")]; acm = ac.groupby("mes").aum.sum()
dac = (ac[ac.mes == MES].groupby("nombre").aum.sum() - ac[ac.mes == SE].groupby("nombre").aum.sum()).fillna(0).sort_values()
K.update(top10_share=cm.head(10).sum() / fo_, acdi=acm.get(MES, 0), acdi_mm=acm.get(MES, 0) / acm.get(SE, np.nan) - 1,
         acdi_share=acm.get(MES, 0) / u[u.mes == MES].aum_orig.sum(), acdi_mov=(dac.index[0], dac.iloc[0]) if len(dac) and abs(dac.iloc[0]) > abs(dac.iloc[-1]) else ((dac.index[-1], dac.iloc[-1]) if len(dac) else None))

# ================================================================== RENDIMIENTOS vs peers (CAFCI, taxonomía 1816)
rc = os.path.join(OUT, "rend_corte.csv")
subprocess.run([sys.executable, os.path.join(AQUI, "rend_corte.py"), str(pd.Timestamp(O).date()), rc], check=True, env={**os.environ, "CAFCI": A_.cafci})
r = pd.read_csv(rc)
ref = r[(r.cuota_referencia == 1) & (r.patrimonio_fondo_mill > 0)]
bzr = r[(r.gerente_1816 == "Balanz") & (r.patrimonio_clase_mill > 0)]
fondos = bzr[(bzr.cuota_referencia == 1) & (bzr.subcategoria_1816 != "Sin clasificar")].drop_duplicates("codigo_cnv").sort_values("patrimonio_fondo_mill", ascending=False)
rows = []
for _, fr in fondos.iterrows():
    peer = ref[(ref.subcategoria_1816 == fr.subcategoria_1816) & (ref.gerente_1816 != "Balanz")]
    row = {"Fondo": fr.fondo_1816 if isinstance(fr.fondo_1816, str) else fr.fondo, "aum": fr.patrimonio_fondo_mill}
    for col, h in (("r_30D", "30d"), ("r_90D", "90d"), ("r_YTD", "YTD"), ("r_365D", "12m")):
        lim = 0.5 if col in ("r_30D", "r_90D") else 3
        pq = peer[peer[col].notna() & (peer[col].abs() < lim)]
        avg = np.average(pq[col], weights=pq.patrimonio_fondo_mill) if len(pq) and pq.patrimonio_fondo_mill.sum() > 0 else np.nan
        row[h] = fr[col] - avg if pd.notna(fr[col]) and pd.notna(avg) else np.nan
    rows.append(row)
t63 = pd.DataFrame(rows)
hz = "YTD" if MN >= 3 else "12m"                       # en ene/feb el YTD es muy corto: se usa 12 meses
rr = t63[t63[hz].notna()].head(14).sort_values(hz)
fig, ax = plt.subplots(figsize=(9.2, 6.0))
v = rr[hz] * 100
hbars(ax, v, [POS if x >= 0 else NEG for x in v], lambda x, k: ("+" if x > 0 else "") + ar(x, 1) + " pp", fs=12)
ax.set_yticks(range(len(rr))); ax.set_yticklabels([textwrap.shorten(str(x), 30, placeholder="…") for x in rr.Fondo], fontsize=12.5)
ax.axvline(0, color="#9aa5b8", lw=1); ax.set_xlim(v.min() - 6, v.max() + 6); sv(fig, "rend.png")
mh = t63[hz].notna()
best = t63[mh].sort_values(hz).iloc[-1]; worst_big = rr.iloc[0]
K.update(rend_hz=hz, rend_beat=int((t63.loc[mh, hz] > 0).sum()), rend_n=int(mh.sum()), rend_best=(best.Fondo, best[hz]), rend_worst=(worst_big.Fondo, worst_big[hz]))
bw = {}
for h in ("30d", "90d", "YTD", "12m"):
    m_ = t63[h].notna(); bw[h] = t63.loc[m_ & (t63[h] > 0), "aum"].sum() / t63.loc[m_, "aum"].sum() if m_.any() else np.nan
fig, ax = plt.subplots(figsize=(11, 5.4))
vv = [bw[h] * 100 for h in ("30d", "90d", "YTD", "12m")]
ax.bar(range(4), vv, .6, color=[BLUE, BLUE, NAVY, NAVY])
for i, x in enumerate(vv): ax.text(i, x + 2, f"{ar(x, 0)}%", ha="center", fontsize=20, color=INK, fontweight="bold")
ax.axhline(50, color="#a9b4c6", lw=1.5, ls="--"); ax.text(-.42, 51.5, "50%", fontsize=13, color=MUT, ha="left")
ax.set_xticks(range(4)); ax.set_xticklabels(["30 días", "90 días", "En el año", "12 meses"], fontsize=15); clean(ax); ax.set_ylim(0, 100); sv(fig, "peer_aum.png")
K.update(peer_aum=bw)

# ================================================================== ADICIONALES: Balanz vs industria
grp = [("Balanz", BZ), ("Independientes", lambda x: x[x.t == "Independientes"]), ("Bancarias", lambda x: x[x.t == "Bancarias"]), ("Industria", lambda x: x)]
n1 = pd.DataFrame({nm: {"Crecimiento del AUM": T(fn(o)) / T(fn(d)) - 1, "Flujo neto / AUM inicial": fn(ytd).Susc_Netas.sum() / T(fn(d))} for nm, fn in grp}).T
fig, ax = plt.subplots(figsize=(11, 5.4)); xx = np.arange(2); w = .19
for i, (nm, r_) in enumerate(n1.iterrows()):
    ax.bar(xx + (i - 1.5) * w, r_.values * 100, w * .92, color=[NAVY, "#93c9ef", SOFT, "#a9b4c6"][i], label=nm)
    for j, x in enumerate(r_.values): ax.text(j + (i - 1.5) * w, x * 100 + abs(n1.values).max() * 2, f"{ar(x * 100, 0)}%", ha="center", fontsize=13.5, color=INK, fontweight="bold" if nm == "Balanz" else "normal")
ax.set_xticks(xx); ax.set_xticklabels(n1.columns, fontsize=15); clean(ax); ax.legend(frameon=False, fontsize=13, ncol=4, loc="upper center", bbox_to_anchor=(.5, 1.08))
ax.set_ylim(min(0, n1.values.min() * 120), n1.values.max() * 118); ax.axhline(0, color="#c9d1de", lw=1); sv(fig, "n_ytd.png")
ga0 = d.groupby("Gerente").AUM_Final.sum(); ga1 = o.groupby("Gerente").AUM_Final.sum()
gg = (ga1 / ga0 - 1).reindex(ga0[ga0 > 1e6].index).dropna().sort_values(ascending=False)
K.update(n1=n1.to_dict(), grow_rank=list(gg.index).index("Balanz") + 1 if "Balanz" in gg.index else None, grow_n=len(gg))

EXMM = lambda df: df[~df.c3.str.startswith("Money")]
fig, axs = plt.subplots(1, 2, figsize=(14, 5.4))
for ax, (tt, f0, key) in zip(axs, ((f"Ene–{MES_ES[MN]} {Y}", D, "y"), (f"Últimos 3 meses ({MES_ES[int(P(2)[5:])]}–{MES_ES[MN]})", JL, "3"))):
    gf = EXMM(A[(A.Fecha > f0) & (A.Fecha <= O)]).groupby("Gerente").Susc_Netas.sum().sort_values(ascending=False) / 1e6
    t6 = gf.head(6) if "Balanz" in gf.head(6).index else pd.concat([gf.head(5), gf[["Balanz"]]])
    t6 = t6[::-1]; ps = [list(gf.index).index(g) + 1 for g in t6.index]
    hbars(ax, t6, [NAVY if g == "Balanz" else SOFT for g in t6.index], lambda x, k: f"$ {ar(x, 2)} bn", xpad=.02, fs=16, bold=lambda k: k == "Balanz")
    ax.set_yticks(range(len(t6))); ax.set_yticklabels([f"{p}. {g}" for p, g in zip(ps, t6.index)], fontsize=16.5)
    for t_ in ax.get_yticklabels():
        if "Balanz" in t_.get_text(): t_.set_fontweight("bold")
    ax.set_xlim(min(0, t6.min()), t6.max() * 1.45); ax.set_title(tt, fontsize=18, color=INK, loc="left", fontweight="bold", pad=12)
    K["exmm_" + key] = (list(gf.index).index("Balanz") + 1, gf["Balanz"] * 1e6, gf.index[0], gf.iloc[0] * 1e6, gf.iloc[1] * 1e6 if len(gf) > 1 else np.nan)
fig.tight_layout(w_pad=4); sv(fig, "n_exmm.png")
a0, a1, b0 = EXMM(A[A.Fecha == JL]), EXMM(o), EXMM(d)
K.update(exmm_g3=(T(BZ(a1)) / T(BZ(a0)) - 1, T(a1) / T(a0) - 1), exmm_gy=(T(BZ(a1)) / T(BZ(b0)) - 1, T(a1) / T(b0) - 1),
         tot_g3=(T(BZ(o)) / T(BZ(A[A.Fecha == JL])) - 1, T(o) / T(A[A.Fecha == JL]) - 1))

cs_all = ["Renta Fija USD", "T+1", "Renta Fija ARS", "Money Market USD", "Renta Mixta", "Renta Variable", "Money Market ARS"]
shf = lambda f, cc_: BZ(A[(A.Fecha == f) & (A.c3 == cc_)]).AUM_Final.sum() / A[(A.Fecha == f) & (A.c3 == cc_)].AUM_Final.sum()
rk = {cc_: int(o[o.c3 == cc_].groupby("Gerente").AUM_Final.sum().rank(ascending=False).get("Balanz", 99)) for cc_ in cs_all}
cs = sorted(cs_all, key=lambda x: (rk[x], -shf(O, x)))[:3]
sh = pd.DataFrame({lb: {cc_: shf(f, cc_) for cc_ in cs} for f, lb in ((D, lab(DIC)), (JL, lab(M3)), (O, MESC))})
fig, ax = plt.subplots(figsize=(11, 5.4)); xx = np.arange(3); w = .26
for i, (lb, cl) in enumerate(zip(sh.columns, [SOFT, "#93c9ef", NAVY])):
    ax.bar(xx + (i - 1) * w, sh[lb] * 100, w * .92, color=cl, label=lb)
    for j, x in enumerate(sh[lb]): ax.text(j + (i - 1) * w, x * 100 + sh.values.max() * 2, f"{ar(x * 100, 1)}%", ha="center", fontsize=13.5, color=INK, fontweight="bold" if lb == MESC else "normal")
ax.set_xticks(xx); ax.set_xticklabels([f"{cc_}\n#{rk[cc_]} del mercado" for cc_ in cs], fontsize=14.5); clean(ax)
ax.legend(frameon=False, fontsize=13, ncol=3, loc="upper right"); ax.set_ylim(0, sh.values.max() * 128); sv(fig, "n_share_cat.png")
K.update(cat=[(cc_, rk[cc_], sh.loc[cc_, lab(DIC)], sh.loc[cc_, lab(M3)], sh.loc[cc_, MESC]) for cc_ in cs])

# ================================================================== TEXTOS
k = K; MC = MES_ES[MN]
SRC_IND = f"Fuente: CAFCI / CNV, cierre {pd.Timestamp(O).strftime('%d-%m-%Y')}. AUM en $ (bn = billones)."
SRC_INT = f"Fuente: Power BI interno (DS Fondos y Reporte de Comisiones por Fondos), {MESC}. USD MEP."
S, NOTES = {}, {}


def stat(n, l): return f'<div class="stat"><p class="num">{esc(n)}</p><p class="lbl">{esc(l)}</p></div>'


def chart_slide(id_, kicker, title, img, alt, stats, source, note=""):
    S[id_] = (f'<section id="{id_}" class="content">\n<p class="kicker">{esc(kicker)}</p>\n<h2>{esc(title)}</h2>\n<div class="body">\n'
              f'<img class="chart" src="ASSET:{img}" alt="{esc(alt)}">\n<div class="side">\n' + "\n".join(stat(a, b) for a, b in stats) +
              f'\n</div>\n</div>\n<p class="source">{esc(source)}</p>\nLOGO\n<aside>{esc(note)}</aside>\n</section>')


rk_txt = lambda n: f"{n}°"
yy_aum = K["aum_int"] / (pv.loc[M12_].sum() * 1e6) - 1 if M12_ in pv.index else np.nan
crece = lambda x: "creció" if x >= 0 else "cayó"

S["cover"] = f'''<section id="cover" class="cover">
<img class="cover-img" src="ASSET:bg_cover.jpg" alt="">
<img class="cover-logo" src="ASSET:logo_navy.png" alt="Balanz, N°1 en inversiones">
<p class="kicker">Balanz Asset Management · Comité Ejecutivo</p>
<h1>Informe de Gestión FCI</h1>
<p class="sub">Resultados de {MESL}</p>
<div class="cover-kpis">
<div><p class="cnum">#{k["ytd_rank_sgi"]}</p><p class="clbl">SGI en flujo neto {Y}</p></div>
<div><p class="cnum">{usdm(k["aum_int"])}</p><p class="clbl">AUM total, {pct(yy_aum, 0, True)} y/y</p></div>
<div><p class="cnum">USD {ar(k["fact"] / 1e6, 1)}M</p><p class="clbl">facturación mensual, {pct(k["fact_yy"], 0, True)} y/y</p></div>
</div>
<aside>Versión ejecutiva del informe mensual, generada automáticamente con datos CAFCI/CNV y Power BI interno.</aside>
</section>'''

kd = lambda x: "pos" if x > 0 else ""
S["resumen"] = f'''<section id="resumen" class="content">
<p class="kicker">Resumen del mes</p>
<h2>{MES_L[MN].capitalize()} en seis números</h2>
<div class="kpis">
<div class="kpi"><p class="klbl">AUM Balanz (CAFCI)</p><p class="knum">{bn(k["bz_aum"])}</p><p class="kdelta {kd(k["bz_var"])}">{pct(k["bz_var"], 1, True)} m/m</p></div>
<div class="kpi"><p class="klbl">Market share</p><p class="knum">{ar(k["ms"] * 100, 1)}%</p><p class="kdelta">{ar(k["mi"] * 100, 1)}% entre independientes</p></div>
<div class="kpi"><p class="klbl">Ranking por AUM</p><p class="knum">#{k["rank"]} · #{k["rank_sgi"]}</p><p class="kdelta">de {k["n_sg"]} SG · de {k["n_sgi"]} SGI</p></div>
<div class="kpi"><p class="klbl">Flujo neto {Y}</p><p class="knum">{bn(k["bz_ytd"])}</p><p class="kdelta {kd(k["bz_ytd"])}">{pct(k["bz_ytd_pct"], 0, True)} sobre AUM inicial · #{k["ytd_rank_sgi"]} SGI</p></div>
<div class="kpi"><p class="klbl">AUM negocio propio</p><p class="knum">{usdm(k["aum_int"])}</p><p class="kdelta {kd(k["aum_int_mm"])}">{pct(k["aum_int_mm"], 1, True)} m/m · {pct(yy_aum, 0, True)} y/y</p></div>
<div class="kpi"><p class="klbl">Facturación del mes</p><p class="knum">USD {ar(k["fact"] / 1e6, 2)}M</p><p class="kdelta {kd(k["fact_mm"])}">{pct(k["fact_mm"], 1, True)} m/m · {pct(k["fact_yy"], 0, True)} y/y</p></div>
</div>
<p class="source">Fuente: CAFCI / CNV y Power BI interno, {MESL}.</p>
LOGO
<aside>Flujo neto de Balanz en el mes: {mill(k["bz_flujo"])}.</aside>
</section>'''

chart_slide("ind-aum", "Industria", f"La industria {'crece' if k['aum_ind_var'] >= 0 else 'retrocede'}: {pct(k['aum_ind_var'], 1, True)} en {MES_L[MN]}", "ind_aum.png",
            "AUM de la industria en billones de pesos, últimos 13 meses",
            [(bn(k["aum_ind"], 1), f"AUM industria al {pd.Timestamp(O).strftime('%d/%m')}"), (pct(k["aum_12m"], 1, True), "en 12 meses"),
             (f"USD {ar(k['aum_usd'] / 1e3, 1)} bn", f"{pct(k['aum_usd_var'], 1, True)} m/m en dólares"),
             (f"{pct(k['var_banc'], 1, True)} / {pct(k['var_indep'], 1, True)}", "bancarias / independientes en el mes")], SRC_IND)
tit_fl = (f"Los Money Market explicaron el {ar(k['flujo_mm_share'] * 100, 0)}% del flujo" if k["flujo_mm_share"] == k["flujo_mm_share"] and k["flujo_mm_share"] >= .5
          else f"{k['flujo_top'][0]} lideró el flujo de la industria")
chart_slide("ind-flujo", "Industria", tit_fl, "ind_flujo.png", f"Flujo neto de la industria por categoría en {MESL}, miles de millones de pesos",
            [(("+" if k["flujo_ind"] > 0 else "") + bn(k["flujo_ind"]), f"flujo neto del mes (mes anterior: {bn(k['flujo_ind_prev'])})"),
             (bn(k["flujo_banc"]), f"a bancarias · {bn(k['flujo_indep'])} a independientes"),
             (("+" if k["flujo_ytd"] > 0 else "") + bn(k["flujo_ytd"]), f"flujo {Y}: {pct(k['flujo_ytd_pct'], 1)} del AUM inicial")],
            f"Fuente: CAFCI / CNV, {MESC}. Flujo en miles de millones de $.")
chart_slide("ranking", "Posicionamiento", f"Balanz, {rk_txt(k['rank'])} administradora del país por AUM", "rank.png", f"Top sociedades gerentes por AUM a {MESL}",
            [(f"#{k['rank']} de {k['n_sg']}", "sociedades gerentes"), (f"#{k['rank_sgi']} de {k['n_sgi']}", f"independientes" + (f" (1° {k['sgi1']})" if k["rank_sgi"] > 1 else "")),
             (f"#{k['rank_exmm_sgi']}", f"independientes ex Money Market ({ar(k['share_exmm_sgi'] * 100, 1)}% share)")],
            SRC_IND, f"Ex Money Market: #{k['rank_exmm']} en el total (1° {k['exmm1']}).")
tit_y = (f"#1 independiente en captación de flujo en {Y}" if k["ytd_rank_sgi"] == 1 else f"#{k['ytd_rank_sgi']} entre independientes en captación de flujo en {Y}")
chart_slide("flujo-ytd", "Posicionamiento", tit_y, "flujo_ytd.png", f"Flujo neto {Y} de las administradoras con mayor captación",
            [(bn(k["bz_ytd"]), f"flujo neto ene–{MC}"),
             (pct(k["bz_ytd_pct"], 0, True), f"sobre el AUM de inicio de año (industria {pct(k['flujo_ytd_pct'], 0, True)})"),
             (f"{ar(k['bz_ytd_share'] * 100, 1)}%", f"del flujo total de la industria · #{k['ytd_rank']} del mercado")],
            f"Fuente: CAFCI / CNV, ene–{MC} {Y}. Azul oscuro: Balanz · celeste: otras independientes · gris: bancarias.")
t3s = k["fondos_top3_share"]
chart_slide("fondos-flujo", "Posicionamiento",
            f"Tres fondos explican el {ar(t3s * 100, 0)}% del flujo de Balanz en {Y}" if t3s == t3s and 0 < t3s <= 1 else f"Los fondos Balanz con más captación en {Y}",
            "fondos_flujo.png", f"Flujo neto {Y} de los 8 fondos Balanz con mayor captación, millones de $",
            [(mill(k["fondos_top1"][1]), f"{k['fondos_top1'][0]}, el fondo que más captó"),
             (f"{ar(t3s * 100, 0)}%" if t3s == t3s else "n/d", "del flujo lo aportan " + ", ".join(k["fondos_top3"][:2]) + " y " + k["fondos_top3"][2]),
             (f"{k['fondos_pos']} de {k['fondos_n']}", "fondos con flujo positivo en el año")],
            f"Fuente: CAFCI / CNV, suscripciones netas ene–{MC} {Y}. Millones de $.", f"Mayores rescates: {k['fondos_peor'][0]} ({mill(k['fondos_peor'][1])}).")
dms = k["ms"] - k["ms_ini"]
chart_slide("share", "Posicionamiento", f"Market share: {pp(dms)} en el último año", "ms.png", "Participación de Balanz en el AUM total y entre independientes, 13 meses",
            [(f"{ar(k['ms'] * 100, 1)}%", f"share total ({lab(M12_)}: {ar(k['ms_ini'] * 100, 1)}%)"),
             (f"{ar(k['mi'] * 100, 1)}%", f"share entre independientes ({lab(M12_)}: {ar(k['mi_ini'] * 100, 1)}%)"),
             (("+" if k["ms_mm"] > 0 else "−") + f"{ar(abs(k['ms_mm']) * 1e4, 0)} pb", "en el mes")], SRC_IND)
S["mix"] = f'''<section id="mix" class="content">
<p class="kicker">Posicionamiento</p>
<h2>{"Una cartera más dolarizada que la industria" if k["usd_bz"] > k["usd_ind"] else "Composición de la cartera vs. la industria"}</h2>
<div class="mixrow">
<div class="big"><p class="hnum">{ar(k["usd_bz"] * 100, 1)}%</p><p class="lbl">del AUM de Balanz está en fondos en USD, contra {ar(k["usd_ind"] * 100, 1)}% en la industria</p></div>
<div class="big"><p class="hnum">{ar(k["mix_bz_top"][1] * 100, 0)}%</p><p class="lbl">en {esc(k["mix_bz_top"][0])}, la categoría de mayor peso en Balanz</p></div>
</div>
<img class="mixchart" src="ASSET:mix.png" alt="Composición del AUM por categoría: industria vs Balanz">
<p class="source">{SRC_IND}</p>
LOGO
<aside>La industria concentra {ar(k["mix_ind_top"][1] * 100, 0)}% en {esc(k["mix_ind_top"][0])}.</aside>
</section>'''
stmt = ("El negocio de fondos de Balanz duplicó su tamaño en un año" if yy_aum >= 1 else
        f"El negocio de fondos de Balanz {crece(yy_aum)} {pct(abs(yy_aum), 0)} en un año")
S["statement"] = f'''<section id="statement" class="statement">
<p class="kicker">Negocio propio</p>
<h2 class="stmt">{esc(stmt)}</h2>
<div class="cover-kpis">
<div><p class="cnum">{usdm(k["aum_int"])}</p><p class="clbl">AUM total a {MES_L[MN]}</p></div>
<div><p class="cnum">{pct(yy_aum, 0, True)}</p><p class="clbl">AUM interanual</p></div>
<div><p class="cnum">{pct(k["fact_ytd_yy"], 0, True)}</p><p class="clbl">facturación ene–{MC} vs {Y - 1}</p></div>
</div>
LOGO
<aside></aside>
</section>'''
chart_slide("aum-int", "Negocio propio",
            ("AUM en máximos: " if k["aum_int_max"] else "") + f"{usdm(k['aum_int'])}, {pct(k['aum_int_mm'], 1, True)} en el mes", "aum_int.png",
            "AUM total del negocio propio en millones de USD, 12 meses",
            [(usdm(k["aum_int"]), f"AUM total ({pct(k['aum_int_mm'], 1, True)} m/m)"), (usdm(k["aum_exmeli"]), "AUM ex MELI"),
             (("+" if k["flujo_exmeli_ytd"] > 0 else "") + usdm(k["flujo_exmeli_ytd"]), f"flujo ex MELI {Y} ({MC}: {usdm(k['flujo_exmeli'])})")], SRC_INT)
chart_slide("facturacion", "Negocio propio", ("Facturación récord: " if k["fact_record"] else "Facturación: ") + f"USD {ar(k['fact'] / 1e6, 1)}M en {MES_L[MN]}", "fact.png",
            f"Facturación mensual en millones de USD, {Y - 1} vs {Y}",
            [(f"USD {ar(k['fact'] / 1e6, 2)}M", f"facturación de {MES_L[MN]}"), (pct(k["fact_yy"], 0, True), f"vs {MES_L[MN]} {Y - 1}"),
             (f"USD {ar(k['fact_ytd'] / 1e6, 1)}M", f"acumulado ene–{MC} ({pct(k['fact_ytd_yy'], 0, True)} vs {Y - 1})")], SRC_INT)
chart_slide("fact-areas", "Negocio propio", f"{k['fact_top2'][0]} y {k['fact_top2'][1]} lideran el crecimiento de la facturación", "fact_contrib.png",
            "Variación interanual de la facturación por unidad, miles de USD",
            [(("+" if k["fact_dyy"] > 0 else "") + usdm(k["fact_dyy"], 1), f"facturación {MESC} vs {lab(M12_)}"),
             (f"{ar(k['fact_top2_share'] * 100, 0)}%" if k["fact_top2_share"] == k["fact_top2_share"] else "n/d", f"del cambio lo explican {k['fact_top2'][0]} y {k['fact_top2'][1]}"),
             ("+USD " + ar(k["fact_top1"][1] / 1e3, 0) + "k", f"{k['fact_top1'][0]}, el mayor aporte")], SRC_INT + f" Miles de USD, {MESC} vs {lab(M12_)}.")
chart_slide("areas-hist", "Negocio propio", f"De USD {ar(k['area_hist'][1], 0)}M a USD {ar(k['area_hist'][2], 0)}M desde {k['area_hist'][0]}", "area_hist.png",
            "AUM por área, cierres anuales y mes actual, millones de USD",
            [(f"{ar(k['area_hist'][2] / k['area_hist'][1], 1)}x", f"el AUM desde {k['area_hist'][0]}"),
             (f"{k['area_top2'][0]} y {k['area_top2'][1]}", f"las dos áreas más grandes: {ar(k['area_top2_share'] * 100, 0)}% del AUM")],
            f"Fuente: historia nov-19 a sep-26 del informe mensual; desde nov-25 Power BI interno. Millones de USD MEP.")
tit_ar = (f"Las {k['area_n']} áreas principales crecen más de {ar(np.floor(k['area_yy_min'] * 100), 0)}% y/y" if k["area_up"] == k["area_n"] and k["area_yy_min"] > 0
          else f"{k['area_up']} de las {k['area_n']} áreas principales crecen en el año")
chart_slide("areas-oct", "Negocio propio", tit_ar, "area_oct.png", f"AUM por área a {MESL} en millones de USD con variación interanual",
            [(usdm(k["area1"][1] * 1e6), f"{k['area1'][0]}, el área más grande ({ar(k['area1'][2] * 100, 0)}%)")] +
            ([(pct(k["area_fast"][1], 0, True), f"{k['area_fast'][0]}, el mayor crecimiento y/y")] if k["area_fast"] else []), SRC_INT)
gpf = k["pf"][1] / k["pf"][0] - 1
chart_slide("inversores", "Negocio propio", f"La base de cuotapartistas {crece(gpf)} {pct(abs(gpf), 0)} en el año", "inversores.png",
            "Posiciones de cuotapartistas personas humanas por mes, en miles",
            [(f"{ar(k['pf'][1] / 1e3, 0)}k", f"posiciones de personas humanas ({k['pf'][2]}: {ar(k['pf'][0] / 1e3, 0)}k)"), (pct(gpf, 0, True), "en el año"),
             (pct(k["pj"][1] / k["pj"][0] - 1, 0, True), f"posiciones de personas jurídicas ({ar(k['pj'][1], 0)})")],
            SRC_INT + " Posiciones = cuotapartistas sumados por fondo.", f"Últimos 3 meses: {pct(k['pf_3m'], 1, True)}.")
chart_slide("clientes", "Negocio propio", f"Base diversificada: el top 10 explica {ar(k['top10_share'] * 100, 0)}% de la facturación", "clientes.png",
            f"Top 10 clientes por facturación en {MESL}, miles de USD",
            [(f"{ar(k['top10_share'] * 100, 1)}%", "facturación del top 10 de clientes"),
             (usdm(k["acdi"] * 1e6 if k["acdi"] < 1e5 else k["acdi"], 1), f"AUM de ACDIs ({ar(k['acdi_share'] * 100, 1)}% del total, {pct(k['acdi_mm'], 1, True)} m/m)")],
            SRC_INT, f"Mayor movimiento en ACDIs: {k['acdi_mov'][0]} ({'+' if k['acdi_mov'][1] > 0 else '−'}USD {ar(abs(k['acdi_mov'][1]) / 1e6, 1)}M)." if k["acdi_mov"] else "")
hzl = "en el año" if hz == "YTD" else "a 12 meses"
chart_slide("rendimientos", "Producto", f"{k['rend_beat']} de {k['rend_n']} fondos superan a su peer group {hzl}", "rend.png",
            f"Diferencia de rendimiento {hz} contra el promedio ponderado del peer group, en puntos porcentuales",
            [(f"{k['rend_beat']} / {k['rend_n']}", f"fondos con rendimiento {hz} superior a sus pares"),
             (pp(k["rend_best"][1]), f"{k['rend_best'][0]}, el mejor diferencial"), (pp(k["rend_worst"][1]), f"{k['rend_worst'][0]}, el más rezagado entre los grandes")],
            f"Fuente: CAFCI, rendimientos al {pd.Timestamp(r.fecha.max()).strftime('%d-%m-%Y')}; peer group = subcategoría 1816 ponderada por AUM. 14 mayores fondos por AUM.")
S["pendientes"] = '''<section id="pendientes" class="content">
<p class="kicker">Para completar</p>
<h2>Datos pendientes para la versión final</h2>
<div class="cards">
<div class="card"><h3>Colocaciones primarias</h3><p>Detalle de licitaciones del mes y monto colocado por Balanz por emisión (Banca de Inversión).</p></div>
<div class="card"><h3>Inversores de la industria</h3><p>Distribución por tipo de inversor de CAFCI/CNV, para comparar con la de Balanz.</p></div>
<div class="card"><h3>Fondos de terceros</h3><p>Volumen de fondos de terceros distribuidos (visual Bolsa).</p></div>
</div>
<p class="source">Estas secciones no tienen fuente automática todavía.</p>
LOGO
<aside></aside>
</section>'''
msg1 = (f"#{k['ytd_rank_sgi']} entre independientes en captación {Y} y {rk_txt(k['rank'])} del mercado por AUM.")
msg2 = f"Negocio propio en {usdm(k['aum_int'])} y facturación de USD {ar(k['fact'] / 1e6, 1)}M ({pct(k['fact_yy'], 0, True)} y/y)."
msg3 = (f"Market share de {ar(k['ms'] * 100, 1)}% ({pp(dms)} en 12 meses) y {k['rend_beat']} de {k['rend_n']} fondos por encima de sus pares.")
S["cierre"] = f'''<section id="cierre" class="closing">
<p class="kicker">Mensajes clave</p>
<h2 class="stmt">{esc(f"{MES_L[MN].capitalize()} en tres mensajes")}</h2>
<ol class="msgs">
<li>{esc(msg1)}</li>
<li>{esc(msg2)}</li>
<li>{esc(msg3)}</li>
</ol>
LOGO
<aside></aside>
</section>'''

# adicionales
gb, gi_ = k["n1"]["Crecimiento del AUM"]["Balanz"], k["n1"]["Crecimiento del AUM"]["Industria"]
fb, fi = k["n1"]["Flujo neto / AUM inicial"]["Balanz"], k["n1"]["Flujo neto / AUM inicial"]["Industria"]
tit = (f"Balanz duplicó su AUM en {Y}: creció el doble que la industria" if gb >= 1 and gb >= 2 * gi_ else
       f"Balanz creció {pct(gb, 0)} en {Y}, " + ("por encima" if gb > gi_ else "por debajo") + f" de la industria ({pct(gi_, 0)})")
chart_slide("crec-ytd", f"Adicional · Balanz vs. industria {Y}", tit, "n_ytd.png", f"Crecimiento del AUM y flujo neto sobre AUM inicial, ene–{MC} {Y}",
            [(pct(gb, 0, True), f"AUM de Balanz ene–{MC} (industria {pct(gi_, 0, True)})"),
             (f"#{k['grow_rank']}" if k["grow_rank"] else "n/d", f"en crecimiento entre las {k['grow_n']} administradoras con más de $1 bn"),
             (pct(fb, 0, True), f"flujo neto sobre AUM inicial (industria {pct(fi, 0, True)})")], f"Fuente: CAFCI / CNV, {pd.Timestamp(D).strftime('%d-%m-%Y')} a {pd.Timestamp(O).strftime('%d-%m-%Y')}. AUM en pesos.")
ey, e3 = k["exmm_y"], k["exmm_3"]
gap = f", a {mill(e3[3] - e3[1])} de {e3[2]}" if e3[0] == 2 else ""
chart_slide("exmm", "Adicional · Balanz vs. industria, 3 meses",
            ("Fuera de Money Market, Balanz lidera la captación del año y del trimestre" if ey[0] <= 2 and e3[0] <= 2 else "Flujo ex Money Market: Balanz vs. el mercado"),
            "n_exmm.png", "Flujo neto ex Money Market, top 6 administradoras: año y últimos 3 meses",
            [(f"#{ey[0]}", f"flujo ex MM ene–{MC}: {bn(ey[1])}"), (f"#{e3[0]}", f"flujo ex MM últimos 3 meses: {bn(e3[1])}{gap}"),
             (pct(k["exmm_g3"][0], 1, True), f"AUM ex MM en 3 meses (industria {pct(k['exmm_g3'][1], 1, True)})")],
            "Fuente: CAFCI / CNV. Ex Money Market = todas las categorías salvo MM ARS y MM USD.",
            f"AUM total en 3 meses: Balanz {pct(k['tot_g3'][0], 1, True)} vs industria {pct(k['tot_g3'][1], 1, True)}.")
c0 = k["cat"][0]
chart_slide("share-cat", "Adicional · Balanz vs. industria por categoría", f"#{c0[1]} del mercado en {c0[0]}, con {ar(c0[4] * 100, 1)}% de share", "n_share_cat.png",
            f"Market share de Balanz por categoría a {lab(DIC)}, {lab(M3)} y {MESC}",
            [(pp(c0[4] - c0[2]), f"share en {c0[0]} en el año ({ar(c0[2] * 100, 1)}% → {ar(c0[4] * 100, 1)}%)"),
             (pp(c0[4] - c0[3]), f"en {c0[0]} en los últimos 3 meses")] +
            [(f"#{x[1]} · {ar(x[4] * 100, 1)}%", f"en {x[0]} ({pp(x[4] - x[2])} en el año)") for x in k["cat"][1:2]], SRC_IND)
chart_slide("peer-aum", "Adicional · Producto", f"{ar(bw['YTD'] * 100, 0)}% del AUM está en fondos que le ganan a su peer group en el año", "peer_aum.png",
            "Porcentaje del AUM de Balanz en fondos con rendimiento superior al promedio ponderado de su peer group, por plazo",
            [(f"{ar(bw['YTD'] * 100, 0)}%", "del AUM supera a sus pares en el año"), (f"{ar(bw['12m'] * 100, 0)}%", "del AUM supera a sus pares a 12 meses"),
             (f"{ar(bw['30d'] * 100, 0)}%", "en los últimos 30 días")],
            "Fuente: CAFCI; peer group = subcategoría 1816 ponderada por AUM. Ponderado por patrimonio de cada fondo.")
if k["din"]:
    da = k["din_aum"]
    chart_slide("dinamica", "Adicional · Dinámica interna, 3 meses", f"{k['din'][0]} y {k['din'][1]}, los motores del trimestre", "areas3m.png",
                f"Crecimiento del AUM por área entre {lab(M3)} y {MESC}",
                [(pct(k["din_g"][0], 0, True), f"AUM de {k['din'][0]} en 3 meses: USD {ar(da[0], 0)}M → {ar(da[1], 0)}M"),
                 (pct(k["din_g"][1], 0, True), f"AUM de {k['din'][1]} en 3 meses"),
                 (("+" if k["dq_top"][1] > 0 else "−") + f"USD {ar(abs(k['dq_top'][1]) / 1e3, 0)}k", f"facturación trimestral del fondo {k['dq_top'][0]} vs el trimestre anterior")],
                SRC_INT + " Áreas con más de USD 20M.",
                f"Facturación trimestral de {k['dq_bot'][0]}: {'+' if k['dq_bot'][1] > 0 else '−'}USD {ar(abs(k['dq_bot'][1]) / 1e3, 0)}k." +
                "".join(f" {a} {pct(b, 0, True)} en el trimestre." for a, b in k["din_neg"]))

order = ["cover", "resumen", "ind-aum", "ind-flujo", "ranking", "flujo-ytd", "fondos-flujo", "share", "mix", "statement", "aum-int", "facturacion", "fact-areas",
         "areas-hist", "areas-oct", "inversores", "clientes", "rendimientos", "pendientes", "cierre", "crec-ytd", "exmm", "share-cat", "peer-aum", "dinamica"]
order = [x for x in order if x in S]
deck = {"v": 5, "createdOnFiles": {"v": 1, "at": "2026-11-13T15:00:00Z"}, "lists": "css", "format": {"v": 1, "shared": ["project/deck.css"]},
        "title": f"Informe de Gestión FCI – Comité Ejecutivo ({MESC})", "order": order, "cover": "cover",
        "sections": {"s1": {"description": "Apertura y resumen del mes", "start": "cover"}, "s2": {"description": "La industria de FCI en el mes", "start": "ind-aum"},
                     "s3": {"description": "Posicionamiento de Balanz en el mercado", "start": "ranking"},
                     "s4": {"description": "Negocio propio: AUM, facturación y áreas", "start": "statement"},
                     "s5": {"description": "Producto, pendientes y cierre", "start": "rendimientos"},
                     "s6": {"description": "Slides adicionales: Balanz vs. industria y dinámica interna", "start": "crec-ytd"}},
        "faces": {"inter": {"family": "Inter", "href": "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"},
                  "source-serif-4": {"family": "Source Serif 4", "href": "https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400..800&display=swap"}},
        "designSystems": []}
LOGO = '<img class="logo" src="ASSET:logo_navy.png" alt="Balanz, N°1 en inversiones">'
for k_, v_ in S.items(): open(os.path.join(OUT, "project", "slides", f"{k_}.html"), "w").write(v_.replace("LOGO", LOGO))
json.dump(deck, open(os.path.join(OUT, "project", "deck.json"), "w"), ensure_ascii=False, indent=1)
open(os.path.join(OUT, "project", "deck.css"), "w").write(open(os.path.join(AQUI, "deck.css")).read())
# assets fijos de marca
for a in ("logo_navy.png", "bg_cover.jpg"):
    if os.path.exists(os.path.join(AQUI, "assets", a)):
        import shutil; shutil.copy(os.path.join(AQUI, "assets", a), os.path.join(PNG, a))


def js(x):
    if isinstance(x, (np.floating, float)): return None if np.isnan(x) else float(x)
    if isinstance(x, (np.integer,)): return int(x)
    if isinstance(x, dict): return {str(a): js(b) for a, b in x.items()}
    if isinstance(x, (list, tuple)): return [js(b) for b in x]
    if isinstance(x, (np.bool_,)): return bool(x)
    return x


res = {"mes": MES, "ok": True, "faltantes": [], "slides": order, "titulos": {k_: re.search(r"<h[12][^>]*>(.*?)</h[12]>", v_, re.S).group(1) for k_, v_ in S.items()},
       "cifras": js(K)}
json.dump(res, open(os.path.join(OUT, "resumen.json"), "w"), ensure_ascii=False, indent=1)
print(json.dumps({"mes": MES, "ok": True, "slides": len(order)}, ensure_ascii=False))
