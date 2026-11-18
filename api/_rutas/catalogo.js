// GET /api/catalogo?nivel=fondo|clase&buscar=texto&gerente=&categoria=&subcategoria=&tipo_gerente=&moneda=&codigo=&clase=
// Fondos y clases vigentes (ultima planilla) con codigos CNV y CAFCI, clasificacion 1816 y CAFCI, honorarios y patrimonio.
const { bajar, parseCSV, contiene, responder, manejar } = require("../_lib");
module.exports = manejar(async (req, res) => {
  const q = req.query, nivel = String(q.nivel || "fondo").toLowerCase();
  if (!["fondo", "clase"].includes(nivel)) throw Object.assign(new Error("nivel = fondo | clase"), { status: 400 });
  const [rend, tax] = await Promise.all([bajar("rendimientos.csv").then(parseCSV), bajar("taxonomia.csv").then(parseCSV).catch(() => [])]);
  const fuente = new Map(tax.map(t => [t.Codigo_CNV, t.fuente_tax == null ? null : String(t.fuente_tax)]));
  const cods = q.codigo ? String(q.codigo).split(",").map(Number) : null, clases = q.clase ? String(q.clase).split(",").map(Number) : null;
  const filas = rend.filter(f => (q.incluir_596 === "1" || f.decreto_596 !== "S")
    && (!q.buscar || String(q.buscar).split(/\s+/).every(p => contiene([f.fondo_1816, f.fondo, f.fondo_clase, f.gerente_1816, f.gerente].join(" "), p)))
    && (contiene(f.fondo_1816, q.fondo) || contiene(f.fondo, q.fondo))
    && (contiene(f.gerente_1816, q.gerente) || contiene(f.gerente, q.gerente)) && contiene(f.categoria_1816, q.categoria)
    && contiene(f.subcategoria_1816, q.subcategoria) && contiene(f.tipo_gerente, q.tipo_gerente)
    && (!q.moneda || String(f.moneda).toUpperCase() === String(q.moneda).toUpperCase())
    && (!cods || cods.includes(f.codigo_cnv)) && (!clases || clases.includes(f.codigo_cafci)));
  const base = f => ({ fecha: f.fecha, codigo_cnv: f.codigo_cnv, fondo: f.fondo_1816 || f.fondo, fondo_cafci: f.fondo, gerente: f.gerente_1816,
    sociedad_gerente: f.gerente, tipo_gerente: f.tipo_gerente, categoria: f.categoria_1816, subcategoria: f.subcategoria_1816,
    clasificacion_cafci: f.clasificacion_cafci });
  let datos;
  if (nivel === "clase") {
    datos = filas.map(f => ({ ...base(f), codigo_cafci: f.codigo_cafci, cuota: f.fondo_clase, moneda_clase: f.moneda, cuota_referencia: f.cuota_referencia,
      patrimonio_clase: f.patrimonio_clase_mill, patrimonio_fondo: f.patrimonio_fondo_mill, hon_gerente: f.hon_sg, hon_depositaria: f.hon_sd,
      calificacion: f.calificacion, depositaria: f.depositaria, decreto_596: f.decreto_596, fuente_clasificacion: fuente.get(f.codigo_cnv) ?? null }))
      .sort((a, b) => (b.patrimonio_fondo || 0) - (a.patrimonio_fondo || 0) || a.codigo_cnv - b.codigo_cnv || (b.patrimonio_clase || 0) - (a.patrimonio_clase || 0));
  } else {
    const g = new Map();
    for (const f of filas) {
      let a = g.get(f.codigo_cnv);
      if (!a) g.set(f.codigo_cnv, a = { ...base(f), clases: 0, monedas: new Set(), codigo_cafci_referencia: null, patrimonio_fondo: f.patrimonio_fondo_mill,
        depositaria: f.depositaria, decreto_596: f.decreto_596, fuente_clasificacion: fuente.get(f.codigo_cnv) ?? null });
      a.clases++; if (f.moneda) a.monedas.add(f.moneda);
      if (f.cuota_referencia === 1) a.codigo_cafci_referencia = f.codigo_cafci;
    }
    datos = [...g.values()].map(a => ({ ...a, monedas: [...a.monedas].join(",") })).sort((a, b) => (b.patrimonio_fondo || 0) - (a.patrimonio_fondo || 0));
  }
  responder(req, res, datos, { nivel, fecha: rend[0] && rend[0].fecha, unidad: "patrimonio en millones de ARS; honorarios en % anual" });
});
