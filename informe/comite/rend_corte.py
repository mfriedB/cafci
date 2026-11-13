# Uso: python3 rend_corte.py AAAA-MM-DD salida.csv   (env CAFCI = clon del repo). Copia de scripts/rendimientos.py con fecha de corte.
"""Rendimientos por clase a la ultima fecha, como la vista "Ranking" de 1816 (DATASETS / FCI / Performance).

Salida: procesado/rendimientos.csv, una fila por clase con dato en la ultima fecha.
Ventanas (rendimiento directo, neto de honorarios, sobre el valor de cuotaparte): 1D, 7D, MTD, 30D, 90D, YTD, 365D.
La base de cada ventana es el ultimo valor de cuotaparte disponible a esa fecha calendario (igual que 1816):
  1D = fecha - 1 dia, 7D = fecha - 7, MTD = cierre del mes anterior, 30D = fecha - 30, 90D = fecha - 90,
  YTD = 31/12 del anio anterior, 365D = fecha - 365.
Monedas: r_<v> en la moneda de la clase; r_<v>_ars y r_<v>_usd convertidos con el dolar de procesado/dolar.csv
(promedio MEP-CCL o MEP segun config.json). 1816 usa su propia serie de dolar para convertir: en la moneda de la
clase coinciden exacto; convertidas pueden diferir en la variacion del tipo de cambio.
dias_<v> permite pasar a TNA (r*365/dias) o TEA ((1+r)^(365/dias)-1).
"""
import glob, json, os
import pandas as pd, numpy as np

import sys
BASE = os.environ.get("CAFCI", "/home/claude/cafci")
PROC = os.path.join(BASE, "procesado")
CFG = json.load(open(os.path.join(BASE, "config.json"))) if os.path.exists(os.path.join(BASE, "config.json")) else {}
V = ["1D", "7D", "MTD", "30D", "90D", "YTD", "365D"]


def main():
    fs = [f for f in sorted(glob.glob(os.path.join(PROC, "clases_diario", "*.csv.gz"))) if os.path.basename(f)[:7] <= sys.argv[1][:7]][-15:]
    cols = ["fecha", "codigo_cafci", "codigo_cnv", "fondo_clase", "fondo", "fondo_1816", "gerente", "gerente_1816", "tipo_gerente",
            "categoria_1816", "subcategoria_1816", "clasificacion_cafci", "moneda", "vcp", "patrimonio", "patrimonio_ars", "hon_sg",
            "hon_sd", "calificacion", "cuota_referencia", "decreto_596", "ley_27743", "depositaria"]
    D = pd.concat([pd.read_csv(f, usecols=lambda c: c in cols, low_memory=False) for f in fs], ignore_index=True)
    D["fecha"] = pd.to_datetime(D.fecha); D = D[D.fecha <= pd.Timestamp(sys.argv[1])]
    F = D.fecha.max()
    P = D[D.vcp > 0].pivot_table(index="fecha", columns="codigo_cafci", values="vcp", aggfunc="last").sort_index()
    P = P.reindex(pd.date_range(P.index.min(), F)).ffill()
    base = {"1D": F - pd.Timedelta(days=1), "7D": F - pd.Timedelta(days=7), "MTD": F.replace(day=1) - pd.Timedelta(days=1),
            "30D": F - pd.Timedelta(days=30), "90D": F - pd.Timedelta(days=90),
            "YTD": pd.Timestamp(F.year - 1, 12, 31), "365D": F - pd.Timedelta(days=365)}
    # dolar para convertir
    tc = None
    dp = os.path.join(PROC, "dolar.csv")
    if os.path.exists(dp):
        dl = pd.read_csv(dp, parse_dates=["fecha"]).set_index("fecha").sort_index()
        tc = ((dl.mep + dl.ccl) / 2).where(dl.ccl.notna(), dl.mep) if CFG.get("tipo_cambio", "promedio_mep_ccl") == "promedio_mep_ccl" and "ccl" in dl else dl.mep
        tc = tc.dropna(); tc = tc.reindex(pd.date_range(min(tc.index.min(), P.index.min()), F)).ffill()
    hoy = D[D.fecha == F].drop_duplicates("codigo_cafci", keep="last").set_index("codigo_cafci")
    out = hoy[[c for c in cols if c in hoy.columns and c not in ("fecha", "vcp")]].copy()
    out.insert(0, "fecha", F.date().isoformat())
    out["vcp"] = hoy.vcp
    pf = hoy.groupby("codigo_cnv").patrimonio_ars.transform("sum")
    out["patrimonio_clase_mill"] = hoy.patrimonio_ars / 1e6
    out["patrimonio_fondo_mill"] = pf / 1e6
    out["honorarios_total"] = (hoy.hon_sg.fillna(0) + hoy.hon_sd.fillna(0)) / 100
    usd = out.moneda != "ARS"
    for v in V:
        b = base[v]
        r = (P.loc[F] / P.loc[b] - 1) if b >= P.index.min() else pd.Series(np.nan, index=P.columns)
        out["r_" + v] = r.reindex(out.index)
        out["dias_" + v] = (F - b).days
        if tc is not None and b >= tc.index.min():
            k = tc.loc[F] / tc.loc[b]
            out["r_" + v + "_ars"] = np.where(usd, (1 + out["r_" + v]) * k - 1, out["r_" + v])
            out["r_" + v + "_usd"] = np.where(usd, out["r_" + v], (1 + out["r_" + v]) / k - 1)
        else:
            out["r_" + v + "_ars"] = np.where(usd, np.nan, out["r_" + v]); out["r_" + v + "_usd"] = np.where(usd, out["r_" + v], np.nan)
    out = out.reset_index().sort_values(["codigo_cnv", "codigo_cafci"])
    out.to_csv(sys.argv[2], index=False, float_format="%.10g")
    print("rendimientos.csv:", len(out), "clases al", F.date(), "| referencia:", int(out.get("cuota_referencia", pd.Series(dtype=float)).fillna(0).sum()))


if __name__ == "__main__":
    main()
