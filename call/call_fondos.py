"""Actualiza las slides 4 a 9 de la Call de Fondos sin pasar por Power BI ni por 1816.

Datos: base oficial CAFCI/CNV via la API https://cafci.vercel.app/api/fondos (respaldo: rama datos del repo mfriedB/cafci, procesado/).
El script vigente se baja con: curl -sfL -o call_fondos.py "https://cafci.vercel.app/api/script?nombre=call_fondos.py"
La base ya trae la clasificacion de 1816 (tipo, subtipo, nombre del fondo, gerente corto y tipo de gerente; ver
mapeo/ y scripts/taxonomia.py), asi que no hace falta ningun archivo local.

Uso:  python call_fondos.py --pptx "Call de Fondos -13.11.2026.pptx" --salida "Call de Fondos -20.11.2026.pptx"
      (sin --pptx solo genera los graficos en la carpeta graficos/)
      python call_fondos.py --auto CARPETA
      (toma la "Call de Fondos -DD.MM.AAAA.pptx" mas nueva de CARPETA como modelo y guarda en la misma carpeta la del
       viernes siguiente; si ya existe, la actualiza. Es lo que corre la tarea programada semanal)
"""
import argparse, io, json, os, re, sys, urllib.request
from datetime import date
import numpy as np
import pandas as pd
from PIL import Image, ImageDraw, ImageFont

API_URL = os.environ.get("CAFCI_API", "https://cafci.vercel.app/api")
BASE_URL = "https://raw.githubusercontent.com/mfriedB/cafci/datos/procesado/"   # respaldo si la API no responde
ASSET_URL = "https://raw.githubusercontent.com/mfriedB/cafci/main/call/"      # plantillas y fuentes
AQUI = os.path.dirname(os.path.abspath(__file__))
MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
MESES_L = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

# ---------------------------------------------------------------- datos
def leer_url(nombre):
    with urllib.request.urlopen(BASE_URL + nombre, timeout=120) as r: return r.read()

def leer_api(mes):
    with urllib.request.urlopen(f"{API_URL}/fondos?mes={mes}&formato=csv", timeout=120) as r: return r.read()

# Columna calculada CSV_1816[Tipo_Gerente] del Power BI "Informe Gestion FCI": el resto son independientes
BANCARIAS_PBI = ["Galicia", "Santander", "BBVA", "HSBC", "ICBC", "Macro", "Pellegrini", "BIND", "Provinfondos", "Patagonia", "Proahorro",
                 "Supervielle", "BACS", "Bancor", "Mariva", "Ciudad", "CMF", "SAM Arg", "Chaco"]

def cargar(desde=None):
    """Base mensual por fondo desde la API (cafci.vercel.app/api/fondos); si la API no responde, lee procesado/ de la rama datos."""
    try:
        with urllib.request.urlopen(f"{API_URL}/fondos", timeout=60) as r: ult = json.loads(r.read())["mes"]
        desde = desde or f"{int(ult[:4]) - 1}-12"
        meses = [str(m) for m in pd.period_range(desde, ult, freq="M")]
        D = pd.concat([pd.read_csv(io.BytesIO(leer_api(m))) for m in meses], ignore_index=True)
        idx = {"fuente": API_URL}
        print("datos: API", API_URL, "| meses", meses[0], "a", meses[-1])
    except Exception as e:
        print("API no disponible (", e, ") -> uso la rama datos de GitHub")
        idx = json.loads(leer_url("index.json"))
        desde = desde or f"{int(idx['mensual'][-1]['mes'][:4]) - 1}-12"
        meses = [m for m in idx["mensual"] if m["mes"] >= desde]
        D = pd.concat([pd.read_csv(io.BytesIO(leer_url(m["archivo"]))) for m in meses], ignore_index=True)
    D["mes"] = D.Fecha.str[:7]
    D["Gerente_corto"] = D.Gerente
    D["Tipo_Gerente"] = np.where(D.Gerente_corto.str.strip().str.upper().isin([g.upper() for g in BANCARIAS_PBI]), "Bancarias", "Independientes")
    D["Cat"] = D.Categoria
    D["RF_USD"] = D.Subcategoria.isin(["RF USD CP", "RF USD Disc", "RF USD GL Ex ARG", "RF USD GL Inc ARG", "RF USD corp loc"])
    D["Nombre"] = D.Fondo.str.strip()
    D["Balanz"] = D.Gerente_corto.eq("Balanz")
    for c in ["AUM_promedio", "AUM_Final", "AUM_Inicial", "Susc_Netas"]: D[c] = D[c] / 1e6        # millones -> billones
    return D, idx

def fmt(v, d=2): return f"{v:,.{d}f}".replace(",", "X").replace(".", ",").replace("X", ".")
def etiqueta_mes(m): y, mm = m.split("-"); return f"{MESES[int(mm)-1]} {y}"

# ---------------------------------------------------------------- dibujo estilo Power BI
# Cada grafico se dibuja sobre una plantilla (plantillas/slideN.png) que es la imagen exportada del Power BI
# "Informe Gestion FCI" sin los datos: titulos, marcos y leyendas quedan identicos. Lo que depende de los datos
# (barras, lineas, burbujas, etiquetas) se dibuja con las posiciones, tamanos y colores medidos en esas imagenes.
# Fuente: Selawik (sustituto libre de Segoe UI publicado por Microsoft, misma metrica).
SS = 3                                                    # supermuestreo para bordes suaves
NEGRO, GRIS_LBL, GRIS_EJE = (0, 0, 0), (110, 106, 106), (96, 94, 92)
C_BANC, C_IND = (41, 50, 111), (90, 129, 206)             # Bancarias / Independientes
C_NAVY, C_VIOLETA = (41, 50, 111), (103, 96, 255)
_fuentes = {}

def asset(rel):
    """Archivo auxiliar (plantilla o fuente) junto al script; si falta lo baja del repo."""
    ruta = os.path.join(AQUI, rel)
    if not os.path.exists(ruta):
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with urllib.request.urlopen(ASSET_URL + rel.replace(os.sep, "/").replace(" ", "%20"), timeout=120) as r: data = r.read()
        with open(ruta, "wb") as f: f.write(data)
    return ruta

def F(px, bold=True):
    k = (round(px * SS, 1), bold)
    if k not in _fuentes:
        _fuentes[k] = ImageFont.truetype(asset("fuentes/Selawik-Bold.ttf" if bold else "fuentes/Selawik-Regular.ttf"), k[0])
    return _fuentes[k]

class Lienzo:
    """Lienzo en coordenadas de la imagen final (px); internamente dibuja a SS x."""
    def __init__(self, n):
        base = Image.open(asset(f"plantillas/slide{n}.png")).convert("RGB")
        self.W, self.H = base.size
        self.im = base.resize((self.W * SS, self.H * SS), Image.NEAREST)
        self.d = ImageDraw.Draw(self.im, "RGBA")
    def rect(self, x0, y0, x1, y1, fill):
        self.d.rectangle([round(x0 * SS), round(y0 * SS), round(x1 * SS) - 1, round(y1 * SS) - 1], fill=fill)
    def linea(self, pts, color, w):
        p = [(x * SS, y * SS) for x, y in pts]
        self.d.line(p, fill=color, width=round(w * SS), joint="curve")
        for x, y in p:                                   # puntas redondeadas
            r = w * SS / 2; self.d.ellipse([x - r, y - r, x + r, y + r], fill=color)
    def circulo(self, x, y, r, fill, borde=None, wb=0):
        self.d.ellipse([(x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r) * SS], fill=fill, outline=borde, width=round(wb * SS))
    def texto(self, s, x, y, px, color=NEGRO, ancla="ms", bold=True):
        """ancla de PIL: x l/m/r, y s = linea de base (los numeros apoyan sobre la base)."""
        self.d.text((x * SS, y * SS), s, font=F(px, bold), fill=color, anchor=ancla)
    def ancho(self, s, px, bold=True):
        b = F(px, bold).getbbox(s); return (b[2] - b[0]) / SS
    def caja(self, s, x, y, px, bold=True, ancla="ms"):
        b = self.d.textbbox((x * SS, y * SS), s, font=F(px, bold), anchor=ancla); return [v / SS for v in b]
    def texto_rotado(self, s, x, y, px, color, ang):
        """texto rotado ang grados (antihorario) cuyo final queda en (x, y) = esquina superior derecha."""
        f = F(px, False); b = f.getbbox(s)
        t = Image.new("L", (b[2] + 8, b[3] + 8), 0); ImageDraw.Draw(t).text((4, 4), s, font=f, fill=255)
        t = t.rotate(ang, expand=True, resample=Image.BICUBIC)
        X, Y = round(x * SS - t.width), round(y * SS)
        capa = Image.new("RGB", t.size, color); self.im.paste(capa, (X, Y), t)
    def guardar(self, out):
        self.im.resize((self.W, self.H), Image.LANCZOS).save(out)

def paso_lindo(maximo, max_marcas=12, pasos=(1, 2.5, 5)):
    k = 10 ** np.floor(np.log10(max(maximo, 1e-9) / max_marcas))
    for m in (1, 10, 100):
        for p in pasos:
            if p * k * m * max_marcas >= maximo: return p * k * m
    return maximo

def anio(D): return D.mes.max()[:4]
def meses_anio(D): return sorted(m for m in D.mes.unique() if m[:4] == anio(D))
def mes_base(D): return f"{int(anio(D)) - 1}-12"

# ---------------------------------------------------------------- slide 4
def slide4(D, out):
    C = Lienzo(4)
    u = D[D.mes == D.mes.max()]
    g = u.groupby(["Gerente_corto", "Tipo_Gerente"]).AUM_promedio.sum().reset_index().sort_values("AUM_promedio", ascending=False)
    top = g.head(30).reset_index(drop=True)
    # ranking (30 filas, paso 55,28 px, barra 46 px, ancho maximo 606,5 px)
    vmax = top.AUM_promedio.max()
    for i, r in top.iterrows():
        y0 = i * 55.276; yc = y0 + 23
        x1 = 238.5 + r.AUM_promedio / vmax * 607
        C.rect(238.5, y0, x1, y0 + 46, C_BANC if r.Tipo_Gerente == "Bancarias" else C_IND)
        C.texto(r.Gerente_corto, 214, yc + 11.5, 31.2, ancla="rs")
        C.texto(f"{fmt(r.AUM_promedio)} bill.", x1 + 30, yc + 15, 31.2, ancla="ls")
    puesto = int(top.index[top.Gerente_corto.eq("Balanz")][0]) + 1 if top.Gerente_corto.eq("Balanz").any() else None
    # tarjeta
    tot = u.AUM_promedio.sum()
    C.texto(f"{fmt(tot)} bill.", 1507, 382, 78, color=(17, 17, 17), ancla="ms")
    # tipo de gerente
    t = u.groupby("Tipo_Gerente").AUM_promedio.sum().reindex(["Bancarias", "Independientes"]).fillna(0)
    for k, (nom, v) in enumerate(t.items()):
        y0 = 856 + k * 144; yc = y0 + 58.5
        x1 = 1337.5 + v / t.max() * 411
        C.rect(1337.5, y0, x1, y0 + 117, C_BANC if k == 0 else C_IND)
        C.texto(nom, 1311, yc + 12, 34.4, ancla="rs")
        C.texto(f"{fmt(v, 1)} bill.", x1 + 30, yc + 12, 34.4, ancla="ls")
    # categoria apilada bancarias / independientes
    c = u.pivot_table(index="Cat", columns="Tipo_Gerente", values="AUM_promedio", aggfunc="sum").fillna(0)
    for col in ["Bancarias", "Independientes"]:
        if col not in c: c[col] = 0
    c["tot"] = c.Bancarias + c.Independientes; c = c.sort_values("tot", ascending=False)
    for k, (nom, r) in enumerate(c.iterrows()):
        y0 = 444 + k * 128.8; yc = y0 + 54
        xb = 2377 + r.Bancarias / c.tot.max() * 411; x1 = 2377 + r.tot / c.tot.max() * 411
        C.rect(2377, y0, xb, y0 + 108, C_BANC); C.rect(xb, y0, x1, y0 + 108, C_IND)
        C.texto(nom, 2351, yc + 12, 34.4, ancla="rs")
        C.texto(f"{fmt(r.tot, 1)} bill.", x1 + 30, yc + 12, 34.4, ancla="ls")
    C.guardar(out)
    return {"total": tot, "puesto_balanz": puesto, "n": 30, "fila_frac": ((puesto - 1) * 55.276 + 23) / C.H if puesto else None}

# ---------------------------------------------------------------- lineas (slides 5 y 8)
def etiqueta_fin(C, x, y, nombre, color_txt, px):
    C.linea([(x + 15, y), (x + 55, y)], (110, 106, 106), 2)
    C.texto(nombre, x + 72, y + px * 0.36, px, color_txt, ancla="ls")

def slide5(D, out):
    C = Lienzo(5)
    ms = [mes_base(D)] + meses_anio(D)
    fechas = []
    for m in ms:
        f = pd.Timestamp(D[D.mes == m].Fecha.iloc[0]); fechas.append(f.strftime("%d/%m/%Y"))
    # eje Y fijo en el Power BI: 0 a 115 % (izquierda) y 0 a 208 % (derecha); (filtro, x0, x1, y del 0 %, y del maximo, maximo)
    paneles = [(None, 2, 1482, 876.8, 103.7, 115), ("RF_USD", 1517, 2997, 873.3, 199.0, 208)]
    for filtro, X0, X1, y0, ytope, fin in paneles:
        X = D if filtro is None else D[D[filtro]]
        t = X.groupby("mes").AUM_Final.sum().reindex(ms); b = X[X.Balanz].groupby("mes").AUM_Final.sum().reindex(ms)
        it = (t / t.iloc[0] - 1) * 100; ib = (b / b.iloc[0] - 1) * 100
        ymax = max(fin, max(it.max(), ib.max()) * 1.03)        # si los datos pasan el tope fijo, se agranda
        esc = (y0 - ytope) / ymax
        n = len(ms); izq = X0 + 81.3; ancho = 1205 / n
        xs = [izq + (i + 0.5) * ancho for i in range(n)]
        for serie, col in [(it, C_NAVY), (ib, C_VIOLETA)]:
            pts = [(x, y0 - v * esc) for x, v in zip(xs, serie)]
            C.linea(pts, col, 7)
            for x, y in pts: C.circulo(x, y, 9.5, col)
        for serie in [ib, it]:
            for x, v in zip(xs, serie):
                yb = y0 - v * esc - 35
                if filtro is not None:                          # este grafico tiene etiquetas con fondo blanco al 76 %
                    b = C.caja(f"{v:.0f} %", x, yb, 26.8); C.d.rectangle([(b[0] - 5) * SS, (b[1] - 5) * SS, (b[2] + 5) * SS, (yb + 7) * SS], fill=(255, 255, 255, 194))
                C.texto(f"{v:.0f} %", x, yb, 26.8, NEGRO, "ms")
        etiqueta_fin(C, xs[-1], y0 - ib.iloc[-1] * esc, "Balanz", (49, 49, 129), 33.8)
        etiqueta_fin(C, xs[-1], y0 - it.iloc[-1] * esc, "Industria", (110, 106, 106), 33.8)
        for i, (x, f) in enumerate(zip(xs, fechas)):          # fechas a 31 grados, se cortan con ... si no entran
            s = f
            while True:
                L = C.ancho(s, 25.7, False)
                if x - L * np.cos(np.radians(31)) >= X0 + 24 or len(s) < 4: break
                s = s[:-2] + "…" if not s.endswith("…") else s[:-2] + "…"
            C.texto_rotado(s, x + 2, 884, 25.7, (96, 92, 92), 31)
    C.guardar(out)

# ---------------------------------------------------------------- slide 6
COLORES_BURBUJA = {  # (relleno, borde) medidos en el Power BI
    "Balanz": ((65, 50, 141), (48, 25, 128)), "Galicia": ((248, 158, 36), (249, 138, 0)), "Santander": ((226, 102, 119), (221, 70, 93)),
    "Mercado Pago": ((194, 144, 165), (184, 121, 147)), "Delta": ((197, 79, 96), (190, 40, 62)), "Provinfondos": ((163, 255, 91), (143, 255, 52)),
    "Schroder": ((133, 158, 238), (112, 140, 233)), "ICBC": ((66, 103, 119), (40, 82, 100)), "BIND": ((97, 168, 199), (70, 153, 189)),
    "Allaria": ((112, 125, 255), (85, 101, 255)), "Pellegrini": ((87, 87, 102), (60, 60, 77)), "Macro": ((62, 67, 71), (35, 41, 45)),
    "BBVA": ((121, 146, 181), (95, 124, 166)), "Adcap": ((65, 82, 133), (38, 58, 115)), "One618": ((52, 70, 79), (25, 45, 56)),
    "Consultatio": ((150, 110, 190), (130, 85, 175)), "Investis": ((120, 180, 120), (95, 165, 95)), "Patagonia": ((70, 130, 180), (45, 110, 165)),
}
OTROS_COLORES = [((230, 140, 60), (225, 115, 25)), ((120, 120, 200), (95, 95, 185)), ((100, 170, 130), (75, 155, 110)), ((200, 90, 150), (190, 60, 130))]

def slide6(D, out, minimo=2.3):
    """Scatter del Power BI: gerentes con AUM promedio > 2,3 bill.; X = suscripciones del ano, Y = AUM promedio del mes /
    AUM final de diciembre - 1 (negativo -> 0), tamano = AUM promedio. Ejes: Y fijo 30 % a 114 %, X hasta 3,5 bill. o mas."""
    C = Lienzo(6)
    ult = D.mes.max(); base = mes_base(D)
    aum = D[D.mes == ult].groupby("Gerente_corto").AUM_promedio.sum()
    aum = aum[aum > minimo].sort_values(ascending=False)
    G = D[D.Gerente_corto.isin(aum.index)]
    susc = G[G.mes.str[:4] == anio(D)].groupby("Gerente_corto").Susc_Netas.sum().reindex(aum.index).fillna(0)
    crec = ((aum / G[G.mes == base].groupby("Gerente_corto").AUM_Final.sum().reindex(aum.index) - 1) * 100).clip(lower=0)
    ok = crec.notna(); aum, susc, crec = aum[ok], susc[ok], crec[ok]
    r = np.sqrt(44 ** 2 + (102 ** 2 - 44 ** 2) * (aum - aum.min()) / max(aum.max() - aum.min(), 1e-9))
    PL, PR, PT, PB = 271, 2378, 113, 1551
    YMIN, YMAX = 30, 114
    xmin = susc.min(); W = PR - PL
    xmax = max([3.5] + [(susc[g] - r[g] * xmin / W) / (1 - r[g] / W) for g in aum.index])   # entra la burbuja mas a la derecha
    sx = W / (xmax - xmin); sy = (PB - PT) / (YMAX - YMIN)
    X = lambda v: PL + (v - xmin) * sx
    Y = lambda v: PB - (v - YMIN) * sy
    gris = (153, 153, 153)
    def punteada(p0, p1):
        (x0, y0), (x1, y1) = p0, p1; L = np.hypot(x1 - x0, y1 - y0); k = 0
        while k < L:
            a, b = k / L, min(k + 15, L) / L
            C.linea([(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a), (x0 + (x1 - x0) * b, y0 + (y1 - y0) * b)], gris, 2.5); k += 31
    px_ = paso_lindo(xmax - xmin, 8, (1, 2, 2.5, 5))
    v = np.ceil(xmin / px_) * px_
    while v <= xmax + 1e-9:
        punteada((X(v), PT), (X(v), PB))
        C.texto(f"{np.floor(v + 0.5):.0f} bill." if px_ >= 0.5 else f"{fmt(v, 1)} bill.", X(v), 1602, 43, GRIS_LBL, "ms"); v += px_
    for v in range(40, YMAX + 1, 20):
        punteada((PL, Y(v)), (PR, Y(v)))
        C.texto(f"{v} %", 235, Y(v) + 15.5, 43, GRIS_LBL, "rs")
    capa = Image.new("RGBA", C.im.size, (0, 0, 0, 0)); dc = ImageDraw.Draw(capa)
    for k, gname in enumerate(aum.index):
        rel, bor = COLORES_BURBUJA.get(gname, OTROS_COLORES[k % len(OTROS_COLORES)])
        cx, cy, rr = X(susc[gname]), Y(crec[gname]), r[gname]
        dc.ellipse([(cx - rr) * SS, (cy - rr) * SS, (cx + rr) * SS, (cy + rr) * SS], fill=rel + (255,), outline=bor + (255,), width=round(2.5 * SS))
    mascara = Image.new("L", C.im.size, 0); ImageDraw.Draw(mascara).rectangle([PL * SS, PT * SS, PR * SS, PB * SS], fill=255)
    capa.putalpha(Image.fromarray(np.minimum(np.array(capa.getchannel("A")), np.array(mascara))))
    C.im.paste(capa, (0, 0), capa)
    puestas = []                                                 # etiquetas con fondo blanco al 60 %; si chocan se corren
    def choca(b): return any(not (b[2] < q[0] or b[0] > q[2] or b[3] < q[1] or b[1] > q[3]) for q in puestas)
    for gname in aum.sort_values(ascending=False).index:
        cx, cy, rr = X(susc[gname]), Y(crec[gname]), r[gname]
        if not (PT <= cy <= PB): continue
        w = C.ancho(gname, 36)
        opciones = [(cx, cy + rr + 50, "ms"), (cx + rr + 18, cy + 13, "ls"), (cx - rr - 18, cy + 13, "rs"), (cx, cy - rr - 22, "ms")]
        for x, yb, an in opciones:
            if an == "ms": x = max(x, PL + w / 2 + 4)
            b = C.caja(gname, x, yb, 36, ancla=an); b = [b[0] - 4, b[1] - 4, b[2] + 4, yb + 9]
            if not choca(b) and b[0] >= PL and b[2] <= PR: break
        else:
            x, yb, an = opciones[0]; x = max(x, PL + w / 2 + 4); b = C.caja(gname, x, yb, 36); b = [b[0] - 4, b[1] - 4, b[2] + 4, yb + 9]
        puestas.append(b)
        C.d.rectangle([v * SS for v in b], fill=(255, 255, 255, 153))
        C.texto(gname, x, yb, 36, NEGRO, an)
    C.guardar(out)

# ---------------------------------------------------------------- slide 7
def slide7(D, out):
    C = Lienzo(7)
    ms = meses_anio(D); X = D[D.mes.isin(ms)]
    aum = X.groupby("mes").AUM_promedio.sum().reindex(ms); share = X[X.Balanz].groupby("mes").AUM_promedio.sum().reindex(ms) / aum * 100
    fl = X.groupby("mes").Susc_Netas.sum().reindex(ms).cumsum(); fb = X[X.Balanz].groupby("mes").Susc_Netas.sum().reindex(ms).cumsum() / fl * 100
    # (barras, linea, x izq, ancho, aire sobre la barra mas alta, tope fijo del eje de la linea en el Power BI, y del tope, formato)
    paneles = [(aum, share, 15.5, 1431.1, 1.08, 5.54, 177, lambda v: f"{v:.0f} bill.", 23.9, 24.0, 39.5),
               (fl, fb, 1524, 1464.6, 1.23, 16.1, 185, lambda v: f"{fmt(v, 1)} bill.", 24.0, 27.2, 43)]
    base = 931
    for barras, linea, izq, W, aire, sec_fin, ytop, fb_, fs_b, fs_p, hcaja in paneles:
        n = len(ms); banda = W / n; xs = [izq + (i + 0.5) * banda for i in range(n)]; bw = banda * 0.71
        eb = (base - ytop) / (barras.max() * aire)
        lmin = linea.min(); fin = max(sec_fin, linea.max() * 1.1)   # el minimo de la linea queda 9 px sobre la base
        el = (base - 9 - ytop) / (fin - lmin) if fin > lmin else 0
        for i, x in enumerate(xs):
            if i % (2 if n > 6 else 1) == 0:                   # linea punteada y mes cada dos meses
                yy = 109
                while yy < base - 4: C.rect(x + 1, yy, x + 3, yy + 3, (200, 200, 200)); yy += 12
                C.texto(etiqueta_mes(ms[i]), x, 970, 26.9, (92, 88, 88), "ms", bold=False)
        for x, v in zip(xs, barras): C.rect(x - bw / 2, base - v * eb, x + bw / 2, base, C_NAVY)
        for x, v in zip(xs, barras): C.texto(fb_(v), x, base - v * eb - 29, fs_b, NEGRO, "ms")
        pts = [(x, base - 9 - (v - lmin) * el) for x, v in zip(xs, linea)]
        C.linea(pts, C_VIOLETA, 7)
        for x, y in pts: C.circulo(x, y, 9, C_VIOLETA)
        for (x, y), v in zip(pts, linea):
            C.d.rectangle([(x - bw / 2) * SS, (y - 27 - hcaja) * SS, (x + bw / 2) * SS, (y - 27) * SS], fill=(255, 255, 255, 194))
            C.texto(f"{fmt(v, 1)} %", x, y - 27 - hcaja * 0.32, fs_p, NEGRO, "ms")
    C.guardar(out)

# ---------------------------------------------------------------- slide 8
SERIES8 = [("Money Market", C_NAVY), ("Renta Fija", (98, 0, 242)), ("T+1", (94, 117, 164)), ("Otros", (104, 98, 255))]
def slide8(D, out):
    C = Lienzo(8)
    ms = meses_anio(D)
    X = D[D.mes.isin(ms)].copy(); X["CO"] = X.Cat.where(X.Cat.isin(["Money Market", "Renta Fija", "T+1"]), "Otros")
    paneles = [(X, 5, 1017.0, 206), (X[X.Balanz], 1530, 1096.3, 181)]
    for Y, X0, y0, ytop in paneles:
        p = Y.pivot_table(index="mes", columns="CO", values="AUM_Final", aggfunc="sum").reindex(ms).fillna(0)
        p = p.div(p.sum(axis=1), axis=0) * 100
        esc = (y0 - ytop) / p.values.max()
        n = len(ms); paso = 1084 / max(n - 1, 1) if n > 1 else 0; x0 = X0 + 74
        xs = [x0 + i * 108.4 for i in range(n)]
        for i, x in enumerate(xs):
            if i % (2 if n > 6 else 1) == 0:
                yy = 107
                while yy < 1040: C.rect(x, yy, x + 2, yy + 3, (205, 205, 205)); yy += 12
                C.texto(etiqueta_mes(ms[i]), x, 1059, 26.9, (92, 88, 88), "ms", bold=False)
        ys = {s: [y0 - v * esc for v in p.get(s, pd.Series(0, index=ms))] for s, _ in SERIES8}
        for s, col in SERIES8:
            pts = list(zip(xs, ys[s])); C.linea(pts, col, 6)
            for x, y in pts: C.circulo(x, y, 9, col)
        for i, x in enumerate(xs):                              # etiquetas arriba; abajo si arriba pisan otro marcador o etiqueta
            puestas = []
            for s_, _ in sorted(SERIES8, key=lambda sc: ys[sc[0]][i]):
                y = ys[s_][i]; v = p[s_].iloc[i] if s_ in p else 0
                otros = [ys[o][i] for o, _ in SERIES8 if o != s_]
                def libre(by): return not any(by - 22 <= oy <= by + 12 for oy in otros) and not any(abs(by - q) < 24 for q in puestas)
                by = y - 36 if libre(y - 36) else y + 56
                puestas.append(by)
                C.texto(f"{fmt(v, 1)} %", x, by, 26, GRIS_LBL, "ms")
        # nombres al final; si dos quedan muy cerca se separan
        fin = sorted([(ys[s][-1], s, col) for s, col in SERIES8])
        pos = []
        for y, s, col in fin:
            yy = y if not pos or y - pos[-1] >= 34 else pos[-1] + 34
            pos.append(yy)
            C.linea([(xs[-1] + 15, y), (xs[-1] + 40, yy)], (110, 106, 106), 2)
            C.texto(s, xs[-1] + 55, yy + 10, 28.4, col, "ls")
    C.guardar(out)

# ---------------------------------------------------------------- slide 9
def envolver(C, s, px, ancho):
    lineas, act = [], ""
    for w in s.split():
        prueba = (act + " " + w).strip()
        if C.ancho(prueba, px) <= ancho or not act: act = prueba
        else: lineas.append(act); act = w
    return lineas + [act]

def slide9(D, out, n=5):
    C = Lienzo(9)
    X = D[(D.mes.str[:4] == anio(D)) & (D.Cat != "Money Market")]
    s = X.groupby(["Codigo_CNV"]).agg(Nombre=("Nombre", "last"), Balanz=("Balanz", "last"), Susc=("Susc_Netas", "sum")).sort_values("Susc", ascending=False).head(n)
    v = s.Susc * 1000; esc = (558 - 181) / v.max()
    cajas = []
    for k, (nom, bz, val) in enumerate(zip(s.Nombre, s.Balanz, v)):
        xc = 281.5 + k * 279.75
        C.rect(xc - 108, 558 - val * esc, xc + 108, 558, C_NAVY)
        C.texto(f"$ {val:,.0f} mil M".replace(",", "."), xc, 558 - val * esc - 27, 36.6, (109, 105, 105), "ms")
        ls = envolver(C, nom, 36.6, 250)
        x0s, x1s = [], []
        for j, l in enumerate(ls):
            C.texto(l, xc, 633 + j * 50, 36.6, NEGRO, "ms"); b = C.caja(l, xc, 633 + j * 50, 36.6); x0s.append(b[0]); x1s.append(b[2])
        if bz:
            cajas.append((min(x0s) / C.W, 604 / C.H, (max(x1s) - min(x0s)) / C.W, (36 + 50 * (len(ls) - 1)) / C.H))
    C.guardar(out)
    return cajas

# ---------------------------------------------------------------- PowerPoint
def fecha_larga(d): return f"{d.day} de {MESES_L[d.month-1]} de {d.year}"

def actualizar_pptx(ruta, salida, imgs, corte, info4, cajas9):
    from pptx import Presentation
    from pptx.util import Emu
    prs = Presentation(ruta)
    for n, img in imgs.items():
        s = prs.slides[n - 1]
        pics = [sh for sh in s.shapes if sh.shape_type == 13]
        big = max(pics, key=lambda x: x.width * x.height)
        L, T, W, H = big.left, big.top, big.width, big.height
        from PIL import Image
        iw, ih = Image.open(img).size
        esc = min(W / iw, H / ih); w, h = int(iw * esc), int(ih * esc)
        nl, nt = L + (W - w) // 2, T + (H - h) // 2
        pic = s.shapes.add_picture(img, nl, nt, w, h)
        big._element.addprevious(pic._element)          # mismo orden z que la imagen vieja
        rid = big._element.blipFill.blip.rEmbed if hasattr(big._element, "blipFill") else None
        big._element.getparent().remove(big._element)
        for sh in s.shapes:                              # pie con la fecha (el texto puede venir partido en varios runs)
            if sh.has_text_frame:
                for p in sh.text_frame.paragraphs:
                    if not p.runs: continue
                    t = "".join(r.text for r in p.runs)
                    t2 = re.sub(r"al \d{1,2} de [A-Za-zé]+ de \d{4}", "al " + fecha_larga(corte), t).replace("fuente 1816", "fuente CAFCI / CNV")
                    if t2 != t:
                        p.runs[0].text = t2
                        for r in p.runs[1:]: r.text = ""
                        if "CAFCI" in t2: sh.width = max(sh.width, Emu(6900000))   # "fuente CAFCI / CNV" en una sola linea
        if n == 4 and info4.get("puesto_balanz"):
            for sh in s.shapes:
                if sh.has_text_frame and sh.text_frame.text.strip().startswith("TOP"):
                    sh.text_frame.paragraphs[0].runs[0].text = f"TOP {info4['puesto_balanz']}"
                    for r in sh.text_frame.paragraphs[0].runs[1:]: r.text = ""
            # flecha y texto a la altura de la fila de Balanz (ranking de 30 filas en la mitad izquierda)
            fila_y = nt + h * info4["fila_frac"]
            for sh in s.shapes:
                if sh.name.startswith("Flecha") or (sh.has_text_frame and sh.text_frame.text.startswith("TOP")):
                    sh.top = int(fila_y - sh.height / 2)
        if n == 9:
            rects = [sh for sh in s.shapes if sh.name.startswith("Rect")]
            for k, sh in enumerate(rects):
                if k < len(cajas9):
                    x, y, ww, hh = cajas9[k]; m = 0.012
                    sh.left, sh.top = int(nl + (x - m) * w), int(nt + (y - m) * h)
                    sh.width, sh.height = int((ww + 2 * m) * w), int((hh + 2 * m) * h)
                else:
                    sh._element.getparent().remove(sh._element)
            for k in range(len(rects), len(cajas9)):     # mas fondos Balanz que recuadros: se duplica el primero
                import copy
                nuevo = copy.deepcopy(rects[0]._element); s.shapes._spTree.append(nuevo)
                sh = s.shapes[-1]; x, y, ww, hh = cajas9[k]; m = 0.012
                sh.left, sh.top = int(nl + (x - m) * w), int(nt + (y - m) * h)
                sh.width, sh.height = int((ww + 2 * m) * w), int((hh + 2 * m) * h)
    prs.save(salida)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pptx"); ap.add_argument("--salida"); ap.add_argument("--graficos", default=os.path.join(AQUI, "graficos"))
    ap.add_argument("--auto", help="carpeta con las Call de Fondos -DD.MM.AAAA.pptx")
    a = ap.parse_args()
    if a.auto:
        from datetime import datetime, timedelta
        decks = []
        for n in os.listdir(a.auto):
            m = re.match(r"Call de Fondos -(\d{2})\.(\d{2})\.(\d{4})\.pptx$", n)
            if m: decks.append((datetime(int(m[3]), int(m[2]), int(m[1])).date(), n))
        if not decks: sys.exit("No hay ninguna 'Call de Fondos -DD.MM.AAAA.pptx' en " + a.auto)
        hoy = date.today()
        viernes = hoy + timedelta(days=(4 - hoy.weekday()) % 7)
        destino = f"Call de Fondos -{viernes:%d.%m.%Y}.pptx"
        modelo = max(decks)[1]
        a.pptx = os.path.join(a.auto, modelo); a.salida = os.path.join(a.auto, destino)
        print("modelo:", modelo, "-> salida:", destino)
    os.makedirs(a.graficos, exist_ok=True)
    D, idx = cargar()
    corte = pd.Timestamp(D[D.mes == D.mes.max()].Fecha.iloc[0]).date()
    g = lambda n: os.path.join(a.graficos, f"slide{n}.png")
    info4 = slide4(D, g(4)); slide5(D, g(5)); slide6(D, g(6)); slide7(D, g(7)); slide8(D, g(8)); cajas9 = slide9(D, g(9))
    print("corte", corte, "| total AUM prom", round(info4["total"], 2), "bill. | Balanz puesto", info4["puesto_balanz"], "| fondos Balanz en top flujo:", len(cajas9))
    if a.pptx:
        actualizar_pptx(a.pptx, a.salida or a.pptx, {n: g(n) for n in range(4, 10)}, corte, info4, cajas9)
        print("presentacion:", a.salida or a.pptx)

if __name__ == "__main__":
    main()
