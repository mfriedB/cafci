"""Bases INTERNAS de Balanz para el tablero "Informe de Gestion FCI" (no se publican en el repo).

Corre en la compu de Matias. Lee las mismas carpetas que el Power BI (OneDrive "FCI - PBI - Fondos"):
  PBI - Mati - Comisiones/*.xlsx            -> comisiones.json        (facturacion por unidad de negocio, USD)
  PBI - Mati - Comisiones x Fondo/*.xlsx    -> comisiones_fondo.json  (facturacion por fondo, USD)
  Serie Facturación/*.xlsx                  -> serie_facturacion.json
  Cantidad de Cuotapartistas/*.xlsx         -> cuotapartistas.json    (AUM por fondo, clase y tipo de inversor, sin datos de clientes)
  Compra_Venta_Contrapartes_/*.xlsx         -> contrapartes.json
y aplica las mismas columnas calculadas que el modelo del Power BI (Unidad de Negocio, Fondo Corregido,
Categoria Tipo Inversor, Categoria_Previa, Categoria, Categoria_Pase, Agente_Norm).

Uso: python3 internos.py CARPETA_FCI_PBI_FONDOS CARPETA_SALIDA
"""
import glob, json, os, sys, unicodedata
import pandas as pd

UNIDAD = {"Corporate": "Corporate", "Externos": "Externos", "IFA": "IFA", "Individuos": "Individuos", "IR": "IR", "BLNZ": "Otros",
          "Canales": "Canales", "Banca Privada": "Banca Privada", "Sector Público": "Sector Público",
          "University Inversiones": "Academy Inversiones", "Advisory": "Advisory", "Sales & Trading": "Sales & Trading",
          "Private Wealth": "Private Wealth", "Wealth Management": "Wealth Management", "Productores Exclusivos": "Productores Exclusivos",
          "Productores": "Productores Exclusivos", "Banca de Inversión": "Banca de Inversión", "WM UY": "WM UY",
          "Inst.": "Institucionales", "Institucionales": "Institucionales", "Inst. No Reg": "Institucionales No Regulados",
          "Inst. No Reg 2": "Institucionales No Regulados2", "Mesa Sales & Trading": "Sales & Trading", "WM": "Wealth Management",
          "PyME": "Pyme", "Pyme": "Pyme", "Prod Exc": "Productores Exclusivos", "IB-Banca de Inversión": "Banca de Inversión",
          "IB - Banca de Inversión": "Banca de Inversión", "Wealth Management Uruguay": "WM UY", "Auditoria Interna": "Otros"}
FONDO_CORR = {"Institucional (IL)": "Inflation linked", "Retorno Total": "Renta Mixta", "Performance II": "Lecaps",
              "Performance XIV": "Crédito Privado"}
TIPO_INV = {"Agentes de Colocacion y distribucion Integral de FCIs": "ACDIs", "Cajas de Prevision": "Institucionales",
            "Compañias de Seguros": "Institucionales", "Inversores Corporativo.": "Corporativos", "Inversores Corporativos": "Corporativos",
            "Personas Humanas Argentinas Mayores de Edad": "P. Humanas", "Personas Humanas con Residencia en el Exterior": "P. Humanas",
            "Pymes": "PyMEs", "Aseguradoras de Riesgos de Trabajo": "Institucionales", "Personas Humanas Argentinas Menores de Edad": "P. Humanas",
            "Entidades Financieras Autorizadas por el BCRA": "Institucionales", "Fondos Comunes de Inversion": "Institucionales",
            "Personas Jurídicas con Residencia en el Exterior": "Institucionales"}
TIPO_ESPECIE = {"Acciones": "Acciones", "Acciones ADR": "Acciones", "Acciones CEDEAR": "CEDEARs", "Amortizaciones a Cobrar": "Rentas",
                "Apertura Colocadora": "Cauciones", "Bono Dual": "Bonos AR$", "Bono Provincial CER": "Bonos AR$", "Bono Soberano CER": "Bonos AR$",
                "Bono Soberano Dolar Link": "Bonos AR$", "Bono Tasa Fija Provincial": "Bonos U$S", "Bono Tasa Fija Soberano": "Bonos U$S",
                "Cheque de Pago Diferido": "Cheques", "Cheque de Pago Diferido a Cobrar": "Cheques", "CUENTA CORRIENTE": "Cuentas Corrientes",
                "CUENTA CORRIENTE REMUNERADA": "Cuentas Corrientes", "Derivado Agropecuario (SOJA)": "ROFEX", "Derivado Dólar Futuro": "ROFEX",
                "Deudores por Operaciones a Liquidar": "Deudores", "Dividendos en Efectivo a Cobrar": "Dividendos", "ETF": "CEDEARs",
                "Fideicomiso Financiero": "ONs AR$", "Fideicomiso Financiero Badlar ($)": "ONs AR$", "Fideicomiso Financiero TAMAR": "ONs AR$",
                "Fondo Común de Inversión": "FCI", "Garantía por Operaciones": "Garantías", "Intereses a Cobrar": "Intereses",
                "Letra Provincial Tasa Fija": "Bonos AR$", "LETRAS DEL TESORO": "Bonos AR$", "Letras del tesoro TAMAR": "Bonos AR$",
                "Letras Provinciales TAMAR": "Bonos AR$", "Obligación Negociable Badlar": "ONs AR$", "Obligación Negociable Dólar Linked": "ONs AR$",
                "Obligación Negociable TAMAR": "ONs AR$", "Obligación Negociable Tasa Fija": "ONs U$S", "Obligaciones Negociables UVA": "ONs AR$",
                "Obligaciones por Garantía": "Garantías", "Plazo Fijo": "Plazos Fijos", "Provisión de Gastos Varios": "Provisiones",
                "Renta Fija Soberana Paraguay": "Bonos U$S", "Renta Fija Soberana Uruguay": "Bonos U$S", "Rentas a Cobrar": "Rentas",
                "Títulos Entregados en Garantía": "Garantías"}
for _s in ["Agro", "Brasil", "Chile", "Consumo", "Energía", "Financiera", "Mexico", "Oil y Gas", "Paraguay", "Telco"]:
    TIPO_ESPECIE["Renta Fija Corporativa " + _s] = "ONs U$S"


def leer(carpeta, patron="*.xlsx"):
    # orden por fecha de modificacion: ante el mismo mes en dos archivos, gana el mas nuevo (ej. la bajada automatica del Power BI)
    fs = sorted([f for f in glob.glob(os.path.join(carpeta, patron)) if not os.path.basename(f).startswith("~$")], key=os.path.getmtime)
    return pd.concat([pd.read_excel(f).assign(**{"Source.Name": os.path.basename(f)}) for f in fs], ignore_index=True) if fs else pd.DataFrame()


def limpio(s):
    return str(s if s is not None else "").replace(" ", " ").strip()


def comisiones(base, carpeta, col):
    d = leer(os.path.join(base, carpeta))
    if d.empty: return []
    d["FechaFinMes"] = pd.to_datetime(d.FechaFinMes).dt.date.astype(str)
    d["u"] = d["Unidad Negocio"].map(limpio)
    d["k"] = d.u.map(UNIDAD).fillna(d.u) if col == "unidad" else d.u.map(FONDO_CORR).fillna(d.u)
    # si el mismo mes viene en dos archivos, vale el ultimo archivo leido (mas nuevo)
    d["_o"] = range(len(d))
    d = d.sort_values("_o").drop_duplicates(["FechaFinMes", "u"], keep="last")
    g = d.groupby(["FechaFinMes", "k"], as_index=False).ComisionYTM.sum()
    return [{"mes": r.FechaFinMes, col: r.k, "comisiones": round(float(r.ComisionYTM), 2)} for r in g.itertuples()]


def contrapartes(base):
    d = leer(os.path.join(base, "Compra_Venta_Contrapartes_"))
    if d.empty: return []
    d = d.sort_values("Source.Name").drop_duplicates([c for c in d.columns if c != "Source.Name"], keep="last")
    out = []
    tipoop = d.Tipo_Operación.map(lambda x: limpio(x).upper())
    for i, r in d.iterrows():
        tipo = limpio(r["Tipo de Especie"]); tu = tipo.upper(); esp = limpio(r.Especie).upper(); f0 = esp[:1]
        if "B 10032026" in esp: cp = "Bonos U$S"
        elif "BF34O" in esp: cp = "Bonos AR$"
        elif "PDCAR29M" in esp or "REPUBLIC CHILE" in esp or "REP BRAZIL" in esp: cp = "Bonos U$S"
        elif "PSSYO" in esp or "PS38O" in esp: cp = "ONs AR$"
        elif "TLCRO" in esp: cp = "ONS AR$"
        elif "BONO TASA FIJA SOBERANO" in tu and f0 in ("S", "T"): cp = "Bonos AR$"
        elif "TREASURY BILL" in esp: cp = "Bonos U$S"
        else: cp = TIPO_ESPECIE.get(tipo, r["Tipo de Especie"])
        mon = limpio(r["Moneda de Concertación"])
        cat = {"Bonos U$S": "Bonos U$S en AR$", "ONs U$S": "ONs U$S en AR$"}.get(cp, cp) if mon == "$" else cp
        out.append(dict(i=i, fondo=r.Fondo, op=r.Operación_Numero, tipo_op=r.Tipo_Operación, especie=r.Especie, ticker=r.Ticker,
                        fecha_txt=str(r.Fecha_Concertacion), vn=r["Valor Nominal"], moneda=mon, bruto=r.Bruto_Concertación,
                        gastos=r.Gastos_Concertación, neto=r.Neto_Concertación, agente=r.Agente, tipo_especie=tipo, categoria=cat,
                        tipo_opU=tipoop[i]))
    o = pd.DataFrame(out)
    # Categoria_Pase: hay una operacion opuesta (compra/venta) del mismo fondo, especie, VN y agente a menos de 5 numeros
    opu = {"COMPRA": "VENTA", "VENTA": "COMPRA"}
    pase = []
    grp = {k: g for k, g in o.groupby(["fondo", "especie", "vn", "agente"], dropna=False)}
    for r in o.itertuples():
        t = opu.get(r.tipo_opU); es = False
        if t and pd.notna(r.op):
            g = grp[(r.fondo, r.especie, r.vn, r.agente)]
            g = g[(g.tipo_opU == t) & g.op.notna()]
            es = len(g) > 0 and (g.op - r.op).abs().min() < 5
        pase.append("Pase" if es else r.categoria)
    o["categoria_pase"] = pase

    def agente_norm(a):
        a = limpio(a)
        if not a or a.lower() == "nan": return None
        u = a.upper()
        if u.startswith("MAX"): return "Max Capital"
        for k, v in [("ALLARIA", "Allaria"), ("ADCAP", "AdCap"), ("COMAFI", "Banco Comafi"), ("BALANZ", "Balanz")]:
            if k in u: return v
        return a
    o["agente_norm"] = o.agente.map(agente_norm)
    f = pd.to_datetime(o.fecha_txt.str[:10], format="%d/%m/%Y", errors="coerce")
    o["fecha"] = f.dt.date.astype(str); o["trimestre"] = "Qtr " + f.dt.quarter.astype("Int64").astype(str); o["anio"] = f.dt.year
    es_pesos = o.moneda.str.contains(r"\$", regex=True) & ~o.moneda.str.contains("U", regex=False)
    o["monto_usd_mill"] = o.bruto.where(~es_pesos, o.bruto / 1400) / 1e6
    cols = ["fondo", "op", "tipo_op", "especie", "ticker", "fecha_txt", "fecha", "anio", "trimestre", "categoria", "categoria_pase", "vn",
            "moneda", "bruto", "gastos", "neto", "agente", "agente_norm", "tipo_especie", "monto_usd_mill"]
    return json.loads(o[cols].to_json(orient="records", force_ascii=False))


def cuotapartistas(base):
    fs = [f for f in sorted(glob.glob(os.path.join(base, "Cantidad de Cuotapartistas", "*.xlsx"))) if not os.path.basename(f).startswith("~$")]
    if not fs: return {"archivo": None, "filas": []}
    d = pd.read_excel(fs[-1], usecols=lambda c: c in ("Fondo", "Clase", "Tipo Inversor", "Importe", "Moneda", "Cuotapartista"))
    d["tipo"] = d["Tipo Inversor"].map(limpio)
    d["categoria_tipo_inversor"] = d.tipo.map(TIPO_INV).fillna(d.tipo)
    d["importe_usd_mill"] = d.Importe.where(d.Moneda.map(limpio) != "$", d.Importe / 1535) / 1e6
    g = d.groupby(["Fondo", "categoria_tipo_inversor"], as_index=False).agg(importe_usd_mill=("importe_usd_mill", "sum"),
                                                                        cuotapartistas=("Cuotapartista", "nunique"))
    return {"archivo": os.path.basename(fs[-1]), "filas": json.loads(g.to_json(orient="records", force_ascii=False))}


def serie(base):
    d = leer(os.path.join(base, "Serie Facturación"))
    if d.empty: return []
    d["Fecha"] = pd.to_datetime(d.Fecha)
    d["_m"] = d.Fecha.dt.to_period("M")
    d = d.drop_duplicates("_m", keep="last").sort_values("Fecha")   # un valor por mes; gana el archivo mas nuevo
    d["Fecha"] = d.Fecha.dt.date.astype(str)
    return [{"fecha": r.Fecha, "facturacion": float(r.Facturación)} for r in d.itertuples()]


def main():
    base, salida = sys.argv[1], sys.argv[2]
    os.makedirs(salida, exist_ok=True)
    datos = {"comisiones": comisiones(base, "PBI - Mati - Comisiones", "unidad"),
             "comisiones_fondo": comisiones(base, "PBI - Mati - Comisiones x Fondo", "fondo"),
             "serie_facturacion": serie(base), "cuotapartistas": cuotapartistas(base), "contrapartes": contrapartes(base)}
    for k, v in datos.items():
        json.dump(v, open(os.path.join(salida, k + ".json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"), default=str)
        n = len(v["filas"]) if isinstance(v, dict) else len(v)
        print(k, n, "filas")


if __name__ == "__main__":
    main()
