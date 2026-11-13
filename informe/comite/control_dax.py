"""Compara una exportación DAX nueva contra la anterior: los meses que están en las dos tienen que dar igual (±2%).
Sirve para detectar si una consulta se corrió distinto. Uso: python3 control_dax.py carpeta_anterior carpeta_nueva"""
import os, re, sys
import pandas as pd
ant, nue = sys.argv[1], sys.argv[2]; mal = []
def leer(p):
    d = pd.read_csv(p, sep="\t", encoding="utf-8-sig")
    d.columns = [re.findall(r"\[([^\]]+)\]", c)[-1] if "[" in c else c for c in d.columns]
    d["mes"] = pd.to_datetime(d["Fecha Mes"], format="mixed").dt.strftime("%Y-%m"); return d
for n in ("dax_mes_unidad.txt", "dax_mes_unidad_fondo.txt", "dax_clientes.txt", "dax_inversores.txt"):
    pa, pn = os.path.join(ant, n), os.path.join(nue, n)
    if not os.path.exists(pn): mal.append(f"{n}: falta"); continue
    if not os.path.exists(pa): continue
    a, b = leer(pa), leer(pn)
    ms = sorted(set(a.mes) & set(b.mes))[-6:-1]          # meses comunes ya cerrados (sin el último)
    for col in [c for c in ("aum_orig", "aum", "fact", "n") if c in a and c in b]:
        if n == "dax_clientes.txt" and col != "fact": continue
        sa, sb = a[a.mes.isin(ms)].groupby("mes")[col].sum(), b[b.mes.isin(ms)].groupby("mes")[col].sum()
        dif = ((sb - sa).abs() / sa.abs().replace(0, 1)).max()
        if dif > 0.02: mal.append(f"{n} {col}: difiere {dif:.1%} en meses ya cerrados")
print("OK" if not mal else "\n".join(mal)); sys.exit(1 if mal else 0)
