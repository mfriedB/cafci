// GET /api/script?nombre=call_fondos.py
// Sirve la version vigente (rama main) de los scripts publicos del repo, para bajarlos sin pasar por GitHub:
//   curl -sfL -o call_fondos.py "https://cafci.vercel.app/api/script?nombre=call_fondos.py"
// Sin nombre devuelve la lista de scripts disponibles.
const SCRIPTS = { "call_fondos.py": "call/call_fondos.py" };
const RAW = "https://raw.githubusercontent.com/mfriedB/cafci/main/";
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const nombre = String(req.query.nombre || "");
  if (!nombre) return res.status(200).json({ scripts: Object.keys(SCRIPTS), uso: "/api/script?nombre=call_fondos.py" });
  const ruta = SCRIPTS[nombre];
  if (!ruta) return res.status(404).json({ error: `No existe el script ${nombre}`, scripts: Object.keys(SCRIPTS) });
  try {
    const r = await fetch(RAW + ruta);
    if (!r.ok) return res.status(502).json({ error: `GitHub devolvio ${r.status} para ${ruta}` });
    res.setHeader("Content-Type", "text/x-python; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="${nombre}"`);
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).send(await r.text());
  } catch (e) { return res.status(502).json({ error: e.message }); }
};
