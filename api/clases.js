// GET /api/clases?mes=2026-11&codigo=1234   (codigo = Codigo CNV del fondo; clase = Codigo CAFCI de la clase)
const { diario, contiene, responder, manejar } = require("./_lib");
module.exports = manejar(async (req, res) => {
  const q = req.query;
  if (!q.mes) { const e = new Error("Indicar mes=AAAA-MM"); e.status = 400; throw e; }
  if (!q.codigo && !q.clase && !q.fondo && !q.gerente) { const e = new Error("Indicar codigo, clase, fondo o gerente (el mes completo tiene ~80.000 filas)"); e.status = 400; throw e; }
  const cods = q.codigo ? String(q.codigo).split(",").map(Number) : null, clases = q.clase ? String(q.clase).split(",").map(Number) : null;
  const datos = (await diario(q.mes)).filter(f => (!cods || cods.includes(f.codigo_cnv)) && (!clases || clases.includes(f.codigo_cafci))
    && contiene(f.fondo, q.fondo) && contiene(f.gerente, q.gerente) && (!q.desde || f.fecha >= q.desde) && (!q.hasta || f.fecha <= q.hasta));
  responder(req, res, datos, { mes: q.mes });
});
