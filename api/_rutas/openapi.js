// GET /api/openapi (y /openapi.json) -> especificacion OpenAPI 3 de la API
const { manejar } = require("../_lib");
const { openapi } = require("../_spec");
module.exports = manejar(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");
  res.status(200).json(openapi());
});
