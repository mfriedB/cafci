// GET /api/ranking?mes=2026-10&por=gerente&metrica=AUM_promedio&top=30
const { mensual, contiene, responder, manejar } = require("./_lib");
module.exports = manejar(async (req, res) => {
  const q = req.query, por = (q.por || "gerente").toLowerCase(), met = q.metrica || "AUM_promedio", top = Number(q.top || 30);
  const { meta, filas } = await mensual(q.mes);
  const g = new Map(); let total = 0;
  for (const f of filas) {
    if (!contiene(f.Categoria, q.categoria)) continue;
    const k = por === "fondo" ? `${f.Fondo}|${f.Gerente}|${f.Codigo_CNV}` : f.Gerente;
    g.set(k, (g.get(k) || 0) + (f[met] || 0)); total += f[met] || 0;
  }
  const datos = [...g.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, v], i) => {
    const [n, ger, cod] = k.split("|");
    return por === "fondo" ? { Puesto: i + 1, Fondo: n, Gerente: ger, Codigo_CNV: Number(cod), [met]: v, Participacion: v / total }
                           : { Puesto: i + 1, Gerente: n, [met]: v, Participacion: v / total };
  });
  responder(req, res, datos, { mes: meta.mes, hasta: meta.hasta, metrica: met, total, unidad: "millones de ARS" });
});
