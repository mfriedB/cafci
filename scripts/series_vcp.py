"""Series de valor de cuotaparte por clase, para que /api/vcp responda rapido y con toda la historia.

Lee el detalle diario por clase (procesado/clases_diario/AAAA-MM.csv.gz) y deja en procesado/vcp/:
  <codigo_cafci>.csv.gz   una linea por dia: fecha,vcp (sin encabezado, ordenado por fecha, solo vcp > 0)
  clases.csv              codigo_cafci, codigo_cnv, cuota, moneda, desde, hasta, dias (nombre y moneda del ultimo dato)
Solo reescribe los archivos que cambiaron (gzip sin fecha: mismo contenido = mismos bytes).
"""
import glob, gzip, os
import pandas as pd

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROC = os.path.join(BASE, "procesado")
OUT = os.path.join(PROC, "vcp")
COLS = ["fecha", "codigo_cafci", "codigo_cnv", "fondo_clase", "moneda", "vcp"]


def escribir(ruta, datos: bytes):
    if os.path.exists(ruta) and open(ruta, "rb").read() == datos:
        return 0
    open(ruta, "wb").write(datos)
    return 1


def main():
    os.makedirs(OUT, exist_ok=True)
    partes = []
    for f in sorted(glob.glob(os.path.join(PROC, "clases_diario", "*.csv.gz"))):
        d = pd.read_csv(f, usecols=lambda c: c in COLS, dtype={"fondo_clase": "string", "moneda": "string"}, low_memory=False)
        partes.append(d)
    D = pd.concat(partes, ignore_index=True)
    D["vcp"] = pd.to_numeric(D.vcp, errors="coerce")
    D["codigo_cafci"] = pd.to_numeric(D.codigo_cafci, errors="coerce")
    D = D[D.codigo_cafci.notna() & (D.vcp > 0)].copy()
    D["codigo_cafci"] = D.codigo_cafci.astype("int64")
    D["fecha"] = D.fecha.astype(str).str[:10]
    D = D.sort_values(["codigo_cafci", "fecha"]).drop_duplicates(["codigo_cafci", "fecha"], keep="last")

    cambios = 0; cat = []
    for cafci, g in D.groupby("codigo_cafci", sort=True):
        txt = "".join(f"{f},{float(v)!r}\n" for f, v in zip(g.fecha, g.vcp))
        cambios += escribir(os.path.join(OUT, f"{cafci}.csv.gz"), gzip.compress(txt.encode(), compresslevel=9, mtime=0))
        u = g.iloc[-1]
        cat.append({"codigo_cafci": cafci, "codigo_cnv": pd.to_numeric(u.codigo_cnv, errors="coerce"), "cuota": u.fondo_clase,
                    "moneda": u.moneda, "desde": g.fecha.iloc[0], "hasta": g.fecha.iloc[-1], "dias": len(g)})
    C = pd.DataFrame(cat)
    C["codigo_cnv"] = C.codigo_cnv.astype("Int64")
    cambios += escribir(os.path.join(OUT, "clases.csv"), C.to_csv(index=False, lineterminator="\n").encode())
    print(f"Series VCP: {len(C)} clases, {len(D):,} filas, {cambios} archivos nuevos o modificados")


if __name__ == "__main__":
    main()
