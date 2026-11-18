// GET /api/vcp?clase=1234,5678&desde=2026-01-01&hasta=2026-11-12&base100=1&moneda=original
// Serie diaria de valor de cuotaparte (como DATASETS / FCI / Performance / Series de 1816).
//   clase: Codigo CAFCI (una o varias) | codigo: Codigo CNV (usa la cuota de referencia de cada fondo)
//   gerente / tipo / subtipo: cuotas de referencia de los fondos que cumplen el filtro (maximo 80)
//   base100=1: base 100 al inicio | moneda: original (default) | ars | usd (convertido con promedio MEP-CCL del dia)
// Camino rapido: series precalculadas por clase (procesado/vcp/<codigo_cafci>.csv.gz, scripts/series_vcp.py), sin limite
// de periodo. Si no estan, lee el detalle diario por clase mes a mes (maximo 400 dias).
const zlib = require("zlib");
const { indice, diarioCols, dolar, bajar, parseCSV, contiene, responder, manejar } = require("../_lib");
const dia = s => new Date(s + "T00:00:00Z"), iso = d => d.toISOString().slice(0, 10);
const MAX_CLASES = 80;
const err = (m, s = 400) => Object.assign(new Error(m), { status: s });

async function catalogoVCP() {
  try { return new Map(parseCSV(await bajar("vcp/clases.csv")).map(f => [f.codigo_cafci, f])); } catch (_) { return null; }
}

module.exports = manejar(async (req, res) => {
  const q = req.query;
  const idx = await indice();
  const hasta = (q.hasta || idx.fechas_planilla[idx.fechas_planilla.length - 1]).slice(0, 10);
  const desde = (q.desde || iso(new Date(dia(hasta) - 365 * 864e5))).slice(0, 10);
  if (desde > hasta) throw err("desde debe ser anterior a hasta");
  let clases = q.clase ? String(q.clase).split(",").map(Number) : [];
  if (q.codigo || q.gerente || q.tipo || q.subtipo) {
    const cods = q.codigo ? String(q.codigo).split(",").map(Number) : null;
    const r = parseCSV(await bajar("rendimientos.csv")).filter(f => f.cuota_referencia === 1
      && (!cods || cods.includes(f.codigo_cnv)) && contiene(f.gerente_1816, q.gerente) && contiene(f.categoria_1816, q.tipo)
      && contiene(f.subcategoria_1816, q.subtipo) && (cods || (f.decreto_596 !== "S" && f.categoria_1816)));
    clases.push(...r.map(f => f.codigo_cafci));
  }
  clases = [...new Set(clases)];
  if (!clases.length) throw err("Indicar clase (Codigo CAFCI), codigo (Codigo CNV), gerente, tipo o subtipo (ver /api/catalogo)");
  if (clases.length > MAX_CLASES) throw err(`Son ${clases.length} clases: el maximo por consulta es ${MAX_CLASES}. Agregar filtros.`);
  const mon = (q.moneda || "original").toLowerCase();
  if (!["original", "ars", "usd"].includes(mon)) throw err("moneda = original | ars | usd");
  const tc = mon === "original" ? null : await dolar();
  const cat = await catalogoVCP();
  const filas = [];                                                  // [fecha, cafci, nombre, moneda, vcp]
  if (cat && clases.every(c => cat.has(c))) {
    const series = await Promise.all(clases.map(c => bajar(`vcp/${c}.csv.gz`, true).then(gz => [c, zlib.gunzipSync(gz).toString("utf8")])));
    for (const [c, txt] of series) {
      const m = cat.get(c);
      for (const l of txt.split("\n")) {
        const i = l.indexOf(","); if (i < 0) continue;
        const fecha = l.slice(0, i); if (fecha < desde || fecha > hasta) continue;
        filas.push([fecha, c, m.cuota, m.moneda, Number(l.slice(i + 1))]);
      }
    }
  } else {
    if ((dia(hasta) - dia(desde)) / 864e5 > 400) throw err("Periodo maximo: 400 dias");
    const ms = idx.mensual.map(m => m.mes).filter(m => m >= desde.slice(0, 7) && m <= hasta.slice(0, 7));
    const cols = ["fecha", "codigo_cafci", "fondo_clase", "moneda", "vcp"];
    for (const p of await Promise.all(ms.map(m => diarioCols(m, cols))))
      for (const f of p) if (clases.includes(f[1]) && f[0] >= desde && f[0] <= hasta) filas.push(f);
  }
  const datos = [], base = new Map();
  filas.sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  for (const [fecha, cafci, nombre, moneda, vcp] of filas) {
    if (!(vcp > 0)) continue;
    let v = vcp;
    if (mon === "ars" && moneda !== "ARS") v = vcp * tc.get(fecha);
    if (mon === "usd" && moneda === "ARS") v = vcp / tc.get(fecha);
    if (!base.has(cafci)) base.set(cafci, v);
    datos.push({ fecha, codigo_cafci: cafci, cuota: nombre, moneda_clase: moneda, valor: q.base100 === "1" ? 100 * v / base.get(cafci) : v });
  }
  responder(req, res, datos, { desde, hasta, moneda: mon, base100: q.base100 === "1", clases: clases.length });
});
