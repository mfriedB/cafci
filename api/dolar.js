// GET /api/dolar?desde=2026-01-01&hasta=2026-11-30
const { bajar, parseCSV, responder, manejar } = require("./_lib");
module.exports = manejar(async (req, res) => {
  const q = req.query;
  const datos = parseCSV(await bajar("dolar.csv")).filter(f => (!q.desde || f.fecha >= q.desde) && (!q.hasta || f.fecha <= q.hasta));
  responder(req, res, datos);
});
