"""Reemplaza ASSET:<nombre> por la url /_blob/<id> en project/slides/*.html.
Uso: python3 assets_map.py <out> mapa.json   (mapa.json = {"rank.png": "/_blob/abc...", ...}, armado con los resultados de upload_asset)"""
import glob, json, re, sys
out, mp = sys.argv[1], json.load(open(sys.argv[2]))
falt = set()
for f in glob.glob(f"{out}/project/slides/*.html"):
    h = open(f).read()
    for n in set(re.findall(r"ASSET:([\w.\-]+)", h)):
        if n in mp: h = h.replace("ASSET:" + n, mp[n])
        else: falt.add(n)
    open(f, "w").write(h)
print("faltan:", sorted(falt) if falt else "ninguno")
sys.exit(1 if falt else 0)
