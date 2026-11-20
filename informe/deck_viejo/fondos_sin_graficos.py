# Uso: python3 fondos_sin_graficos.py INFORME.pptx [reemplazos.json] -> bg2.pptx (se exporta a PDF y PNG con LibreOffice)
# fondo raster sin textos y sin las imagenes que se reemplazan por graficos generados con datos
import json, sys
from pptx import Presentation
R=json.load(open(sys.argv[2] if len(sys.argv) > 2 else 'reemplazos.json'))
p=Presentation(sys.argv[1])  # el PPT original del informe
def walk(shs, rm):
    for sh in list(shs):
        if sh.shape_type==6: walk(sh.shapes, rm); continue
        if sh.shape_id in rm and sh.shape_type==13:
            sh._element.getparent().remove(sh._element); continue
        if sh.has_text_frame and sh.text_frame.text.strip():
            for para in sh.text_frame.paragraphs:
                for r in para.runs: r.text=''
                for f in para._p.findall('{http://schemas.openxmlformats.org/drawingml/2006/main}fld'): f.getparent().remove(f)
for i,s in enumerate(p.slides,1): walk(s.shapes, set(R.get(str(i),[])))
p.save('bg2.pptx')
