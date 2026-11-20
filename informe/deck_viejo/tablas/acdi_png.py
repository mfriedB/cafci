"""Imagen de la tabla de ACDIs (slide 41) con el formato del Excel original, desde acdi.csv."""
import os, sys
import pandas as pd
from playwright.sync_api import sync_playwright
AQ = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/igs/charts/s41_6.png"
d = pd.read_csv(os.path.join(AQ, "acdi.csv"), index_col=0)
W, H = 1196, 886
f = lambda v: f"{v:,.0f}".replace(",", ".")
cols = list(d.columns)
th = "".join(f"<th>{'' if i == 0 else c}</th>" for i, c in enumerate(cols))
body = ""
for n, r in d.iterrows():
    tot = n == "Total general"
    body += f"<tr{' class=t' if tot else ''}><td class=n>{n}</td>" + "".join(f"<td>{f(v)}</td>" for v in r.values) + "</tr>"
html = f"""<html><head><style>body{{margin:0;background:#fff}}
table{{border-collapse:collapse;width:{W}px;height:{H}px;font-family:Carlito,Calibri,sans-serif;font-size:7.4px;font-weight:bold;table-layout:fixed}}
td,th{{border:0.6px solid #000;text-align:right;padding:0 1.5px;white-space:nowrap;overflow:hidden;line-height:1}}
th{{background:#1f4e79;color:#fff}} td.n,th:first-child{{text-align:left;background:#1f4e79;color:#fff;width:16.3%}}
tr.t td{{background:#1f4e79;color:#fff}}
</style></head><body><table><tr><th>ACDI</th>{th}</tr>{body}</table></body></html>"""
open("/tmp/acdi.html", "w").write(html.replace("<th></th>", "<th></th>", 1))
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": W, "height": H}, device_scale_factor=3)
    pg.goto("file:///tmp/acdi.html"); pg.screenshot(path=OUT, clip=dict(x=0, y=0, width=W, height=H))
print("ok", OUT, len(d))
