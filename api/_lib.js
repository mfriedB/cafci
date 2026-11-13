// Utilidades compartidas de la API: lee la base publicada en GitHub (procesado/) con cache en memoria.
const zlib = require("zlib");
const BASE = process.env.BASE_URL || "https://raw.githubusercontent.com/mfriedB/cafci/main/procesado/";
const TTL = 10 * 60 * 1000;
const cache = new Map();

async function bajar(rel, binario = false) {
  const c = cache.get(rel);
  if (c && Date.now() - c.t < TTL) return c.v;
  const r = await fetch(BASE + rel);
  if (!r.ok) { const e = new Error(`No se encontro ${rel} (${r.status})`); e.status = r.status === 404 ? 404 : 502; throw e; }
  let v = binario ? Buffer.from(await r.arrayBuffer()) : await r.text();
  cache.set(rel, { t: Date.now(), v });
  return v;
}

function parseCSV(txt) {
  const filas = []; let fila = [], campo = "", q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) {
      if (ch === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else q = false; }
      else campo += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { fila.push(campo); campo = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && txt[i + 1] === "\n") i++;
      fila.push(campo); campo = ""; if (fila.length > 1 || fila[0] !== "") filas.push(fila); fila = [];
    } else campo += ch;
  }
  if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }
  const h = filas.shift() || [];
  return filas.map(f => Object.fromEntries(h.map((k, i) => [k, convertir(f[i])])));
}
function convertir(v) {
  if (v === undefined || v === "") return null;
  if (/^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(v)) return Number(v);
  return v;
}

async function indice() { return JSON.parse(await bajar("index.json")); }
async function mensual(mes) {
  const idx = await indice();
  const e = mes ? idx.mensual.find(m => m.mes === mes) : idx.mensual[idx.mensual.length - 1];
  if (!e) { const err = new Error(`No hay datos para el mes ${mes}`); err.status = 404; throw err; }
  return { meta: e, filas: parseCSV(await bajar(e.archivo)) };
}
async function diario(mes) {
  const gz = await bajar(`clases_diario/${mes}.csv.gz`, true);
  return parseCSV(zlib.gunzipSync(gz).toString("utf8"));
}
function meses(idx, desde, hasta) {
  return idx.mensual.map(m => m.mes).filter(m => (!desde || m >= desde.slice(0, 7)) && (!hasta || m <= hasta.slice(0, 7)));
}
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const contiene = (v, q) => !q || norm(v).includes(norm(q));

function responder(req, res, datos, extra = {}) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
  const filas = Array.isArray(datos) ? datos : null;
  if (filas && (req.query.formato || "").toLowerCase() === "csv") {
    const cols = filas.length ? Object.keys(filas[0]) : [];
    const esc = v => v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    return res.status(200).send([cols.join(","), ...filas.map(f => cols.map(c => esc(f[c])).join(","))].join("\n"));
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(200).send(JSON.stringify(filas ? { ...extra, filas: filas.length, datos: filas } : datos));
}
function manejar(fn) {
  return async (req, res) => {
    try { await fn(req, res); }
    catch (e) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.status(e.status || 500).json({ error: e.message });
    }
  };
}
module.exports = { bajar, parseCSV, indice, mensual, diario, meses, contiene, responder, manejar };
