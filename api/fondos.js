// GET /api/fondos?mes=2026-10&gerente=Balanz&categoria=Money%20Market&subcategoria=MM%20ARS&tipo_gerente=Bancaria&fondo=ahorro&codigo=123
const { mensual, contiene, responder, manejar } = require("./_lib");
module.exports = manejar(async (req, res) => {
  const q = req.query;
  const { meta, filas } = await mensual(q.mes);
  const codigos = q.codigo ? String(q.codigo).split(",").map(Number) : null;
  const datos = filas.filter(f => contiene(f.Gerente, q.gerente) && contiene(f.Categoria, q.categoria) && contiene(f.Fondo, q.fondo)
    && contiene(f.Subcategoria, q.subcategoria) && contiene(f.Tipo_Gerente, q.tipo_gerente)
    && (!codigos || codigos.includes(f.Codigo_CNV)));
  responder(req, res, datos, { mes: meta.mes, desde: meta.desde, hasta: meta.hasta, parcial: meta.parcial, unidad: "millones de ARS" });
});
