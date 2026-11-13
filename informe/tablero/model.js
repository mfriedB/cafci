/* Modelo de datos: replica de las tablas CSV_1816 / Fondos_1816_USD / internas del Power BI y de sus columnas
   calculadas y medidas. Montos de industria en MILLONES (ARS o USD), como los CSV de 1816. */
(function () {
  const M = {};
  window.M = M;

  // Tipo_Gerente del Power BI (lista de gerentes bancarios del modelo; comparacion sin distinguir mayusculas como DAX)
  const BANCARIOS = ["Galicia", "Santander", "BBVA", "HSBC", "ICBC", "MACRO", "Pellegrini", "BIND", "Provinfondos", "Patagonia",
    "Proahorro", "Supervielle", "BACS", "Bancor", "Mariva", "Ciudad", "CMF", "SAM Arg", "Chaco"].map(s => s.toUpperCase());
  const COMERCIAL = {
    "Balanz Ahorro en Dolares": "Corporativo", "Balanz Capital Abierto Pymes FCI": "Pymes", "Balanz Capital Acciones Argentina": "Acciones",
    "Balanz Capital Ahorro": "Ahorro CP", "Balanz Capital Estrategia I USD": "Dólar CP", "Balanz Capital Estrategia II USD": "Estrategia II USD",
    "Balanz Capital Estrategia III USD": "Latam", "Balanz Capital Estrategia IV USD": "Estrategia IV USD", "Balanz Capital Estrategia V USD": "Estrategia V USD",
    "Balanz Capital Estrategia VI USD": "Estrategia VI USD", "Balanz Capital Money Market": "Money Market", "Balanz Capital Renta Fija": "Dólar Linked",
    "Balanz Capital Renta Fija en Dolares": "Soberano", "Balanz Crecimiento FCI Infraestructura": "Crecimiento", "Balanz Crédito Privado": "Crédito Privado",
    "Balanz Desarrollo": "Desarrollo FCI", "Balanz Equity Selection": "Equity Selection", "Balanz Excalibur Regisseur": "Excalibur Regisseur",
    "Balanz Infraestructura": "Infraestructura FCI", "Balanz Institucional": "Inflation Linked", "Balanz Lecaps": "Lecaps", "Balanz Long Pesos": "Long",
    "Balanz Money Market USD": "Money Market USD", "Balanz Performance I": "Performance I", "Balanz Performance III": "ONs", "Balanz Performance IV": "Performance IV",
    "Balanz Performance V": "Performance V", "Balanz Performance VII": "Balanz Performance VII", "Balanz Performance XI": "Performance XI",
    "Balanz Performance XII": "Balanz Performance XII", "Balanz Performance XIII": "Performance XIII", "Balanz Renta Fija Estrategica": "Rta Fija Estrategica",
    "Balanz Renta Fija Global": "RF Global", "Balanz Renta Fija Opportunity": "Opportunity", "Balanz Renta Variable Global": "RV Global",
    "Balanz Retorno Total": "Renta Mixta", "Balanz Soja": "Soja", "Balanz Sudamericano USD": "Latam Sin Arg"
  };
  M.CATS = ["Destino Esp.", "Money Market", "Renta Fija", "Renta Mixta", "Renta Variable", "T+1"];
  M.COL = { banc: "#13306a", ind: "#3e8bd8", balanz: "#2f80ed", ind2: "#13306a" };

  function tipoGer(g) { return BANCARIOS.includes(String(g || "").trim().toUpperCase()) ? "Bancarias" : "Independientes"; }
  function cat2(c, s) {
    const u = String(s || "").trim().toUpperCase();
    if (u === "MM USD CLÁSICO") return "Money Market USD";
    if (u === "MM ARS CLÁSICO" || u === "MM ARS DINÁMICO") return "Money Market ARS";
    return c;
  }
  function cat3(c, s) {
    const u = String(s || "").trim().toUpperCase();
    if (u === "MM USD CLÁSICO") return "Money Market USD";
    if (u === "MM ARS CLÁSICO" || u === "MM ARS DINÁMICO") return "Money Market ARS";
    if (c === "Renta Fija" && u.includes("USD") && !u.includes("LINKED")) return "Renta Fija USD";
    if (c === "Renta Fija") return "Renta Fija ARS";
    return c;
  }
  function sub2(c, s) {
    const su = String(s || "").trim(), u = su.toUpperCase(), cu = String(c || "").trim().toUpperCase();
    if (cu === "DESTINO ESP.") return "Destino Esp.";
    if (u === "RF ARS LECAP") return "RF ARS Lecap";
    if (u === "RF USD LINKED") return "RF USD Linked";
    if (u.includes("RM Y OTROS")) return "RM y Otros";
    if (u.includes("RF MULT")) return "RF MULT";
    if (u.includes("RV")) return "RV";
    if (u.includes("RF ARS")) return "RF ARS";
    if (u.includes("RF USD")) return "RF USD";
    if (u.includes("MM ARS")) return "MM ARS";
    if (u.includes("MM USD")) return "MM USD";
    return su;
  }
  function moneda(s) { const x = String(s || ""); return x.includes("Linked") ? "ARS" : x.includes("USD") ? "USD" : "ARS"; }
  function catOtros(c) { return ["Money Market", "Renta Fija", "T+1"].includes(c) ? c : "Otros"; }

  function decode(block, dic, meses, fechas) {
    const n = block.m.length, out = new Array(n);
    for (let i = 0; i < n; i++) {
      const c = dic.c[block.c[i]], s = dic.s[block.s[i]], g = dic.g[block.g[i]], fondo = dic.n[block.n[i]];
      const mi = block.m[i];
      out[i] = {
        mi, mes: meses[mi], fecha: fechas[mi], c, s, n: fondo, g, t: tipoGer(g), c2: cat2(c, s), c3: cat3(c, s), s2: sub2(c, s), co: catOtros(c),
        mon: moneda(s), com: COMERCIAL[fondo] || fondo,
        aP: block.aP[i], aI: block.aI[i], aF: block.aF[i], su: block.su[i], fg: block.fg[i], fd: block.fd[i]
      };
      out[i].re = out[i].aF - out[i].aI - out[i].su;
    }
    return out;
  }

  M.load = async function () {
    const [ind, intl] = await Promise.all([fetch("data/industria.json").then(r => r.json()),
      fetch("data/internos.json").then(r => r.ok ? r.json() : {}).catch(() => ({}))]);
    M.meses = ind.meses; M.fechas = ind.fecha_mes; M.generado = ind.generado; M.pend = ind.pendientes || [];
    M.ARS = decode(ind.ars, ind.dic, ind.meses, ind.fecha_mes);
    M.USD = decode(ind.usd, ind.dic, ind.meses, ind.fecha_mes);
    M.I = intl || {};
    M.lastMi = M.meses.length - 1;
    M.gerentes = [...new Set(M.ARS.filter(r => r.mi === M.lastMi).map(r => r.g))].sort((a, b) => a.localeCompare(b, "es"));
    M.gerentesAll = [...new Set(M.ARS.map(r => r.g))].sort((a, b) => a.localeCompare(b, "es"));
    M.subcats = [...new Set(M.ARS.filter(r => r.mi >= M.lastMi - 12).map(r => r.s))].filter(Boolean).sort();
    M.idx = mes => M.meses.indexOf(mes);
  };

  /* ---------- filtros de contexto (equivalente al contexto de filtro del Power BI) ----------
     ctx = {meses:Set<mi>|null, cats:Set|null, subs:Set|null, ger:Set|null, tipo:Set|null, fondo:Set|null, c3:Set|null, s2:Set|null} */
  M.pass = function (r, ctx, ignore) {
    ignore = ignore || [];
    if (ctx.cats && !ignore.includes("cats") && !ctx.cats.has(r.c)) return false;
    if (ctx.subs && !ignore.includes("subs") && !ctx.subs.has(r.s)) return false;
    if (ctx.s2 && !ignore.includes("s2") && !ctx.s2.has(r.s2)) return false;
    if (ctx.c3 && !ignore.includes("c3") && !ctx.c3.has(r.c3)) return false;
    if (ctx.ger && !ignore.includes("ger") && !ctx.ger.has(r.g)) return false;
    if (ctx.tipo && !ignore.includes("tipo") && !ctx.tipo.has(r.t)) return false;
    if (ctx.fondo && !ignore.includes("fondo") && !ctx.fondo.has(r.n)) return false;
    if (ctx.exGer && ctx.exGer.has(r.g)) return false;
    if (ctx.exFondo && ctx.exFondo.has(r.n)) return false;
    return true;
  };
  M.rows = function (ctx, ignore, cur) { const src = cur === "usd" ? M.USD : M.ARS; return src.filter(r => M.pass(r, ctx, ignore)); };
  // "Mes maximo visible": maximo mes seleccionado en el segmentador de fecha (ALLSELECTED)
  M.maxMi = function (ctx) { return ctx.meses && ctx.meses.size ? Math.max(...ctx.meses) : M.lastMi; };
  M.inMeses = (r, ctx) => !ctx.meses || !ctx.meses.size || ctx.meses.has(r.mi);
  M.sum = (rows, k) => { let s = 0; for (const r of rows) s += r[k] || 0; return s; };
  M.sumBy = function (rows, keyFn, valFn) {
    const m = new Map();
    for (const r of rows) { const k = keyFn(r); m.set(k, (m.get(k) || 0) + valFn(r)); }
    return m;
  };
  M.mesLabel = function (mi, largo) {
    const [y, m] = M.meses[mi].split("-").map(Number);
    const n = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][m - 1];
    const l = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"][m - 1];
    return largo ? `${l} de ${y}` : `${n} ${y}`;
  };
  M.mi2026 = () => M.idx("2026-01");

  /* ---------- medidas ---------- */
  // valor del mes maximo visible / mes anterior
  M.mesMax = (rows, ctx, k) => { const mi = M.maxMi(ctx); return M.sum(rows.filter(r => r.mi === mi), k); };
  M.mesAnt = (rows, ctx, k) => { const mi = M.maxMi(ctx) - 1; return M.sum(rows.filter(r => r.mi === mi), k); };
  M.varPct = (cur, prev) => prev ? (cur - prev) / prev : null;
  M.div = (a, b) => b ? a / b : null;
  // Denominador del Market Share dinamico: total del mes de las categorias elegidas en el segmentador (todas si no hay)
  M.denMS = function (ctx, mi, cur) {
    const src = cur === "usd" ? M.USD : M.ARS;
    let s = 0;
    for (const r of src) if (r.mi === mi && (!ctx.cats || ctx.cats.has(r.c))) s += r.aP;
    return s;
  };
  // Market share dinamico (AUM promedio / total de las categorias elegidas), por mes
  M.msDinamico = function (ctx, ger, mis) {
    const out = [];
    for (const mi of mis) {
      const den = M.denMS(ctx, mi);
      let num = 0;
      for (const r of M.ARS) if (r.mi === mi && r.g === ger && M.pass(r, ctx, ["ger"])) num += r.aP;
      out.push(den ? num / den : null);
    }
    return out;
  };
  // Suscripciones acumuladas desde enero 2026 hasta cada mes
  M.cumDesde2026 = function (rows, mis) {
    const m26 = M.mi2026(), byM = M.sumBy(rows.filter(r => r.mi >= m26), r => r.mi, r => r.su);
    let acc = 0; const res = new Map();
    for (let mi = m26; mi <= M.lastMi; mi++) { acc += byM.get(mi) || 0; res.set(mi, acc); }
    return mis.map(mi => (mi < m26 ? 0 : res.get(mi) || 0));
  };

  /* ---------- formatos (como el Power BI, es-AR) ---------- */
  const nf = (d) => new Intl.NumberFormat("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
  M.num = (v, d = 0) => (v == null || !isFinite(v) ? "—" : nf(d).format(v));
  // v en millones
  M.money = function (vMill, opt) {
    opt = opt || {};
    if (vMill == null || !isFinite(vMill)) return "—";
    const p = opt.usd ? (opt.sym === false ? "" : "US$ ") : (opt.sym === false ? "" : "$ ");
    const v = vMill * 1e6, a = Math.abs(v), d = opt.d == null ? 1 : opt.d;
    let s;
    if (a >= 1e12) s = nf(d).format(v / 1e12) + " bill.";
    else if (a >= 1e9) s = nf(d).format(v / 1e9) + " mil M";
    else if (a >= 1e6) s = nf(d).format(v / 1e6) + " M";
    else s = nf(0).format(v);
    return (s.startsWith("-") ? "-" + p + s.slice(1) : p + s).replace(/^\s+/, "");
  };
  M.pct = (v, d = 1) => (v == null || !isFinite(v) ? "—" : nf(d).format(v * 100) + " %");
  M.usd = (v, d = 0) => (v == null || !isFinite(v) ? "—" : "$ " + nf(d).format(v));
  M.mill = (v, d = 1) => { if (v == null || !isFinite(v)) return "—"; const a = Math.abs(v); return a >= 1e6 ? "$ " + nf(2).format(v / 1e6) + " mill." : a >= 1e3 ? "$ " + nf(d).format(v / 1e3) + " mil" : "$ " + nf(0).format(v); };
  M.cls = v => (v == null ? "" : v > 0 ? "pos" : v < 0 ? "neg" : "");
})();
