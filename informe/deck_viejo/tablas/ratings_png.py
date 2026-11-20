"""Tabla de ratings (slide 44) con el formato del Excel original. Datos: ratings.json (FIX SCR + columnas del informe)."""
import json, sys, os
from playwright.sync_api import sync_playwright
D = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "ratings.json")))
OUT = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/igs/charts/s44_6.png"
W, H = 1920, 533
NEGRITA = {"Pymes", "Excalibur Regisseur"}          # en el original, "Sin Cambios" en negrita para los revisados del mes
def notch(v): return v and v != "Sin Cambios"
rows = ""
for f in D["filas"]:
    fondo, tipo, _, act, _, _, fecha, ant2, evy, ant, ev, mn, mx, pr = f
    gy = ' class="g"' if (notch(evy) or (evy == "" and f[0] in ("Lecaps", "Dolar Corto Plazo", "Latam", "Money Market USD"))) else ""
    ge = ' class="g"' if (notch(ev) or (ev == "" and fondo == "Money Market USD")) else (' class="b"' if fondo in NEGRITA else "")
    rows += f"<tr><td>{fondo}</td><td>{tipo}</td><td class='l'>{act}</td><td>{fecha}</td><td>{ant2}</td><td{gy}>{evy}</td><td>{ant}</td><td{ge}>{ev}</td><td class='l'>{mn}</td><td>{mx}</td><td>{pr}</td></tr>"
html = f"""<html><head><style>
body{{margin:0;background:#fff}} table{{border-collapse:collapse;width:{W - 12}px;margin:2px 6px;font-family:Carlito,Calibri,sans-serif;font-size:19px;table-layout:fixed}}
td,th{{border:1px solid #000;text-align:center;padding:0 2px;height:24.6px;white-space:nowrap;line-height:1}}
th{{color:#fff;font-weight:bold;font-size:19.5px}} .c0{{background:#fff;border:none;border-bottom:2px solid #000}}
.tb{{background:#974706}} .tp{{background:#002060}} .hg{{background:#808080}} .ho{{background:#e26b0a}} .hb{{background:#0f2fff}}
td.g{{background:#00d000;color:#fff;font-weight:bold}} td.b{{font-weight:bold}} td.l{{border-left:2px solid #000}} th.l{{border-left:2px solid #000}}
</style></head><body><table>
<colgroup><col style="width:13.2%"><col style="width:13.2%"><col style="width:7.9%"><col style="width:7.8%"><col style="width:8.1%"><col style="width:10.3%"><col style="width:6.6%"><col style="width:6.6%"><col style="width:6.6%"><col style="width:5.4%"><col style="width:5.4%"></colgroup>
<tr><th class="c0"></th><th class="c0"></th><th class="tb l" colspan="6">CALIFICACIÓN de los FCIs de BALANZ</th><th class="tp l" colspan="3">Referencia de PEERS</th></tr>
<tr><th class="hg">Fondo</th><th class="hg">Tipo de FCI</th><th class="ho l">Actual</th><th class="ho">Fecha (informe)</th><th class="ho">Anterior (2 años)</th><th class="ho">Evolución YoY</th><th class="ho">Anterior</th><th class="ho">Evolución</th><th class="hb l">Mínima</th><th class="hb">Máxima</th><th class="hb">Promedio</th></tr>
{rows}</table></body></html>"""
open("/tmp/ratings.html", "w").write(html)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": W, "height": H}, device_scale_factor=2)
    pg.goto("file:///tmp/ratings.html"); pg.screenshot(path=OUT, clip=dict(x=0, y=0, width=W, height=H))
print("ok", OUT)
