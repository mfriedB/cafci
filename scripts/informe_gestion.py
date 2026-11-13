"""Bases publicas del tablero "Informe de Gestion FCI" (replica del Power BI), en procesado/informe/.

  industria_ars.csv   = fondos_cafci_*.csv de todos los meses (formato 1816, millones de ARS) en un solo archivo
  industria_usd.csv   = lo mismo en millones de USD (equivale a Fondos_1816_USD): cada dia el patrimonio, los flujos y
                        los honorarios de cada clase se pasan a dolares con el dolar de ese dia (promedio MEP-CCL, como
                        1816) y despues se agregan por fondo y mes igual que en pesos.
Columnas: Fecha, Categoria, Subcategoria, Fondo, Gerente, Tipo_Gerente, Codigo_CNV, AUM_promedio, AUM_Inicial, AUM_Final,
Susc_Netas, Rendimiento, Facturacion_Gerente, Facturacion_Depo.
"""
import glob, json, os
import numpy as np, pandas as pd

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROC = os.path.join(BASE, "procesado")
OUT = os.path.join(PROC, "informe")
CFG = json.load(open(os.path.join(BASE, "config.json"))) if os.path.exists(os.path.join(BASE, "config.json")) else {}
COLS = ["Fecha", "Categoria", "Subcategoria", "Fondo", "Gerente", "Tipo_Gerente", "Codigo_CNV", "AUM_promedio", "AUM_Inicial",
        "AUM_Final", "Susc_Netas", "Rendimiento", "Facturacion_Gerente", "Facturacion_Depo"]
NUM = COLS[7:]


def guardar(df, nombre):
    p = os.path.join(OUT, nombre)
    txt = df.to_csv(index=False, float_format="%.6f", lineterminator="\n")
    if not os.path.exists(p) or open(p, encoding="utf-8").read() != txt:
        open(p, "w", encoding="utf-8").write(txt)


def main():
    os.makedirs(OUT, exist_ok=True)
    idx = json.load(open(os.path.join(PROC, "index.json")))
    A = pd.concat([pd.read_csv(os.path.join(PROC, e["archivo"])) for e in idx["mensual"]], ignore_index=True)
    A["Fecha"] = A.Fecha.astype(str)
    A["mes"] = A.Fecha.str[:7]
    guardar(A[COLS], "industria_ars.csv")

    # ---- en dolares, dia por dia
    cols = ["fecha", "codigo_cafci", "codigo_cnv", "patrimonio_ars", "flujo_ars", "hon_sg", "hon_sd", "decreto_596", "categoria_1816"]
    D = pd.concat([pd.read_csv(f, usecols=lambda c: c in cols, low_memory=False)
                   for f in sorted(glob.glob(os.path.join(PROC, "clases_diario", "*.csv.gz")))], ignore_index=True)
    D = D[(D.decreto_596 != "S") & D.categoria_1816.notna()]
    D["fecha"] = pd.to_datetime(D.fecha)
    cal = pd.date_range(D.fecha.min(), D.fecha.max())
    dl = pd.read_csv(os.path.join(PROC, "dolar.csv"), parse_dates=["fecha"]).set_index("fecha").sort_index()
    tc = ((dl.mep + dl.ccl) / 2).where(dl.ccl.notna(), dl.mep) if CFG.get("tipo_cambio", "promedio_mep_ccl") == "promedio_mep_ccl" else dl.mep
    tc = tc.dropna(); tc = tc.reindex(pd.date_range(min(tc.index.min(), cal[0]), cal[-1])).ffill().bfill().reindex(cal)
    fondo_de = D.drop_duplicates("codigo_cafci", keep="last").set_index("codigo_cafci").codigo_cnv
    W = D.pivot_table(index="fecha", columns="codigo_cafci", values="patrimonio_ars", aggfunc="last").reindex(cal).ffill(limit=7).fillna(0.0)
    HG = D.pivot_table(index="fecha", columns="codigo_cafci", values="hon_sg", aggfunc="last").reindex(cal).ffill().bfill().fillna(0.0)
    HD = D.pivot_table(index="fecha", columns="codigo_cafci", values="hon_sd", aggfunc="last").reindex(cal).ffill().bfill().fillna(0.0)
    HG = HG.reindex(columns=W.columns).fillna(0.0); HD = HD.reindex(columns=W.columns).fillna(0.0)
    Wu = W.div(tc, axis=0)
    g = fondo_de.reindex(W.columns).values
    PF = Wu.T.groupby(g).sum().T                                   # patrimonio diario por fondo, USD
    FG = (Wu * HG / 100 / 365).T.groupby(g).sum().T
    FD = (Wu * HD / 100 / 365).T.groupby(g).sum().T
    FLd = D.assign(u=D.flujo_ars / D.fecha.map(tc)).groupby(["fecha", "codigo_cnv"]).u.sum().unstack().reindex(cal).fillna(0.0)
    filas = []
    for _, e in A.groupby("mes"):
        f1 = pd.Timestamp(e.Fecha.iloc[0]); ini = pd.Timestamp(f1.year, f1.month, 1) - pd.Timedelta(days=1)
        if ini < cal[0]: continue
        dias = pd.date_range(ini + pd.Timedelta(days=1), f1)
        cnv = e.Codigo_CNV.values
        x = pd.DataFrame({"AUM_promedio": PF.loc[dias].mean().reindex(cnv).values, "AUM_Inicial": PF.loc[ini].reindex(cnv).values,
                          "AUM_Final": PF.loc[f1].reindex(cnv).values,
                          "Susc_Netas": FLd.loc[dias].sum().reindex(cnv).values,
                          "Facturacion_Gerente": FG.loc[dias].sum().reindex(cnv).values,
                          "Facturacion_Depo": FD.loc[dias].sum().reindex(cnv).values}).fillna(0.0) / 1e6
        x["Rendimiento"] = x.AUM_Final - x.AUM_Inicial - x.Susc_Netas
        for c in COLS[:7]: x[c] = e[c].values
        filas.append(x[COLS])
    U = pd.concat(filas, ignore_index=True)
    guardar(U, "industria_usd.csv")
    print("informe: ARS", len(A), "filas | USD", len(U), "filas | ultimo mes", A.mes.max())


if __name__ == "__main__":
    main()
