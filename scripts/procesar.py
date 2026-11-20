"""Procesa las Planillas Diarias oficiales (raw/cnv/*.xlsx) al formato de la base de 1816.

Salidas (procesado/):
  clases_diario/AAAA-MM.csv.gz        una fila por clase y fecha de planilla
  fondos_cafci_AAAA-MM-DD.csv         una fila por fondo y mes, mismas columnas que fondos_para_looker_*.csv
  index.json                          lista de archivos disponibles (para consumir como API)

Metodologia (montos en millones de ARS, como 1816):
  - Suscripciones netas del dia = (cuotapartes hoy - cuotapartes dia anterior) x valor de cuotaparte de hoy.
  - Clases en dolares: se pasan a pesos con el promedio de dolar MEP y CCL del dia (como 1816); con
    config.json "tipo_cambio": "mep" se usa solo el MEP. Serie en procesado/dolar.csv.
    Se guarda tambien el implicito de la planilla (fx_planilla, igual al BCRA A3500).
  - AUM_Inicial / AUM_Final: patrimonio al cierre del mes anterior y del mes (o ultima fecha disponible).
  - Rendimiento = AUM_Final - AUM_Inicial - Suscripciones netas.
  - AUM_promedio: promedio por dia calendario (fines de semana y feriados repiten el ultimo dato).
  - Facturacion: honorario anual de la planilla (SG y SD, % sobre patrimonio) x patrimonio diario / 365.
  - Se excluyen fondos cerrados y fondos del Decreto 596 (igual que la vista de 1816).
"""
import glob, gzip, json, os, re
from datetime import date, datetime, timedelta, timezone
import openpyxl
import pandas as pd
import sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import taxonomia

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(BASE, "raw", "cnv"); PROC = os.path.join(BASE, "procesado")
CFG = json.load(open(os.path.join(BASE, "config.json"))) if os.path.exists(os.path.join(BASE, "config.json")) else {}
os.makedirs(os.path.join(PROC, "clases_diario"), exist_ok=True)

COLS = {0: "fondo_clase", 1: "moneda", 2: "region", 3: "horizonte", 4: "fecha_txt", 5: "vcp", 6: "vcp_ant", 8: "vcp_reexp_ars",
        12: "ccp", 13: "ccp_ant", 14: "patrimonio", 15: "patrimonio_ant", 17: "depositaria", 18: "codigo_cnv", 20: "codigo_cafci",
        23: "gerente", 24: "codigo_clasificacion", 30: "hon_sg", 31: "hon_sd", 36: "moneda_fondo", 37: "plazo_liq",
        38: "decreto_596", 43: "minimo_inversion", 44: "ley_27743", 45: "tipo_dinero", 46: "calificado"}

import unicodedata
def _n(x): return unicodedata.normalize("NFKD", str(x or "")).encode("ascii", "ignore").decode().lower().strip()
# (grupo de la fila 8, subencabezado de la fila 9 o None, orden dentro del grupo) -> nombre interno
BUSCAR = {"fondo_clase": ("fondo", None, 0), "moneda": ("clasificacion", "moneda", 0), "region": ("clasificacion", "region", 0),
          "horizonte": ("clasificacion", "horizonte", 0), "fecha_txt": ("fecha", None, 0), "vcp": ("valor (mil cuotapartes)", "actual", 0),
          "vcp_ant": ("valor (mil cuotapartes)", None, 1), "vcp_reexp_ars": ("valor (mil cuotapartes)", "reexp", 0),
          "ccp": ("cantidad de cuotapartes", "actual", 0), "ccp_ant": ("cantidad de cuotapartes", None, 1),
          "patrimonio": ("patrimonio", "actual", 0), "patrimonio_ant": ("patrimonio", None, 1), "depositaria": ("sociedad depositaria", None, 0),
          "codigo_cnv": ("codigo cnv", None, 0), "codigo_cafci": ("codigo cafci", None, 0), "gerente": ("sociedad gerente", None, 0),
          "codigo_clasificacion": ("codigo de clasificacion", None, 0), "hon_sg": ("honorarios adm. sg", None, 0), "hon_sd": ("honorarios adm. sd", None, 0),
          "moneda_fondo": ("moneda fondo", None, 0), "plazo_liq": ("plazo liq", None, 0), "decreto_596": ("decreto 596", None, 0),
          "minimo_inversion": ("minimo de inversion", None, 0), "ley_27743": ("regularizacion", None, 0), "tipo_dinero": ("tipo de dinero", None, 0),
          "calificado": ("calificado", None, 0), "calificacion": ("calificacion", None, 0),
          "comision_ingreso": ("comision ingreso", None, 0), "comision_rescate": ("comision rescate", None, 0),
          "comision_transferencia": ("comision transferencia", None, 0), "gastos_gestion": ("gastos ord gestion", None, 0),
          "hon_exito": ("honorarios exito", None, 0), "indice_mm": ("indice de mm", None, 0), "repatriacion": ("repatriacion", None, 0),
          "tipo_escision": ("tipo de escision", None, 0), "id_cafci_padre": ("id fondo cafci padre", None, 0),
          "id_cnv_padre": ("id fondo cnv padre", None, 0), "var_mes": ("variacion cuotaparte %", None, 0),
          "var_anio": ("variacion cuotaparte %", None, 1), "var_12m": ("variacion cuotaparte %", None, 2)}

def columnas(rows):
    """Ubica cada columna por su encabezado (las planillas viejas tienen otro orden); si no aparece usa la posicion actual."""
    g, grupos = "", []
    for v in rows[7]:
        if v is not None: g = _n(v)
        grupos.append(g)
    subs = [_n(v) for v in rows[8]]
    out = {}
    for nombre, (grp, sub, k) in BUSCAR.items():
        idx = [i for i, gg in enumerate(grupos) if gg.startswith(grp)]
        if sub: idx = [i for i in idx if subs[i].startswith(sub)] or ([i for i in idx][k:k + 1] if k else [])
        elif k: idx = idx[k:k + 1]
        if idx: out[idx[0]] = nombre
    faltan = set(BUSCAR) - set(out.values())
    for i, nombre in COLS.items():
        if nombre in faltan and i not in out: out[i] = nombre
    return out

def leer(path):
    ws = openpyxl.load_workbook(path, read_only=True, data_only=True).active
    rows = list(ws.iter_rows(values_only=True))
    cols = columnas(rows)
    ic = {v: k for k, v in cols.items()}
    try:
        fecha_ant = datetime.strptime(str(rows[8][ic["vcp_ant"]]), "%d/%m/%y").date()
    except ValueError:
        fecha_ant = None          # algunas planillas no traen la fecha del dia anterior en el encabezado
    out, clasif = [], None
    for r in rows[10:]:
        if r[0] and all(v is None for v in r[1:6]):
            clasif = str(r[0]).strip(); continue
        if not r[0] or not r[ic["fecha_txt"]] or r[ic["codigo_cafci"]] is None: continue
        d = {v: (r[k] if k < len(r) else None) for k, v in cols.items()}
        d["clasificacion_cafci"] = clasif
        out.append(d)
    df = pd.DataFrame(out)
    df["fecha"] = pd.to_datetime(df.fecha_txt, format="%d/%m/%y").dt.date
    df["fecha_ant"] = fecha_ant
    fp = df.fecha.mode()[0]
    # algunos fondos (p.ej. Fima Premium) informan con 1-3 dias de rezago: se toma su ultimo dato
    # disponible (hasta 7 dias) como valor de esa planilla; fechas mas viejas = fondos suspendidos
    df = df[(df.fecha <= fp) & (df.fecha >= fp - timedelta(days=7))].copy()
    df["fecha_dato"] = df.fecha
    df["fecha"] = fp
    return fp, df

def limpiar(D):
    """Saca datos puntuales erroneos de la planilla: un dia en que la clase informa patrimonio, cuotapartes o
    valor de cuotaparte que salta mas de 40% y al dia siguiente vuelve (o informa 0 entre dos dias con dato)."""
    for c in ["vcp", "ccp", "patrimonio"]: D[c] = pd.to_numeric(D[c], errors="coerce")
    D = D.sort_values(["codigo_cafci", "fecha"])
    total = 0
    for _ in range(3):
        malo = pd.Series(False, index=D.index)
        g = D.groupby("codigo_cafci")
        # un dato coherente (patrimonio = cuotapartes x VCP / 1000) con VCP sin salto es un flujo real de ida y vuelta
        # (ej. suscripcion grande el ultimo dia del mes y rescate al dia siguiente): NO se descarta (1816 lo cuenta)
        coherente = (D.patrimonio - D.ccp * D.vcp / 1000).abs() <= 0.02 * D.patrimonio.abs().clip(lower=1)
        for c in ["patrimonio", "ccp", "vcp"]:
            x = D[c]; a = g[c].shift(); b = g[c].shift(-1)
            ok = (a > 0) & (b > 0)
            r1, r2 = x / a, b / x.where(x != 0)
            salto = ok & (((r1 < 0.6) & (r2 > 1.6)) | ((r1 > 1.6) & (r2 < 0.6)) | (x <= 0))
            salto &= ((b / a) - 1).abs() < 0.25            # vuelve a un nivel parecido al anterior
            if c != "vcp": salto &= ~coherente | (x <= 0)
            malo |= salto.fillna(False)
        if not malo.any(): break
        total += int(malo.sum()); D = D[~malo]
    print("datos puntuales descartados:", total)
    return D

def superposicion_clases(D):
    """Clase nueva de un fondo que ya informa (migracion de clase, ej. Lombard Renta en Pesos 17/11/2026 Clase A ->
    Clase B): la planilla en que aparece la clase nueva trae en "dia anterior" el traspaso ya hecho (B con casi todo,
    A con el resto), pero el dato de la clase vieja de ese dia viene de su propia planilla (todavia con todo). Mezclar
    las dos versiones cuenta el fondo dos veces ese dia en el patrimonio y el AUM promedio (1816 no lo hace).
    Se descarta el dato reconstruido de la clase nueva para un dia anterior a su primera planilla propia cuando otra
    clase del mismo fondo ya informo ese dia en su propia planilla: la clase nueva entra el dia en que aparece."""
    S = D[["prio", "codigo_cafci", "fecha", "codigo_cnv"]]       # solo las columnas que se usan (no copiar el panel entero)
    propio = S[S.prio == 1]
    primera = propio.groupby("codigo_cafci").fecha.min()
    rec = S[(S.prio == 0) & S.codigo_cnv.notna()]
    p = rec.codigo_cafci.map(primera)
    rec = rec[p.notna() & (pd.to_datetime(rec.fecha) < pd.to_datetime(p))]
    otras = propio[propio.codigo_cnv.notna()][["codigo_cnv", "fecha", "codigo_cafci"]]
    m = rec.reset_index().merge(otras, on=["codigo_cnv", "fecha"], suffixes=("", "_otra"))
    m = m[m.codigo_cafci != m.codigo_cafci_otra]
    fuera = set(m["index"])
    if fuera:
        print("dias reconstruidos de clases nuevas descartados (superposicion con otra clase del fondo):", len(fuera))
    return D.drop(index=list(fuera)) if fuera else D

def migraciones(D):
    """Bajas de clases: se agrega un dato con cuotapartes y patrimonio en 0 el dia siguiente al ultimo informado.
    - Clase que deja de informar mientras el fondo sigue con otras clases (migracion, ej. Galicia 28/08/2026 Clase I ->
      Clase C): la salida de la clase vieja compensa la entrada a la nueva (si no, el fondo suma la entrada y no la salida).
    - Fondo entero que deja de informar (liquidacion, fusion): su patrimonio sale como rescate (igual que 1816)."""
    D = D.sort_values(["codigo_cafci", "fecha"])
    ult = D.groupby("codigo_cafci").tail(1)
    ult = ult[(pd.to_numeric(ult.ccp, errors="coerce") > 0) & ult.codigo_cnv.notna()]
    fechas_f = D.groupby("codigo_cnv").fecha.apply(lambda s: sorted(set(s)))
    todas = sorted(set(D.fecha)); fmax = todas[-1]
    nuevos = []
    for _, r in ult.iterrows():
        fs = fechas_f.get(r.codigo_cnv, [])
        sig = [f for f in fs if f > r.fecha]
        if not sig:                               # el fondo entero dejo de informar (liquidacion, fusion, baja)
            if (pd.Timestamp(fmax) - pd.Timestamp(r.fecha)).days < 10: continue  # puede ser rezago: esperar
            sig = [f for f in todas if f > r.fecha]   # salida el dia habil siguiente (como 1816: rescate)
            if not sig: continue
        elif (pd.Timestamp(sig[-1]) - pd.Timestamp(r.fecha)).days < 7: continue   # puede ser rezago de la clase
        n = r.copy(); n["fecha"] = sig[0]; n["fecha_dato"] = sig[0]; n["ccp"] = 0; n["patrimonio"] = 0; n["ccp_ant"] = None
        nuevos.append(n)
    if nuevos:
        D = pd.concat([D, pd.DataFrame(nuevos)], ignore_index=True)
        print("clases que dejaron de informar con el fondo activo (salida registrada):", len(nuevos))
    return D


def categoria_1816(r):
    c = r.clasificacion_cafci or ""
    if c.startswith(("Mercado de Dinero", "Plazo Fijo")): return "Money Market"   # "Plazo Fijo" = nombre viejo (hasta 2021)
    if c.startswith("Renta Variable"): return "Renta Variable"
    if c.startswith("Renta Mixta") or c.startswith("Retorno Total"): return "Renta Mixta"
    if c.startswith(("PyMes", "Infraestructura", "ASG", "RG900")): return "Destino Esp."
    if c.startswith("Renta Fija"):
        if r.moneda_fondo == "ARS" and str(r.horizonte).startswith("Cor") and (pd.to_numeric(r.plazo_liq, errors="coerce") or 9) <= 1:
            return "T+1"
        return "Renta Fija"
    return None   # Fondos Cerrados u otros

def nombre_fondo(s):
    return re.sub(r"\s*-\s*Clase\s+[A-Z0-9]+.*$", "", str(s)).strip()

SOLO_LEER = "--solo-leer" in __import__("sys").argv
# Corrida incremental: MESES_PROCESAR=N reprocesa solo los ultimos N meses (mas un mes previo de arrastre que no se
# publica: da el patrimonio inicial, las altas y las migraciones del primer mes) y conserva lo publicado del resto.
# Sin la variable (o 0) se reprocesa toda la historia: hace falta cuando cambia el codigo o la clasificacion (mapeo/).
MESES_PROCESAR = int(os.environ.get("MESES_PROCESAR") or 0)

def ventana_incremental(files):
    """(primer mes que se publica, primer dia que se lee) o None si corresponde la historia completa."""
    if not MESES_PROCESAR or not os.path.exists(os.path.join(PROC, "index.json")) or not os.path.exists(os.path.join(PROC, "taxonomia.csv")):
        return None
    ult = max(datetime.strptime(os.path.basename(f)[:8], "%Y%m%d").date() for f in files)
    p0 = pd.Period(ult, "M") - (MESES_PROCESAR - 1)
    return p0, (p0 - 1).start_time.date()

def main():
    files = sorted(glob.glob(os.path.join(RAW, "*_Planilla_Diaria_A.xlsx")))
    ventana = None if SOLO_LEER else ventana_incremental(files)
    if ventana:
        files = [f for f in files if datetime.strptime(os.path.basename(f)[:8], "%Y%m%d").date() >= ventana[1]]
        print(f"corrida incremental: se publican los meses desde {ventana[0]} (se leen {len(files)} planillas desde {ventana[1]})")
    else:
        print("corrida completa: toda la historia" if not SOLO_LEER else "lectura de planillas")
    dfs = []
    cache = os.path.join(BASE, "raw", "parsed"); os.makedirs(cache, exist_ok=True)
    for f in files:
        pk = os.path.join(cache, os.path.basename(f) + ".v3.pkl.gz")     # lectura cacheada (las planillas no cambian)
        if os.path.exists(pk) and os.path.getmtime(pk) >= os.path.getmtime(f):
            df = pd.read_pickle(pk)
        else:
            try:
                fp, df = leer(f); df.to_pickle(pk); print("leido", os.path.basename(f), fp, len(df))
            except Exception as e:
                print("NO SE PUDO LEER", os.path.basename(f), repr(e)); continue
        if SOLO_LEER: continue
        for c in df.columns:                     # textos en formato arrow: ocupan mucha menos memoria (historial completo)
            if df[c].dtype == object and c not in ("fecha", "fecha_dato", "fecha_ant"): df[c] = df[c].astype("string[pyarrow]")
        dfs.append(df)
    if SOLO_LEER:
        print("planillas leidas y cacheadas:", len(files)); return
    D = pd.concat(dfs, ignore_index=True); del dfs
    # Panel por FECHA DEL DATO (como 1816): si un fondo informa con rezago, su dato del dia t aparece en la
    # planilla de t+1; se toma esa version (la de la planilla mas nueva que lo contenga).
    D = D.rename(columns={"fecha": "planilla"})
    D["prio"] = 1
    # Dias sin planilla propia (ej. 30/06/2026): se reconstruyen con las columnas "dia anterior" de la planilla
    # siguiente (valor de cuotaparte, cuotapartes y patrimonio a la fecha del encabezado). Prioridad menor.
    ya = pd.MultiIndex.from_arrays([D.codigo_cafci, D.fecha_dato])
    falta = ~pd.MultiIndex.from_arrays([D.codigo_cafci, D.fecha_ant]).isin(ya)
    A = D[(D.fecha_dato == D.planilla) & D.fecha_ant.notna() & falta].copy()     # solo dias que faltan
    del ya, falta
    A["fecha_dato"] = A.fecha_ant
    for a, b in [("vcp", "vcp_ant"), ("ccp", "ccp_ant"), ("patrimonio", "patrimonio_ant")]: A[a] = A[b]
    A[["vcp_ant", "ccp_ant", "patrimonio_ant", "vcp_reexp_ars"]] = None
    A["prio"] = 0
    D = pd.concat([D, A], ignore_index=True); del A
    # mismo resultado que sort_values(["prio", "planilla"]).drop_duplicates(..., keep="last") pero ordenando solo las
    # columnas clave: el panel completo se copia una sola vez (con la historia entera la memoria del runner no alcanzaba)
    orden = D[["prio", "planilla", "codigo_cafci", "fecha_dato"]].sort_values(["prio", "planilla"])
    D = D.loc[orden.drop_duplicates(["codigo_cafci", "fecha_dato"], keep="last").index]; del orden
    D["fecha"] = D.fecha_dato
    # codigo CNV de cada clase = el ultimo informado: en las primeras planillas de una clase nueva a veces viene vacio
    # o con otro codigo (ej. Mills M1000 Balanceado Pesos, 04-05/05/2026, con codigo 73); si no, la suscripcion
    # inicial queda en otro fondo
    cn = pd.to_numeric(D.codigo_cnv, errors="coerce")
    orden = pd.DataFrame({"c": D.codigo_cafci.values, "f": D.fecha.values, "n": cn.values}).dropna(subset=["n"]).sort_values("f")
    mapa = orden.drop_duplicates("c", keep="last").set_index("c").n
    D["codigo_cnv"] = D.codigo_cafci.map(mapa).where(D.codigo_cafci.isin(mapa.index), cn).round().astype("Int64")
    D = superposicion_clases(D)
    D = limpiar(D)
    D = migraciones(D)
    for c in ["vcp", "vcp_ant", "vcp_reexp_ars", "ccp", "ccp_ant", "patrimonio", "patrimonio_ant", "hon_sg", "hon_sd"]:
        D[c] = pd.to_numeric(D[c], errors="coerce").fillna(0.0)
    D["fondo"] = D.fondo_clase.map(nombre_fondo)
    # universo de fondos (abiertos; igual que 1816) por la clasificacion CAFCI; dentro de el, taxonomia 1816
    # (tipo, subtipo, gerente corto, tipo de gerente) desde mapeo/ o por regla para fondos nuevos (scripts/taxonomia.py)
    # (depende solo de 4 columnas: se evalua una fila por combinacion distinta en vez de las millones del panel)
    h = pd.util.hash_pandas_object(D[["clasificacion_cafci", "moneda_fondo", "horizonte", "plazo_liq"]], index=False)
    uno = ~h.duplicated()
    univ = h.map(pd.Series(D.loc[uno].apply(categoria_1816, axis=1).notna().values, index=h[uno].values)).astype(bool)
    del h, uno
    # datos del fondo = los de su ultimo dia, de la clase en la moneda del fondo y la mas grande (desempate fijo: antes,
    # con varias clases el mismo dia, dependia del orden de las filas y una clase en otra moneda podia dar otra
    # clasificacion CAFCI, ej. "Retorno Total Peso" en un fondo en dolares)
    meta = D[["fecha", "codigo_cnv", "fondo", "gerente", "clasificacion_cafci", "moneda_fondo", "region", "horizonte", "plazo_liq",
              "id_cnv_padre", "moneda", "patrimonio", "codigo_cafci"]]
    meta = meta.assign(Codigo_CNV=pd.to_numeric(meta.codigo_cnv.astype(object), errors="coerce"),
                       _m=(meta.moneda == meta.moneda_fondo).fillna(False).astype(int))
    meta = (meta.dropna(subset=["Codigo_CNV"]).sort_values(["fecha", "_m", "patrimonio", "codigo_cafci"])
            .drop_duplicates("Codigo_CNV", keep="last").drop(columns=["fecha", "codigo_cnv", "moneda", "patrimonio", "codigo_cafci", "_m"]))
    meta = meta.astype(object)
    meta["Codigo_CNV"] = meta.Codigo_CNV.astype(int)
    tax = taxonomia.clasificar(meta).drop_duplicates("Codigo_CNV").set_index("Codigo_CNV")
    tax_out = tax.drop(columns=["moneda_fondo", "region", "horizonte", "plazo_liq", "id_cnv_padre"], errors="ignore")
    if ventana:                                   # fondos que no informan en la ventana: queda su clasificacion publicada
        vieja = pd.read_csv(os.path.join(PROC, "taxonomia.csv"), index_col="Codigo_CNV")
        tax_out = pd.concat([tax_out, vieja[~vieja.index.isin(tax_out.index)]])
    tax_out.to_csv(os.path.join(PROC, "taxonomia.csv"))
    nuevos = tax[~tax.fuente_tax.isin(["1816", "manual"])]
    if len(nuevos): print("fondos clasificados por regla (no estan en mapeo/taxonomia_1816.csv):", len(nuevos))
    cnv = pd.to_numeric(D.codigo_cnv, errors="coerce")
    for c, t in [("categoria_1816", "Tipo_1816"), ("subcategoria_1816", "Subtipo_1816"), ("gerente_1816", "Gerente_1816"),
                 ("tipo_gerente", "Tipo_Gerente_1816"), ("fondo_1816", "Fondo_1816")]:
        D[c] = cnv.map(tax[t]).astype("category")          # category: pocas categorias, poca memoria
    D["fondo_1816"] = D.fondo_1816.astype(object).where(D.fondo_1816.notna(), D.fondo).astype("category")
    D["categoria_1816"] = D.categoria_1816.where(univ & ~D.categoria_1816.isin(["En liq/Resc especie"]))   # fuera del universo
    ref = D.sort_values("fecha").drop_duplicates("codigo_cafci", keep="last")[["codigo_cafci", "codigo_cnv", "patrimonio"]].rename(columns={"codigo_cnv": "Codigo_CNV"})
    ref = taxonomia.referencia(ref.assign(codigo_cafci=lambda x: pd.to_numeric(x.codigo_cafci), Codigo_CNV=lambda x: pd.to_numeric(x.Codigo_CNV)))
    D["cuota_referencia"] = pd.to_numeric(D.codigo_cafci).map(ref.set_index("codigo_cafci").referencia).fillna(0).astype(int)
    # tipo de cambio implicito por moneda y fecha
    # el patrimonio y el VCP estan expresados en la moneda de la CLASE (col. Moneda), no la del fondo
    fxr = D[(D.moneda != "ARS") & (D.vcp > 0) & (D.vcp_reexp_ars > 0)].assign(r=lambda x: x.vcp_reexp_ars / x.vcp)
    fx = fxr.groupby(["fecha", "moneda"]).r.median().rename("fx").reset_index()
    D = D.merge(fx, on=["fecha", "moneda"], how="left")
    D.loc[D.moneda == "ARS", "fx"] = 1.0
    D["fx"] = D.groupby("moneda").fx.transform(lambda s: s.ffill().bfill())
    D["fx_planilla"] = D.fx
    # tipo de cambio de conversion del dia del dato (procesado/dolar.csv): promedio MEP-CCL o MEP segun config;
    # si falta el dia se usa el ultimo disponible; sin serie queda el implicito de la planilla (= BCRA A3500)
    dolar = os.path.join(PROC, "dolar.csv")
    serie = CFG.get("tipo_cambio", "promedio_mep_ccl")       # "promedio_mep_ccl" (igual a 1816) o "mep"
    if os.path.exists(dolar):
        dl = pd.read_csv(dolar, parse_dates=["fecha"]).set_index("fecha").sort_index()
        if serie == "promedio_mep_ccl" and "ccl" in dl:
            tc = ((dl.mep + dl.ccl) / 2).where(dl.ccl.notna(), dl.mep)
        else:
            tc = dl.mep
        tc = tc.dropna()
        f = pd.to_datetime(D.fecha)
        D["fx_usd"] = tc.reindex(pd.date_range(tc.index.min(), max(tc.index.max(), f.max()))).ffill().reindex(f).values
        usd = D.moneda != "ARS"
        D.loc[usd & D.fx_usd.notna(), "fx"] = D.loc[usd & D.fx_usd.notna(), "fx_usd"]
    D["patrimonio_ars"] = D.patrimonio * D.fx
    # flujo = variacion de cuotapartes entre planillas consecutivas (un dato rezagado repetido no suma dos veces)
    D = D.sort_values(["codigo_cafci", "fecha"])
    prev = D.groupby("codigo_cafci").ccp.shift()
    ccp_prev = prev.where(prev.notna(), D.ccp_ant)
    # alta: primer dato de una clase (posterior al inicio del panel) = suscripcion inicial completa (como 1816);
    # la columna "dia anterior" de la planilla de lanzamiento suele repetir las cuotapartes del dia y perdia el flujo
    inicio = D.fecha.min()
    alta = prev.isna() & (D.fecha > inicio + timedelta(days=10))
    ccp_prev = ccp_prev.where(~alta, 0.0)
    D["flujo_ars"] = ((D.ccp - ccp_prev) * D.vcp / 1000 * D.fx).fillna(0.0)
    # control: un flujo no puede superar el patrimonio de la clase; si pasa (error de cuotapartes o VCP en la
    # planilla) se toma la variacion de patrimonio descontado el rendimiento del dia
    pprev = D.groupby("codigo_cafci").patrimonio_ars.shift()
    vprev = D.groupby("codigo_cafci").vcp.shift()
    tope = 1.5 * pd.concat([D.patrimonio_ars, pprev], axis=1).max(axis=1)
    alt = (D.patrimonio_ars - pprev * (D.vcp / vprev.where(vprev > 0))).fillna(0.0)
    D.loc[D.flujo_ars.abs() > tope, "flujo_ars"] = alt
    simple = (D.patrimonio_ars - pprev).fillna(0.0)          # cambio de escala de cuotapartes (split): variacion simple
    D.loc[D.flujo_ars.abs() > tope, "flujo_ars"] = simple
    D["mes"] = pd.to_datetime(D.fecha).dt.to_period("M")
    keep = ["fecha", "planilla", "fecha_ant", "codigo_cafci", "codigo_cnv", "fondo_clase", "fondo", "gerente", "clasificacion_cafci", "categoria_1816",
            "subcategoria_1816", "gerente_1816", "tipo_gerente", "fondo_1816", "cuota_referencia",
            "moneda", "moneda_fondo", "horizonte", "plazo_liq", "decreto_596", "ley_27743", "tipo_dinero", "vcp", "ccp", "patrimonio", "fx", "fx_planilla",
            "patrimonio_ars", "flujo_ars", "hon_sg", "hon_sd", "minimo_inversion", "calificado", "region", "depositaria", "calificacion",
            "comision_ingreso", "comision_rescate", "comision_transferencia", "gastos_gestion", "hon_exito", "indice_mm",
            "repatriacion", "tipo_escision", "id_cafci_padre", "id_cnv_padre", "var_mes", "var_anio", "var_12m"]
    for c in keep:
        if c not in D: D[c] = None
    # Guardia: si en esta corrida faltan planillas de un mes que ya estaba procesado (ej. la CNV no respondio y el
    # cache esta incompleto) se conserva lo publicado de ese mes en vez de pisarlo con datos parciales.
    viejo_idx = {}
    if os.path.exists(os.path.join(PROC, "index.json")):
        try: viejo_idx = {e["mes"]: e for e in json.load(open(os.path.join(PROC, "index.json")))["mensual"]}
        except Exception: viejo_idx = {}
    _u = D.loc[(D.decreto_596 != "S") & D.categoria_1816.notna(), "fecha"]
    n_plan = pd.Series(sorted(set(_u))).map(lambda x: str(pd.Period(x, "M"))).value_counts()
    proteger = {m for m, e in viejo_idx.items() if not e.get("parcial") and n_plan.get(m, 0) < e.get("planillas", 0)
                and (not ventana or m >= str(ventana[0]))}
    if proteger: print("meses conservados (faltan planillas en esta corrida):", sorted(proteger))
    if ventana:
        fuera = {m for m in viejo_idx if m < str(ventana[0])} | {str(m) for m in D.mes.unique() if str(m) < str(ventana[0])}
        if fuera: print(f"corrida incremental: quedan como estaban publicados {len(fuera)} meses ({min(fuera)} a {max(fuera)})")
        proteger |= fuera                         # incluye el mes de arrastre, que no se publica
    for m, g in D.groupby("mes"):
        if str(m) in proteger: continue
        g[keep].sort_values(["fecha", "codigo_cafci"]).to_csv(os.path.join(PROC, "clases_diario", f"{m}.csv.gz"), index=False, compression={"method": "gzip", "mtime": 0})

    U = D.loc[(D.decreto_596 != "S") & D.categoria_1816.notna(), ["fecha", "mes", "codigo_cafci", "codigo_cnv", "fondo", "gerente",
          "categoria_1816", "subcategoria_1816", "gerente_1816", "tipo_gerente", "fondo_1816", "clasificacion_cafci",
          "patrimonio_ars", "flujo_ars", "hon_sg", "hon_sd"]].copy()
    del D; import gc; gc.collect()
    # ultimo dato de cada fondo en cada mes (para nombre, gerente y categoria del mes) - tabla chica, se calcula una vez
    ULT = U.sort_values(["fecha", "patrimonio_ars"]).drop_duplicates(["codigo_cnv", "mes"], keep="last")[
        ["codigo_cnv", "mes", "fondo", "gerente", "categoria_1816", "subcategoria_1816", "gerente_1816", "tipo_gerente", "fondo_1816", "clasificacion_cafci"]]
    fechas = sorted(U.fecha.unique())
    # foto diaria por dia calendario: cada clase con su ultimo dato disponible (hasta 7 dias de antiguedad)
    cal_all = pd.date_range(pd.Timestamp(fechas[0]), pd.Timestamp(fechas[-1]), freq="D")
    W = U.pivot_table(index="fecha", columns="codigo_cafci", values="patrimonio_ars", aggfunc="last")
    W.index = pd.to_datetime(W.index)
    W = W.reindex(cal_all).ffill(limit=7).fillna(0.0)
    clase = U.sort_values("fecha").drop_duplicates("codigo_cafci", keep="last").set_index("codigo_cafci")
    hon = U.sort_values("fecha").pivot_table(index="fecha", columns="codigo_cafci", values=["hon_sg", "hon_sd"], aggfunc="last")
    hon.index = pd.to_datetime(hon.index); hon = hon.reindex(cal_all).ffill().bfill().fillna(0.0)
    fondo_de = clase.codigo_cnv
    salidas = []
    for viejo in glob.glob(os.path.join(PROC, "fondos_cafci_*.csv")):     # el mes parcial cambia de nombre cada dia
        if viejo[-14:-7] not in proteger: os.remove(viejo)
    for m in sorted(U.mes.unique()):
        if str(m) in proteger:
            if str(m) in viejo_idx: salidas.append(viejo_idx[str(m)])
            continue
        ini = (m.start_time - timedelta(days=1)).date(); fin_mes = m.end_time.date()
        f_mes = [f for f in fechas if ini < f <= fin_mes]
        if not f_mes or pd.Timestamp(ini) < cal_all[0]: continue
        f1 = fin_mes if fin_mes <= fechas[-1] else f_mes[-1]
        cal = pd.date_range(pd.Timestamp(ini) + timedelta(days=1), pd.Timestamp(f1), freq="D")
        k = ["codigo_cnv"]
        num = W.loc[cal].sum().groupby(fondo_de).sum()
        a = pd.DataFrame({"numeral": num})
        a.index.name = "codigo_cnv"
        a["fac_g"] = (W.loc[cal] * hon["hon_sg"].loc[cal]).sum().groupby(fondo_de).sum() / 100 / 365
        a["fac_d"] = (W.loc[cal] * hon["hon_sd"].loc[cal]).sum().groupby(fondo_de).sum() / 100 / 365
        a["AUM_promedio"] = a.numeral / len(cal)
        a["AUM_Inicial"] = W.loc[pd.Timestamp(ini)].groupby(fondo_de).sum()
        a["AUM_Final"] = W.loc[pd.Timestamp(f1)].groupby(fondo_de).sum()
        a["Susc_Netas"] = U[(U.fecha > ini) & (U.fecha <= f1)].groupby(k).flujo_ars.sum()
        a = a.fillna(0.0)
        a["Rendimiento"] = a.AUM_Final - a.AUM_Inicial - a.Susc_Netas
        f0 = ini
        meta = ULT[ULT.mes <= m].drop_duplicates("codigo_cnv", keep="last").set_index("codigo_cnv")
        a = a.join(meta[["fondo", "gerente", "categoria_1816", "subcategoria_1816", "gerente_1816", "tipo_gerente", "fondo_1816", "clasificacion_cafci"]])
        out = pd.DataFrame({
            "Fecha": f1.isoformat(),
            "Categoria": a.categoria_1816, "Subcategoria": a.subcategoria_1816, "Fondo": a.fondo_1816, "Gerente": a.gerente_1816,
            "AUM_promedio": a.AUM_promedio / 1e6, "AUM_Inicial": a.AUM_Inicial / 1e6, "AUM_Final": a.AUM_Final / 1e6,
            "Susc_Netas": a.Susc_Netas / 1e6, "Rendimiento": a.Rendimiento / 1e6,
            "Facturacion_Gerente": a.fac_g / 1e6, "Facturacion_Depo": a.fac_d / 1e6})
        out["Tipo_Gerente"] = a.tipo_gerente; out["Sociedad_Gerente"] = a.gerente; out["Fondo_CAFCI"] = a.fondo
        out["Clasificacion_CAFCI"] = a.clasificacion_cafci
        out = out[(out.AUM_promedio != 0) | (out.AUM_Inicial != 0) | (out.AUM_Final != 0)].copy()
        tot = out.AUM_promedio.sum(); mm = out.Categoria == "Money Market"; bz = out.Sociedad_Gerente.str.contains("Balanz", na=False)
        out["suma_aums_mensual"] = tot
        out["suma_mensual_balanz"] = bz * out[bz].AUM_promedio.sum()
        out["suma_aums_mm_mensual"] = mm * out[mm].AUM_promedio.sum()
        out["suma_aums_no_mm_mensual"] = (~mm) * out[~mm].AUM_promedio.sum()
        out = out.sort_values(["Gerente", "Fondo"]).reset_index().rename(columns={"codigo_cnv": "Codigo_CNV"})
        cols = ["Fecha", "Categoria", "Subcategoria", "Fondo", "Gerente", "AUM_promedio", "AUM_Inicial", "AUM_Final", "Susc_Netas",
                "Rendimiento", "Facturacion_Gerente", "Facturacion_Depo", "suma_aums_mensual", "suma_mensual_balanz",
                "suma_aums_mm_mensual", "suma_aums_no_mm_mensual", "Codigo_CNV", "Tipo_Gerente", "Sociedad_Gerente", "Fondo_CAFCI",
                "Clasificacion_CAFCI"]
        nombre = f"fondos_cafci_{out.Fecha.iloc[0]}.csv"
        out[cols].to_csv(os.path.join(PROC, nombre), index=False, float_format="%.15g", lineterminator="\r\n")
        salidas.append({"archivo": nombre, "mes": str(m), "desde": ini.isoformat(), "hasta": f1.isoformat(),
                        "parcial": f1 < fin_mes and str(m) == str(U.mes.max()), "fondos": int(len(out)), "planillas": len(f_mes)})
        print(nombre, len(out), "fondos, planillas", len(f_mes), "AUM prom", round(tot / 1e6, 1) if False else round(tot, 1))
    fechas_idx = [f.isoformat() for f in fechas]
    if ventana:                                   # las fechas de antes de la ventana salen del indice publicado
        try: viejas = json.load(open(os.path.join(PROC, "index.json")))["fechas_planilla"]
        except Exception: viejas = []
        fechas_idx = sorted(set(f for f in viejas if f < ventana[0].start_time.date().isoformat())
                            | {f for f in fechas_idx if f >= ventana[0].start_time.date().isoformat()})
    ya = {e["mes"] for e in salidas}
    salidas += [viejo_idx[m] for m in proteger if m not in ya and m in viejo_idx]
    salidas.sort(key=lambda e: e["mes"])
    json.dump({"actualizado": datetime.now(timezone.utc).isoformat(timespec="seconds"), "fuente": "Planilla Diaria CAFCI archivada por la CNV",
               "fechas_planilla": fechas_idx, "mensual": salidas},
              open(os.path.join(PROC, "index.json"), "w"), ensure_ascii=False, indent=1)

if __name__ == "__main__":
    main()
