// GET /api/industria?desde=2026-01&por=categoria   (por = total | categoria | gerente)
const { indice, mensual, meses, contiene, responder, manejar } = require("./_lib");
const M = ["AUM_promedio", "AUM_Inicial", "AUM_Final", "Susc_Netas", "Rendimiento", "Facturacion_Gerente", "Facturacion_Depo"];
module.exports = manejar(async (req, res) => {
  const q = req.query, por = (q.por || "total").toLowerCase();
  const idx = await indice();
  const partes = await Promise.all(meses(idx, q.desde, q.hasta).map(m => mensual(m)));
  const datos = [];
  for (const { meta, filas } of partes) {
    const g = new Map();
    for (const f of filas) {
      if (!contiene(f.Gerente, q.gerente) || !contiene(f.Categoria, q.categoria)) continue;
      const k = por === "categoria" ? f.Categoria : por === "gerente" ? f.Gerente : "Industria";
      const a = g.get(k) || Object.fromEntries([["Mes", meta.mes], [por === "total" ? "Grupo" : por, k], ["Fondos", 0], ...M.map(m => [m, 0])]);
      a.Fondos++; for (const m of M) a[m] += f[m] || 0; g.set(k, a);
    }
    datos.push(...[...g.values()].map(a => (M.forEach(m => a[m] = Math.round(a[m] * 1000) / 1000), a)));
  }
  responder(req, res, datos, { unidad: "millones de ARS" });
});
