"""Pasa las cargas manuales del tablero "Informe de Gestión FCI" (base del artifact, colección "cargas") a los archivos
que usan comite.py y el tablero. Corre en la nube o en la compu; los datos NO se suben al repo.

Entrada: un JSON con la lista de documentos de la colección "cargas" (lo que devuelve db_list, una lista de objetos con
tipo, mes, cols, filas, archivo, at; también acepta {"docs": [...]}, o JSON por línea).
Uso:
  python3 cargas_a_archivos.py CARGAS.json --dax CARPETA_DAX [--internos internos.json]
- dax: reescribe dax_mes_unidad.txt, dax_mes_unidad_fondo.txt, dax_clientes.txt y dax_inversores.txt reemplazando los
  meses que vinieron en la carga manual (los demás meses del archivo quedan como estaban).
- internos: reemplaza en comisiones, comisiones_fondo, serie_facturacion y contrapartes (compra/venta) los meses cargados a mano.
- extras: guarda en un JSON las plantillas 4 a 8 (fondos de terceros, emisiones primarias, fondos fuera de CAFCI,
  clientes excluidos Ex Meli y textos del mes) para el informe completo.
Las plantillas 1 a 3 (AUM por area y fondo, clientes, inversores) ya se guardan con el formato de las consultas DAX.
Imprime qué meses tomó de la carga manual.
"""
import argparse, calendar, json, os
import pandas as pd

DAX = {  # tipo -> (archivo, columnas del archivo en el orden de las filas guardadas)
    "aum_unidad": ("dax_mes_unidad.txt", ["UnidadNegocio[unidad]", "[aum_orig]", "[ten]", "[fact]", "[flujo]"]),
    "aum_unidad_fondo": ("dax_mes_unidad_fondo.txt", ["UnidadNegocio[unidad]", "AgrupacionFondo[nombre_corto_fdo_ok]", "[aum]", "[fact]", "[flujo]"]),
    "clientes": ("dax_clientes.txt", ["Cuotapartistas[nombre]", "UnidadNegocio[unidad]", "[aum]", "[fact]", "[flujo]"]),
    "inversores": ("dax_inversores.txt", ["Cuotapartistas[Categoria]", "Cuotapartistas[tipopersona]", "AgrupacionFondo[nombre_corto_fdo_ok]", "[aum]", "[n]"]),
}
FECHA = "Calendario[Fecha Mes]"


def leer_docs(p):
    t = open(p, encoding="utf-8").read().strip()
    try:
        d = json.loads(t)
    except json.JSONDecodeError:
        d = [json.loads(l) for l in t.splitlines() if l.strip()]
    if isinstance(d, dict): d = d.get("docs") or d.get("documents") or list(d.values())
    out = []
    for x in d:
        x = x.get("data", x) if isinstance(x, dict) and "tipo" not in x else x
        if isinstance(x, dict) and x.get("tipo") and x.get("mes") and not x.get("registro"): out.append(x)
    # cada archivo subido guarda su versión de cada mes, a veces partida en varios documentos (parte 1, 2, ...):
    # se unen las partes y, por tipo y mes, vale la versión del archivo subido más recientemente
    unidos = {}
    for x in sorted(out, key=lambda x: (x["tipo"], x["mes"], x.get("archivoId") or "", x.get("parte") or 1)):
        k = (x["tipo"], x["mes"], x.get("archivoId") or "previo:" + str(x.get("at") or ""))
        if k in unidos: unidos[k]["filas"] = list(unidos[k]["filas"]) + list(x["filas"])
        else: unidos[k] = dict(x)
    vig = {}
    for x in unidos.values():
        k = (x["tipo"], x["mes"])
        if k not in vig or str(x.get("at") or "") > str(vig[k].get("at") or ""): vig[k] = x
    return list(vig.values())


def fin_mes(m):
    y, mm = int(m[:4]), int(m[5:7]); return f"{m}-{calendar.monthrange(y, mm)[1]:02d}"


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("cargas"); ap.add_argument("--dax"); ap.add_argument("--internos")
    ap.add_argument("--extras", help="JSON con terceros, emisiones, cerrados, exclusiones y textos (plantillas 4 a 8)")
    a = ap.parse_args()
    docs = leer_docs(a.cargas)
    por = {}
    for d in docs: por.setdefault(d["tipo"], []).append(d)
    if a.dax:
        os.makedirs(a.dax, exist_ok=True)
        for tipo, (arch, cols) in DAX.items():
            ds = por.get(tipo)
            if not ds: continue
            p = os.path.join(a.dax, arch)
            viejo = pd.read_csv(p, sep="\t", encoding="utf-8-sig", dtype=str) if os.path.exists(p) else pd.DataFrame(columns=[FECHA] + cols)
            meses = {d["mes"] for d in ds}
            if len(viejo):
                mv = pd.to_datetime(viejo[FECHA], format="mixed").dt.strftime("%Y-%m")
                viejo = viejo[~mv.isin(meses)]
            nuevo = pd.DataFrame([[d["mes"] + "-01"] + list(f) for d in ds for f in d["filas"]], columns=[FECHA] + cols)
            todo = pd.concat([viejo, nuevo.astype(str)], ignore_index=True)
            todo["_m"] = pd.to_datetime(todo[FECHA], format="mixed").dt.strftime("%Y-%m")
            todo = todo.sort_values("_m", kind="stable").drop(columns="_m")
            todo.to_csv(p, sep="\t", index=False, encoding="utf-8")
            print(f"{arch}: meses de la carga manual {sorted(meses)}")
    if a.internos:
        I = json.load(open(a.internos, encoding="utf-8")) if os.path.exists(a.internos) else {}
        for tipo, clave, col in (("com_unidad", "comisiones", "unidad"), ("com_fondo", "comisiones_fondo", "fondo")):
            ds = por.get(tipo)
            if not ds: continue
            meses = {d["mes"] for d in ds}
            filas = [r for r in I.get(clave, []) if str(r["mes"])[:7] not in meses]
            filas += [{"mes": fin_mes(d["mes"]), col: k, "comisiones": round(float(v), 2)} for d in ds for k, v in d["filas"]]
            I[clave] = sorted(filas, key=lambda r: r["mes"])
            print(f"{clave}: meses de la carga manual {sorted(meses)}")
            if tipo == "com_unidad":
                se = [r for r in I.get("serie_facturacion", []) if str(r["fecha"])[:7] not in meses]
                se += [{"fecha": fin_mes(d["mes"]), "facturacion": round(sum(float(v) for _, v in d["filas"]))} for d in ds]
                I["serie_facturacion"] = sorted(se, key=lambda r: r["fecha"])
        ds = por.get("compraventa")   # compra/venta de especies: reemplaza en contrapartes los meses cargados a mano
        if ds:
            meses = {d["mes"] for d in ds}
            filas = [r for r in I.get("contrapartes", []) if str(r.get("fecha") or "")[:7] not in meses]
            filas += [dict(zip(d["cols"], f)) for d in ds for f in d["filas"]]
            I["contrapartes"] = filas
            print(f"contrapartes: meses de la carga manual {sorted(meses)}")
        json.dump(I, open(a.internos, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"), default=str)
    if a.extras: extras(por, a.extras)


def extras(por, path):
    out = {}
    for tipo in ("terceros", "emisiones", "cerrados", "exclusiones", "textos"):
        ds = sorted(por.get(tipo, []), key=lambda d: d["mes"])
        if ds: out[tipo] = [{"mes": d["mes"], "cols": d.get("cols"), "filas": d["filas"]} for d in ds]
    json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("extras:", {k: [d["mes"] for d in v] for k, v in out.items()})


if __name__ == "__main__":
    main()
