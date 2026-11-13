"""Datos del tablero "Ranking Fondos Balanz" (antes extraidos de 1816), desde la base CAFCI/CNV.

Salida: procesado/dashboard/{fondos,categorias,corte,historial}.json (+ las mismas filas por /api/dashboard).
Corte = ultima fecha con dato (t). Semana = t-6 .. t; comparacion = t-7.
Por cuota de referencia de cada fondo (como 1816), categoria = subtipo 1816, en ARS y en USD:
  rend_7d       variacion del valor de cuotaparte t-7 -> t (en USD/ARS convertido con el dolar de cada dia)
  aum_prom_sem  patrimonio promedio del fondo (todas sus clases) por dia corrido de la semana, millones
  susc_netas_sem suscripciones netas del fondo en la semana, millones
  pos_*         puesto dentro de la categoria (1 = mayor); var_pos = puestos ganados vs el corte t-7
Historial: un corte por semana (viernes) de las ultimas 26 semanas + el corte actual, solo fondos Balanz.
"""
import glob, json, math, os
import numpy as np, pandas as pd

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROC = os.path.join(BASE, "procesado")
OUT = os.path.join(PROC, "dashboard")
CFG = json.load(open(os.path.join(BASE, "config.json"))) if os.path.exists(os.path.join(BASE, "config.json")) else {}
SEMANAS_HIST = 26


def cargar():
    fs = sorted(glob.glob(os.path.join(PROC, "clases_diario", "*.csv.gz")))[-14:]
    cols = ["fecha", "codigo_cafci", "codigo_cnv", "fondo_clase", "categoria_1816", "subcategoria_1816", "gerente_1816", "moneda",
            "vcp", "patrimonio_ars", "flujo_ars", "hon_sg", "hon_sd", "cuota_referencia", "decreto_596"]
    D = pd.concat([pd.read_csv(f, usecols=lambda c: c in cols, low_memory=False) for f in fs], ignore_index=True)
    D["fecha"] = pd.to_datetime(D.fecha)
    D = D[D.categoria_1816.notna() & (D.decreto_596 != "S") & D.subcategoria_1816.notna() & (D.subcategoria_1816 != "Sin clasificar")]
    return D


def main():
    os.makedirs(OUT, exist_ok=True)
    D = cargar()
    F = D.fecha.max()
    cal = pd.date_range(D.fecha.min(), F)
    dl = pd.read_csv(os.path.join(PROC, "dolar.csv"), parse_dates=["fecha"]).set_index("fecha").sort_index()
    tc = ((dl.mep + dl.ccl) / 2).where(dl.ccl.notna(), dl.mep) if CFG.get("tipo_cambio", "promedio_mep_ccl") == "promedio_mep_ccl" else dl.mep
    tc = tc.dropna().reindex(pd.date_range(min(tc.dropna().index.min(), cal[0]), F)).ffill().reindex(cal)
    ult = D.sort_values("fecha").drop_duplicates("codigo_cafci", keep="last").set_index("codigo_cafci")
    ref = ult[ult.cuota_referencia == 1]
    ref = ref[~ref.codigo_cnv.duplicated(keep="first")]
    m16 = pd.read_csv(os.path.join(BASE, "mapeo", "clases_1816.csv")).set_index("codigo_cafci").Cuota_1816
    nombre = pd.Series([m16.get(c, ref.loc[c, "fondo_clase"]) for c in ref.index], index=ref.index).str.strip()
    # paneles diarios (dia corrido, ultimo dato hasta 7 dias)
    V = D[D.vcp > 0].pivot_table(index="fecha", columns="codigo_cafci", values="vcp", aggfunc="last").reindex(cal).ffill()
    V = V.reindex(columns=ref.index)
    usdc = (ref.moneda != "ARS").reindex(V.columns).values
    V_ars = V.copy(); V_ars.loc[:, usdc] = V.loc[:, usdc].mul(tc, axis=0)
    V_usd = V.copy(); V_usd.loc[:, ~usdc] = V.loc[:, ~usdc].div(tc, axis=0)
    fondo_de = ult.codigo_cnv
    P = D.pivot_table(index="fecha", columns="codigo_cafci", values="patrimonio_ars", aggfunc="last").reindex(cal).ffill(limit=7).fillna(0)
    PF = P.T.groupby(fondo_de.reindex(P.columns)).sum().T            # patrimonio por fondo, ARS
    FL = D.pivot_table(index="fecha", columns="codigo_cnv", values="flujo_ars", aggfunc="sum").reindex(cal).fillna(0)
    PF_usd = PF.div(tc, axis=0); FL_usd = FL.div(tc, axis=0)
    cnv_ref = ref.codigo_cnv.astype(int)

    def corte(t, moneda):
        Vx = V_ars if moneda == "ARS" else V_usd
        Pf, Fl = (PF, FL) if moneda == "ARS" else (PF_usd, FL_usd)
        b = t - pd.Timedelta(days=7)
        sem = pd.date_range(t - pd.Timedelta(days=6), t)
        r7 = Vx.loc[t] / Vx.loc[b] - 1 if b in Vx.index else pd.Series(np.nan, index=Vx.columns)
        r30 = Vx.loc[t] / Vx.loc[t - pd.Timedelta(days=30)] - 1 if t - pd.Timedelta(days=30) in Vx.index else pd.Series(np.nan, index=Vx.columns)
        y0 = pd.Timestamp(t.year - 1, 12, 31)
        rytd = Vx.loc[t] / Vx.loc[y0] - 1 if y0 in Vx.index else pd.Series(np.nan, index=Vx.columns)
        aum = Pf.loc[sem].mean().reindex(cnv_ref.values).values / 1e6
        susc = Fl.loc[(Fl.index > b) & (Fl.index <= t)].sum().reindex(cnv_ref.values).fillna(0).values / 1e6
        p0 = Pf.loc[b].reindex(cnv_ref.values).values if b in Pf.index else np.full(len(cnv_ref), np.nan)
        p1 = Pf.loc[t].reindex(cnv_ref.values).values
        f = pd.DataFrame({"codigo_cafci": ref.index, "codigo_cnv": cnv_ref.values, "cuota": nombre.values, "moneda": moneda,
                          "categoria": ref.subcategoria_1816.values, "tipo": ref.categoria_1816.values, "gerente": ref.gerente_1816.values,
                          "balanz": (ref.gerente_1816 == "Balanz").values,
                          "rend_7d": r7.reindex(ref.index).values, "rend_30d": r30.reindex(ref.index).values, "rend_ytd": rytd.reindex(ref.index).values,
                          "aum_prom_sem": aum, "susc_netas_sem": susc,
                          "var_aum_7d": np.where(p0 > 0, p1 / np.where(p0 > 0, p0, 1) - 1, np.nan),
                          "fee": ((ref.hon_sg.fillna(0) + ref.hon_sd.fillna(0)) / 100).values})
        f = f[f.aum_prom_sem > 0].copy()          # solo fondos activos (como 1816)
        f.loc[~np.isfinite(f.rend_7d), "rend_7d"] = np.nan
        g = f.groupby("categoria")
        f["pos_rend_7d"] = g.rend_7d.rank(ascending=False, method="min")
        f["n_cat"] = g.rend_7d.transform("count")
        f["pos_aum"] = f.where(f.aum_prom_sem > 0).groupby(f.categoria).aum_prom_sem.rank(ascending=False, method="min")
        f["n_cat_aum"] = f.assign(a=f.aum_prom_sem > 0).groupby("categoria").a.transform("sum")
        f["cuartil"] = np.ceil(f.pos_rend_7d / f.n_cat * 4)
        f["spread_bps"] = (f.rend_7d - g.rend_7d.transform("median")) * 1e4
        f["share_cat"] = f.aum_prom_sem / g.aum_prom_sem.transform("sum")
        return f

    def con_variacion(t, moneda):
        a, p = corte(t, moneda), corte(t - pd.Timedelta(days=7), moneda)
        k = p.set_index("codigo_cafci")
        a["var_pos"] = a.codigo_cafci.map(k.pos_rend_7d) - a.pos_rend_7d
        a["var_pos_aum"] = a.codigo_cafci.map(k.pos_aum) - a.pos_aum
        return a

    fondos = pd.concat([con_variacion(F, m) for m in ["ARS", "USD"]], ignore_index=True)
    cats = []
    for (c, m), g in fondos.groupby(["categoria", "moneda"]):
        bz = g[g.balanz]; ger = g.groupby("gerente").aum_prom_sem.sum().sort_values(ascending=False)
        cats.append({"categoria": c, "moneda": m, "tipo": g.tipo.iloc[0], "n_fondos": int(len(g)), "aum_total": g.aum_prom_sem.sum(),
                     "susc_netas_sem": g.susc_netas_sem.sum(), "rend_7d_mediana": g.rend_7d.median(), "rend_7d_max": g.rend_7d.max(),
                     "balanz_fondos": int(len(bz)), "balanz_share": bz.aum_prom_sem.sum() / g.aum_prom_sem.sum() if g.aum_prom_sem.sum() else None,
                     "balanz_susc_netas_sem": bz.susc_netas_sem.sum(),
                     "balanz_pos_gerente": (list(ger.index).index("Balanz") + 1) if len(bz) else None, "n_gerentes": int(len(ger))})
    corte_ = [{"semana_desde": (F - pd.Timedelta(days=6)).date().isoformat(), "semana_hasta": F.date().isoformat(),
               "fecha_comparacion": (F - pd.Timedelta(days=7)).date().isoformat(), "fuente": "CAFCI / CNV (planilla diaria)"}]
    # historial: viernes de las ultimas semanas + corte actual
    viernes = [d for d in pd.date_range(F - pd.Timedelta(weeks=SEMANAS_HIST), F) if d.weekday() == 4 and d - pd.Timedelta(days=7) >= cal[0]]
    fechas = sorted(set(viernes + [F]))
    hist = []
    for t in fechas:
        for m in ["ARS", "USD"]:
            h = corte(t, m); h = h[h.balanz]
            hist.append(h.assign(semana=t.date().isoformat())[["semana", "cuota", "moneda", "categoria", "pos_rend_7d", "n_cat", "pos_aum",
                                                              "n_cat_aum", "rend_7d", "aum_prom_sem"]])
    hist = pd.concat(hist, ignore_index=True)

    def limpio(df):
        recs = json.loads(df.to_json(orient="records", double_precision=10))
        return recs
    ints = ["pos_rend_7d", "n_cat", "pos_aum", "n_cat_aum", "cuartil", "var_pos", "var_pos_aum"]
    for df in (fondos, hist):
        for c in ints:
            if c in df: df[c] = df[c].astype("Int64")
    salida = {"fondos": limpio(fondos.drop(columns=["codigo_cafci"]).assign(codigo_cafci=fondos.codigo_cafci)),
              "categorias": limpio(pd.DataFrame(cats)), "corte": corte_, "historial": limpio(hist)}
    for k, v in salida.items():
        txt = json.dumps(v, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        p = os.path.join(OUT, k + ".json")
        if not os.path.exists(p) or open(p, encoding="utf-8").read() != txt:
            open(p, "w", encoding="utf-8").write(txt)
    print("dashboard:", F.date(), "| fondos", len(fondos) // 2, "| Balanz", int(fondos.balanz.sum() // 2), "| historial", len(hist))


if __name__ == "__main__":
    main()
