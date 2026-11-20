"""Gráficos del Informe de Gestión (deck viejo) que en el original venían de Excel / 1816, rehechos con datos CAFCI/CNV.
Uso: python3 gen_excel.py [CSV_INDUSTRIA] [FECHA_CIERRE]
Cada gráfico se dibuja al tamaño exacto en que va en la slide (px de un lienzo de 1920x1080) x2 para nitidez.
"""
import sys, os
import numpy as np, pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as mt
from matplotlib.patches import FancyBboxPatch

CSV = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/igcut/procesado/informe/industria_ars.csv"
O = sys.argv[2] if len(sys.argv) > 2 else "2026-09-30"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "charts")
os.makedirs(OUT, exist_ok=True)
DPI = 200
MES = {1: "ene", 2: "feb", 3: "mar", 4: "abr", 5: "may", 6: "jun", 7: "jul", 8: "ago", 9: "sept", 10: "oct", 11: "nov", 12: "dic"}

A = pd.read_csv(CSV)
A = A[A.Categoria.notna() & (A.Fecha <= O)].copy()
A["mes"] = A.Fecha.str[:7]
FIN = A.groupby("mes").Fecha.max()                     # último dato de cada mes
A = A[A.Fecha.isin(FIN.values)]
ms_ = sorted(A.mes.unique())
M12 = ms_[-12:]                                        # oct-25 .. sep-26
o = A[A.Fecha == O]


def ar(x, d=1):
    s = f"{x:,.{d}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def fig_px(w, h):
    f = plt.figure(figsize=(w * 2 / DPI, h * 2 / DPI), dpi=DPI)
    return f


def save(f, n):
    f.savefig(os.path.join(OUT, n + ".png"), dpi=DPI, facecolor="white")
    plt.close(f)
    print("ok", n)


# ------------------------------------------------------------------ grupos estilo 1816
GRUPO_N = {"Consultatio": "One618"}


def g1816(s):
    s = str(s)
    if s == "MM ARS Clásico": return "MM ARS Clásico"
    if s == "MM ARS Dinámico": return "MM ARS Dinámico"
    if s == "MM USD Clásico": return "MM USD Clásico"
    if s == "T+1": return "T+1"
    if s in ("ASG", "INFRA", "PYME"): return "Destino esp."
    if s in ("RF ARS CER", "RF ARS Disc", "RF ARS Lecap"): return "RF ARS"
    if s == "RF USD Linked": return "RF USD linked"
    if s.startswith("RF USD"): return "RF USD"
    if s.startswith("RF MULT"): return "RF MULT"
    if s.startswith("RM"): return "RM y Otros"
    if s.startswith("RV"): return "RV"
    return "Otros"


A["g"] = A.Subcategoria.map(g1816)
TRANS = ["MM ARS Clásico", "MM ARS Dinámico", "MM USD Clásico", "T+1"]
NOTR = ["Destino esp.", "RF ARS", "RF USD", "RM y Otros", "Otros", "RF MULT", "RF USD linked", "RV"]


# ------------------------------------------------------------------ s06: perfil de productos (4 paneles, estilo 1816)
def s06():
    W, H = 1246, 798
    plt.rcParams.update({"font.family": "DejaVu Sans"})
    f = fig_px(W, H)
    p = A[A.mes.isin(M12)].pivot_table(index="mes", columns="g", values="AUM_Final", aggfunc="sum").reindex(M12).fillna(0)
    for c in TRANS + NOTR:
        if c not in p: p[c] = 0.0
    tot = p.sum(1); tr = p[TRANS].sum(1); ntr = tot - tr
    labs = [f"{MES[int(m[5:])]}-{m[2:4]}" for m in M12]
    COL = {"Transaccionales": "#76777a", "Otros FCI": "#3c4a8c", "MM ARS Clásico": "#4a72a6", "MM ARS Dinámico": "#f0922b",
           "MM USD Clásico": "#e2454d", "T+1": "#5e95c6", "Destino esp.": "#f0922b", "RF ARS": "#4a72a6", "RF USD": "#2d8a3e",
           "RM y Otros": "#49a3c0", "Otros": "#555a60", "RF MULT": "#c8b4dc", "RF USD linked": "#7dc66b", "RV": "#d6283c"}
    panels = [
        ("Perfil de productos", " (sobre total de industria)", {"Transaccionales": tr / tot, "Otros FCI": ntr / tot}, "all"),
        ("Perfil de productos excl. transaccionales", " (sobre total de industria)", {c: p[c] / tot for c in NOTR}, "ends"),
        ("Perfil de productos", " (sobre total de FCI transaccionales)", {c: p[c] / tr for c in TRANS}, "all"),
        ("Perfil de productos", " (sobre total de FCI excl. transaccionales)", {c: p[c] / ntr for c in NOTR}, "ends"),
    ]
    boxes = [(0.008, 0.535, 0.475, 0.455), (0.515, 0.535, 0.475, 0.455), (0.008, 0.06, 0.475, 0.44), (0.515, 0.06, 0.475, 0.44)]
    for (t1, t2, series, mode), (x, y, w, h) in zip(panels, boxes):
        f.patches.append(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0,rounding_size=0.008", transform=f.transFigure,
                                        facecolor="white", edgecolor="#e6e6e6", lw=1, zorder=-2))
        f.patches.append(FancyBboxPatch((x, y + h - 0.055), w, 0.055, boxstyle="round,pad=0,rounding_size=0.008", transform=f.transFigure,
                                        facecolor="#ececec", edgecolor="#ececec", lw=0, zorder=-1))
        f.text(x + w / 2, y + h - 0.028, r"$\bf{" + t1.replace(" ", r"\ ") + "}$" + t2, ha="center", va="center", fontsize=10.5, color="#3a3a3a")
        ax = f.add_axes([x + 0.012, y + (0.075 if y < 0.5 else 0.07), w - 0.024, h - 0.15 - (0.0 if y < 0.5 else 0.0)])
        xs = np.arange(len(M12))
        vals = []
        for k, (n, s) in enumerate(series.items()):
            v = s.values * 100
            ax.plot(xs, v, color=COL[n], lw=2.2, marker="o" if mode == "all" else None, ms=3.2, zorder=3)
            vals.append((n, v))
            pts = range(len(xs)) if mode == "all" else [0, len(xs) - 1]
            for i in pts:
                if mode == "all" and i not in (0, len(xs) - 1):
                    dy = 7 if (k % 2 == 0) else -9
                else:
                    dy = 0
                ha = "right" if (mode != "all" and i == 0) else ("left" if mode != "all" else "center")
                off = (-3, 0) if (mode != "all" and i == 0) else ((3, 0) if mode != "all" else (0, dy if i not in (0, len(xs) - 1) else 7))
                if mode == "all" and i == 0: off, ha = (-3, 0), "right"
                if mode == "all" and i == len(xs) - 1: off, ha = (3, 0), "left"
                ax.annotate(ar(v[i], 1) + "%", (xs[i], v[i]), xytext=off, textcoords="offset points", ha=ha, va="center",
                            fontsize=7.4, color=COL[n], fontweight="bold" if mode != "all" else "normal")
        ax.set_xticks(xs); ax.set_xticklabels(labs, fontsize=8, color="#333")
        ax.set_yticks([]); ax.set_xlim(-0.6, len(xs) - 0.4)
        lo = min(v.min() for _, v in vals); hi = max(v.max() for _, v in vals)
        ax.set_ylim(lo - (hi - lo) * 0.06 - 0.5, hi + (hi - lo) * 0.08 + 0.5)
        for s_ in ("top", "right", "left"): ax.spines[s_].set_visible(False)
        ax.spines["bottom"].set_color("#bbbbbb"); ax.tick_params(length=0)
        if mode != "all":
            ax.axhline(0, color="#555a60", lw=2.2, zorder=2)
    # leyendas
    def leg(items, x0, y0, step, row=None):
        for i, n in enumerate(items):
            xx = x0 + (i % row) * step if row else x0 + i * step
            yy = y0 - (i // row) * 0.026 if row else y0
            f.patches.append(plt.Rectangle((xx, yy - 0.008), 0.016, 0.016, transform=f.transFigure, color=COL[n]))
            f.text(xx + 0.022, yy, n, fontsize=7.6, va="center", color="#333")
    leg(["Transaccionales", "Otros FCI"], 0.14, 0.503, 0.105)
    leg(TRANS, 0.075, 0.025, 0.105)
    leg(["Destino esp.", "RF ARS", "RF USD", "RM y Otros", "Otros", "RF MULT", "RF USD linked", "RV"], 0.54, 0.04, 0.11, row=4)
    save(f, "s06_6")


# ------------------------------------------------------------------ s10: flujo mensual por categoría (Excel apilado)
def s10(gerente, name, W, H):
    plt.rcParams.update({"font.family": "Carlito"})
    d = A[A.mes.isin(M12)]
    if gerente: d = d[d.Gerente == gerente]
    cats = ["T+1", "Renta Variable", "Renta Mixta", "Renta Fija", "Money Market", "Destino Esp."]
    col = {"Destino Esp.": "#54a14a", "Money Market": "#eac844", "Renta Fija": "#b07aa1", "Renta Mixta": "#ff9da7",
           "Renta Variable": "#9c755f", "T+1": "#bab0ac"}
    p = d.pivot_table(index="mes", columns="Categoria", values="Susc_Netas", aggfunc="sum").reindex(M12).fillna(0)
    f = fig_px(W, H); ax = f.add_axes([0.075, 0.13, 0.82, 0.85])
    xs = np.arange(len(M12)); pos = np.zeros(len(xs)); neg = np.zeros(len(xs))
    for c in cats:
        v = (p[c] if c in p else pd.Series(0, index=M12)).values                 # millones de $
        b = np.where(v >= 0, pos, neg)
        ax.bar(xs, v, 0.75, bottom=b, color=col[c], zorder=3, edgecolor="none")
        pos += np.where(v >= 0, v, 0); neg += np.where(v < 0, v, 0)
    ax.yaxis.set_major_locator(mt.MaxNLocator(10, steps=[1, 2, 5]))
    ax.yaxis.set_major_formatter(mt.FuncFormatter(lambda x, _: ar(x, 2)))
    ax.tick_params(axis="y", labelsize=4.2, colors="#595959", length=0); ax.tick_params(axis="x", length=0)
    ax.set_xticks(xs); ax.set_xticklabels([f"1/{int(m[5:])}/{m[2:4]}" for m in M12], rotation=90, fontsize=4.2, color="#595959")
    ax.grid(axis="y", color="#ececec", lw=0.6, zorder=0)
    for s_ in ax.spines.values(): s_.set_visible(False)
    ax.axhline(0, color="#d9d9d9", lw=0.6)
    ax.set_xlim(-0.6, len(xs) - 0.4)
    for i, c in enumerate(cats[::-1]):
        f.patches.append(plt.Rectangle((0.905, 0.965 - i * 0.032), 0.009, 0.018, transform=f.transFigure, color=col[c]))
        f.text(0.918, 0.974 - i * 0.032, c, fontsize=5, va="center", color="#404040")
    save(f, name)


# ------------------------------------------------------------------ s15_11: ranking AUM ex Money Market (columnas)
def s15_11():
    W, H = 899, 360
    plt.rcParams.update({"font.family": "Carlito"})
    ex = o[o.Categoria != "Money Market"].groupby(["Gerente", "Tipo_Gerente"]).AUM_Final.sum().reset_index()
    ex = ex[ex.AUM_Final > 15000].sort_values("AUM_Final", ascending=False)
    f = fig_px(W, H); ax = f.add_axes([0.0, 0.27, 1.0, 0.73])
    xs = np.arange(len(ex))
    cols = ["#f5c518" if t == "Independiente" else "#b8bfd6" for t in ex.Tipo_Gerente]
    ax.bar(xs, ex.AUM_Final.values, 0.75, color=cols)
    for x, v in zip(xs, ex.AUM_Final.values):
        ax.text(x, v + ex.AUM_Final.max() * 0.01, ar(v, 0).replace(",", "."), rotation=90, ha="center", va="bottom", fontsize=6.2, color="#222")
    ax.set_xticks(xs); ax.set_xticklabels([GRUPO_N.get(g, g) for g in ex.Gerente], rotation=90, fontsize=6.6, color="#222")
    ax.set_yticks([]); ax.tick_params(length=0)
    for s_ in ax.spines.values(): s_.set_visible(False)
    ax.set_xlim(-0.7, len(xs) - 0.3); ax.set_ylim(0, ex.AUM_Final.max() * 1.45)
    save(f, "s15_11")


# ------------------------------------------------------------------ s15_8: ranking AUM total (barras horizontales, estilo 1816)
def s15_8():
    W, H = 754, 499
    plt.rcParams.update({"font.family": "DejaVu Sans"})
    g = o.groupby(["Gerente", "Tipo_Gerente"]).AUM_Final.sum().reset_index().sort_values("AUM_Final", ascending=False).head(40)
    tot = o.AUM_Final.sum()
    f = fig_px(W, H); ax = f.add_axes([0.165, 0.005, 0.83, 0.99])
    ax.set_facecolor("#fbfbfb")
    ys = np.arange(len(g))
    cols = ["#4a6fa5" if t == "Bancaria" else "#7fb2ea" for t in g.Tipo_Gerente]
    ax.barh(ys, g.AUM_Final.values, 0.72, color=cols, zorder=3)
    for y, v in zip(ys, g.AUM_Final.values):
        ax.text(v + g.AUM_Final.max() * 0.005, y, ar(v / tot * 100, 2) + "%", va="center", fontsize=2.9, color="#222", zorder=4)
    yf = lambda y: 0.005 + 0.99 * (1 - (y + 0.6) / (len(ys)))
    for y, v, nm in zip(ys, g.AUM_Final.values, g.Gerente):
        f.text(0.086, yf(y), GRUPO_N.get(nm, nm), ha="right", va="center", fontsize=3.4, color="#222")
        f.text(0.112, yf(y), ar(v / 1e6, 3), ha="left", va="center", fontsize=3.4, color="#222")
    ax.set_yticks([])
    ax.invert_yaxis(); ax.set_xticks(np.linspace(0, g.AUM_Final.max() * 1.06, 18)); ax.set_xticklabels([])
    ax.grid(axis="x", color="#e9e9e9", lw=0.5, zorder=0); ax.tick_params(axis="x", length=0)
    for s_ in ax.spines.values(): s_.set_visible(False)
    ax.set_xlim(0, g.AUM_Final.max() * 1.06); ax.set_ylim(len(ys) - 0.4, -0.6)
    save(f, "s15_8")


# ------------------------------------------------------------------ s16 / s17 / s21: market share (Excel líneas)
GRUPO = {"Consultatio": "One618 (ex Consultatio + ST)", "Delta": "Delta + Galileo", "Investis": "Investis + Bacs"}


def ms_series(sgi_only):
    d = A[(A.Categoria != "Money Market") & (A.mes >= "2020-12")].copy()
    if sgi_only: d = d[d.Tipo_Gerente == "Independiente"]
    d["G"] = d.Gerente.map(lambda x: GRUPO.get(x, x))
    p = d.pivot_table(index="mes", columns="G", values="AUM_Final", aggfunc="sum").fillna(0)
    return p.div(p.sum(1), axis=0) * 100


def ms_chart(name, sgi_only, names, colors, title, W, H, yl):
    plt.rcParams.update({"font.family": "Carlito"})
    s = ms_series(sgi_only)
    f = fig_px(W, H); ax = f.add_axes([0.035, 0.12, 0.93, 0.86])
    xs = np.arange(len(s))
    for n, c in zip(names, colors):
        if n not in s: continue
        ax.plot(xs, s[n].values, color=c, lw=2.6 if n == "Balanz" else 1.6, zorder=4 if n == "Balanz" else 3)
        ax.text(xs[-1] + 1.2, s[n].values[-1], ar(s[n].values[-1], 1) + "%", fontsize=6, va="center", color="#404040")
    ax.set_ylim(*yl); ax.yaxis.set_major_locator(mt.MultipleLocator(0.5))
    ax.yaxis.set_major_formatter(mt.FuncFormatter(lambda x, _: ar(x, 1) + "%"))
    ticks = [i for i, m in enumerate(s.index) if m[5:] in ("12", "06")]
    ax.set_xticks(ticks)
    ax.set_xticklabels([("1/" + str(int(s.index[i][5:])) + "/" + s.index[i][2:4]) if s.index[i] < "2024-12" else
                        f"01/{s.index[i][5:]}/{s.index[i][:4]}" for i in ticks], fontsize=5.6, color="#595959")
    ax.tick_params(axis="y", labelsize=5.6, colors="#595959", length=0); ax.tick_params(axis="x", length=0)
    ax.grid(axis="y", color="#e3e3e3", lw=0.5, zorder=0)
    for s_ in ax.spines.values(): s_.set_visible(False)
    ax.spines["bottom"].set_visible(True); ax.spines["bottom"].set_color("#d9d9d9")
    ax.set_xlim(-0.5, len(xs) + 3)
    ax.text(0.5, 0.97, title, transform=ax.transAxes, ha="center", va="top", fontsize=8.6, color="#595959")
    # leyenda abajo
    tot_w = 0; items = [(n, c) for n, c in zip(names, colors)]
    x0 = 0.5 - len(items) * 0.0485
    for i, (n, c) in enumerate(items):
        xx = x0 + i * 0.097
        f.lines.append(plt.Line2D([xx, xx + 0.018], [0.03, 0.03], transform=f.transFigure, color=c, lw=2.2 if n == "Balanz" else 1.4))
        f.text(xx + 0.022, 0.03, n, fontsize=5.4, va="center", color="#595959")
    save(f, name)


def s21():
    W, H = 1920, 645
    plt.rcParams.update({"font.family": "Carlito"})
    d = A[A.mes >= "2023-01"]
    tot = d.groupby("mes").AUM_Final.sum(); bz = d[d.Gerente == "Balanz"].groupby("mes").AUM_Final.sum()
    s = (bz / tot * 100).dropna()
    f = fig_px(W, H); ax = f.add_axes([0.045, 0.2, 0.945, 0.68])
    xs = np.arange(len(s))
    ax.plot(xs, s.values, color="#4472c4", lw=2.6, marker="D", ms=4.5, zorder=3)
    for i, v in enumerate(s.values):
        ax.annotate(ar(v, 2) + "%", (i, v), xytext=(0, 6 if i % 2 == 0 else -9), textcoords="offset points", ha="center",
                    fontsize=11.5, color="#404040", fontweight="bold")
    lo = np.floor(s.min() * 2) / 2 - 0.5; hi = np.ceil(s.max() * 2) / 2 + 0.5
    ax.set_ylim(1.5, 5.5); ax.set_yticks([1.5, 2.5, 3.5, 4.5, 5.5])
    ax.yaxis.set_major_formatter(mt.FuncFormatter(lambda x, _: ar(x, 2) + "%"))
    ax.grid(axis="y", color="#bfbfbf", lw=0.6, ls=(0, (4, 3)))
    ax.set_xticks(xs); ax.set_xticklabels([f"{MES[int(m[5:])][:3]}-{m[2:4]}" for m in s.index], rotation=45, fontsize=10.5, color="#1f3864", fontweight="bold")
    ax.tick_params(length=0, axis="y", labelsize=10.5, colors="#1f3864")
    for s_ in ax.spines.values(): s_.set_visible(False)
    ax.spines["bottom"].set_visible(True); ax.spines["bottom"].set_color("#bfbfbf")
    ax.set_xlim(-0.8, len(xs) - 0.2)
    f.text(0.5, 0.94, "Market share", ha="center", fontsize=15, color="#1f3864", fontweight="bold")
    save(f, "s21_6")


if __name__ == "__main__":
    s06()
    s10(None, "s10_6", 799, 359)
    s10("Balanz", "s10_8", 895, 417)
    s15_8(); s15_11()
    ms_chart("s16_6", False,
             ["Galicia", "Santander", "Macro", "Pellegrini", "Schroder", "Delta + Galileo", "Balanz", "MegaQM", "One618 (ex Consultatio + ST)", "Investis + Bacs"],
             ["#f5b52f", "#ff1a1a", "#1d93d1", "#8a2a8f", "#58c4f0", "#8fd88a", "#1f4e8c", "#ffff33", "#d4590f", "#d9d9d9"],
             "Evolución Market Share ex-Money Market Industria\ndesde 2020", 1389, 637, (2.0, 12.6))
    ms_chart("s17_6", True,
             ["Schroder", "Balanz", "MegaQM", "Allaria", "Adcap", "One618 (ex Consultatio + ST)", "Investis + Bacs", "Delta + Galileo", "Cocos", "SBS"],
             ["#58c4f0", "#1f5c99", "#ffff33", "#d43fd4", "#163b4a", "#d4590f", "#d9d9d9", "#6b1a5c", "#b8860b", "#e05ae0"],
             "Evolución Market Share ex-Money Market SGIs\ndesde 2020", 1272, 791, (0.0, 19.1))
    s21()
