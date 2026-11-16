"""Arma los datos del tablero "Informe de Gestion FCI" (artifact) en formato compacto.

Uso: python3 build_data.py SALIDA [CARPETA_INTERNOS]
  - industria: procesado/informe/industria_ars.csv y industria_usd.csv del repo (los baja de GitHub si no estan local)
  - internos: los .json que genera internos.py (opcional)
Salida: SALIDA/industria.json y SALIDA/internos.json
"""
import io, json, os, sys, urllib.request
import pandas as pd

RAW = "https://raw.githubusercontent.com/mfriedB/cafci/main/procesado/informe/"
AQUI = os.path.dirname(os.path.abspath(__file__))
LOCAL = os.path.join(os.path.dirname(AQUI), "procesado", "informe")


def leer(nombre, sub="informe"):
    p = os.path.join(os.path.dirname(LOCAL), sub, nombre) if sub else os.path.join(os.path.dirname(LOCAL), nombre)
    if os.path.exists(p): return pd.read_csv(p)
    url = RAW.replace("/informe/", "/" + (sub + "/" if sub else ""))
    with urllib.request.urlopen(url + nombre, timeout=180) as r: return pd.read_csv(io.BytesIO(r.read()))


def pendientes(A):
    """Fondos con patrimonio en el ultimo mes que no estan en la tabla de 1816 (clasificados por regla o sin clasificar)."""
    try: t = leer("taxonomia.csv", sub="")
    except Exception as e:
        print("aviso: sin taxonomia.csv", e); return []
    t = t[~t.fuente_tax.astype(str).isin(["1816", "manual"])]
    alta = A.groupby("Codigo_CNV").Fecha.min()
    ult = A[A.Fecha == A.Fecha.max()].groupby("Codigo_CNV").AUM_Final.sum()
    out = []
    for _, r in t.iterrows():
        aum = float(ult.get(r.Codigo_CNV, 0) or 0)
        if aum <= 0: continue
        val = lambda x: "" if pd.isna(x) else str(x)
        out.append({"cnv": int(r.Codigo_CNV), "fondo": val(r.fondo), "gerente": val(r.Gerente_1816) or val(r.gerente),
                    "tipo": val(r.Tipo_1816), "subtipo": val(r.Subtipo_1816), "cafci": val(r.clasificacion_cafci),
                    "fuente": val(r.fuente_tax), "alta": str(alta.get(r.Codigo_CNV, ""))[:10], "aum": round(aum, 2)})
    return sorted(out, key=lambda x: (x["alta"], x["aum"]), reverse=True)


# Call de Fondos, slide "Fondos ARS - short duration YTD": rendimiento acumulado diario del anio de estas clases
CLASES_YTD = [(1115, "Balanz Capital Ahorro B"), (3357, "Balanz Capital Money Market C"),
              (5580, "Balanz Crédito Privado C"), (3671, "Balanz Lecaps A")]


def rend_ytd(meses):
    anio = meses[-1][:4]; ms = [str(int(anio) - 1) + "-12"] + [m for m in meses if m.startswith(anio)]
    cod = [c for c, _ in CLASES_YTD]; partes = []
    for m in ms:
        try: d = leer(m + ".csv.gz", sub="clases_diario") if os.path.exists(os.path.join(os.path.dirname(LOCAL), "clases_diario", m + ".csv.gz")) \
            else pd.read_csv(RAW.replace("/informe/", "/clases_diario/") + m + ".csv.gz")
        except Exception as e:
            print("aviso: sin clases_diario", m, e); continue
        partes.append(d[d.codigo_cafci.isin(cod)][["fecha", "codigo_cafci", "vcp"]])
    if not partes: return {}
    d = pd.concat(partes); d = d[d.vcp > 0].sort_values("fecha")
    W = d.pivot_table(index="fecha", columns="codigo_cafci", values="vcp", aggfunc="last").sort_index().ffill()
    base = W[W.index < anio + "-01-01"]
    if base.empty: return {}
    W = W[W.index >= anio + "-01-01"]; b = base.iloc[-1]
    return {"fechas": [str(x)[:10] for x in W.index],
            "series": [{"n": n, "v": [round(float(v), 5) for v in (W[c] / b[c] - 1).fillna(0)]} for c, n in CLASES_YTD if c in W]}


def columnar(df, dic, desde=None, dec=3):
    if desde: df = df[df.Fecha.str[:7] >= desde]
    out = {"m": df.Fecha.str[:7].map(dic["mes_idx"]).astype(int).tolist()}
    for k, c in [("c", "Categoria"), ("s", "Subcategoria"), ("n", "Fondo"), ("g", "Gerente")]:
        out[k] = df[c].fillna("").map(dic[k + "_idx"]).astype(int).tolist()
    for k, c in [("aP", "AUM_promedio"), ("aI", "AUM_Inicial"), ("aF", "AUM_Final"), ("su", "Susc_Netas"),
                 ("fg", "Facturacion_Gerente"), ("fd", "Facturacion_Depo")]:
        out[k] = [round(float(x), dec) for x in df[c].fillna(0.0)]
    return out


def main():
    salida = sys.argv[1]; internos = sys.argv[2] if len(sys.argv) > 2 else None
    os.makedirs(salida, exist_ok=True)
    A = leer("industria_ars.csv"); U = leer("industria_usd.csv")
    for d in (A, U): d["Fecha"] = d.Fecha.astype(str)
    meses = sorted(set(A.Fecha.str[:7]))
    fecha_mes = A.groupby(A.Fecha.str[:7]).Fecha.max().to_dict()
    dic = {"mes_idx": {m: i for i, m in enumerate(meses)}}
    listas = {}
    for k, c in [("c", "Categoria"), ("s", "Subcategoria"), ("n", "Fondo"), ("g", "Gerente")]:
        vals = sorted(set(A[c].fillna("")) | set(U[c].fillna("")))
        listas[k] = vals; dic[k + "_idx"] = {v: i for i, v in enumerate(vals)}
    data = {"generado": pd.Timestamp.now(tz="America/Argentina/Buenos_Aires").isoformat(timespec="minutes"),
            "meses": meses, "fecha_mes": [fecha_mes[m] for m in meses], "dic": listas,
            "ars": columnar(A, dic, dec=2), "usd": columnar(U, dic, desde="2024-12", dec=4), "pendientes": pendientes(A),
            "rend_ytd": rend_ytd(meses)}
    json.dump(data, open(os.path.join(salida, "industria.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    I = {}
    if internos and os.path.isdir(internos):
        for k in ["comisiones", "comisiones_fondo", "serie_facturacion", "cuotapartistas", "contrapartes"]:
            p = os.path.join(internos, k + ".json")
            if os.path.exists(p): I[k] = json.load(open(p, encoding="utf-8"))
    I["generado"] = data["generado"]
    json.dump(I, open(os.path.join(salida, "internos.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("industria.json", len(data["ars"]["m"]), "filas ARS,", len(data["usd"]["m"]), "USD, meses", meses[0], "-", meses[-1],
          "| pendientes:", len(data["pendientes"]), "| internos:", [k for k in I if k != "generado"])


if __name__ == "__main__":
    main()
