// GET /api/archivos?grupo=parquet  Links directos a los archivos de la base completa (rama datos del repo)
const { indice, bajar, contiene, responder, manejar } = require("../_lib");
const { RAW } = require("../_spec");
module.exports = manejar(async (req, res) => {
  const idx = await indice(), L = [];
  const add = (grupo, archivo, formato, descripcion) => L.push({ grupo, archivo, formato, descripcion, url: RAW + archivo });
  add("indice", "index.json", "json", "Meses disponibles, archivo de cada mes, si es parcial y cuantas planillas tiene");
  add("mensual por fondo", "informe/industria_ars.csv", "csv", "Todos los meses x fondo en millones de ARS (formato 1816), un solo archivo");
  add("mensual por fondo", "informe/industria_usd.csv", "csv", "Todos los meses x fondo en millones de USD (cada dia al dolar de ese dia)");
  for (const m of idx.mensual) add("mensual por fondo (un archivo por mes)", m.archivo, "csv", `Mes ${m.mes}${m.parcial ? " (parcial)" : ""}, ${m.fondos} fondos`);
  for (const m of idx.mensual) add("diario por clase", `clases_diario/${m.mes}.csv.gz`, "csv.gz", `Planilla diaria completa por clase, ${m.mes}`);
  for (const m of idx.mensual) add("diario por fondo", `fondos_diario/${m.mes}.csv.gz`, "csv.gz", `Patrimonio y flujo diario por fondo, ${m.mes}`);
  add("catalogos", "taxonomia.csv", "csv", "Clasificacion 1816 de cada fondo y su fuente");
  add("catalogos", "rendimientos.csv", "csv", "Ultima fecha por clase: datos de la clase y rendimientos 1D a 365D");
  add("otros", "dolar.csv", "csv", "Dolar MEP, CCL, promedio y BCRA A3500 diario");
  add("otros", "cuotapartistas_tipo.csv", "csv", "Cuentas y montos por tipo de fondo y de inversor (Informe Mensual CAFCI)");
  add("otros", "manifest.csv", "csv", "Planillas descargadas de la CNV: link, recepcion y hash");
  try {
    const cat = JSON.parse(await bajar("parquet/catalogo.json"));
    const desc = { fondos_mensual: "Todos los meses x fondo (columna Mes)", fondos: "Catalogo de fondos", clases: "Catalogo de clases",
      dolar: "Dolar diario", rendimientos: "Rendimientos por clase", fondos_diario: "Patrimonio y flujo diario por fondo, toda la historia" };
    for (const [k, v] of Object.entries(cat)) {
      if (k === "base_url") continue;
      for (const u of [].concat(v)) if (typeof u === "string" && u.endsWith(".parquet"))
        L.push({ grupo: Array.isArray(v) ? `parquet ${k} (un archivo por mes)` : "parquet", archivo: u.replace(RAW, ""), formato: "parquet",
          descripcion: desc[k] || (Array.isArray(v) ? `${k}, ${u.match(/(\d{4}-\d{2})\.parquet$/)?.[1] || ""}` : k), url: u });
    }
  } catch (_) {}
  responder(req, res, L.filter(f => contiene(f.grupo, req.query.grupo)), { base: RAW });
});
