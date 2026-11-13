"""Convierte las exportaciones del reporte de Power BI Service "Rporte de Comision por Fondos v2" (pagina Fondos YTD)
a los Excel que lee internos.py. Corre en la compu de Matias; los datos NO se suben al repo.

Exportacion: matriz principal > Mas opciones > Exportar datos > "Datos con diseño actual" (.xlsx),
una vez con "Analisis por" = Unidad Negocio y otra con = Fondos. El archivo trae meses en filas y
unidades/fondos en columnas, con ComisionYTM a precision completa.

Uso: python3 pbi_comisiones.py CARPETA_FCI_PBI_FONDOS ARCHIVO1.xlsx [ARCHIVO2.xlsx ...]
Escribe (pisando la version anterior del mismo año):
  PBI - Mati - Comisiones/comisiones_fci_pbi_AAAA.xlsx
  PBI - Mati - Comisiones x Fondo/comisiones_fondo_pbi_AAAA.xlsx
  Serie Facturación/serie_pbi_AAAA.xlsx   (total mensual = suma de todas las unidades)
"""
import os, sys
import pandas as pd

MES = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}
MES.update({"Ene": 1, "Abr": 4, "Ago": 8, "Dic": 12})


def leer_matriz(path):
    x = pd.read_excel(path, header=None)
    tipo = str(x.iloc[0, 0]).strip()
    if tipo not in ("Unidad Negocio", "Fondos"):
        raise ValueError(f"{path}: encabezado inesperado {tipo!r}")
    nombres = list(x.iloc[0, 1:])
    filas = []
    for i in range(2, len(x)):
        lab = str(x.iloc[i, 0]).strip()
        if lab in ("Total", "nan") or lab.startswith("Filtros"): continue
        m, a = lab.split("-")
        fin = pd.Timestamp(year=2000 + int(a), month=MES[m[:3].title()], day=1) + pd.offsets.MonthEnd(0)
        for j, n in enumerate(nombres, 1):
            n = str(n).strip()
            v = x.iloc[i, j]
            if n in ("Total", "nan", "") or pd.isna(v): continue
            filas.append({"AnoMesCorto": lab, "FechaFinMes": fin.date(), "Unidad Negocio": n, "ComisionYTM": float(v)})
    return tipo, pd.DataFrame(filas)


def main():
    base, archivos = sys.argv[1], sys.argv[2:]
    for f in archivos:
        tipo, d = leer_matriz(f)
        if d.empty: print("sin datos:", f); continue
        anio = pd.to_datetime(d.FechaFinMes).dt.year.max()
        if tipo == "Unidad Negocio":
            d.to_excel(os.path.join(base, "PBI - Mati - Comisiones", f"comisiones_fci_pbi_{anio}.xlsx"), index=False)
            s = d.groupby("FechaFinMes", as_index=False).ComisionYTM.sum().rename(columns={"FechaFinMes": "Fecha", "ComisionYTM": "Facturación"})
            s["Facturación"] = s["Facturación"].round(0)
            s.to_excel(os.path.join(base, "Serie Facturación", f"serie_pbi_{anio}.xlsx"), index=False)
            print(f"unidades {anio}: {d.FechaFinMes.nunique()} meses, {d['Unidad Negocio'].nunique()} unidades; ultimo mes",
                  s.Fecha.max(), "total", f"{s['Facturación'].iloc[-1]:,.0f}")
        else:
            d.to_excel(os.path.join(base, "PBI - Mati - Comisiones x Fondo", f"comisiones_fondo_pbi_{anio}.xlsx"), index=False)
            print(f"fondos {anio}: {d.FechaFinMes.nunique()} meses, {d['Unidad Negocio'].nunique()} fondos")


if __name__ == "__main__":
    main()
