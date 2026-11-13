// GET /api/serie?codigo=1234,5678&desde=2026-01&hasta=2026-11   (o fondo=texto / gerente=texto)
const { indice, mensual, meses, contiene, responder, manejar } = require("./_lib");
module.exports = manejar(async (req, res) => {
  const q = req.query;
  if (!q.codigo && !q.fondo && !q.gerente) { const e = new Error("Indicar codigo, fondo o gerente"); e.status = 400; throw e; }
  const idx = await indice();
  const lista = meses(idx, q.desde, q.hasta);
  const codigos = q.codigo ? String(q.codigo).split(",").map(Number) : null;
  const partes = await Promise.all(lista.map(m => mensual(m)));
  const datos = [];
  for (const { meta, filas } of partes)
    for (const f of filas)
      if ((!codigos || codigos.includes(f.Codigo_CNV)) && contiene(f.Fondo, q.fondo) && contiene(f.Gerente, q.gerente))
        datos.push({ Mes: meta.mes, ...f });
  responder(req, res, datos, { unidad: "millones de ARS" });
});
