"""Indicadores que 1816 no muestra, calculados sobre el detalle diario por clase (procesado/clases_diario/).

Salidas (montos en millones de ARS, flujos en % del patrimonio del dia anterior):
  fondos_diario/AAAA-MM.csv.gz   fondo x dia: patrimonio, suscripciones netas y flujo % (base liviana para series diarias)
  parquet/fondos_diario.parquet  lo mismo, toda la historia en un archivo (para DuckDB / pandas por HTTP)
  insights/alertas.csv           por fondo a la ultima fecha: racha de dias con rescates netos, flujo del dia y de 5 dias,
                                 percentil del flujo del dia contra su propio ultimo año, y la alerta resultante
  insights/liquidez.csv          por fondo, ultimos 250 dias habiles: peor dia de rescate, percentiles 1 y 5, volatilidad de
                                 flujos y % de dias con rescates, contra la mediana de su subcategoria
  insights/estacionalidad.csv    flujo medio por dia habil del mes y por dias al cierre, por categoria (ultimos 12 meses completos)
  insights/sensibilidad.csv      flujo del mes siguiente segun el quintil de rendimiento del mes dentro de la subcategoria
  insights/fees.csv              fee efectivo de gerente por subcategoria y gerente vs mercado, share de AUM y de facturacion
  insights/concentracion.csv     por gerente y mes: suscripcion bruta, % que entro en los 3 mejores dias, dias con entradas
  insights/cambios.csv           cambios persistentes de condiciones por clase (honorarios, comisiones, minimo, plazo,
                                 calificacion, depositaria) y altas/bajas de clases, ultimos 13 meses
  insights/resumen.json          fecha de corte y cantidad de filas de cada archivo

Los archivos se reescriben solo si cambia el contenido (asi el historial del repo no crece con cada corrida).
"""
import glob, gzip, hashlib, io, json, os
import numpy as np
import pandas as pd

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROC = os.path.join(BASE, "procesado")
OUT = os.path.join(PROC, "insights"); DIA = os.path.join(PROC, "fondos_diario")
os.makedirs(OUT, exist_ok=True); os.makedirs(DIA, exist_ok=True)

MESES_INSIGHTS = 26          # meses de detalle diario que se cargan para los indicadores
UMBRAL_AUM = 1000.0          # millones de ARS: fondos mas chicos no entran en alertas ni liquidez
LIQUIDEZ = {"Money Market", "T+1"}
CAMPOS_CAMBIO = ["hon_sg", "hon_sd", "comision_ingreso", "comision_rescate", "minimo_inversion", "plazo_liq", "calificacion", "depositaria"]
MIN_RACHA = 5                # un valor nuevo tiene que mantenerse 5 planillas para contar como cambio (la planilla tiene idas y vueltas)
cambios = 0


def _escribir(ruta, data: bytes):
    global cambios
    if os.path.exists(ruta) and hashlib.sha256(open(ruta, "rb").read()).digest() == hashlib.sha256(data).digest():
        return
    open(ruta, "wb").write(data); cambios += 1


def csv(df, nombre):
    _escribir(os.path.join(OUT, nombre), df.to_csv(index=False, float_format="%.6g", lineterminator="\n").encode())


def csv_gz(df, ruta):
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", mtime=0) as g:
        g.write(df.to_csv(index=False, float_format="%.6f", lineterminator="\n").encode())
    _escribir(ruta, buf.getvalue())


# ------------------------------------------------------------------ fondo x dia
COLS = ["fecha", "codigo_cafci", "codigo_cnv", "fondo_clase", "fondo", "fondo_1816", "gerente", "gerente_1816", "tipo_gerente",
        "categoria_1816", "subcategoria_1816", "moneda", "moneda_fondo", "patrimonio", "patrimonio_ars", "flujo_ars", "decreto_596"] + CAMPOS_CAMBIO


def fondos_diario():
    """Agrega clases a fondos, dia por dia, para toda la historia. Devuelve (fondo-dia de los ultimos meses, clases de los ultimos meses)."""
    archivos = sorted(glob.glob(os.path.join(PROC, "clases_diario", "*.csv.gz")))
    recientes = set(os.path.basename(f)[:7] for f in archivos[-MESES_INSIGHTS:])
    previo = {}                       # ultimo patrimonio de cada fondo (para el flujo % del primer dia de cada mes)
    todo, F, C = [], [], []
    for f in archivos:
        mes = os.path.basename(f)[:7]
        d = pd.read_csv(f, usecols=lambda c: c in COLS, low_memory=False)
        d = d[d.get("decreto_596", "N").fillna("N") != "S"]
        for c in ["fondo_1816", "gerente_1816", "categoria_1816", "subcategoria_1816", "tipo_gerente"]:
            if c not in d: d[c] = None
        d["fondo_1816"] = d.fondo_1816.fillna(d.fondo); d["gerente_1816"] = d.gerente_1816.fillna(d.gerente)
        g = (d.groupby(["fecha", "codigo_cnv"], as_index=False)
               .agg(fondo=("fondo_1816", "first"), gerente=("gerente_1816", "first"), tipo_gerente=("tipo_gerente", "first"),
                    categoria=("categoria_1816", "first"), subcategoria=("subcategoria_1816", "first"),
                    moneda_fondo=("moneda_fondo", "first"), patrimonio=("patrimonio_ars", "sum"), flujo=("flujo_ars", "sum")))
        g["patrimonio"] /= 1e6; g["flujo"] /= 1e6
        g = g.sort_values(["codigo_cnv", "fecha"])
        ant = g.groupby("codigo_cnv").patrimonio.shift()
        ant = ant.fillna(g.codigo_cnv.map(previo))
        g["flujo_pct"] = np.where(ant > 0, g.flujo / ant, np.nan)
        previo.update(g.groupby("codigo_cnv").patrimonio.last().to_dict())
        csv_gz(g, os.path.join(DIA, f"{mes}.csv.gz"))
        todo.append(g.assign(mes=mes))
        if mes in recientes:
            F.append(g); C.append(d)
    T = pd.concat(todo, ignore_index=True)
    try:
        import pyarrow as pa, pyarrow.parquet as pq
        T2 = T.copy(); T2["fecha"] = pd.to_datetime(T2.fecha).dt.date
        for c in ["fondo", "gerente", "tipo_gerente", "categoria", "subcategoria", "moneda_fondo", "mes"]:
            T2[c] = T2[c].astype("string")
        T2["codigo_cnv"] = pd.to_numeric(T2.codigo_cnv, errors="coerce").astype("Int64")
        tabla = pa.Table.from_pandas(T2, preserve_index=False).replace_schema_metadata(None)
        buf = io.BytesIO(); pq.write_table(tabla, buf, compression="zstd", compression_level=9, row_group_size=200_000)
        os.makedirs(os.path.join(PROC, "parquet"), exist_ok=True)
        _escribir(os.path.join(PROC, "parquet", "fondos_diario.parquet"), buf.getvalue())
    except Exception as e:                # el parquet es un extra: si falla, los indicadores igual se publican
        print("fondos_diario.parquet: no se pudo escribir", repr(e))
    return pd.concat(F, ignore_index=True), pd.concat(C, ignore_index=True)


# ------------------------------------------------------------------ indicadores
def alertas(F, hoy):
    """Racha de rescates netos al dia de hoy, flujo de 1 y 5 dias, y percentil del flujo de hoy contra el ultimo año del fondo."""
    filas = []
    ult = F[F.fecha == hoy].set_index("codigo_cnv")
    for cod, g in F[F.codigo_cnv.isin(ult.index)].groupby("codigo_cnv"):
        g = g.sort_values("fecha")
        if g.patrimonio.iloc[-1] < UMBRAL_AUM: continue
        neg = (g.flujo < 0).values[::-1]
        racha = int(np.argmin(neg)) if not neg.all() else len(neg)
        tramo = g.iloc[len(g) - racha:] if racha else g.iloc[0:0]
        base_racha = g.patrimonio.iloc[len(g) - racha - 1] if racha and len(g) > racha else np.nan
        h = g.iloc[-251:-1]
        hist = h.flujo_pct[(h.patrimonio - h.flujo) >= 0.25 * h.patrimonio.median()].dropna()
        hoy_pct = g.flujo_pct.iloc[-1]
        pctl = float((hist < hoy_pct).mean()) if len(hist) >= 60 and pd.notna(hoy_pct) else np.nan
        f5 = g.flujo.iloc[-5:].sum(); b5 = g.patrimonio.iloc[-6] if len(g) > 5 else np.nan
        a = []
        if racha >= MIN_RACHA: a.append(f"{racha} dias seguidos de rescates")
        if pd.notna(pctl) and pctl <= 0.02 and hoy_pct < -0.01: a.append("rescate del dia en el 2% peor de su ultimo año")
        if pd.notna(pctl) and pctl >= 0.98 and hoy_pct > 0.01: a.append("suscripcion del dia en el 2% mejor de su ultimo año")
        x = ult.loc[cod]
        filas.append(dict(fecha=hoy, Codigo_CNV=cod, fondo=x.fondo, gerente=x.gerente, tipo_gerente=x.tipo_gerente, categoria=x.categoria,
                          subcategoria=x.subcategoria, patrimonio=x.patrimonio, flujo_dia=x.flujo, flujo_dia_pct=hoy_pct,
                          percentil_dia=pctl, flujo_5d=f5, flujo_5d_pct=f5 / b5 if b5 and b5 > 0 else np.nan,
                          racha_rescates=racha, flujo_racha=tramo.flujo.sum(),
                          flujo_racha_pct=tramo.flujo.sum() / base_racha if base_racha and base_racha > 0 else np.nan,
                          alerta="; ".join(a)))
    return pd.DataFrame(filas).sort_values(["alerta", "flujo_racha"], ascending=[False, True])


def liquidez(F):
    filas = []
    for cod, g in F.groupby("codigo_cnv"):
        g = g.sort_values("fecha").iloc[-250:]
        # dias con patrimonio previo minimo (arranque, liquidacion, migracion de clases) distorsionan el %: se descartan
        base = g.patrimonio - g.flujo
        p = g.flujo_pct[(base >= 0.25 * g.patrimonio.median()) & g.flujo_pct.between(-1, 1)].dropna()
        if len(p) < 120 or g.patrimonio.mean() < UMBRAL_AUM or p.std() == 0: continue
        u = g.iloc[-1]
        filas.append(dict(Codigo_CNV=cod, fondo=u.fondo, gerente=u.gerente, categoria=u.categoria, subcategoria=u.subcategoria,
                          patrimonio_prom=g.patrimonio.mean(), dias=len(p), peor_dia=p.min(), fecha_peor_dia=g.loc[p.idxmin(), "fecha"],
                          p1=p.quantile(0.01), p5=p.quantile(0.05), mejor_dia=p.max(), volatilidad=p.std(), pct_dias_rescate=(p < 0).mean()))
    L = pd.DataFrame(filas)
    med = L.groupby("subcategoria")[["peor_dia", "p1", "p5", "volatilidad"]].median().add_suffix("_subcat")
    L = L.join(med, on="subcategoria")
    L["fondos_subcat"] = L.groupby("subcategoria").Codigo_CNV.transform("count")
    return L.sort_values("patrimonio_prom", ascending=False)


def estacionalidad(F, planillas):
    """Flujo agregado por categoria y dia (en pb del patrimonio del dia anterior), ubicado por dia habil del mes."""
    F = F[F.fecha.isin(planillas)]
    meses = sorted(F.fecha.str[:7].unique())
    meses = [m for m in meses[:-1]][-12:]                 # ultimos 12 meses completos
    F = F[F.fecha.str[:7].isin(meses)].copy()
    F["base"] = F.patrimonio - F.flujo                    # aprox. del patrimonio previo sin depender del dia anterior
    pl = pd.Series(sorted(planillas)); pl = pl[pl.str[:7].isin(meses)]
    dh = pl.groupby(pl.str[:7]).cumcount() + 1
    dc = pl.groupby(pl.str[:7]).cumcount(ascending=False) + 1
    pos = pd.DataFrame({"fecha": pl.values, "dia_habil": dh.values, "dias_al_cierre": dc.values})
    out = []
    for cat, g in list(F.groupby("categoria")) + [("Total", F)]:
        a = g.groupby("fecha").agg(flujo=("flujo", "sum"), base=("base", "sum")).reset_index().merge(pos, on="fecha")
        a["bps"] = a.flujo / a.base * 1e4
        for eje in ["dia_habil", "dias_al_cierre"]:
            s = a.groupby(eje).agg(dias=("bps", "size"), flujo_medio_bps=("bps", "mean"), flujo_mediano_bps=("bps", "median"),
                                   pct_dias_rescate=("bps", lambda x: (x < 0).mean()), flujo_total=("flujo", "sum")).reset_index()
            s = s.rename(columns={eje: "dia"}); s.insert(0, "eje", eje); s.insert(0, "categoria", cat)
            out.append(s[s.dias >= 6])
    return pd.DataFrame(pd.concat(out, ignore_index=True)).assign(desde=meses[0], hasta=meses[-1])


def mensuales(n):
    idx = json.load(open(os.path.join(PROC, "index.json")))
    ms = [e for e in idx["mensual"] if not e.get("parcial")][-n:]
    return pd.concat([pd.read_csv(os.path.join(PROC, e["archivo"])).assign(mes=e["mes"], dias=int(e["hasta"][8:10])) for e in ms], ignore_index=True)


def sensibilidad():
    M = mensuales(25)
    M = M[M.AUM_promedio > 5000].copy()
    M["rend"] = M.Rendimiento / M.AUM_promedio
    M["flujo"] = M.Susc_Netas / M.AUM_Inicial.where(M.AUM_Inicial > 0)
    M["q"] = M.groupby(["mes", "Subcategoria"]).rend.transform(lambda s: pd.qcut(s.rank(method="first"), 5, labels=False) + 1 if len(s) >= 5 else np.nan)
    mes_sig = {m: s for m, s in zip(sorted(M.mes.unique())[:-1], sorted(M.mes.unique())[1:])}
    sig = M[["mes", "Codigo_CNV", "flujo"]].rename(columns={"mes": "mes_sig", "flujo": "flujo_sig"})
    X = M.assign(mes_sig=M.mes.map(mes_sig)).merge(sig, on=["mes_sig", "Codigo_CNV"]).dropna(subset=["q", "flujo_sig"])
    X = X[X.flujo_sig.between(-1, 3)]
    out = []
    for sub, g in list(X.groupby("Subcategoria")) + [("Total", X)]:
        if len(g) < 100: continue
        r = {"subcategoria": sub, "observaciones": len(g)}
        for q in range(1, 6): r[f"q{q}_flujo_mes_sig"] = g[g.q == q].flujo_sig.median()
        r["diferencia_q5_q1"] = r["q5_flujo_mes_sig"] - r["q1_flujo_mes_sig"]
        out.append(r)
    return pd.DataFrame(out).sort_values("diferencia_q5_q1", ascending=False).assign(desde=X.mes.min(), hasta=X.mes_sig.max())


def fees():
    M = mensuales(1)
    mes, dias = M.mes.iloc[0], M.dias.iloc[0]
    g = M.groupby(["Subcategoria", "Gerente"], as_index=False).agg(aum=("AUM_promedio", "sum"), fact=("Facturacion_Gerente", "sum"), fondos=("Fondo", "count"))
    t = M.groupby("Subcategoria").agg(aum_sub=("AUM_promedio", "sum"), fact_sub=("Facturacion_Gerente", "sum"))
    g = g.join(t, on="Subcategoria")
    g["fee_efectivo"] = g.fact * 365 / dias / g.aum
    g["fee_mercado"] = g.fact_sub * 365 / dias / g.aum_sub
    g["share_aum"] = g.aum / g.aum_sub; g["share_facturacion"] = g.fact / g.fact_sub
    g["ranking_aum"] = g.groupby("Subcategoria").aum.rank(ascending=False, method="min").astype(int)
    g = g.rename(columns={"Subcategoria": "subcategoria", "Gerente": "gerente", "aum": "aum_promedio", "fact": "facturacion_gerente"})
    return g.drop(columns=["aum_sub", "fact_sub"]).assign(mes=mes).sort_values(["subcategoria", "aum_promedio"], ascending=[True, False])


def concentracion(F):
    F = F.copy(); F["mes"] = F.fecha.str[:7]
    F["grupo"] = np.where(F.categoria.isin(LIQUIDEZ), "Liquidez (MM y T+1)", "Resto")
    out = []
    for grupo, H in [("Total", F)] + list(F.groupby("grupo")):
        d = H.groupby(["gerente", "mes", "fecha"]).flujo.sum().reset_index()
        for (ger, mes), g in d.groupby(["gerente", "mes"]):
            pos = g.flujo[g.flujo > 0].sort_values(ascending=False)
            if pos.sum() <= 0: continue
            out.append(dict(gerente=ger, mes=mes, grupo=grupo, flujo_neto=g.flujo.sum(), suscripcion_bruta_diaria=pos.sum(),
                            rescate_bruto_diario=-g.flujo[g.flujo < 0].sum(), dias=len(g), dias_con_entradas=len(pos),
                            pct_top3_dias=pos.iloc[:3].sum() / pos.sum(), mayor_dia=pos.iloc[0]))
    C = pd.DataFrame(out)
    meses = sorted(C.mes.unique())[-13:]
    return C[C.mes.isin(meses)].sort_values(["mes", "grupo", "suscripcion_bruta_diaria"], ascending=[False, True, False])


def _norm(v):
    if pd.isna(v): return None
    if isinstance(v, (int, float, np.floating, np.integer)): return round(float(v), 4)
    return str(v).strip()


def cambios_condiciones(C, hoy):
    """Cambios que se sostienen al menos MIN_RACHA planillas (filtra las idas y vueltas de la planilla) y altas/bajas de clases."""
    meses = sorted(C.fecha.str[:7].unique())[-13:]
    C = C[C.fecha.str[:7].isin(meses)].sort_values(["codigo_cafci", "fecha"])
    desde = C.fecha.min(); filas = []
    for cls, g in C.groupby("codigo_cafci"):
        u = g.iloc[-1]
        info = dict(codigo_cafci=cls, Codigo_CNV=u.codigo_cnv, clase=u.fondo_clase, fondo=u.fondo_1816, gerente=u.gerente_1816,
                    subcategoria=u.subcategoria_1816, patrimonio_clase=u.patrimonio_ars / 1e6 if pd.notna(u.patrimonio_ars) else np.nan)
        if g.fecha.iloc[0] > (pd.Timestamp(desde) + pd.Timedelta(days=10)).strftime("%Y-%m-%d"):
            filas.append(dict(fecha=g.fecha.iloc[0], campo="alta_clase", antes=None, despues=u.fondo_clase, provisorio=False, **info))
        if g.fecha.iloc[-1] < (pd.Timestamp(hoy) - pd.Timedelta(days=10)).strftime("%Y-%m-%d"):
            filas.append(dict(fecha=g.fecha.iloc[-1], campo="baja_clase", antes=u.fondo_clase, despues=None, provisorio=False, **info))
        for campo in CAMPOS_CAMBIO:
            if campo not in g: continue
            v = [_norm(x) for x in g[campo].values]; fechas = g.fecha.values
            corridas = []                                   # [valor, inicio, largo]
            for i, x in enumerate(v):
                if corridas and corridas[-1][0] == x: corridas[-1][2] += 1
                else: corridas.append([x, i, 1])
            estables = [c for k, c in enumerate(corridas) if c[2] >= MIN_RACHA or k == len(corridas) - 1]
            for a, b in zip(estables, estables[1:]):
                if a[0] != b[0] and a[2] >= MIN_RACHA and a[0] is not None and b[0] is not None:
                    filas.append(dict(fecha=fechas[b[1]], campo=campo, antes=a[0], despues=b[0], provisorio=b[2] < MIN_RACHA, **info))
    X = pd.DataFrame(filas)
    return X.sort_values(["fecha", "patrimonio_clase"], ascending=[False, False]) if len(X) else X


def main():
    F, C = fondos_diario()
    F["fecha"] = F.fecha.astype(str); C["fecha"] = C.fecha.astype(str)
    idx = json.load(open(os.path.join(PROC, "index.json")))
    planillas = set(idx.get("fechas_planilla", []))
    hoy = F.fecha.max()
    res = {"fecha_corte": hoy, "archivos": {}}
    for nombre, fn in [("alertas", lambda: alertas(F, hoy)), ("liquidez", lambda: liquidez(F)),
                       ("estacionalidad", lambda: estacionalidad(F, planillas)), ("sensibilidad", sensibilidad),
                       ("fees", fees), ("concentracion", lambda: concentracion(F)), ("cambios", lambda: cambios_condiciones(C, hoy))]:
        df = fn(); csv(df, f"{nombre}.csv"); res["archivos"][nombre] = len(df)
        print(f"{nombre}: {len(df)} filas")
    _escribir(os.path.join(OUT, "resumen.json"), json.dumps(res, ensure_ascii=False, indent=1).encode())
    print("insights:", cambios, "archivos actualizados")


if __name__ == "__main__":
    main()
