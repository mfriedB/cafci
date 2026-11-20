"""Captura visuales del tablero "Informe de Gestión FCI" (réplica del Power BI) para el deck viejo, con los datos ya cortados
al mes del informe. Necesita el tablero servido en http://localhost:8765 (ver actualizar_deck.py) y Playwright.
Uso: python3 capturas_tablero.py [s05_3,s12_5,...]   (sin argumentos: todas)"""
import json, sys, os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'charts'); os.makedirs(OUT, exist_ok=True)
from playwright.sync_api import sync_playwright
PURP={'colors':['#252A6B','#6B66F2','#2E3192','#8E8CF5'],'band':'#2E3192'}
JOBS=[
 ('s05_3',1,None,[]),
 ('s05_5',1,['354eade8e481f50a7570','ed7a3bd05e7571b7549c'],[]),   # se ajusta abajo
 ('s12_5',14,['e24a07ee7b62a8d3a3b9','679e931adb46aba6310c','7af354b369a71c09a611'],[]),
 ('s13_5',15,['7921a489a9bbbfcd0fd1','405794799fe05a68fa2d','5bbc1978c8d734a25f77'],[]),
 ('s15_8',53,['530389a420a960c22d1b'],[]),
 ('s20_5',42,['d3a05784d29ccd3b0318'],[('theme',PURP)]),
 ('s22_3',45,['e36b7dee67ded32bfe46'],[('theme',PURP)]),
 ('s23_6',18,['2bc2c24c7a9261fa8b6b','1574671cd733da0144d1','0186cdfd0da99b45ac90','fa0196f00fb0e9aba2d6'],[('clear','cc4b8513138e76d064c9')]),
 ('s24_8',18,['2bc2c24c7a9261fa8b6b','1574671cd733da0144d1','0186cdfd0da99b45ac90','fa0196f00fb0e9aba2d6'],[('text','cc4b8513138e76d064c9','Balanz')]),
 ('s25_5',43,['e3b9f41a50b5600eb935'],[]),
 ('s26_6',44,['573176e25bd07c4448c8'],[]),
]
only=sys.argv[1].split(',') if len(sys.argv)>1 else None
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1600,'height':1150},device_scale_factor=3)
    pg.goto('http://localhost:8765/index.html#pbi-1'); pg.wait_for_timeout(6000)
    for name,n,ids,acts in JOBS:
        if only and name not in only: continue
        th=[x for x in acts if x[0]=='theme']
        pg.evaluate("c=>{window._dc=window._dc||PBI.theme.dataColors.slice(); PBI.theme.dataColors=c?c.concat(window._dc.slice(c.length)):window._dc.slice()}", th[0][1]['colors'] if th else None)
        pg.evaluate("location.hash='pbi-53'"); pg.wait_for_timeout(800)
        pg.evaluate(f"location.hash='pbi-{n}'"); pg.wait_for_timeout(2500)
        for a in acts:
            if a[0]=='clear':
                inp=pg.locator(f'.pv[data-id="{a[1]}"] input'); inp.fill(''); inp.press('Enter'); pg.wait_for_timeout(2000)
            if a[0]=='text':
                inp=pg.locator(f'.pv[data-id="{a[1]}"] input'); inp.fill(a[2]); inp.press('Enter'); pg.wait_for_timeout(2000)
        if th: pg.evaluate("b=>document.querySelectorAll('.pv-title').forEach(t=>{if(t.style.background)t.style.background=b})", th[0][1]['band'])
        if ids is None:
            r=pg.evaluate("(()=>{const b=document.querySelector('.pv-stage').getBoundingClientRect();return [b.left,b.top,b.right,b.bottom]})()")
        else:
            r=pg.evaluate("ids=>{let L=1e9,T=1e9,R=-1e9,B=-1e9;for(const i of ids){const b=document.querySelector(`.pv[data-id='${i}']`).getBoundingClientRect();L=Math.min(L,b.left);T=Math.min(T,b.top);R=Math.max(R,b.right);B=Math.max(B,b.bottom)};return [L,T,R,B]}",ids)
        pg.screenshot(path=os.path.join(OUT, f'{name}.png'),clip=dict(x=r[0],y=r[1],width=r[2]-r[0],height=r[3]-r[1]),animations='disabled')
        print(name,[round(x) for x in r])
