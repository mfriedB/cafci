/* Prueba del tablero antes de publicar: sirve la carpeta empaquetada y abre cada hoja con Playwright.
   Uso: node probar.js <carpeta con index.html, *.js, data/ y echarts.min.js> [hojas, default 53]
   Sale con codigo 1 si hay errores de JavaScript o medidas del Power BI sin traducir en pbi_model.js. */
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const root = path.resolve(process.argv[2] || "."), n = +(process.argv[3] || 53);
const tipos = { ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".html": "text/html" };
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split("?")[0].split("#")[0]));
  fs.readFile(f, (e, b) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader("Content-Type", tipos[path.extname(f)] || "application/octet-stream"); r.end(b); });
}).listen(0, async () => {
  const port = srv.address().port, b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  p.on("pageerror", e => errs.push(e.message));
  p.on("console", m => { if (m.type() === "error" || /Medida sin traducir/.test(m.text())) errs.push(m.text()); });
  await p.goto(`http://localhost:${port}/index.html#pbi-1`); await p.waitForTimeout(3000);
  const hojas = await p.evaluate(() => (window.PBI ? PBI.pages.map(x => x.name) : []));
  for (let i = 1; i <= Math.min(n, hojas.length); i++) {
    const antes = errs.length;
    await p.evaluate(i => { location.hash = "pbi-" + i; }, i); await p.waitForTimeout(700);
    const vis = await p.evaluate(() => document.querySelectorAll(".pv").length);
    if (errs.length > antes || !vis) console.log(`hoja ${i} ${hojas[i - 1]}: ${vis} visuales` + (errs.length > antes ? " | " + errs.slice(antes).join(" | ").slice(0, 400) : ""));
  }
  console.log(`hojas ${hojas.length}, errores ${errs.length}`);
  await b.close(); srv.close(); process.exit(errs.length ? 1 : 0);
});
