// GET /api/cuotapartistas?tipo=tipo|estimados  Informe Mensual CAFCI: cuentas y montos por tipo de fondo y de inversor
// (dato oficial) o estimacion de cuentas por fondo (no oficial).
const { bajar, parseCSV, contiene, responder, manejar } = require("../_lib");
module.exports = manejar(async (req, res) => {
  const q = req.query, tipo = String(q.tipo || "tipo").toLowerCase();
  if (tipo === "tipo") {
    const d = parseCSV(await bajar("cuotapartistas_tipo.csv")).filter(f => (!q.mes || f.mes === q.mes) && (!q.desde || f.mes >= q.desde.slice(0, 7))
      && (!q.hasta || f.mes <= q.hasta.slice(0, 7)) && contiene(f.tipo_fondo, q.tipo_fondo) && contiene(f.segmento, q.segmento));
    return responder(req, res, d, { tipo, fuente: "Informe Mensual CAFCI", unidad: "monto en millones de ARS" });
  }
  if (tipo !== "estimados") throw Object.assign(new Error("tipo = tipo | estimados"), { status: 400 });
  let mes = q.mes, txt = null;
  if (mes) txt = await bajar(`cuotapartistas_estimados_${mes}.csv`);
  else {                                  // la ultima estimacion publicada (se busca hacia atras desde el mes actual)
    const d = new Date();
    for (let i = 0; i < 8 && !txt; i++) {
      const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 7);
      try { txt = await bajar(`cuotapartistas_estimados_${m}.csv`); mes = m; } catch (_) {}
    }
    if (!txt) throw Object.assign(new Error("No se encontro ninguna estimacion de cuotapartistas"), { status: 404 });
  }
  const cods = q.codigo ? String(q.codigo).split(",").map(Number) : null;
  const d = parseCSV(txt).filter(f => contiene(f.Gerente, q.gerente) && contiene(f.Fondo, q.fondo) && contiene(f.Tipo, q.tipo_fondo)
    && (!cods || cods.includes(f.codigo_cnv)));
  responder(req, res, d, { tipo, mes, fuente: "Estimacion propia a partir del Informe Mensual CAFCI (no es dato oficial)", unidad: "millones de ARS" });
});
