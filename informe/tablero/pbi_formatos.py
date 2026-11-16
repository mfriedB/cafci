"""Extrae del modelo de datos de "Informe Gestion FCI.pbix" los formatos de las medidas y columnas (pbi_formats.json).

Solo hace falta correrlo si se agregan medidas o se les cambia el formato en el Power BI. Necesita pbixray
(pip install pbixray) y no lee datos: solo los metadatos del modelo (nombre de medida -> cadena de formato).

Uso: python3 pbi_formatos.py "Informe Gestion FCI.pbix" [salida.json]
"""
import json, os, sys
from pbixray import PBIXRay


def main():
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "pbi_formats.json")
    db = PBIXRay(src)._metadata.source._db
    q = db.query("SELECT t.Name tn, me.Name n, me.FormatString f FROM [Measure] me JOIN [Table] t ON me.TableID=t.ID")
    m = {f"{r.tn}|{r.n}": r.f for r in q.itertuples() if isinstance(r.f, str)}
    q = db.query("SELECT t.Name tn, c.ExplicitName n, c.FormatString f FROM [Column] c JOIN [Table] t ON c.TableID=t.ID WHERE c.FormatString IS NOT NULL")
    c = {f"{r.tn}|{r.n}": r.f for r in q.itertuples() if isinstance(r.n, str) and not str(r.tn).startswith(("LocalDateTable", "DateTableTemplate"))}
    # columnas decimales sin formato: el Power BI las muestra con separador de miles y 2 decimales
    q = db.query("SELECT t.Name tn, c.ExplicitName n FROM [Column] c JOIN [Table] t ON c.TableID=t.ID WHERE c.FormatString IS NULL AND c.ExplicitDataType = 8")
    for r in q.itertuples():
        if isinstance(r.n, str) and not str(r.tn).startswith(("LocalDateTable", "DateTableTemplate")): c.setdefault(f"{r.tn}|{r.n}", "#,0.00")
    json.dump({"m": m, "c": c}, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=0, sort_keys=True)
    print("medidas", len(m), "columnas", len(c), "->", out)


if __name__ == "__main__":
    main()
