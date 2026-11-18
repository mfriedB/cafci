// GET /api/guia (y /llms.txt) -> la guia completa en markdown, para personas o asistentes de IA
const { manejar } = require("../_lib");
const { guiaMarkdown } = require("../_spec");
module.exports = manejar(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.status(200).send(guiaMarkdown());
});
