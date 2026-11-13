"""Publica la base en Parquet (procesado/parquet/) para consultarla con SQL directo por HTTP (DuckDB, Polars, pandas).

Archivos:
  fondos_mensual.parquet               todos los meses x fondo (mismo contenido que fondos_cafci_*.csv, con columna Mes)
  fondos.parquet                       catalogo: Codigo_CNV, fondo, gerente, categoria, clasificacion CAFCI, moneda, clases
  clases.parquet                       catalogo de clases: codigo_cafci, Codigo_CNV, clase, moneda, minimo, honorarios
  dolar.parquet                        dolar MEP y BCRA A3500 diario
  clases_diario/AAAA-MM.parquet        detalle diario por clase, un archivo por mes
  catalogo.json                        lista de URLs de todos los parquet (para read_parquet([...]))

Solo se reescribe un archivo si su contenido cambio, asi el historial del repo no crece con cada corrida.
"""
import glob, hashlib, io, json, os
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROC = os.path.join(BASE, "procesado"); OUT = os.path.join(PROC, "parquet")
URL = "https://raw.githubusercontent.com/mfriedB/cafci/main/procesado/parquet/"
os.makedirs(os.path.join(OUT, "clases_diario"), exist_ok=True)
cambios = 0

def guardar(df, rel):
    """Escribe el parquet solo si los datos cambiaron (comparando un hash del contenido)."""
    global cambios
    df = df.reset_index(drop=True)
    tabla = pa.Table.from_pandas(df, preserve_index=False).replace_schema_metadata(None)
    buf = io.BytesIO()
    pq.write_table(tabla, buf, compression="zstd", compression_level=9, row_group_size=200_000, write_statistics=True)
    nuevo = buf.getvalue(); ruta = os.path.join(OUT, rel)
    if os.path.exists(ruta) and hashlib.sha256(open(ruta, "rb").read()).digest() == hashlib.sha256(nuevo).digest():
        return
    open(ruta, "wb").write(nuevo); cambios += 1

NUM = ["vcp", "ccp", "patrimonio", "fx", "fx_planilla", "patrimonio_ars", "flujo_ars", "hon_sg", "hon_sd", "minimo_inversion", "plazo_liq",
       "comision_ingreso", "comision_rescate", "comision_transferencia", "gastos_gestion", "var_mes", "var_anio", "var_12m"]
ENT = ["codigo_cafci", "codigo_cnv", "cuota_referencia"]
TXT = ["fondo_clase", "fondo", "gerente", "clasificacion_cafci", "categoria_1816", "subcategoria_1816", "gerente_1816",
       "tipo_gerente", "fondo_1816", "moneda", "moneda_fondo", "horizonte",
       "decreto_596", "ley_27743", "tipo_dinero", "calificado", "region", "depositaria", "calificacion", "hon_exito", "indice_mm",
       "repatriacion", "tipo_escision", "id_cafci_padre", "id_cnv_padre"]

def tipos(d):
    """Mismo esquema en todos los meses (las planillas viejas no traen algunas columnas)."""
    for c in ENT: d[c] = pd.to_numeric(d.get(c), errors="coerce").astype("Int64")
    for c in NUM: d[c] = pd.to_numeric(d.get(c), errors="coerce").astype("float64")
    for c in TXT: d[c] = d.get(c, pd.Series(index=d.index, dtype="string")).astype("string")
    for c in ["fecha", "planilla", "fecha_ant"]: d[c] = pd.to_datetime(d.get(c), errors="coerce").dt.date
    return d[["fecha", "planilla", "fecha_ant"] + ENT + TXT + NUM]

def main():
    idx = json.load(open(os.path.join(PROC, "index.json")))
    # mensual por fondo
    M = []
    for e in idx["mensual"]:
        d = pd.read_csv(os.path.join(PROC, e["archivo"]))
        d.insert(0, "Mes", e["mes"]); d["Parcial"] = bool(e.get("parcial"))
        M.append(d)
    M = pd.concat(M, ignore_index=True)
    M["Codigo_CNV"] = pd.to_numeric(M.Codigo_CNV, errors="coerce").astype("Int64")
    for c in ["Categoria", "Subcategoria", "Fondo", "Gerente", "Fecha", "Tipo_Gerente", "Sociedad_Gerente", "Fondo_CAFCI",
              "Clasificacion_CAFCI"]:
        M[c] = M.get(c, pd.Series(index=M.index, dtype="string")).astype("string")
    guardar(M, "fondos_mensual.parquet")
    # detalle diario por mes + catalogos
    ult = []
    for f in sorted(glob.glob(os.path.join(PROC, "clases_diario", "*.csv.gz"))):
        mes = os.path.basename(f)[:7]
        d = tipos(pd.read_csv(f, low_memory=False))
        guardar(d, f"clases_diario/{mes}.parquet")
        ult.append(d.sort_values("fecha").drop_duplicates("codigo_cafci", keep="last"))
    C = pd.concat(ult).sort_values("fecha").drop_duplicates("codigo_cafci", keep="last")
    clases = C[["codigo_cafci", "codigo_cnv", "fondo_clase", "fondo", "gerente", "depositaria", "moneda", "moneda_fondo", "region", "horizonte",
                "clasificacion_cafci", "categoria_1816", "subcategoria_1816", "gerente_1816", "tipo_gerente", "fondo_1816",
                "cuota_referencia", "calificacion", "minimo_inversion", "calificado", "plazo_liq", "hon_sg", "hon_sd",
                "hon_exito", "comision_ingreso", "comision_rescate", "comision_transferencia", "gastos_gestion", "tipo_dinero",
                "ley_27743", "decreto_596", "id_cafci_padre", "id_cnv_padre", "tipo_escision", "fecha"]].rename(
        columns={"codigo_cnv": "Codigo_CNV", "fecha": "ultimo_dato"})
    guardar(clases.sort_values(["Codigo_CNV", "codigo_cafci"]), "clases.parquet")
    fondos = clases.groupby("Codigo_CNV").agg(fondo=("fondo", "first"), gerente=("gerente", "first"),
                                              categoria=("categoria_1816", "first"), subcategoria=("subcategoria_1816", "first"),
                                              gerente_1816=("gerente_1816", "first"), tipo_gerente=("tipo_gerente", "first"),
                                              fondo_1816=("fondo_1816", "first"), clasificacion_cafci=("clasificacion_cafci", "first"),
                                              moneda_fondo=("moneda_fondo", "first"), clases=("codigo_cafci", "count"),
                                              ultimo_dato=("ultimo_dato", "max")).reset_index()
    guardar(fondos, "fondos.parquet")
    if os.path.exists(os.path.join(PROC, "dolar.csv")):
        dl = pd.read_csv(os.path.join(PROC, "dolar.csv")); dl["fecha"] = pd.to_datetime(dl.fecha).dt.date
        guardar(dl, "dolar.parquet")
    if os.path.exists(os.path.join(PROC, "rendimientos.csv")):
        guardar(pd.read_csv(os.path.join(PROC, "rendimientos.csv")), "rendimientos.parquet")
    archivos = sorted(os.path.relpath(p, OUT).replace(os.sep, "/") for p in glob.glob(os.path.join(OUT, "**", "*.parquet"), recursive=True))
    cat = {"base_url": URL, "fondos_mensual": URL + "fondos_mensual.parquet", "fondos": URL + "fondos.parquet",
           "clases": URL + "clases.parquet", "dolar": URL + "dolar.parquet", "rendimientos": URL + "rendimientos.parquet",
           "clases_diario": [URL + a for a in archivos if a.startswith("clases_diario/")]}
    nuevo = json.dumps(cat, ensure_ascii=False, indent=1)
    p = os.path.join(OUT, "catalogo.json")
    if not os.path.exists(p) or open(p).read() != nuevo: open(p, "w").write(nuevo)
    print("parquet:", len(archivos), "archivos,", cambios, "actualizados")

if __name__ == "__main__":
    main()
