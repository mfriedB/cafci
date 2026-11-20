"""Gráficos internos del Informe de Gestión (deck viejo): AUM por área (29, 54, 55), facturación mensual (32) y
% de facturación por fondo de cada área (50-53). Datos internos: nunca a GitHub.
Uso: python3 gen_internos.py HIST_AREA.csv INTERNOS.json CARPETA_FACT_FONDO_AREA [AAAA-MM]
"""
import sys, os, json, glob
import numpy as np, pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as mt
from matplotlib.patches import Rectangle
from matplotlib import font_manager as _fm
for _f in glob.glob(os.path.expanduser("~/.fonts/*.ttf")): _fm.fontManager.addfont(_f)

HIST, INT, FFA = sys.argv[1], sys.argv[2], sys.argv[3]
MES = sys.argv[4] if len(sys.argv) > 4 else "2026-09"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "charts"); os.makedirs(OUT, exist_ok=True)
DPI = 200
ME = {1: "ene", 2: "feb", 3: "mar", 4: "abr", 5: "may", 6: "jun", 7: "jul", 8: "ago", 9: "sep", 10: "oct", 11: "nov", 12: "dic"}


def ar(x, d=1):
    s = f"{x:,.{d}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def fig_px(w, h): return plt.figure(figsize=(w * 2 / DPI, h * 2 / DPI), dpi=DPI)


def save(f, n):
    f.savefig(os.path.join(OUT, n + ".png"), dpi=DPI, facecolor="white"); plt.close(f); print("ok", n)


H = pd.read_csv(HIST, index_col=0)
H = H[H.index <= MES]
fin_mes = lambda m: (pd.Period(m, "M").end_time).strftime("%d/%m/%Y")


# ------------------------------------------------------------------ s29: AUM por área (columnas apiladas, Excel)
def s29():
    W, H_ = 1536, 765
    plt.rcParams.update({"font.family": "Carlito"})
    cols = [c for c in H.columns if c != "Total"]
    PAL = ["#4f81bd", "#c0504d", "#9bbb59", "#8064a2", "#4bacc6", "#f79646", "#2c4d75", "#772c2a", "#5f7530", "#4d3b62", "#276a7c",
           "#b65708", "#729aca", "#cd7371", "#afc97a", "#9983b5", "#6fbdd1", "#f9ab6b", "#000000", "#ffff00", "#ff0000", "#00b050"]
    order = cols[::-1]                                  # Corporate abajo, como el original
    f = fig_px(W, H_); ax = f.add_axes([0.035, 0.13, 0.96, 0.85])
    xs = np.arange(len(H)); bot = np.zeros(len(H))
    for i, c in enumerate(order):
        v = H[c].fillna(0).values
        ax.bar(xs, v, 0.62, bottom=bot, color=PAL[i % len(PAL)], zorder=3); bot += v
    ax.set_xticks(xs); ax.set_xticklabels([fin_mes(m) for m in H.index], rotation=90, fontsize=8.0, color="#595959")
    ax.yaxis.set_major_locator(mt.MultipleLocator(100)); ax.yaxis.set_major_formatter(mt.FuncFormatter(lambda x, _: ar(x, 0)))
    ax.tick_params(axis="y", labelsize=8.5, colors="#595959", length=0); ax.tick_params(axis="x", length=0)
    ax.grid(axis="y", color="#e3e3e3", lw=0.4, zorder=0)
    for s_ in ax.spines.values(): s_.set_visible(False)
    ax.set_xlim(-0.6, len(xs) - 0.4); ax.set_ylim(0, np.ceil(bot.max() / 100) * 100 + 100)
    for i, c in enumerate(cols):                         # leyenda (Start arriba, Corporate abajo)
        k = order.index(c)
        y = 0.96 - i * 0.0345
        f.patches.append(Rectangle((0.075, y - 0.007), 0.008, 0.014, transform=f.transFigure, color=PAL[k % len(PAL)]))
        f.text(0.086, y, c, fontsize=10.8, va="center", color="#404040")
    save(f, "s29_4")


# ------------------------------------------------------------------ s32: facturación mensual (Excel, línea con etiquetas)
def s32():
    W, H_ = 942, 932
    plt.rcParams.update({"font.family": "Carlito"})
    s = pd.DataFrame(json.load(open(INT))["serie_facturacion"]); s["m"] = s.fecha.str[:7]
    s = s[s.m <= MES].set_index("m").facturacion
    f = fig_px(W, H_)
    f.patches.append(Rectangle((0.002, 0.002), 0.996, 0.996, transform=f.transFigure, fill=False, ec="#d9d9d9", lw=0.6))
    ax = f.add_axes([0.105, 0.075, 0.875, 0.885])
    xs = np.arange(len(s))
    ax.plot(xs, s.values, color="#4472c4", lw=0.9, zorder=3)
    for i, v in enumerate(s.values):
        up = i % 2 == 0
        ax.annotate(ar(v, 0), (i, v), xytext=(0, 5 if up else -9), textcoords="offset points", ha="center", fontsize=10.4,
                    color="#000", fontweight="bold")
    ax.set_ylim(100000, max(4700000, s.max() * 1.06)); ax.yaxis.set_major_locator(mt.MultipleLocator(200000))
    ax.yaxis.set_major_formatter(mt.FuncFormatter(lambda x, _: ar(x, 0)))
    ax.set_xticks(xs); ax.set_xticklabels([f"{ME[int(m[5:])]}-{m[2:4]}" for m in s.index], rotation=45, fontsize=8.3, color="#595959")
    ax.tick_params(axis="y", labelsize=10.4, colors="#595959", length=0); ax.tick_params(axis="x", length=0, pad=0.5)
    ax.grid(axis="y", color="#e3e3e3", lw=0.4, zorder=0)
    for s_ in ax.spines.values(): s_.set_visible(False)
    ax.spines["bottom"].set_visible(True); ax.spines["bottom"].set_color("#d9d9d9")
    ax.set_xlim(-1, len(xs))
    save(f, "s32_4")


# ------------------------------------------------------------------ s54 / s55: AUM por grupo de áreas (Excel, paneles)
GR54 = [("Corporate+IB", ["Corporate", "Banca de Inversión"]), ("PyME", ["PyME"]),
        ("IFA+Canales+Start", ["IFA", "Canales", "Start"]), ("Productores Exclusivos", ["Productores Exclusivos"])]
GR55 = [("WM+PW+Banca Privada", ["Wealth Management", "Private Wealth", "Banca Privada"]), ("Individuos+IR", ["Individuos", "IR"]),
        ("Institucionales + Sector Público", ["Institucionales", "Sector Público"]),
        ("Inst No Regulados", ["Institucionales No Regulados", "Institucionales No Regulados 2"]),
        ("Mesa Sales&Trading", ["Mesa Sales & Trading"])]


def panel(f, rect, title, s, fs=1.0):
    x, y, w, h = rect
    f.patches.append(Rectangle((x, y), w, h, transform=f.transFigure, fill=False, ec="#d9d9d9", lw=0.6))
    ax = f.add_axes([x + w * 0.11, y + h * 0.27, w * 0.84, h * 0.57])
    xs = np.arange(len(s)); ax.plot(xs, s.values, color="#4472c4", lw=1.0 * fs)
    ax.set_ylim(0, None); ax.yaxis.set_major_locator(mt.MaxNLocator(8, steps=[1, 2, 2.5, 5]))
    ax.yaxis.set_major_formatter(mt.FuncFormatter(lambda v, _: ar(v, 2)))
    t = list(range(0, len(s), 3))
    ax.set_xticks(t); ax.set_xticklabels([fin_mes(s.index[i]) for i in t], rotation=45, fontsize=7.3 * fs, color="#595959", ha="right")
    ax.tick_params(axis="y", labelsize=7.8 * fs, colors="#595959", length=0); ax.tick_params(axis="x", length=0, pad=0.5)
    ax.grid(axis="y", color="#e3e3e3", lw=0.4)
    for s_ in ax.spines.values(): s_.set_visible(False)
    ax.spines["bottom"].set_visible(True); ax.spines["bottom"].set_color("#d9d9d9")
    ax.set_xlim(-1, len(s))
    f.text(x + w / 2, y + h * 0.93, title, ha="center", va="center", fontsize=11.3 * fs, color="#595959")


def s54_55():
    d = H[H.index >= "2020-09"]
    ser = lambda cs: d[[c for c in cs if c in d]].sum(1)
    f = fig_px(1667, 756)
    for (t, cs), r in zip(GR54, [(0.005, 0.505, 0.485, 0.49), (0.51, 0.505, 0.485, 0.49), (0.005, 0.005, 0.485, 0.49), (0.51, 0.005, 0.485, 0.49)]):
        panel(f, r, t, ser(cs), 1.35)
    save(f, "s54_4")
    f = fig_px(1299, 938)
    rects = [(0.003, 0.68, 0.49, 0.315), (0.505, 0.68, 0.49, 0.315), (0.012, 0.345, 0.49, 0.315), (0.505, 0.345, 0.49, 0.315),
             (0.003, 0.005, 0.49, 0.315)]
    for (t, cs), r in zip(GR55, rects):
        panel(f, r, t, ser(cs), 0.95)
    save(f, "s55_5")


# ------------------------------------------------------------------ s50-53: % de facturación por fondo del área (estilo Power BI)
PBI_COL = ["#12239e", "#f2a68f", "#1aab40", "#e66c37", "#6b007b", "#e044a7", "#744ec2", "#d9b300", "#d64550", "#197278",
           "#1f6fc5", "#5f6b6d", "#a0a0a0", "#118dff", "#3049ad", "#c83d95", "#ffc000", "#7f7f7f"]


FCOL = {"Money Market": "#f4a582", "Ahorro Corto Plazo": "#13254a", "Corporativo": "#13254a", "Dolar Linked": "#2e86f2",
        "Inflation Linked": "#e3e3e3", "Dolar Corto Plazo": "#3b6fd1", "Lecaps": "#7a7a7a", "Crédito Privado": "#2457a6",
        "Latam": "#f25c54", "Pymes": "#1b998b", "Acciones": "#0b1225", "Renta Mixta": "#3a3a3a", "Opportunity": "#a08f8a",
        "Latam (Sin Arg)": "#f2c14e", "Latam Selection": "#5b8fb9", "Performance XIII": "#6b3e26", "Money Market USD": "#a37aa8",
        "Estrategia VI": "#3c5a14"}


def area(nombre, archivo, slide, W, H_):
    plt.rcParams.update({"font.family": "Selawik"})
    if archivo.endswith(".csv"):            # de la carga manual (cargas_a_archivos.py --fact-area): share ya en %
        x = pd.read_csv(archivo)
    else:                                   # exportación directa del Power BI (3 filas de filtros arriba)
        x = pd.read_excel(archivo, header=None, skiprows=3)
    x.columns = ["fecha", "fondo", "share"]; x = x.dropna(subset=["fondo"])
    x["m"] = pd.to_datetime(x.fecha, errors="coerce").dt.strftime("%Y-%m")
    x = x[(x.m <= MES) & x.m.notna()]
    p = x.pivot_table(index="m", columns="fondo", values="share", aggfunc="sum").fillna(0) * (100 if x.share.max() <= 1.5 else 1)
    p = p[p.iloc[-1].sort_values(ascending=False).index]
    f = fig_px(W, H_)
    f.patches.append(Rectangle((0.002, 0.002), 0.996, 0.996, transform=f.transFigure, fill=False, ec="#123c6b", lw=0.8))
    f.patches.append(Rectangle((0.002, 0.935), 0.996, 0.063, transform=f.transFigure, color="#123c6b"))
    f.text(0.5, 0.966, "Evolutivo Mensual % Facturación x Fondo del Área", ha="center", va="center", color="white", fontsize=15, fontweight="bold")
    ax = f.add_axes([0.075, 0.08, 0.7, 0.82])
    xs = np.arange(len(p)); top = list(p.columns[:3])
    for i, c in enumerate(p.columns):
        col = FCOL.get(c, PBI_COL[(i + 7) % len(PBI_COL)])
        ax.plot(xs, p[c].values, color=col, lw=2.4 if i < 3 else 1.5, marker="o", ms=2.6, zorder=3)
        if i < 12:
            for j, v in enumerate(p[c].values):
                ax.annotate(ar(v, 0) + " %", (j, v), xytext=(0, 3), textcoords="offset points", ha="center", fontsize=10.6, color="#444", fontweight="bold")
        ax.text(xs[-1] + 0.25, p[c].values[-1] if i < 3 else None or p[c].values[-1], c, fontsize=11.8, va="center",
                color=col if c == "Money Market" else "#252423") if i < 3 else None
    # nombres de las series menores, apilados a la derecha
    rest = list(p.columns[3:3 + 14])
    ylo, yhi = 0.4, p[rest].values.max() * 1.08 if rest else 1
    for k, c in enumerate(rest):
        ax.text(xs[-1] + 0.25, yhi - k * (yhi - ylo) / max(len(rest), 1), c, fontsize=11.2, va="center",
                color=FCOL.get(c, PBI_COL[(p.columns.get_loc(c) + 7) % len(PBI_COL)]))
    hi = np.ceil(p.values.max() / 5) * 5
    ax.set_ylim(0, hi); ax.yaxis.set_major_locator(mt.MultipleLocator(5))
    ax.yaxis.set_major_formatter(mt.FuncFormatter(lambda v, _: f"{v:.0f} %"))
    ax.set_xticks(xs[::2]); ax.set_xticklabels([f"{ME[int(m[5:])]} {m[:4]}" for m in p.index[::2]], fontsize=12.2, color="#605e5c")
    ax.tick_params(axis="y", labelsize=12.8, colors="#605e5c", length=0); ax.tick_params(axis="x", length=0)
    ax.grid(axis="y", color="#e1dfdd", lw=0.4, ls=(0, (1, 2)))
    for s_ in ax.spines.values(): s_.set_visible(False)
    ax.set_xlim(-0.4, len(xs) - 0.6)
    save(f, slide)


if __name__ == "__main__":
    s29(); s32(); s54_55()
    for nom, sl, w, h in (("IFA", "s50_4", 1416, 862), ("Individuos", "s51_3", 1398, 849), ("Corporate", "s52_4", 1330, 807),
                          ("Institucionales", "s53_4", 1374, 843)):
        fs = glob.glob(os.path.join(FFA, f"fact_fondo_area_{nom}.csv")) or glob.glob(os.path.join(FFA, f"fact_fondo_area_{nom}.xlsx"))
        if fs: area(nom, fs[0], sl, w, h)
