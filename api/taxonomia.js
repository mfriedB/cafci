// GET /api/taxonomia?tipo=Renta%20Fija&subtipo=&gerente=&fuente=regla
// Clasificacion de cada fondo como en 1816: tipo, subtipo, gerente corto y tipo de gerente.
// fuente: "1816" (tabla mapeo/taxonomia_1816.csv) o "regla: ..." (fondo nuevo clasificado automaticamente).
const { bajar, parseCSV, contiene, responder, manejar } = require("./_lib");
module.exports = manejar(async (req, res) => {
  const q = req.query;
  const datos = parseCSV(await bajar("taxonomia.csv")).filter(f => contiene(f.Tipo_1816, q.tipo) && contiene(f.Subtipo_1816, q.subtipo)
    && contiene(f.Gerente_1816, q.gerente) && contiene(f.Tipo_Gerente_1816, q.tipo_gerente) && contiene(f.fuente_tax, q.fuente));
  responder(req, res, datos);
});
