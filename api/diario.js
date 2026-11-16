// GET /api/diario?desde=2026-10-01&hasta=2026-11-13&por=gerente&categoria=money
// Serie diaria por fondo (procesado/fondos_diario/): patrimonio, suscripciones netas y flujo % del patrimonio previo.
// por=fondo (default) | gerente | categoria | subcategoria | tipo_gerente | total  agrega por fecha.
// Filtros: codigo (Codigo CNV, varios con coma), fondo, gerente, categoria, subcategoria, tipo_gerente. Maximo 13 meses.
const zlib = require("zlib");
const { bajar, parseCSV, indice, meses, contiene, responder, manejar } = require("./_lib");
module.exports = manejar(async (req, res) => {
  const q = req.query, idx = await indice();
  const ult = idx.mensual[idx.mensual.length - 1].hasta;
  const hasta = q.hasta || ult, desde = q.desde || hasta.slice(0, 7) + "-01";
  const ms = meses(idx, desde, hasta);
  if (ms.length > 13) { const e = new Error("Rango maximo: 13 meses"); e.status = 400; throw e; }
  const cods = q.codigo ? String(q.codigo).split(",").map(Number) : null;
  let filas = [];
  for (const m of ms) {
    const txt = zlib.gunzipSync(await bajar(`fondos_diario/${m}.csv.gz`, true)).toString("utf8");
    for (const f of parseCSV(txt))
      if (f.fecha >= desde && f.fecha <= hasta && (!cods || cods.includes(f.codigo_cnv)) && contiene(f.fondo, q.fondo) &&
          contiene(f.gerente, q.gerente) && contiene(f.categoria, q.categoria) && contiene(f.subcategoria, q.subcategoria) &&
          contiene(f.tipo_gerente, q.tipo_gerente)) filas.push(f);
  }
  const por = (q.por || "fondo").toLowerCase();
  if (por !== "fondo") {
    const k = f => por === "total" ? "Total" : f[por] || "(sin dato)", acc = new Map();
    for (const f of filas) {
      const key = f.fecha + "|" + k(f);
      const a = acc.get(key) || { fecha: f.fecha, [por]: k(f), patrimonio: 0, flujo: 0, base: 0, fondos: 0 };
      a.patrimonio += f.patrimonio || 0; a.flujo += f.flujo || 0; a.fondos++;
      if (f.flujo_pct != null && f.flujo_pct !== 0) a.base += f.flujo / f.flujo_pct; else a.base += (f.patrimonio || 0) - (f.flujo || 0);
      acc.set(key, a);
    }
    filas = [...acc.values()].map(a => ({ fecha: a.fecha, [por]: a[por], fondos: a.fondos, patrimonio: a.patrimonio, flujo: a.flujo,
      flujo_pct: a.base > 0 ? a.flujo / a.base : null })).sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0);
  }
  responder(req, res, filas, { desde, hasta, por, unidad: "millones de ARS" });
});
