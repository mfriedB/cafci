// GET /api/rendimientos?moneda=ars&expresion=directo&cuotas=referencia&subtipo=MM%20ARS&orden=30D&top=50
// Ranking de rendimientos por cuota, como DATASETS / FCI / Performance / Ranking de 1816.
//   moneda: ars (default, como 1816) | usd | original (moneda de la clase)
//   expresion: directo (default) | tna | tea
//   cuotas: referencia (default, una por fondo como 1816) | todas
//   filtros: tipo, subtipo, gerente, tipo_gerente, fondo (texto), codigo (Codigo CNV), clase (Codigo CAFCI), moneda_clase
//   orden: 1D | 7D | MTD | 30D (default) | 90D | YTD | 365D ; top
// Columnas pos_<v>: puesto dentro del subtipo 1816 (1 = mayor rendimiento) entre las cuotas listadas.
const { bajar, parseCSV, contiene, responder, manejar } = require("./_lib");
const V = ["1D", "7D", "MTD", "30D", "90D", "YTD", "365D"];
module.exports = manejar(async (req, res) => {
  const q = req.query;
  const mon = (q.moneda || "ars").toLowerCase(), expr = (q.expresion || "directo").toLowerCase();
  const orden = V.includes(q.orden) ? q.orden : "30D";
  const cods = q.codigo ? String(q.codigo).split(",").map(Number) : null, clases = q.clase ? String(q.clase).split(",").map(Number) : null;
  const todas = (q.cuotas || "referencia").toLowerCase() === "todas";
  let filas = parseCSV(await bajar("rendimientos.csv")).filter(f =>
    f.categoria_1816 && (todas || f.cuota_referencia === 1) && f.decreto_596 !== "S"
    && contiene(f.categoria_1816, q.tipo) && contiene(f.subcategoria_1816, q.subtipo) && contiene(f.gerente_1816, q.gerente)
    && contiene(f.tipo_gerente, q.tipo_gerente) && (contiene(f.fondo_1816, q.fondo) || contiene(f.fondo_clase, q.fondo))
    && (!q.moneda_clase || f.moneda === q.moneda_clase.toUpperCase())
    && (!cods || cods.includes(f.codigo_cnv)) && (!clases || clases.includes(f.codigo_cafci)));
  const conv = (r, d) => r == null ? null : expr === "tna" ? r * 365 / d : expr === "tea" ? Math.pow(1 + r, 365 / d) - 1 : r;
  const datos = filas.map(f => {
    const o = { fecha: f.fecha, codigo_cafci: f.codigo_cafci, codigo_cnv: f.codigo_cnv, cuota: f.fondo_clase, fondo: f.fondo_1816,
      tipo: f.categoria_1816, subtipo: f.subcategoria_1816, gerente: f.gerente_1816, tipo_gerente: f.tipo_gerente,
      moneda_clase: f.moneda, calificacion: f.calificacion, honorarios_total: f.honorarios_total,
      patrimonio_cuota: f.patrimonio_clase_mill, patrimonio_fondo: f.patrimonio_fondo_mill, cuota_referencia: f.cuota_referencia };
    for (const v of V) {
      const r = mon === "original" ? f["r_" + v] : f[`r_${v}_${mon}`];
      o["r_" + v] = conv(r, f["dias_" + v]);
    }
    return o;
  });
  for (const v of V) {               // puesto dentro del subtipo
    const g = new Map();
    for (const o of datos) if (o["r_" + v] != null) (g.get(o.subtipo) || g.set(o.subtipo, []).get(o.subtipo)).push(o);
    for (const l of g.values()) l.sort((a, b) => b["r_" + v] - a["r_" + v]).forEach((o, i) => o["pos_" + v] = i + 1);
  }
  datos.sort((a, b) => (b["r_" + orden] ?? -Infinity) - (a["r_" + orden] ?? -Infinity));
  const top = q.top ? datos.slice(0, Number(q.top)) : datos;
  responder(req, res, top, { fecha: filas[0] && filas[0].fecha, moneda: mon, expresion: expr, cuotas: todas ? "todas" : "referencia",
    unidad_patrimonio: "millones de ARS" });
});
