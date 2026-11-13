// GET /api/vcp?clase=1234,5678&desde=2026-01-01&hasta=2026-11-12&base100=1&moneda=original
// Serie diaria de valor de cuotaparte (como DATASETS / FCI / Performance / Series de 1816).
//   clase: Codigo CAFCI (una o varias) | codigo: Codigo CNV (usa la cuota de referencia de cada fondo)
//   base100=1: base 100 al inicio | moneda: original (default) | ars | usd (convertido con promedio MEP-CCL del dia)
//   Periodo maximo: 400 dias.
const { indice, diarioCols, dolar, bajar, parseCSV, responder, manejar } = require("./_lib");
const dia = s => new Date(s + "T00:00:00Z"), iso = d => d.toISOString().slice(0, 10);
module.exports = manejar(async (req, res) => {
  const q = req.query;
  const idx = await indice();
  const hasta = (q.hasta || idx.fechas_planilla[idx.fechas_planilla.length - 1]).slice(0, 10);
  const desde = (q.desde || iso(new Date(dia(hasta) - 365 * 864e5))).slice(0, 10);
  if ((dia(hasta) - dia(desde)) / 864e5 > 400) throw Object.assign(new Error("Periodo maximo: 400 dias"), { status: 400 });
  let clases = q.clase ? String(q.clase).split(",").map(Number) : [];
  if (q.codigo) {
    const cods = String(q.codigo).split(",").map(Number);
    const r = parseCSV(await bajar("rendimientos.csv"));
    clases.push(...r.filter(f => cods.includes(f.codigo_cnv) && f.cuota_referencia === 1).map(f => f.codigo_cafci));
  }
  if (!clases.length) throw Object.assign(new Error("Indicar clase (Codigo CAFCI) o codigo (Codigo CNV)"), { status: 400 });
  const mon = (q.moneda || "original").toLowerCase();
  const ms = idx.mensual.map(m => m.mes).filter(m => m >= desde.slice(0, 7) && m <= hasta.slice(0, 7));
  const cols = ["fecha", "codigo_cafci", "fondo_clase", "moneda", "vcp"];
  const [partes, tc] = await Promise.all([Promise.all(ms.map(m => diarioCols(m, cols))), mon === "original" ? null : dolar()]);
  const datos = [], base = new Map();
  for (const filas of partes) for (const [fecha, cafci, nombre, moneda, vcp] of filas) {
    if (!clases.includes(cafci) || fecha < desde || fecha > hasta || !(vcp > 0)) continue;
    let v = vcp;
    if (mon === "ars" && moneda !== "ARS") v = vcp * tc.get(fecha);
    if (mon === "usd" && moneda === "ARS") v = vcp / tc.get(fecha);
    if (!base.has(cafci)) base.set(cafci, v);
    datos.push({ fecha, codigo_cafci: cafci, cuota: nombre, moneda_clase: moneda, valor: q.base100 === "1" ? 100 * v / base.get(cafci) : v });
  }
  datos.sort((a, b) => a.codigo_cafci - b.codigo_cafci || (a.fecha < b.fecha ? -1 : 1));
  responder(req, res, datos, { desde, hasta, moneda: mon, base100: q.base100 === "1" });
});
