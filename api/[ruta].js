// Router unico de la API: /api/<ruta> -> api/_rutas/<ruta>.js (el plan Hobby de Vercel admite hasta 12 funciones).
// Los requires son explicitos para que Vercel incluya cada archivo en el paquete de la funcion.
const RUTAS = {
  clases: require("./_rutas/clases"), dashboard: require("./_rutas/dashboard"), diario: require("./_rutas/diario"),
  dolar: require("./_rutas/dolar"), fondos: require("./_rutas/fondos"), industria: require("./_rutas/industria"),
  insights: require("./_rutas/insights"), ranking: require("./_rutas/ranking"), rendimientos: require("./_rutas/rendimientos"),
  serie: require("./_rutas/serie"), snapshot: require("./_rutas/snapshot"), taxonomia: require("./_rutas/taxonomia"),
  vcp: require("./_rutas/vcp"),
};
module.exports = (req, res) => {
  const ruta = String(req.query.ruta || "").toLowerCase();
  const h = RUTAS[ruta];
  if (!h) { res.setHeader("Access-Control-Allow-Origin", "*"); return res.status(404).json({ error: `No existe /api/${ruta}. Ver /api` }); }
  delete req.query.ruta;
  return h(req, res);
};
