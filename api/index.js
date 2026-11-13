// GET /api  -> descripcion de la API y meses disponibles
const { indice, responder, manejar } = require("./_lib");
module.exports = manejar(async (req, res) => {
  const idx = await indice();
  responder(req, res, {
    fuente: idx.fuente, actualizado: idx.actualizado,
    meses: idx.mensual.map(m => ({ mes: m.mes, hasta: m.hasta, parcial: m.parcial, fondos: m.fondos, planillas: m.planillas })),
    endpoints: {
      "/api/fondos": "un mes por fondo. Parametros: mes=AAAA-MM (default: ultimo), gerente, categoria, fondo (texto), codigo (Codigo CNV), formato=csv",
      "/api/serie": "serie mensual de uno o varios fondos. Parametros: codigo (uno o varios separados por coma), fondo, gerente, desde, hasta",
      "/api/industria": "totales mensuales. Parametros: desde, hasta, por=categoria|gerente|total, gerente, categoria",
      "/api/clases": "detalle diario por clase. Parametros: mes (obligatorio), codigo (Codigo CNV), clase (Codigo CAFCI), fondo, gerente, desde, hasta",
      "/api/dolar": "dolar MEP, CCL, promedio y BCRA A3500 diario. Parametros: desde, hasta",
      "/api/ranking": "ranking de gerentes o fondos en un mes. Parametros: mes, por=gerente|fondo, metrica=AUM_promedio|AUM_Final|Susc_Netas|Facturacion_Gerente, categoria, top",
    },
  });
});
