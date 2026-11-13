import json, requests, statistics
S=requests.Session(); S.headers["User-Agent"]="Mozilla/5.0"
s=open("explorar/fx1816.txt").read().strip()
f={}
for p in s.split(","):
    d,v=p.split(":"); dd,mm,yy=d.split("/"); f[f"{yy}-{int(mm):02d}-{int(dd):02d}"]=float(v)
out=[]
data={}
for casa in ["bolsa","contadoconliqui","oficial","mayorista","cripto","blue","tarjeta"]:
    try: data[casa]={x["fecha"]:x for x in S.get(f"https://api.argentinadatos.com/v1/cotizaciones/dolares/{casa}",timeout=60).json()}
    except Exception as e: out.append(f"{casa} ERR {e}")
def stat(name, fn):
    r=[]
    for d in f:
        try:
            v=fn(d)
            if v: r.append(f[d]/v)
        except Exception: pass
    if r: out.append(f"{name:40s} n={len(r)} media={statistics.mean(r):.4f} desvio={statistics.pstdev(r):.4f}")
for casa,c in data.items():
    for k in ["compra","venta"]: stat(f"{casa}_{k}", lambda d: c[d][k])
    stat(f"{casa}_medio", lambda d: (c[d]["compra"]+c[d]["venta"])/2)
b,c=data.get("bolsa",{}),data.get("contadoconliqui",{})
stat("prom_mep_ccl_venta", lambda d:(b[d]["venta"]+c[d]["venta"])/2)
stat("prom_mep_ccl_compra", lambda d:(b[d]["compra"]+c[d]["compra"])/2)
# ambito mep/ccl referencia
for nombre,url in [("ambito_mep","https://mercados.ambito.com/dolarrava/mep/historico-general/01-01-2026/13-11-2026"),("ambito_ccl","https://mercados.ambito.com/dolarrava/cl/historico-general/01-01-2026/13-11-2026"),("ambito_oficial","https://mercados.ambito.com/dolar/oficial/historico-general/01-01-2026/13-11-2026"),("ambito_mayorista","https://mercados.ambito.com/dolar/mayorista/historico-general/01-01-2026/13-11-2026")]:
    try:
        j=S.get(url,timeout=60).json()
        m={}
        for row in j[1:]:
            dd,mm,yy=row[0].split("/"); m[f"{yy}-{mm}-{dd}"]=[float(str(x).replace(".","").replace(",",".")) for x in row[1:]]
        for i in range(len(next(iter(m.values())))): stat(f"{nombre}_col{i}", lambda d: m[d][i])
    except Exception as e: out.append(f"{nombre} ERR {e}")
out.sort(key=lambda x: float(x.split("desvio=")[1]) if "desvio=" in x else 9)
open("explorar/resultado.txt","w").write("\n".join(out)); print("\n".join(out))
