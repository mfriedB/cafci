// GET /api  -> descripcion de la API y meses disponibles
const { indice, responder, manejar } = require("./_lib");
module.exports = manejar(async (req, res) => {
  const idx = await indice();
  responder(req, res, {
    fuente: idx.fuente, actualizado: idx.actualizado,
    meses: idx.mensual.map(m => ({ mes: m.mes, hasta: m.hasta, parcial: m.parcial, fondos: m.fondos, planillas: m.planillas })),
    endpoints: {
      "/api/fondos": "un mes por fondo (formato 1816: Categoria/Subcategoria/Gerente de 1816). Parametros: mes=AAAA-MM (default: ultimo), gerente, categoria, subcategoria, tipo_gerente, fondo (texto), codigo (Codigo CNV), formato=csv",
      "/api/snapshot": "Snapshot Industria de 1816 para cualquier periodo: patrimonio inicio/fin/promedio, susc. netas, rendimiento y honorarios ($ y %). Parametros: desde, hasta, por=total|tipo|subtipo|tipo_gerente|gerente|fondo|cuota|moneda|depositaria, moneda=ars|usd, tipo, subtipo, gerente, tipo_gerente, fondo, codigo, incluir_596",
      "/api/rendimientos": "ranking de rendimientos a la ultima fecha como 1816 (1D, 7D, MTD, 30D, 90D, YTD, 365D). Parametros: moneda=ars|usd|original, expresion=directo|tna|tea, cuotas=referencia|todas, tipo, subtipo, gerente, tipo_gerente, fondo, codigo, clase, moneda_clase, orden, top",
      "/api/vcp": "serie diaria de valor de cuotaparte. Parametros: clase (Codigo CAFCI) o codigo (Codigo CNV, cuota de referencia), desde, hasta, base100=1, moneda=original|ars|usd",
      "/api/taxonomia": "clasificacion 1816 de cada fondo (tipo, subtipo, gerente, tipo de gerente) y su fuente (1816 o regla automatica). Parametros: tipo, subtipo, gerente, tipo_gerente, fuente",
      "/api/serie": "serie mensual de uno o varios fondos. Parametros: codigo (uno o varios separados por coma), fondo, gerente, desde, hasta",
      "/api/industria": "totales mensuales. Parametros: desde, hasta, por=total|categoria|subcategoria|gerente|tipo_gerente, gerente, categoria, subcategoria, tipo_gerente",
      "/api/clases": "detalle diario por clase. Parametros: mes (obligatorio), codigo (Codigo CNV), clase (Codigo CAFCI), fondo, gerente, desde, hasta",
      "/api/dolar": "dolar MEP, CCL, promedio y BCRA A3500 diario. Parametros: desde, hasta",
      "/api/ranking": "ranking de gerentes o fondos en un mes. Parametros: mes, por=gerente|fondo, metrica=AUM_promedio|AUM_Final|Susc_Netas|Facturacion_Gerente, categoria, top",
    },
  });
});
