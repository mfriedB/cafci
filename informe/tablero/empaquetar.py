"""Arma la carpeta lista para publicar el tablero "Informe de Gestión FCI" en el artifact privado.

Corre en la compu de Matías (device_bash). Junta:
  - el código del tablero de este repo (informe/tablero),
  - el diseño de las hojas sacado del Power BI "Informe Gestion FCI.pbix" (pbi_spec.js + pbi_img/, con pbi_convert.py),
  - los datos (data/industria.json y data/internos.json, de build_data.py; los internos nunca pasan por GitHub).

Uso: python3 empaquetar.py <carpeta_tablero_del_repo> <pbix> <carpeta_data> <salida>
La salida queda con la misma estructura que el artifact (index.html, *.js, pbi_img/, data/) y un manifiesto.json con
la lista de archivos y su hash, para publicar solo lo que cambió. echarts.min.js no se incluye: el artifact ya lo tiene.
"""
import hashlib, json, os, shutil, subprocess, sys

CODIGO = ["model.js", "ui.js", "pbi_format.js", "pbi_model.js", "pbi_render.js", "pbi_custom.js", "pages_call_slides.js", "pages_call_prop.js", "app.js"]
CDN = "https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.1/echarts.min.js"


def main():
    repo, pbix, data, out = sys.argv[1:5]
    os.makedirs(os.path.join(out, "data"), exist_ok=True)
    for f in CODIGO:
        shutil.copyfile(os.path.join(repo, f), os.path.join(out, f))
    html = open(os.path.join(repo, "index.html"), encoding="utf-8").read().replace(CDN, "echarts.min.js")
    open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(html)
    if os.path.exists(pbix):
        subprocess.run([sys.executable, os.path.join(repo, "pbi_convert.py"), pbix, out], check=True)
    else:
        print("AVISO: no se encontró el .pbix; se mantiene el diseño publicado (pbi_spec.js)", pbix)
    for f in ("industria.json", "internos.json"):
        p = os.path.join(data, f)
        if os.path.exists(p):
            shutil.copyfile(p, os.path.join(out, "data", f))
    man = {}
    for base, _, fs in os.walk(out):
        for f in fs:
            if f == "manifiesto.json":
                continue
            p = os.path.join(base, f)
            rel = os.path.relpath(p, out).replace(os.sep, "/")
            man[rel] = hashlib.sha256(open(p, "rb").read()).hexdigest()
    json.dump(man, open(os.path.join(out, "manifiesto.json"), "w"), indent=1, sort_keys=True)
    print("archivos", len(man))
    for k in sorted(man):
        print(" ", k)


if __name__ == "__main__":
    main()
