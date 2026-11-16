// GET /api/insights?tipo=alertas|liquidez|estacionalidad|sensibilidad|fees|concentracion|cambios|resumen
// Indicadores precalculados por scripts/insights.py (procesado/insights/). Filtros de texto: gerente, fondo, categoria,
// subcategoria, campo; codigo (Codigo CNV); solo_alertas=1 (alertas); confirmados=1 (cambios: sin provisorios);
// desde/hasta (cambios: fecha, concentracion: mes); grupo, eje (estacionalidad); top=N; formato=csv
const { bajar, parseCSV, contiene, responder, manejar } = require("./_lib");
const TIPOS = ["alertas", "liquidez", "estacionalidad", "sensibilidad", "fees", "concentracion", "cambios"];
module.exports = manejar(async (req, res) => {
  const q = req.query, tipo = (q.tipo || "resumen").toLowerCase();
  if (tipo === "resumen") return responder(req, res, { ...JSON.parse(await bajar("insights/resumen.json")), tipos: TIPOS });
  if (!TIPOS.includes(tipo)) { const e = new Error(`tipo invalido: usar ${TIPOS.join(", ")}`); e.status = 400; throw e; }
  const cods = q.codigo ? String(q.codigo).split(",").map(Number) : null;
  const si = v => ["1", "true", "si"].includes(String(v || "").toLowerCase());
  let d = parseCSV(await bajar(`insights/${tipo}.csv`)).filter(f =>
    contiene(f.gerente, q.gerente) && contiene(f.fondo, q.fondo) && contiene(f.categoria, q.categoria) &&
    contiene(f.subcategoria, q.subcategoria) && contiene(f.campo, q.campo) && contiene(f.grupo, q.grupo) &&
    (!q.eje || f.eje === q.eje) && (!cods || cods.includes(f.Codigo_CNV)) &&
    (!si(q.solo_alertas) || f.alerta) && (!si(q.confirmados) || f.provisorio !== "True") &&
    (!q.desde || String(f.fecha || f.mes) >= q.desde) && (!q.hasta || String(f.fecha || f.mes) <= q.hasta));
  if (q.top) d = d.slice(0, Number(q.top));
  responder(req, res, d, { tipo });
});
