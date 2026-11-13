// GET /api/snapshot?desde=2026-06-01&hasta=2026-11-12&por=subtipo&moneda=ars
// Equivalente a DATASETS / FCI / Series Diarias / Datos Patrimoniales / Snapshot Industria de 1816 (pestanias
// Resumen, Susc. Netas, Rendimiento y Metricas por Fondo) para cualquier periodo.
//   desde: fecha inicial (patrimonio de inicio = patrimonio de ese dia). Default: ultimo dia del mes anterior a hasta.
//   hasta: fecha final (default: ultimo dato). Periodo maximo: 400 dias.
//   por: total | tipo | subtipo | tipo_gerente | gerente | fondo (default) | cuota | moneda | depositaria
//   moneda: ars (default) | usd (cada dia al dolar de ese dia, promedio MEP-CCL)
//   filtros: tipo, subtipo, gerente, tipo_gerente, fondo, codigo (Codigo CNV); incluir_596=1 suma fondos del Decreto 596
// Montos en millones. Porcentajes: susc_netas_pct y rendimiento_pct sobre el patrimonio de inicio; honorarios_*_pct anuales
// (honorarios del periodo / patrimonio promedio, anualizado).
const { indice, diarioCols, dolar, contiene, responder, manejar } = require("./_lib");
const COLS = ["fecha", "codigo_cafci", "codigo_cnv", "fondo_clase", "fondo_1816", "fondo", "gerente_1816", "gerente", "tipo_gerente",
  "categoria_1816", "subcategoria_1816", "moneda", "depositaria", "decreto_596", "patrimonio_ars", "flujo_ars", "hon_sg", "hon_sd"];
const C = Object.fromEntries(COLS.map((c, i) => [c, i]));
const dia = s => new Date(s + "T00:00:00Z"), iso = d => d.toISOString().slice(0, 10), mas = (d, n) => new Date(d.getTime() + n * 864e5);
const err = (m, s = 400) => Object.assign(new Error(m), { status: s });

module.exports = manejar(async (req, res) => {
  const q = req.query;
  const idx = await indice();
  const ultima = idx.fechas_planilla[idx.fechas_planilla.length - 1];
  const hasta = q.hasta ? q.hasta.slice(0, 10) : ultima;
  let desde = q.desde ? q.desde.slice(0, 10) : iso(mas(dia(hasta.slice(0, 7) + "-01"), -1));
  if (desde >= hasta) throw err("desde debe ser anterior a hasta");
  const D0 = dia(desde), D1 = dia(hasta), dias = Math.round((D1 - D0) / 864e5);
  if (dias > 400) throw err("Periodo maximo: 400 dias");
  const por = (q.por || "fondo").toLowerCase(), usd = (q.moneda || "ars").toLowerCase() === "usd";
  const cods = q.codigo ? String(q.codigo).split(",").map(Number) : null;
  // meses necesarios (7 dias antes del inicio para arrastrar el ultimo dato)
  const ms = []; for (let d = new Date(Date.UTC(mas(D0, -7).getUTCFullYear(), mas(D0, -7).getUTCMonth(), 1)); d <= D1; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)))
    ms.push(iso(d).slice(0, 7));
  const disp = new Set(idx.mensual.map(m => m.mes)), lista = ms.filter(m => disp.has(m));
  const tc = usd ? await dolar() : null;
  // por clase: patrimonio por fecha, flujos y honorarios (mes a mes, para no tener todo el texto en memoria)
  const K = new Map();
  for (const mes of lista) for (const f of await diarioCols(mes, COLS)) {
    if (!f[C.categoria_1816] || (f[C.decreto_596] === "S" && q.incluir_596 !== "1")) continue;
    if (cods && !cods.includes(f[C.codigo_cnv])) continue;
    let k = K.get(f[C.codigo_cafci]); if (!k) K.set(f[C.codigo_cafci], k = { pat: new Map(), flujo: [], meta: f, hon: new Map() });
    k.pat.set(f[C.fecha], f[C.patrimonio_ars] || 0); k.hon.set(f[C.fecha], [f[C.hon_sg] || 0, f[C.hon_sd] || 0]);
    if (f[C.fecha] > desde && f[C.fecha] <= hasta) k.flujo.push([f[C.fecha], f[C.flujo_ars] || 0]);
    if (f[C.fecha] >= k.meta[C.fecha]) k.meta = f;
  }
  const cal = []; for (let d = mas(D0, -7); d <= D1; d = mas(d, 1)) cal.push(iso(d));
  const G = new Map();
  for (const [cafci, k] of K) {
    const m = k.meta;
    if (!contiene(m[C.categoria_1816], q.tipo) || !contiene(m[C.subcategoria_1816], q.subtipo) || !contiene(m[C.gerente_1816], q.gerente)
      || !contiene(m[C.tipo_gerente], q.tipo_gerente) || !(contiene(m[C.fondo_1816], q.fondo) || contiene(m[C.fondo], q.fondo))) continue;
    let ult = 0, edad = 99, hs = [0, 0], ini = 0, fin = 0, num = 0, hg = 0, hd = 0;
    for (const f of cal) {
      if (k.pat.has(f)) { ult = k.pat.get(f); edad = 0; hs = k.hon.get(f); } else edad++;
      const p0 = edad <= 7 ? ult : 0, x = usd ? p0 / (tc.get(f) || NaN) : p0;
      if (f === desde) ini = x;
      if (f > desde) { num += x; hg += x * hs[0] / 100 / 365; hd += x * hs[1] / 100 / 365; }
      if (f === hasta) fin = x;
    }
    let susc = 0; for (const [f, v] of k.flujo) susc += usd ? v / (tc.get(f) || NaN) : v;
    if (!ini && !fin && !num) continue;
    const clave = ({ total: "Industria", tipo: m[C.categoria_1816], subtipo: m[C.subcategoria_1816], tipo_gerente: m[C.tipo_gerente],
      gerente: m[C.gerente_1816], moneda: m[C.moneda], depositaria: m[C.depositaria], cuota: String(cafci) })[por] ?? String(m[C.codigo_cnv]);
    let a = G.get(clave);
    if (!a) {
      a = { grupo: clave };
      if (por === "fondo" || por === "cuota") Object.assign(a, { codigo_cnv: m[C.codigo_cnv], fondo: m[C.fondo_1816] || m[C.fondo],
        gerente: m[C.gerente_1816], tipo_gerente: m[C.tipo_gerente], tipo: m[C.categoria_1816], subtipo: m[C.subcategoria_1816] });
      if (por === "cuota") Object.assign(a, { codigo_cafci: cafci, cuota: m[C.fondo_clase], moneda_clase: m[C.moneda] });
      Object.assign(a, { cuotas: 0, ini: 0, fin: 0, num: 0, susc: 0, hg: 0, hd: 0 });
      G.set(clave, a);
    }
    a.cuotas++; a.ini += ini; a.fin += fin; a.num += num; a.susc += susc; a.hg += hg; a.hd += hd;
  }
  const r6 = x => Math.round(x * 1e6) / 1e6, M = 1e6;
  const datos = [...G.values()].map(a => {
    const rend = a.fin - a.ini - a.susc, prom = a.num / dias;
    const o = { ...a, patrimonio_inicio: r6(a.ini / M), patrimonio_fin: r6(a.fin / M), patrimonio_promedio: r6(prom / M),
      susc_netas: r6(a.susc / M), rendimiento: r6(rend / M),
      var_total_pct: a.ini ? a.fin / a.ini - 1 : null, susc_netas_pct: a.ini ? a.susc / a.ini : null, rendimiento_pct: a.ini ? rend / a.ini : null,
      honorarios_gerente: r6(a.hg / M), honorarios_depositaria: r6(a.hd / M), honorarios_total: r6((a.hg + a.hd) / M),
      honorarios_gerente_pct: a.num ? a.hg / a.num * 365 : null, honorarios_depositaria_pct: a.num ? a.hd / a.num * 365 : null,
      honorarios_total_pct: a.num ? (a.hg + a.hd) / a.num * 365 : null };
    for (const k of ["ini", "fin", "num", "susc", "hg", "hd"]) delete o[k];
    if (por === "total") delete o.grupo;
    return o;
  }).sort((x, y) => y.patrimonio_fin - x.patrimonio_fin);
  const tot = datos.reduce((s, o) => s + o.patrimonio_fin, 0);
  for (const o of datos) o.participacion = tot ? o.patrimonio_fin / tot : null;
  responder(req, res, datos, { desde, hasta, dias, por, moneda: usd ? "USD" : "ARS", unidad: "millones" });
});
