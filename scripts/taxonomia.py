"""Taxonomia 1816 para todos los fondos CAFCI/CNV.

Base: mapeo/taxonomia_1816.csv (Codigo_CNV -> Tipo/Subtipo/Gerente/Tipo de gerente, relevado una vez de 1816)
      mapeo/clases_1816.csv    (codigo_cafci -> cuota 1816 y si es la "cuota de referencia" de 1816)
Fondos que no estan en la tabla (nuevos) se clasifican solos, sin 1816:
  1. escisiones: heredan la clasificacion del fondo padre (id_cnv_padre de la planilla CNV)
  2. palabras clave del nombre (Pymes, Infraestructura, ASG)
  3. voto mayoritario de los fondos ya clasificados con los mismos atributos CAFCI
     (clasificacion CAFCI, moneda, region, horizonte, plazo de liquidacion), de lo mas especifico a lo mas general
  Gerente corto y tipo de gerente: el de los otros fondos de la misma sociedad gerente.
  Cuota de referencia: la de 1816; si no hay, la clase con mayor patrimonio.
"""
import os, re, unicodedata
import pandas as pd

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAPEO = os.path.join(BASE, "mapeo")
TIPO = {"MM": "Money Market", "RF": "Renta Fija", "RM": "Renta Mixta", "RV": "Renta Variable", "T+1": "T+1",
        "PYME": "Destino Esp.", "INFRA": "Destino Esp.", "ASG": "Destino Esp.", "En Liq Esp": "En liq/Resc especie"}
NIVELES = [["clasificacion_cafci", "moneda_fondo", "region", "horizonte", "plazo_liq"],
           ["clasificacion_cafci", "moneda_fondo", "region", "horizonte"],
           ["clasificacion_cafci", "moneda_fondo", "region"],
           ["clasificacion_cafci", "moneda_fondo"],
           ["clasificacion_cafci"]]


def _n(s):
    return unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()


def tipo_de(sub):
    return TIPO.get(sub) or TIPO.get(str(sub).split(" ")[0], "Otros")


def _palabras(nombre):
    n = _n(nombre)
    if re.search(r"\bpymes?\b", n): return "PYME"
    if re.search(r"\binfra", n): return "INFRA"
    if re.search(r"\basg\b|sustentable", n): return "ASG"
    return None


def clasificar(meta):
    """meta: una fila por Codigo_CNV con fondo, gerente, clasificacion_cafci, moneda_fondo, region, horizonte,
    plazo_liq, id_cnv_padre. Devuelve meta + Tipo_1816, Subtipo_1816, Gerente_1816, Tipo_Gerente_1816, fuente_tax."""
    tax = pd.read_csv(os.path.join(MAPEO, "taxonomia_1816.csv"))
    m = meta.merge(tax, on="Codigo_CNV", how="left")
    m["fuente_tax"] = m.Subtipo_1816.notna().map({True: "1816", False: None})
    conocidos = m[m.Subtipo_1816.notna()]
    sub = conocidos.set_index("Codigo_CNV").Subtipo_1816
    # gerente corto / tipo por sociedad gerente
    g = conocidos.groupby("gerente").agg(G=("Gerente_1816", lambda s: s.mode().iat[0]),
                                        T=("Tipo_Gerente_1816", lambda s: s.mode().iat[0]))
    falt = m.Subtipo_1816.isna()
    for i in m.index[falt]:
        r = m.loc[i]; s = None; fu = None
        p = pd.to_numeric(r.get("id_cnv_padre"), errors="coerce")
        if pd.notna(p) and int(p) in sub.index: s, fu = sub[int(p)], "regla: fondo padre"
        if s is None:
            s = _palabras(r.fondo); fu = "regla: nombre" if s else None
        if s is None:
            for niv in NIVELES:
                q = conocidos
                for c in niv: q = q[q[c] == r[c]]
                if len(q):
                    s, fu = q.Subtipo_1816.mode().iat[0], "regla: " + "+".join(niv); break
        m.loc[i, ["Subtipo_1816", "fuente_tax"]] = [s or "Sin clasificar", fu or "sin datos"]
        m.loc[i, "Tipo_1816"] = tipo_de(s) if s else "Otros"
        if r.gerente in g.index:
            m.loc[i, ["Gerente_1816", "Tipo_Gerente_1816"]] = g.loc[r.gerente, ["G", "T"]].values
        else:
            corto = re.sub(r"\b(s\.?a\.?u?|s\.g\.f\.c\.i\.?|sgfci|asset management|administradora|de|fondos|comunes|inversion)\b\.?", " ",
                           str(r.gerente), flags=re.I)
            m.loc[i, ["Gerente_1816", "Tipo_Gerente_1816"]] = [re.sub(r"\s+", " ", corto).strip(" .,") or r.gerente, "Independiente"]
    return m


def referencia(clases):
    """clases: codigo_cafci, Codigo_CNV, patrimonio (ultimo). Marca la cuota de referencia (1816 o la mas grande)."""
    ref = pd.read_csv(os.path.join(MAPEO, "clases_1816.csv"))
    c = clases.merge(ref[["codigo_cafci", "Cuota_1816", "Referencia_1816"]], on="codigo_cafci", how="left")
    tiene = c.groupby("Codigo_CNV").Referencia_1816.transform(lambda s: (s == 1).any())
    mayor = c.patrimonio.fillna(-1) == c.groupby("Codigo_CNV").patrimonio.transform(lambda s: s.fillna(-1).max())
    c["referencia"] = ((c.Referencia_1816 == 1) | (~tiene & mayor)).astype(int)
    # si varias empatan en la mas grande, quedarse con una
    dup = (~tiene) & c.referencia.eq(1) & c.duplicated(["Codigo_CNV", "referencia"])
    c.loc[dup, "referencia"] = 0
    return c.drop(columns=["Referencia_1816"])
