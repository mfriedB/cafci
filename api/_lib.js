// Utilidades compartidas de la API: lee la base publicada en GitHub (procesado/) con cache en memoria.
const zlib = require("zlib");
const BASE = process.env.BASE_URL || "https://raw.githubusercontent.com/mfriedB/cafci/datos/procesado/";
const TTL = 10 * 60 * 1000;
const cache = new Map();

async function bajar(rel, binario = false) {
  const c = cache.get(rel);
  if (c && c.v !== undefined && Date.now() - c.t < TTL) return c.v;
  if (c && c.p) return c.p;                                   // ya hay una descarga en curso del mismo archivo
  const p = (async () => {
    const r = await fetch(BASE + rel);
    if (!r.ok) { const e = new Error(`No se encontro ${rel} (${r.status})`); e.status = r.status === 404 ? 404 : 502; throw e; }
    return binario ? Buffer.from(await r.arrayBuffer()) : await r.text();
  })();
  cache.set(rel, { ...(c || {}), p });
  try {
    const v = await p;
    cache.set(rel, { t: Date.now(), v });
    return v;
  } catch (e) {
    if (c && c.v !== undefined) { cache.set(rel, { t: Date.now() - TTL + 60e3, v: c.v }); return c.v; }  // GitHub no responde: usa la copia anterior
    cache.delete(rel); throw e;
  }
}
// true si el archivo existe en la base publicada (sin tirar error)
async function existe(rel) { try { await bajar(rel); return true; } catch (e) { return false; } }

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

// Igual que parseCSV pero devuelve solo las columnas pedidas, como arrays (mucho menos memoria para meses enteros)
function parseCSVcols(txt, cols) {
  let i = 0; const n = txt.length;
  function fila() {
    const f = []; let campo = "", q = false;
    for (; i < n; i++) {
      const ch = txt[i];
      if (q) { if (ch === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else q = false; } else campo += ch; }
      else if (ch === '"') q = true;
      else if (ch === ",") { f.push(campo); campo = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && txt[i + 1] === "\n") i++; i++; break; }
      else campo += ch;
    }
    f.push(campo); return f;
  }
  const h = fila(); const ix = cols.map(c => h.indexOf(c));
  const out = [];
  while (i < n) { const f = fila(); if (f.length < 2) continue; out.push(ix.map(k => k < 0 ? null : convertir(f[k]))); }
  return out;
}
async function diarioCols(mes, cols) {
  const gz = await bajar(`clases_diario/${mes}.csv.gz`, true);
  return parseCSVcols(zlib.gunzipSync(gz).toString("utf8"), cols);
}
async function dolar() {
  // serie diaria (dia calendario, ultimo dato disponible) del dolar de conversion: promedio MEP-CCL
  const f = parseCSV(await bajar("dolar.csv"));
  const m = new Map(); let ult = null;
  if (!f.length) return m;
  const d0 = new Date(f[0].fecha + "T00:00:00Z"), d1 = new Date(f[f.length - 1].fecha + "T00:00:00Z");
  const porF = new Map(f.map(x => [x.fecha, x]));
  for (let d = d0; d <= d1; d = new Date(d.getTime() + 864e5)) {
    const k = d.toISOString().slice(0, 10), x = porF.get(k);
    if (x) { const v = x.mep != null && x.ccl != null ? (x.mep + x.ccl) / 2 : x.mep; if (v) ult = v; }
    m.set(k, ult);
  }
  return m;
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

const SITIO = "https://cafci.vercel.app";
const MAX_BYTES = 4.3e6;            // Vercel corta respuestas de funciones de mas de 4,5 MB
const NUMS = ["AUM_promedio", "AUM_Inicial", "AUM_Final", "Susc_Netas", "Rendimiento", "Facturacion_Gerente", "Facturacion_Depo"];

// dolares: base mensual por fondo en millones de USD (procesado/informe/industria_usd.csv, cada dia al dolar de ese dia)
let usdCache = null;
async function baseUSD() {
  const txt = await bajar("informe/industria_usd.csv");
  if (usdCache && usdCache.txt === txt) return usdCache.m;
  const m = new Map();
  for (const f of parseCSV(txt)) {
    const mes = String(f.Fecha).slice(0, 7);
    (m.get(mes) || m.set(mes, new Map()).get(mes)).set(f.Codigo_CNV, f);
  }
  usdCache = { txt, m };
  return m;
}
function monedaMensual(q) {
  const mon = String(q.moneda || "ars").toLowerCase();
  if (!["ars", "usd"].includes(mon)) throw Object.assign(new Error("moneda = ars | usd"), { status: 400 });
  return mon;
}
// Igual que mensual(mes) pero en la moneda pedida. En USD reemplaza las metricas por las de industria_usd.csv y
// recalcula las columnas suma_* (totales del mes) en dolares.
async function mensualMoneda(mes, moneda = "ars") {
  const r = await mensual(mes);
  if (moneda !== "usd") return r;
  const u = (await baseUSD()).get(r.meta.mes) || new Map();
  for (const f of r.filas) { const x = u.get(f.Codigo_CNV); for (const k of NUMS) f[k] = x ? x[k] : null; }
  const s = c => r.filas.reduce((a, f) => a + (c(f) ? f.AUM_promedio || 0 : 0), 0);
  const tot = s(() => true), mm = s(f => f.Categoria === "Money Market"), nomm = tot - mm;
  const bz = s(f => /balanz/i.test(f.Sociedad_Gerente || ""));
  for (const f of r.filas) {
    if ("suma_aums_mensual" in f) f.suma_aums_mensual = tot;
    if ("suma_mensual_balanz" in f) f.suma_mensual_balanz = /balanz/i.test(f.Sociedad_Gerente || "") ? bz : 0;
    if ("suma_aums_mm_mensual" in f) f.suma_aums_mm_mensual = f.Categoria === "Money Market" ? mm : 0;
    if ("suma_aums_no_mm_mensual" in f) f.suma_aums_no_mm_mensual = f.Categoria !== "Money Market" ? nomm : 0;
  }
  return r;
}
const unidadMon = m => m === "usd" ? "millones de USD" : "millones de ARS";

// ---- parametros comunes a todos los endpoints que devuelven tablas: ordenar, columnas, limite, offset
function comunes(req, filas, extra) {
  const q = req.query, avisos = (req._ctx && req._ctx.avisos) || [];
  if (q.ordenar) {
    const crit = String(q.ordenar).split(",").map(s => s.trim()).filter(Boolean)
      .map(s => s[0] === "-" ? [s.slice(1), -1] : [s.replace(/^\+/, ""), 1]);
    for (const [c] of crit) if (filas.length && !(c in filas[0])) avisos.push(`ordenar: no existe la columna "${c}"`);
    filas = [...filas].sort((a, b) => {
      for (const [c, d] of crit) {
        const x = a[c], y = b[c];
        if (x === y || (x == null && y == null)) continue;
        if (x == null) return 1; if (y == null) return -1;
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es")) * d;
      }
      return 0;
    });
  }
  const total = filas.length, off = Math.max(0, parseInt(q.offset, 10) || 0);
  const lim = q.limite != null && q.limite !== "" ? Math.max(0, parseInt(q.limite, 10) || 0) : null;
  if (lim != null || off) {
    filas = filas.slice(off, lim != null ? off + lim : undefined);
    Object.assign(extra, { total_filas: total, offset: off }); if (lim != null) extra.limite = lim;
    if (off + filas.length < total) extra.siguiente_offset = off + filas.length;
  }
  if (q.columnas) {
    const cs = String(q.columnas).split(",").map(s => s.trim()).filter(Boolean);
    const disp = filas.length ? Object.keys(filas[0]) : cs;
    const malas = cs.filter(c => !disp.includes(c));
    if (malas.length) avisos.push(`columnas inexistentes: ${malas.join(", ")} (disponibles: ${disp.join(", ")})`);
    const ok = cs.filter(c => disp.includes(c));
    if (ok.length) filas = filas.map(f => Object.fromEntries(ok.map(c => [c, f[c]])));
  }
  return filas;
}

function csv(filas, excel) {
  const cols = filas.length ? Object.keys(filas[0]) : [];
  const sep = excel ? ";" : ",";
  const esc = v => {
    if (v == null) return "";
    let s = typeof v === "number" && excel ? String(v).replace(".", ",") : String(v);
    if (typeof v === "boolean") s = v ? "true" : "false";
    return s.includes(sep) || /["\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return (excel ? "﻿" : "") + [cols.join(sep), ...filas.map(f => cols.map(c => esc(f[c])).join(sep))].join("\n");
}

function responder(req, res, datos, extra = {}) {
  const q = req.query, ctx = req._ctx || {};
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Expose-Headers", "X-Datos-Actualizado, X-Total-Filas, X-Avisos");
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=86400");
  if (ctx.actualizado) res.setHeader("X-Datos-Actualizado", ctx.actualizado);
  let filas = Array.isArray(datos) ? datos : null;
  if (filas) { extra = { ...extra }; filas = comunes(req, filas, extra); }
  const avisos = ctx.avisos || [];
  if (avisos.length) res.setHeader("X-Avisos", encodeURIComponent(avisos.join(" | ")));
  const fmt = String(q.formato || "json").toLowerCase();
  let cuerpo, tipo;
  if (filas && fmt === "csv") {
    const excel = ["1", "true", "si"].includes(String(q.excel || "").toLowerCase());
    cuerpo = csv(filas, excel); tipo = "text/csv; charset=utf-8";
    res.setHeader("X-Total-Filas", String(extra.total_filas ?? filas.length));
    if (q.descargar === "1") res.setHeader("Content-Disposition", `attachment; filename="cafci_${ctx.ruta || "datos"}.csv"`);
  } else {
    const meta = {};
    if (ctx.actualizado) meta.actualizado = ctx.actualizado;
    if (avisos.length) meta.avisos = avisos;
    const obj = filas ? { ...extra, ...meta, filas: filas.length, datos: filas }
      : (datos && typeof datos === "object" && !Array.isArray(datos) && avisos.length ? { ...datos, avisos } : datos);
    cuerpo = JSON.stringify(obj); tipo = "application/json; charset=utf-8";
  }
  const bytes = Buffer.byteLength(cuerpo);
  if (bytes > MAX_BYTES) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(413).send(JSON.stringify({
      error: `La respuesta tiene ${(bytes / 1e6).toFixed(1)} MB y supera el maximo de 4,5 MB por consulta.`,
      filas: filas ? (extra.total_filas ?? filas.length) : null,
      sugerencias: ["Agregar filtros (codigo, gerente, categoria, desde/hasta)", "Pedir menos columnas con columnas=a,b,c",
        "Paginar con limite=5000&offset=0, 5000, 10000...", "Para bajar la base completa usar los archivos de /api/archivos (CSV o Parquet)"],
      ayuda: `${SITIO}/docs#${ctx.ruta || ""}`,
    }));
  }
  res.setHeader("Content-Type", tipo);
  return res.status(200).send(cuerpo);
}
function manejar(fn) {
  return async (req, res) => {
    req._ctx = req._ctx || { avisos: [] };
    try {
      if (!req._ctx.actualizado) { try { req._ctx.actualizado = (await indice()).actualizado; } catch (_) { /* sin indice: sigue */ } }
      await fn(req, res);
    } catch (e) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      const r = req._ctx.ruta;
      res.status(e.status || 500).json({ error: e.message, ayuda: `${SITIO}/docs${r ? "#" + r : ""}` });
    }
  };
}
module.exports = { SITIO, baseUSD, monedaMensual, mensualMoneda, unidadMon, comunes, csv, bajar, existe, parseCSV, parseCSVcols, diarioCols, dolar, convertir, indice, mensual, diario, meses, contiene, responder, manejar };
