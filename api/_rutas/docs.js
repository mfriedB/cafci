// GET /api/docs -> la guia completa en JSON (la usa la pagina /docs)
const { manejar } = require("../_lib");
const { docsJSON } = require("../_spec");
module.exports = manejar(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");
  res.status(200).json(docsJSON());
});
