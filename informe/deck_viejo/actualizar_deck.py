"""Actualiza los gráficos del deck "Informe de Gestión FCI" en Claude Slides (réplica del PPT mensual de 64 slides).

Qué hace (corre en el contenedor de Claude, los datos internos nunca van al repo):
  1. Corta la base CAFCI/CNV (rama `datos` del repo) al cierre del mes y arma los datos del tablero con build_data.py.
  2. Sirve el tablero "Informe de Gestión FCI" (réplica del Power BI) con esos datos y captura sus visuales
     (capturas_tablero.py): slides 5, 12, 13, 20, 22, 23, 24, 25 y 26.
  3. Dibuja los gráficos que en el original salían de Excel / 1816 (gen_excel.py): slides 6, 10, 15, 16, 17 y 21.
  4. Suma el mes a hist_area.csv con dax_mes_unidad.txt y dibuja los internos (gen_internos.py): slides 29, 32, 50 a 55.
  5. Deja charts/*.png y charts/manifiesto.json (slide, archivo, posición). Claude los sube como assets del artifact
     y cambia el src de cada <img class="ch"> de la slide (las posiciones no cambian de un mes a otro).

Entradas internas (de la pestaña "Datos internos" del tablero, colección "cargas", convertidas con
cargas_a_archivos.py --dax ... --internos ... --fact-area ...):
  --internos  internos.json (comisiones, serie de facturación)       --dax  carpeta con dax_mes_unidad.txt
  --hist      hist_area.csv (AUM por área desde nov-19)               --fact-area  carpeta con fact_fondo_area_<Área>.csv|xlsx
  --tablero   carpeta del tablero (código + pbi_spec.js + pbi_img), p. ej. una copia del artifact

Uso:
  python3 actualizar_deck.py --mes 2026-10 --cafci CLON_RAMA_DATOS --tablero TABLERO --internos internos.json \
      --dax CARPETA_DAX --hist hist_area.csv --fact-area CARPETA
"""
import argparse, json, os, shutil, subprocess, sys, time
import pandas as pd

AQUI = os.path.dirname(os.path.abspath(__file__))
AREA_HIST = {"BLNZ": "Otros", "Academy Inversiones": "University Inversiones", "Productores": "Productores Exclusivos",
             "IB-Banca de Inversión": "Banca de Inversión", "Sales & Trading": "Mesa Sales & Trading", "Pyme": "PyME",
             "Institucionales No Regulados2": "Institucionales No Regulados 2"}


def fin_mes(m): return (pd.Period(m, "M").end_time).strftime("%Y-%m-%d")


def cortar_cafci(cafci, mes, dst):
    os.makedirs(os.path.join(dst, "procesado", "informe"), exist_ok=True); os.makedirs(os.path.join(dst, "informe"), exist_ok=True)
    for f in ("industria_ars.csv", "industria_usd.csv"):
        a = pd.read_csv(os.path.join(cafci, "procesado", "informe", f)); a[a.Fecha <= fin_mes(mes)].to_csv(os.path.join(dst, "procesado", "informe", f), index=False)
    shutil.copy(os.path.join(cafci, "procesado", "taxonomia.csv"), os.path.join(dst, "procesado"))
    shutil.copy(os.path.join(AQUI, "..", "build_data.py"), os.path.join(dst, "informe"))
    subprocess.run([sys.executable, os.path.join(dst, "informe", "build_data.py"), os.path.join(dst, "out")], check=True)
    return os.path.join(dst, "procesado", "informe", "industria_ars.csv"), os.path.join(dst, "out", "industria.json")


def sumar_mes_hist(hist, dax, mes):
    """Agrega (o reemplaza) el mes en hist_area.csv con el AUM por unidad de dax_mes_unidad.txt (millones de USD)."""
    H = pd.read_csv(hist, index_col=0)
    p = os.path.join(dax, "dax_mes_unidad.txt")
    if not os.path.exists(p): print("aviso: sin dax_mes_unidad.txt, hist_area queda como está"); return
    d = pd.read_csv(p, sep="\t", encoding="utf-8-sig")
    d.columns = [c.split("[")[-1].rstrip("]") if "[" in c else c for c in d.columns]
    d["m"] = pd.to_datetime(d["Fecha Mes"], format="mixed").dt.strftime("%Y-%m")
    x = d[d.m == mes]
    if x.empty: print(f"aviso: dax_mes_unidad.txt no trae {mes}"); return
    s = x.groupby(x.unidad.fillna("Otros").map(lambda u: AREA_HIST.get(u, u))).aum_orig.sum() / 1e6
    fila = pd.Series(0.0, index=H.columns)
    for k, v in s.items(): fila[k if k in fila.index else "Otros"] += v
    fila["Total"] = fila.drop("Total").sum()
    H.loc[mes] = fila; H.sort_index().to_csv(hist)
    print(f"hist_area: {mes} = USD {fila['Total']:,.0f} M")


def main():
    ap = argparse.ArgumentParser()
    for a in ("--mes", "--cafci", "--tablero", "--internos", "--dax", "--hist", "--fact-area"): ap.add_argument(a, required=a in ("--mes", "--cafci", "--tablero"))
    a = ap.parse_args()
    tmp = os.path.join(AQUI, "_tmp"); shutil.rmtree(tmp, ignore_errors=True)
    ars, ind = cortar_cafci(a.cafci, a.mes, tmp)
    # tablero con los datos al cierre del mes
    srv = os.path.join(tmp, "tablero"); shutil.copytree(a.tablero, srv); os.makedirs(os.path.join(srv, "data"), exist_ok=True)
    shutil.copy(ind, os.path.join(srv, "data", "industria.json"))
    if a.internos:
        I = json.load(open(a.internos, encoding="utf-8")); fm = fin_mes(a.mes)
        for k in ("comisiones", "comisiones_fondo"): I[k] = [r for r in I.get(k, []) if str(r["mes"]) <= fm]
        I["serie_facturacion"] = [r for r in I.get("serie_facturacion", []) if str(r["fecha"]) <= fm]
        json.dump(I, open(os.path.join(srv, "data", "internos.json"), "w", encoding="utf-8"), ensure_ascii=False)
    web = subprocess.Popen([sys.executable, "-m", "http.server", "8765"], cwd=srv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(1); subprocess.run([sys.executable, os.path.join(AQUI, "capturas_tablero.py")], check=True)
    finally:
        web.terminate()
    subprocess.run([sys.executable, os.path.join(AQUI, "gen_excel.py"), ars, fin_mes(a.mes)], check=True)
    if a.hist and a.internos:
        if a.dax: sumar_mes_hist(a.hist, a.dax, a.mes)
        subprocess.run([sys.executable, os.path.join(AQUI, "gen_internos.py"), a.hist, a.internos, a.fact_area or ".", a.mes], check=True)
    json.dump({"mes": a.mes, "graficos": sorted(f[:-4] for f in os.listdir(os.path.join(AQUI, "charts")) if f.endswith(".png"))},
              open(os.path.join(AQUI, "charts", "manifiesto.json"), "w"), indent=1)
    print("listo:", os.path.join(AQUI, "charts"))


if __name__ == "__main__":
    main()
