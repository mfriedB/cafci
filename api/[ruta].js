// Router unico de la API: /api/<ruta> -> api/_rutas/<ruta>.js (el plan Hobby de Vercel admite hasta 12 funciones).
// Los requires son explicitos para que Vercel incluya cada archivo en el paquete de la funcion.
// Antes de llamar a la ruta: valida fechas y avisa de parametros que la ruta no conoce (ver api/_spec.js).
const RUTAS = {
  archivos: require("./_rutas/archivos"), catalogo: require("./_rutas/catalogo"), clases: require("./_rutas/clases"),
  cuotapartistas: require("./_rutas/cuotapartistas"), dashboard: require("./_rutas/dashboard"), diario: require("./_rutas/diario"),
  docs: require("./_rutas/docs"), dolar: require("./_rutas/dolar"), estado: require("./_rutas/estado"), fondos: require("./_rutas/fondos"),
  guia: require("./_rutas/guia"), industria: require("./_rutas/industria"), insights: require("./_rutas/insights"),
  openapi: require("./_rutas/openapi"), ranking: require("./_rutas/ranking"), rendimientos: require("./_rutas/rendimientos"),
  script: require("./_rutas/script"), serie: require("./_rutas/serie"), snapshot: require("./_rutas/snapshot"),
  taxonomia: require("./_rutas/taxonomia"), vcp: require("./_rutas/vcp"),
};
const { PARAMS, VALIDOS_COMUNES } = require("./_spec");
const SITIO = "https://cafci.vercel.app";
const FECHA = /^\d{4}-\d{2}(-\d{2})?$/;

module.exports = (req, res) => {
  const ruta = String(req.query.ruta || "").toLowerCase().replace(/\.json$/, "");
  delete req.query.ruta;
  const h = RUTAS[ruta];
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (!h) return res.status(404).json({ error: `No existe /api/${ruta}`, endpoints: Object.keys(RUTAS).map(r => `/api/${r}`), ayuda: `${SITIO}/docs` });
  if (req.method === "OPTIONS") { res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "*"); return res.status(204).end(); }
  const avisos = [];
  const conocidos = PARAMS[ruta] || new Set();
  for (const [k, v] of Object.entries(req.query)) {
    if (k.startsWith("_")) continue;                                      // cache busters (_=123)
    if (Array.isArray(v)) { req.query[k] = v[v.length - 1]; avisos.push(`"${k}" vino repetido: se usa el ultimo valor`); }
    if (!conocidos.has(k) && !VALIDOS_COMUNES.has(k)) {
      const parecido = [...conocidos, ...VALIDOS_COMUNES].find(p => p.toLowerCase() === k.toLowerCase() || p.startsWith(k) || k.startsWith(p));
      avisos.push(`parametro desconocido "${k}" (se ignora)${parecido ? `: ¿quisiste decir "${parecido}"?` : ""}`);
    }
  }
  for (const k of ["mes", "desde", "hasta"]) {
    const v = req.query[k];
    if (v != null && v !== "" && !FECHA.test(String(v)))
      return res.status(400).json({ error: `${k}="${v}" no es una fecha valida: usar AAAA-MM o AAAA-MM-DD (ej. 2026-10 o 2026-10-31)`, ayuda: `${SITIO}/docs#${ruta}` });
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.mes || ""))) req.query.mes = req.query.mes.slice(0, 7);   // mes=2026-10-31 -> 2026-10
  req._ctx = { ruta, avisos };
  return h(req, res);
};
