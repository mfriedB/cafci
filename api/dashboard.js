// GET /api/dashboard?archivo=fondos|categorias|corte|historial&moneda=ARS
// Datos del tablero "Ranking Fondos Balanz" (procesado/dashboard/*.json): rendimiento 7 dias, AUM promedio semanal,
// suscripciones netas y posiciones dentro del subtipo 1816, por cuota de referencia, en ARS y USD.
const { bajar, contiene, responder, manejar } = require("./_lib");
const A = ["fondos", "categorias", "corte", "historial"];
module.exports = manejar(async (req, res) => {
  const q = req.query, a = (q.archivo || "fondos").toLowerCase();
  if (!A.includes(a)) throw Object.assign(new Error("archivo = " + A.join(" | ")), { status: 400 });
  let d = JSON.parse(await bajar(`dashboard/${a}.json`));
  d = d.filter(f => (!q.moneda || !f.moneda || f.moneda === q.moneda.toUpperCase()) && contiene(f.categoria, q.categoria)
    && contiene(f.gerente, q.gerente) && (q.balanz !== "1" || f.balanz === true || a === "historial"));
  responder(req, res, d);
});
