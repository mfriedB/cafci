// GET /api  -> descripcion de la API, meses disponibles y lista de endpoints (generada desde api/_spec.js)
const { indice, responder, manejar } = require("./_lib");
const { INFO, ENDPOINTS, COMUNES } = require("./_spec");
module.exports = manejar(async (req, res) => {
  const idx = await indice();
  const endpoints = {};
  for (const e of ENDPOINTS)
    endpoints[`/api/${e.ruta}`] = `${e.titulo}: ${e.descripcion}` + (e.parametros.length ? ` Parametros: ${e.parametros.map(p => p.n).join(", ")}.` : "");
  endpoints["/insights"] = "tablero web de los insights (alertas de flujo, liquidez, estacionalidad, ranking y flujos, fees, concentracion, cambios de condiciones)";
  responder(req, res, {
    titulo: INFO.titulo, guia: `${INFO.sitio}/docs`, guia_texto: `${INFO.sitio}/llms.txt`, openapi: `${INFO.sitio}/openapi.json`,
    fuente: idx.fuente, actualizado: idx.actualizado, actualizacion: INFO.actualizacion,
    meses: idx.mensual.map(m => ({ mes: m.mes, hasta: m.hasta, parcial: m.parcial, fondos: m.fondos, planillas: m.planillas })),
    parametros_comunes: Object.fromEntries(COMUNES.map(p => [p.n, p.d])),
    endpoints,
  });
});
