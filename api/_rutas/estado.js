// GET /api/estado -> hasta que fecha hay datos, cuando fue la ultima corrida y si la base esta al dia
const { indice, bajar, responder, manejar } = require("../_lib");
const HORARIO = "lunes a viernes 12:47 y 18:47 (hora Argentina)";
module.exports = manejar(async (req, res) => {
  const idx = await indice();
  const ult = idx.fechas_planilla[idx.fechas_planilla.length - 1];
  const m = idx.mensual, uM = m[m.length - 1];
  // dias habiles (lun a vie) entre la ultima planilla y hoy, sin contar ninguno de los dos
  const hoy = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  let habiles = 0;
  for (let d = new Date(ult + "T00:00:00Z"); ; ) {
    d = new Date(d.getTime() + 864e5); const k = d.toISOString().slice(0, 10);
    if (k >= hoy) break; if (d.getUTCDay() % 6 !== 0) habiles++;
  }
  const extra = {};
  try { extra.insights_fecha_corte = JSON.parse(await bajar("insights/resumen.json")).fecha_corte; } catch (_) {}
  try { const c = JSON.parse(await bajar("dashboard/corte.json")); extra.ranking_semana = c[0] ? `${c[0].semana_desde} a ${c[0].semana_hasta}` : null; } catch (_) {}
  responder(req, res, {
    estado: habiles <= 1 ? "ok" : "revisar",
    detalle: habiles <= 1 ? "La base tiene la última planilla esperable." :
      `Faltan ${habiles} días hábiles de planilla (puede ser un feriado o una demora de la CNV).`,
    hoy, ultima_planilla: ult, dias_habiles_sin_planilla: habiles, actualizado: idx.actualizado, actualizacion: HORARIO,
    fuente: idx.fuente, primer_mes: m[0].mes, ultimo_mes: uM.mes, ultimo_mes_parcial: !!uM.parcial, meses: m.length,
    fondos_ultimo_mes: uM.fondos, planillas: idx.fechas_planilla.length, ...extra,
  });
});
