/* Motor de datos del tablero "réplica Power BI": tablas del modelo, contexto de filtro y medidas DAX de
   "Informe Gestion FCI.pbix" traducidas a JS. Usa los datos que carga model.js (M.ARS, M.USD, M.I).
   Fechas como texto 'AAAA-MM-DD'; mes como clave mk = año*12 + mes-1. Blank = null. */
(function () {
  const D = {};
  window.D = D;
  const pad = n => String(n).padStart(2, "0");
  const mkOf = s => { const y = +s.slice(0, 4), m = +s.slice(5, 7); return y * 12 + m - 1; };
  const mkStart = mk => `${Math.floor(mk / 12)}-${pad(mk % 12 + 1)}-01`;
  const mkEnd = mk => { const y = Math.floor(mk / 12), m = mk % 12 + 1; return `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`; };
  D.mkOf = mkOf; D.mkStart = mkStart; D.mkEnd = mkEnd;
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  D.MESES = MESES;
  D.cal = function (date, col) {   // columnas de Calendario a partir de una fecha
    if (date == null) return null;
    const y = +date.slice(0, 4), m = +date.slice(5, 7);
    switch (col) {
      case "Date": return date;
      case "Año": return y;
      case "Mes": return MESES[m - 1];
      case "MesNumero": return m;
      case "AñoMes": return `${y}-${pad(m)}`;
      case "AñoMesID": return y * 100 + m;
      case "AñoMes (Texto)": return `${y}-${pad(m)}-01`;
      default: return null;
    }
  };

  /* ---------------- tablas ---------------- */
  const T = {};
  D.T = T;
  function tabla(name, rows, cols, calCol) { T[name] = { name, rows, cols, calCol }; }
  D.build = function () {
    const fechaMi = M.fechas;   // fecha real del dato de cada mes (fin de mes o ultimo dia informado)
    const mkMi = M.meses.map(mkOf);
    const csvCols = {
      Fecha: r => r.F, Mes_Año_Fecha: r => mkStart(r.mk), Categoria: r => r.c, Subcategoria: r => r.s, Fondo: r => r.n, Gerente: r => r.g,
      Tipo_Gerente: r => r.t, Categoria2: r => r.c2, Categoria3: r => r.c3, Subcategoria2: r => r.s2, Categoria_Otros: r => r.co, Moneda: r => r.mon,
      "Comercial (según Fondo)": r => r.com, AUM_promedio: r => r.aP, AUM_Inicial: r => r.aI, AUM_Final: r => r.aF, Susc_Netas: r => r.su,
      Rendimiento: r => r.re, Facturacion_Gerente: r => r.fg, Facturacion_Depo: r => r.fd
    };
    const prep = src => src.map(r => Object.assign(r, { mk: mkMi[r.mi], F: fechaMi[r.mi] }));
    const csv = prep(M.ARS), usd = prep(M.USD);
    // Gerente + MS (Mes Año): "Gerente (x,x%)" del AUM del mes
    const totMes = new Map(), totGM = new Map();
    for (const r of csv) { totMes.set(r.mk, (totMes.get(r.mk) || 0) + r.aF); const k = r.g + "|" + r.mk; totGM.set(k, (totGM.get(k) || 0) + r.aF); }
    const nf1 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });   // FORMAT(.., "0.0%") del modelo sale con punto
    csvCols["Gerente + MS (Mes Año)"] = r => { const t = totMes.get(r.mk); const v = t ? (totGM.get(r.g + "|" + r.mk) || 0) / t : null; return r.g + " (" + (v == null ? "" : nf1.format(v * 100) + "%") + ")"; };
    tabla("CSV_1816", csv, csvCols, r => r.F);
    tabla("Fondos_1816_USD", usd, Object.assign({}, csvCols), r => r.F);
    // totales mensuales de AUM promedio (columnas suma_aums_*_mensual del modelo)
    D.denAll = new Map(); D.denCat = new Map();
    for (const r of csv) {
      D.denAll.set(r.mk, (D.denAll.get(r.mk) || 0) + r.aP);
      const k = r.mk + "|" + r.c; D.denCat.set(k, (D.denCat.get(k) || 0) + r.aP);
    }
    D.catsAll = [...new Set(csv.map(r => r.c))];
    const I = M.I || {};
    // Comisiones por unidad de negocio
    const com = (I.comisiones || []).map(x => ({ mk: mkOf(x.mes), F: mkEnd(mkOf(x.mes)), u: x.unidad, v: x.comisiones }));
    const totC = new Map(); for (const r of com) totC.set(r.mk, (totC.get(r.mk) || 0) + r.v);
    tabla("PBI - Mati - Comisiones", com, {
      FechaFinMes: r => r.F, Mes_Año_Fecha: r => mkStart(r.mk), AnoMesCorto: r => mkStart(r.mk), "Unidad de Negocio": r => r.u, "Unidad Negocio": r => r.u,
      Comisiones: r => r.v, "Share Fact.": r => (totC.get(r.mk) ? r.v / totC.get(r.mk) : null)
    }, r => r.F);
    const cf = (I.comisiones_fondo || []).map(x => ({ mk: mkOf(x.mes), F: mkEnd(mkOf(x.mes)), f: x.fondo, v: x.comisiones }));
    const totF = new Map(); for (const r of cf) totF.set(r.mk, (totF.get(r.mk) || 0) + r.v);
    tabla("PBI - Mati - Comisiones x Fondo", cf, {
      FechaFinMes: r => r.F, Mes_Año_Fecha: r => mkStart(r.mk), AnoMesCorto: r => mkStart(r.mk), "Fondo Corregido": r => r.f, Fondo: r => r.f,
      Comisiones: r => r.v, "Share Fact. Fondos": r => (totF.get(r.mk) ? r.v / totF.get(r.mk) : null)
    }, null);
    const se = (I.serie_facturacion || []).map(x => ({ F: x.fecha, mk: mkOf(x.fecha), v: x.facturacion }));
    tabla("Serie Facturación", se, { Fecha: r => r.F, "Facturación": r => r.v }, null);
    const cu = ((I.cuotapartistas || {}).filas || []).map(x => ({ f: x.Fondo, c: x.categoria_tipo_inversor, v: x.importe_usd_mill, n: x.cuotapartistas }));
    tabla("Cantidad de Cuotapartistas", cu, { Fondo: r => r.f, "Categoria Tipo Inversor": r => r.c, Cuotapartista: r => r.n }, null);
    const cv = (I.contrapartes || []).map(x => Object.assign({ F: x.fecha }, x));
    tabla("Compra_Venta_Contrapartes_", cv, {
      Agente: r => r.agente, Agente_Norm: r => r.agente_norm, "Bruto_Concertación": r => r.bruto, "Categoría_Pase": r => r.categoria_pase,
      "Categoría": r => r.categoria, Especie: r => r.especie, Fecha: r => r.F, Fecha_Concertacion: r => r.fecha_txt, Fondo: r => r.fondo,
      "Gastos_Concertación": r => r.gastos, "Moneda de Concertación": r => r.moneda, "Neto_Concertación": r => r.neto, "Operación_Numero": r => r.op,
      Ticker: r => r.ticker, "Tipo_Operación": r => r.tipo_op, "Valor Nominal": r => r.vn
    }, r => r.F);
    D.lastMk = { CSV_1816: mkMi[mkMi.length - 1], Fondos_1816_USD: mkMi[mkMi.length - 1] };
    for (const n of ["PBI - Mati - Comisiones", "PBI - Mati - Comisiones x Fondo", "Serie Facturación", "Compra_Venta_Contrapartes_"])
      D.lastMk[n] = T[n].rows.length ? Math.max(...T[n].rows.map(r => r.mk)) : null;
    D.lastMk.Calendario = D.lastMk.CSV_1816;
  };

  // valor de una columna para una fila de la tabla t (incluye columnas de Calendario por relacion)
  D.colVal = function (t, key, r) {
    const i = key.indexOf(".");
    const tn = key.slice(0, i), c = key.slice(i + 1);
    const tb = T[t];
    if (tn === t) { const f = tb.cols[c.split("#")[0]]; if (!f) return undefined; const v = f(r); return c.includes("#") ? D.level(v, c.split("#")[1]) : v; }
    if (tn === "Calendario" && tb.calCol) return D.cal(tb.calCol(r), c);
    return undefined;
  };
  D.level = function (date, lvl) {
    if (date == null) return null;
    const y = +date.slice(0, 4), m = +date.slice(5, 7);
    if (lvl === "Year") return y;
    if (lvl === "Quarter") return "Qtr " + Math.ceil(m / 3);
    if (lvl === "Month") return MESES[m - 1];
    if (lvl === "Day") return +date.slice(8, 10);
    return date;
  };
  // ¿el filtro sobre la columna key alcanza a la tabla t?
  D.applies = (t, key) => { const tn = key.slice(0, key.indexOf(".")); return tn === t || (tn === "Calendario" && !!T[t].calCol); };

  /* ---------------- contexto de filtro ----------------
     ctx = { f: {key: [pred]}, outer: {key:[pred]}, scope: Set(keys agrupadas) }
     pred = { sig, test(v), eq? } */
  D.pIn = (vals) => { const s = new Set(vals.map(v => (v == null ? null : v))); return { sig: "in:" + JSON.stringify([...s].sort()), test: v => s.has(v == null ? null : v), eq: s.size === 1 ? [...s][0] : undefined, vals: s }; };
  D.pFn = (sig, fn) => ({ sig, test: fn });
  D.ctx = (f, outer, scope) => ({ f: f || {}, outer: outer || f || {}, scope: scope || new Set() });
  D.with = function (ctx, ops) {
    const f = Object.assign({}, ctx.f);
    for (const op of ops) {
      if (op.rm) for (const k of op.rm) delete f[k];
      if (op.rmTable) for (const k of Object.keys(f)) if (k.startsWith(op.rmTable + ".") || (op.expanded && k.startsWith("Calendario."))) delete f[k];
      if (op.keep) { for (const k of Object.keys(f)) if (k.startsWith(op.keep.t + ".") || k.startsWith("Calendario.")) { if (!op.keep.cols.includes(k)) delete f[k]; } }
      if (op.set) f[op.set[0]] = [op.set[1]];
      if (op.add) f[op.add[0]] = (f[op.add[0]] || []).concat([op.add[1]]);
      if (op.allsel) for (const k of op.allsel) { if (ctx.outer[k]) f[k] = ctx.outer[k]; else delete f[k]; }
      if (op.allselTable) {
        for (const k of Object.keys(f)) if (k.startsWith(op.allselTable + ".") || k.startsWith("Calendario.")) delete f[k];
        for (const k of Object.keys(ctx.outer)) if (k.startsWith(op.allselTable + ".") || k.startsWith("Calendario.")) f[k] = ctx.outer[k];
      }
    }
    return { f, outer: ctx.outer, scope: ctx.scope };
  };
  D.inScope = (ctx, k) => ctx.scope.has(k);
  D.isFiltered = (ctx, k) => !!(ctx.f[k] && ctx.f[k].length);

  // filas de la tabla t bajo el contexto (con cache y particion por filtros de igualdad)
  const cache = new Map();
  D.clearCache = () => cache.clear();
  D.rows = function (t, ctx) {
    const keys = Object.keys(ctx.f).filter(k => D.applies(t, k)).sort();
    const eqKeys = [], other = [];
    for (const k of keys) { const ps = ctx.f[k]; if (ps.length === 1 && ps[0].eq !== undefined && !k.startsWith("Calendario.")) eqKeys.push(k); else other.push(k); }
    const bsig = t + "§" + other.map(k => k + "=" + ctx.f[k].map(p => p.sig).join("&")).join("|");
    let base = cache.get(bsig);
    if (!base) {
      const preds = other.map(k => [k, ctx.f[k]]);
      const src = T[t].rows;
      const out = [];
      for (const r of src) {
        let ok = true;
        for (const [k, ps] of preds) { const v = D.colVal(t, k, r); for (const p of ps) if (!p.test(v)) { ok = false; break; } if (!ok) break; }
        if (ok) out.push(r);
      }
      base = { rows: out, idx: new Map() };
      cache.set(bsig, base);
    }
    if (!eqKeys.length) return base.rows;
    const ik = eqKeys.join("|");
    let ix = base.idx.get(ik);
    if (!ix) {
      ix = new Map();
      for (const r of base.rows) { const kk = eqKeys.map(k => String(D.colVal(t, k, r))).join("\u0001"); let a = ix.get(kk); if (!a) ix.set(kk, a = []); a.push(r); }
      base.idx.set(ik, ix);
    }
    return ix.get(eqKeys.map(k => String(ctx.f[k][0].eq)).join("\u0001")) || [];
  };
  const sumF = (rows, f) => { if (!rows.length) return null; let s = 0; for (const r of rows) s += f(r) || 0; return s; };
  D.sum = (t, ctx, f) => sumF(D.rows(t, ctx), f);
  D.maxF = (t, ctx) => { let m = null; for (const r of D.rows(t, ctx)) if (r.F && (m == null || r.F > m)) m = r.F; return m; };
  const div = (a, b, alt) => (b == null || b === 0 || a == null ? (alt !== undefined && b ? alt : (alt !== undefined && (b == null || b === 0) ? alt : null)) : a / b);
  D.div = (a, b, alt) => { if (b == null || b === 0) return alt === undefined ? null : alt; if (a == null) return null; return a / b; };
  const mul = (v, k) => (v == null ? null : v * k);
  const monthPred = (col, mk) => D.pFn(col + "@m" + mk, v => v != null && mkOf(v) === mk);

  /* ---------------- medidas ---------------- */
  const MS = {};
  D.MS = MS;
  D.measure = function (t, name, ctx) {
    const f = MS[t + "|" + name];
    if (!f) { if (!D._warned) D._warned = new Set(); if (!D._warned.has(name)) { D._warned.add(name); console.warn("Medida sin traducir:", t, name); } return null; }
    return f(ctx);
  };
  const m = (t, n) => ctx => D.measure(t, n, ctx);

  // ---- CSV_1816 y Fondos_1816_USD (misma logica) ----
  function hechos(t, sfx) {
    const K = c => t + "." + c;
    const def = (n, f) => { MS[t + "|" + n.replace("%S", sfx)] = f; };
    const sAUM = ctx => mul(D.sum(t, ctx, r => r.aF), 1e6);
    const sSusc = ctx => mul(D.sum(t, ctx, r => r.su), 1e6);
    const sRend = ctx => mul(D.sum(t, ctx, r => r.re), 1e6);
    const sIni = ctx => mul(D.sum(t, ctx, r => r.aI), 1e6);
    const sProm = ctx => mul(D.sum(t, ctx, r => r.aP), 1e6);
    const maxVis = ctx => D.maxF(t, D.with(ctx, [{ allsel: [K("Fecha")] }]));
    const enMes = (base, off) => ctx => {
      const mf = maxVis(ctx); if (!mf) return null;
      return base(D.with(ctx, [{ rm: [K("Fecha")] }, { set: [K("Fecha"), monthPred("Fecha", mkOf(mf) + off)] }]));
    };
    const anio = (y) => D.pFn("y" + y, v => v != null && +v.slice(0, 4) === y);
    const mesEsp = (y, mo) => D.pFn("ym" + y + mo, v => v != null && +v.slice(0, 4) === y && +v.slice(5, 7) === mo);
    if (sfx === "") {
      def("AUM (Suma)", sAUM); def("Susc. (Suma)", sSusc); def("Rendimiento (Suma)", sRend); def("AUM_Inicial (Suma)", sIni); def("AUM Promedio (Suma)", sProm);
      def("AUM (Mes máximo visible)", enMes(sAUM, 0)); def("AUM (Mes anterior al máximo visible)", enMes(sAUM, -1));
      def("Susc. (Mes máximo visible)", enMes(sSusc, 0)); def("Susc. (Mes anterior al máximo visible)", enMes(sSusc, -1));
      def("AUM_Inicial (Mes máximo visible)", enMes(sIni, 0)); def("AUM_Final (Mes máximo visible)", enMes(sAUM, 0));
      def("AUM Promedio (Mes máximo visible)", enMes(sProm, 0));
      def("Rendimiento (Mes anterior al máximo visible)", enMes(sRend, -1));
    } else {
      def("AUM U$S (Suma)", sAUM); def("Susc. U$S (Suma)", sSusc); def("Rendimiento U$S (Suma)", sRend); def("AUM_Inicial U$S (Suma)", sIni);
      def("AUM U$S (Mes máximo visible)", enMes(sAUM, 0)); def("AUM U$S (Mes anterior al máximo visible)", enMes(sAUM, -1));
      def("Susc. U$S (Mes máximo visible)", enMes(sSusc, 0)); def("AUM_Inicial U$S (Mes máximo visible)", enMes(sIni, 0));
      def("AUM_Final U$S (Mes máximo visible)", enMes(sAUM, 0));
    }
    const N = (a) => a.replace("%S", sfx);
    const g = n => m(t, N(n));
    const aumMax = sfx ? g("AUM U$S (Mes máximo visible)") : g("AUM (Mes máximo visible)");
    const aumAnt = sfx ? g("AUM U$S (Mes anterior al máximo visible)") : g("AUM (Mes anterior al máximo visible)");
    const suscMax = sfx ? g("Susc. U$S (Mes máximo visible)") : g("Susc. (Mes máximo visible)");
    const iniMax = sfx ? g("AUM_Inicial U$S (Mes máximo visible)") : g("AUM_Inicial (Mes máximo visible)");
    const finMax = sfx ? g("AUM_Final U$S (Mes máximo visible)") : g("AUM_Final (Mes máximo visible)");
    const rendMax = ctx => { const a = finMax(ctx), b = iniMax(ctx), c = suscMax(ctx); return a == null && b == null && c == null ? null : (a || 0) - (b || 0) - (c || 0); };
    if (sfx) {
      def("AUM Variación % (Mes máx vs ant) U$S", ctx => { const p = aumAnt(ctx), c = aumMax(ctx); return D.div(c == null ? null : (c || 0) - (p || 0), p); });
      def("Rendimiento U$S (Mes máximo visible)", rendMax);
      def("Susc_sobre_AUM U$S", ctx => D.div(suscMax(ctx), iniMax(ctx)));
      def("Rendimiento_sobre_AUM U$S", ctx => D.div(rendMax(ctx), iniMax(ctx)));
      def("Suscripciones U$S (Suma) 2026", ctx => mul(D.sum(t, D.with(ctx, [{ set: [K("Fecha"), anio(2026)] }]), r => r.su), 1e6));
      def("Rendimiento U$S (Suma) 2026", ctx => mul(D.sum(t, D.with(ctx, [{ set: [K("Fecha"), anio(2026)] }]), r => r.re), 1e6));
      def("AUM_Inicial U$S Ene-2026", ctx => sIni(D.with(ctx, [{ rm: [K("Mes_Año_Fecha")] }, { set: [K("Fecha"), mesEsp(2026, 1)] }])));
      def("% Rendimiento U$S 2026", ctx => D.div(D.measure(t, "Rendimiento U$S (Suma) 2026", ctx), D.measure(t, "AUM_Inicial U$S Ene-2026", ctx)));
      return;
    }
    def("AUM Variación % (Mes máx vs ant)", ctx => { const p = aumAnt(ctx), c = aumMax(ctx); return D.div(c == null ? null : (c || 0) - (p || 0), p); });
    def("AUM Variación ABS (Mes máx vs ant)", ctx => { const p = aumAnt(ctx), c = aumMax(ctx); return c == null && p == null ? null : (c || 0) - (p || 0); });
    def("Variacion del AUM", ctx => { const p = aumAnt(ctx), c = aumMax(ctx); return c == null && p == null ? null : (c || 0) - (p || 0); });
    def("Susc. Variación % (Mes máx vs ant)", ctx => { const p = g("Susc. (Mes anterior al máximo visible)")(ctx), c = suscMax(ctx); return D.div(c == null ? null : (c || 0) - (p || 0), p); });
    def("Rendimiento (Mes máximo visible)", rendMax);
    def("Rendimiento Variación % (Mes máx vs ant)", ctx => { const p = g("Rendimiento (Mes anterior al máximo visible)")(ctx), c = rendMax(ctx); return D.div(c == null ? null : c - (p || 0), p); });
    def("Susc_sobre_AUM", ctx => D.div(suscMax(ctx), iniMax(ctx)));
    def("Rendimiento_sobre_AUM", ctx => D.div(rendMax(ctx), iniMax(ctx)));
    def("% Rendimiento", ctx => D.div(rendMax(ctx), iniMax(ctx)));
    def("% Suscripciones", ctx => D.div(suscMax(ctx), iniMax(ctx)));
    def("AUM Variación % (inicial vs final)", ctx => { const v = D.div(finMax(ctx), iniMax(ctx)); return v == null ? null : v - 1; });
    def("Var_Total_sobre_AUM_promedio", ctx => { const rows = D.rows(t, ctx); return D.div(sumF(rows, r => r.re + r.su), sumF(rows, r => r.aP), 0); });
    // bases y crecimiento
    const baseMes = (y, mo, bz) => ctx => sAUM(D.with(ctx, [{ rm: [K("Mes_Año_Fecha")].concat(bz ? [K("Gerente")] : []) }, { set: [K("Fecha"), mesEsp(y, mo)] }].concat(bz ? [{ set: [K("Gerente"), D.pIn(["Balanz"])] }] : [])));
    def("AUM Base Dic-2025", baseMes(2025, 12)); def("AUM Base Dic-2025 (Balanz)", baseMes(2025, 12, true));
    def("AUM Base Dic-2019", baseMes(2022, 12)); def("AUM Base Dic-2019 (Balanz)", baseMes(2022, 12, true));
    def("Var % desde Dic-2025", ctx => { const b = g("AUM Base Dic-2025")(ctx), a = sAUM(ctx); const r = b ? D.div(a, b) - 1 : null; return r == null ? null : (r < 0 ? 0 : r); });
    def("Var % desde Dic-2025 (Balanz)", ctx => { const a = sAUM(D.with(ctx, [{ set: [K("Gerente"), D.pIn(["Balanz"])] }])), b = g("AUM Base Dic-2025 (Balanz)")(ctx); return b ? D.div(a, b) - 1 : null; });
    def("Var % desde Dic-2019", ctx => {
      const mf = D.maxF(t, ctx); if (mf && mf.slice(0, 7) === "2022-12") return 0;
      const b = g("AUM Base Dic-2019")(ctx); return b ? D.div(sAUM(ctx), b) - 1 : null;
    });
    def("Var % desde Dic-2019 (Balanz)", ctx => { const a = sAUM(D.with(ctx, [{ set: [K("Gerente"), D.pIn(["Balanz"])] }])), b = g("AUM Base Dic-2019 (Balanz)")(ctx); return b ? D.div(a, b) - 1 : null; });
    def("AUM (Mes máximo visible) Scatter", ctx => {
      const mf = D.maxF(t, D.with(ctx, [{ rm: [K("Gerente"), K("Categoria"), K("Subcategoria"), K("Fondo")] }])); if (!mf) return null;
      return sProm(D.with(ctx, [{ set: [K("Fecha"), monthPred("Fecha", mkOf(mf))] }]));
    });
    def("Var % desde Dic-2025 Scatter", ctx => { const a = g("AUM Promedio (Mes máximo visible)")(ctx), b = g("AUM Base Dic-2025")(ctx); const r = b ? D.div(a, b) - 1 : null; return r == null ? null : (r < 0 ? 0 : r); });
    // composicion
    const pctAll = (num, cols) => ctx => D.div(num(ctx), num(D.with(ctx, [{ rm: cols.map(K) }])));
    def("% AUM Moneda", pctAll(aumMax, ["Moneda", "Tipo_Gerente"]));
    const susc26 = ctx => mul(D.sum(t, D.with(ctx, [{ set: [K("Fecha"), anio(2026)] }]), r => r.su), 1e6);
    def("Suscripciones (Suma) 2026", susc26);
    def("% Flujo Moneda", pctAll(susc26, ["Moneda", "Tipo_Gerente"]));
    def("Rendimiento (Suma) 2026", ctx => mul(D.sum(t, D.with(ctx, [{ set: [K("Fecha"), anio(2026)] }]), r => r.re), 1e6));
    def("AUM_Inicial Ene-2026", ctx => sIni(D.with(ctx, [{ rm: [K("Mes_Año_Fecha")] }, { set: [K("Fecha"), mesEsp(2026, 1)] }])));
    def("% Rendimiento 2026", ctx => D.div(g("Rendimiento (Suma) 2026")(ctx), g("AUM_Inicial Ene-2026")(ctx)));
    def("AUM (Mes máximo visible) - Bancarias", ctx => aumMax(D.with(ctx, [{ set: [K("Tipo_Gerente"), D.pIn(["Bancarias"])] }])));
    def("AUM (Mes máximo visible) - Independientes", ctx => aumMax(D.with(ctx, [{ set: [K("Tipo_Gerente"), D.pIn(["Independientes"])] }])));
    // market share
    const totalMS = catCol => ctx => {
      const enCat = D.inScope(ctx, K(catCol)), enGer = D.inScope(ctx, K("Gerente"));
      const catSl = D.isFiltered(ctx, K(catCol)) && !enCat, gerSl = D.isFiltered(ctx, K("Gerente")) && !enGer;
      if (catSl && gerSl) return sAUM(D.with(ctx, [{ rm: [K("Gerente")] }]));
      if (enCat) return sAUM(D.with(ctx, [{ rm: [K(catCol)] }]));
      if (enGer) return sAUM(D.with(ctx, [{ rm: [K("Gerente")] }]));
      return sAUM(D.with(ctx, [{ rm: [K(catCol), K("Gerente")] }]));
    };
    def("AUM para MS", sAUM);
    def("AUM Total para MS", totalMS("Categoria2"));
    def("MS AUM", ctx => D.div(sAUM(ctx), totalMS("Categoria2")(ctx)));
    def("AUM Total para MS Otros", totalMS("Categoria_Otros"));
    def("MS AUM otros", ctx => { const b = totalMS("Categoria_Otros")(ctx), a = sAUM(ctx); return b == null || b === 0 ? null : (a == null ? null : a / b); });
    const den = (ctx, mk) => {
      const c2 = D.with(ctx, [{ allsel: [K("Categoria")] }]);
      const sel = new Set(D.rows(t, c2).map(r => r.c));
      const tot = new Set(D.rows(t, D.with(ctx, [{ rm: [K("Categoria")] }])).map(r => r.c)).size;
      // MAX(suma_aums_mensual) sobre las filas del contexto: el total del mes (vacio si no hay filas)
      if (!D.rows(t, ctx).length) return null;
      if (sel.size === 0 || sel.size === tot) return D.denAll.get(mk) || null;
      let s = 0; for (const c of sel) s += D.denCat.get(mk + "|" + c) || 0; return s;
    };
    def("Denominador MS (Cats sel., Mensual)", ctx => { const mks = [...new Set(D.rows(t, ctx).map(r => r.mk))]; return mks.length === 1 ? den(ctx, mks[0]) : null; });
    const msDin = soloBalanz => ctx => {
      const mks = [...new Set(D.rows(t, soloBalanz ? D.with(ctx, []) : ctx).map(r => r.mk))];
      let tot = null;
      for (const mk of mks) {
        const cm = D.with(ctx, [{ add: ["Calendario.AñoMesID", D.pIn([Math.floor(mk / 12) * 100 + mk % 12 + 1])] }]);
        const d = den(cm, mk);
        const num = D.sum(t, soloBalanz ? D.with(cm, [{ set: [K("Gerente"), D.pIn(["Balanz"])] }]) : cm, r => r.aP);
        const v = num == null ? null : D.div(num, d, 0);
        if (v != null) tot = (tot || 0) + v;
      }
      return tot;
    };
    def("MS Dinámico (Suma)", msDin(false));
    def("MS Dinámico Balanz (Suma)", msDin(true));
    // suscripciones / rendimiento acumulados desde enero 2026
    const desde26 = (fld, ctx) => {
      const mf = D.maxF(t, ctx); if (!mf) return null;
      const fin = mkEnd(mkOf(mf));
      if (fin < "2026-01-01") return 0;
      return mul(D.sum(t, D.with(ctx, [{ rm: [K("Mes_Año_Fecha")] }, { set: [K("Fecha"), D.pFn("r26" + fin, v => v != null && v >= "2026-01-01" && v <= fin)] }]), r => r[fld]), 1e6);
    };
    def("Susc. Acumulada desde Ene-2026 (Dinámica)", ctx => desde26("su", ctx));
    def("Rend. Acumulado desde Ene-2026 (Dinámica)", ctx => desde26("re", ctx));
    def("Susc. Acumulada Balanz desde Ene-2026", ctx => desde26("su", D.with(ctx, [{ set: [K("Gerente"), D.pIn(["Balanz"])] }])));
    def("Susc. Acumulada Total desde Ene-2026", ctx => {
      const mf = D.maxF(t, ctx); if (!mf) return null;
      const fin = mkEnd(mkOf(mf));
      if (fin < "2026-01-01") return 0;
      const rango = D.pFn("r26" + fin, v => v != null && v >= "2026-01-01" && v <= fin);
      let c2;
      if (D.isFiltered(ctx, K("Gerente")) && !D.inScope(ctx, K("Gerente"))) c2 = D.with(ctx, [{ keep: { t, cols: [K("Gerente")] } }]);
      else if (D.isFiltered(ctx, K("Categoria")) && !D.inScope(ctx, K("Categoria"))) c2 = D.with(ctx, [{ keep: { t, cols: [K("Categoria")] } }]);
      else c2 = D.with(ctx, [{ rmTable: t, expanded: true }]);
      return mul(D.sum(t, D.with(c2, [{ set: [K("Fecha"), rango] }]), r => r.su), 1e6);
    });
    def("Ratio_Susc", ctx => D.div(g("Susc. Acumulada Balanz desde Ene-2026")(ctx), g("Susc. Acumulada Total desde Ene-2026")(ctx)));
    def("Ratio_Susc_Ind", ctx => D.div(g("Susc. Acumulada desde Ene-2026 (Dinámica)")(ctx), g("Susc. Acumulada Total desde Ene-2026")(ctx)));
    def("Susc. Balanz (Suma)", ctx => mul(D.sum(t, D.with(ctx, [{ set: [K("Gerente"), D.pIn(["Balanz"])] }]), r => r.su), 1e6));
    // rankings
    const rankx = (valsCtx, f, ctx, dense) => {
      const cur = f(ctx); if (cur == null) return null;
      const gers = [...new Set(D.rows(t, valsCtx).map(r => r.g))];
      const vals = gers.map(gg => f(D.with(ctx, [{ set: [K("Gerente"), D.pIn([gg])] }]))).filter(v => v != null);
      const uniq = [...new Set(vals)].sort((a, b) => b - a);
      return uniq.filter(v => v > cur).length + 1;
    };
    const allSelGer = ctx => D.with(ctx, [{ allsel: [K("Gerente")] }]);
    def("Ranking AUM", ctx => rankx(allSelGer(ctx), aumMax, ctx));
    def("Ranking AUM_Final", ctx => rankx(allSelGer(ctx), finMax, ctx));
    def("Ranking Susc Acum (desde Ene-2026)", ctx => rankx(allSelGer(ctx), g("Susc. Acumulada desde Ene-2026 (Dinámica)"), ctx));
    const fact = ctx => { const rows = D.rows(t, ctx); return rows.length ? mul(sumF(rows, r => (r.fd || 0) + (r.fg || 0)), 1e6) : null; };
    def("Facturación_Total", fact);
    def("Ranking Facturación", ctx => rankx(allSelGer(ctx), fact, ctx));
    def("% de Facturación", ctx => D.div(fact(ctx), fact(D.with(ctx, [{ rm: [K("Gerente")] }])), 0));
    def("% de AUM", ctx => D.div(sAUM(ctx), sAUM(D.with(ctx, [{ rm: [K("Gerente")] }])), 0));
    def("Facturación/M.Share", ctx => { const a = g("% de Facturación")(ctx), b = g("% de AUM")(ctx); return b ? a / b : null; });
    def("Facturacion (Mes maximo visible)", enMes(fact, 0));
    def("Facturacion (Mes anterior al máximo visible)", enMes(fact, -1));
    def("Facturación Variación % (Mes máx vs ant)", ctx => { const p = g("Facturacion (Mes anterior al máximo visible)")(ctx), c = g("Facturacion (Mes maximo visible)")(ctx); return D.div(c == null ? null : c - (p || 0), p); });
    // subcategorias
    def("Susc Industria (Subcat)", ctx => sSusc(D.with(ctx, [{ rm: [K("Gerente")] }])));
    def("Share Susc (Subcat)", ctx => D.div(sSusc(ctx), sSusc(D.with(ctx, [{ rm: [K("Gerente")] }]))));
    const susc26All = ctx => sSusc(D.with(ctx, [{ set: [K("Fecha"), anio(2026)] }]));
    def("Ranking Susc (Subcat)", ctx => {
      const f = susc26All, cur = f(ctx); if (cur == null) return null;
      const gers = [...new Set(T[t].rows.map(r => r.g))];
      const vals = [...new Set(gers.map(gg => f(D.with(ctx, [{ set: [K("Gerente"), D.pIn([gg])] }]))).filter(v => v != null))].sort((a, b) => b - a);
      return vals.filter(v => v > cur).length + 1;
    });
    def("#Gerentes (Subcat)", ctx => { const n = new Set(D.rows(t, D.with(ctx, [{ rm: [K("Gerente")] }])).map(r => r.g)).size; return n || null; });
    def("Lider (Subcat)", ctx => {
      const c2 = D.with(ctx, [{ rm: [K("Gerente")] }]);
      const gers = [...new Set(T[t].rows.map(r => r.g))].sort((a, b) => a.localeCompare(b));
      let best = null, bv = null;
      for (const gg of gers) { const v = susc26All(D.with(c2, [{ set: [K("Gerente"), D.pIn([gg])] }])); if (v != null && (bv == null || v > bv)) { bv = v; best = gg; } }
      return best;
    });
    def("Mostrar Subcat (Susc mayor a 0)", ctx => { const s = sSusc(ctx); return s != null && s >= 0 ? 1 : 0; });
    def("Mostrar Balanz", ctx => (sSusc(D.with(ctx, [{ set: [K("Gerente"), D.pIn(["Balanz"])] }])) != null ? 1 : 0));
  }

  // ---- comisiones internas ----
  function comisiones() {
    const t = "PBI - Mati - Comisiones", K = c => t + "." + c;
    const def = (n, f) => { MS[t + "|" + n] = f; };
    const s = ctx => D.sum(t, ctx, r => r.v);
    const maxAll = ctx => D.maxF(t, D.with(ctx, [{ allselTable: t }]));
    const fecha = (off) => ctx => { const mf = maxAll(ctx); if (!mf) return null; const target = mkEnd(mkOf(mf) + off); return s(D.with(ctx, [{ set: [K("FechaFinMes"), D.pIn([target])] }])); };
    def("Comisiones (Mes Máx Visible)", fecha(0)); def("Comisiones PM", fecha(-1)); def("Comisiones PY", fecha(-12));
    const v = (a, b) => ctx => { const x = MS[t + "|" + a](ctx), y = MS[t + "|" + b](ctx); return x == null && y == null ? null : (x || 0) - (y || 0); };
    def("Variación m/m", v("Comisiones (Mes Máx Visible)", "Comisiones PM"));
    def("Variación y/y", v("Comisiones (Mes Máx Visible)", "Comisiones PY"));
    def("% m/m", ctx => D.div(MS[t + "|Variación m/m"](ctx), MS[t + "|Comisiones PM"](ctx)));
    def("% y/y", ctx => D.div(MS[t + "|Variación y/y"](ctx), MS[t + "|Comisiones PY"](ctx)));
    const ytd = (pyOff) => ctx => {
      const mf = pyOff ? maxAll(ctx) : D.maxF(t, D.with(ctx, [{ rm: [K("FechaFinMes")] }, { allsel: [K("Mes_Año_Fecha")] }]));
      if (!mf) return null;
      const tope = mkEnd(mkOf(mf) - pyOff), y = tope.slice(0, 4);
      return s(D.with(ctx, [{ set: [K("FechaFinMes"), D.pFn("ytd" + tope, x => x != null && x.slice(0, 4) === y && x <= tope)] }]));
    };
    def("Comisiones YTD", ytd(0)); def("Comisiones YTD PY", ytd(12));
    def("Variación YTD", v("Comisiones YTD", "Comisiones YTD PY"));
    def("% YTD", ctx => D.div(MS[t + "|Variación YTD"](ctx), MS[t + "|Comisiones YTD PY"](ctx)));
    for (const [n, base] of [["m/m", "Variación m/m"], ["y/y", "Variación y/y"], ["YTD", "Variación YTD"]])
      def("% Explicación " + n, ctx => D.div(MS[t + "|" + base](ctx), MS[t + "|" + base](D.with(ctx, [{ allsel: [K("Unidad de Negocio")] }]))));

    const t2 = "PBI - Mati - Comisiones x Fondo", K2 = c => t2 + "." + c;
    const def2 = (n, f) => { MS[t2 + "|" + n] = f; };
    const s2 = ctx => D.sum(t2, ctx, r => r.v);
    const maxV = ctx => D.maxF(t2, D.with(ctx, [{ rm: [K2("FechaFinMes")] }, { allsel: [K2("Mes_Año_Fecha")] }]));
    const f2 = off => ctx => { const mf = maxV(ctx); if (!mf) return null; return s2(D.with(ctx, [{ set: [K2("FechaFinMes"), D.pIn([mkEnd(mkOf(mf) + off)])] }])); };
    def2("Comisiones x Fondo (Mes Máx Visible)", f2(0)); def2("Comisiones x Fondo PM", f2(-1)); def2("Comisiones x Fondo PY", f2(-12));
    const ytd2 = off => ctx => { const mf = maxV(ctx); if (!mf) return null; const tope = mkEnd(mkOf(mf) - off), y = tope.slice(0, 4);
      return s2(D.with(ctx, [{ set: [K2("FechaFinMes"), D.pFn("ytd" + tope, x => x != null && x.slice(0, 4) === y && x <= tope)] }])); };
    def2("Comisiones x Fondo YTD", ytd2(0)); def2("Comisiones x Fondo YTD PY", ytd2(12));
    const v2 = (a, b) => ctx => { const x = MS[t2 + "|" + a](ctx), y = MS[t2 + "|" + b](ctx); return x == null && y == null ? null : (x || 0) - (y || 0); };
    def2("Variación x Fondo m/m", v2("Comisiones x Fondo (Mes Máx Visible)", "Comisiones x Fondo PM"));
    def2("Variación x Fondo y/y", v2("Comisiones x Fondo (Mes Máx Visible)", "Comisiones x Fondo PY"));
    def2("Variación x Fondo YTD", v2("Comisiones x Fondo YTD", "Comisiones x Fondo YTD PY"));
    def2("% x Fondo m/m", ctx => D.div(MS[t2 + "|Variación x Fondo m/m"](ctx), MS[t2 + "|Comisiones x Fondo PM"](ctx)));
    def2("% x Fondo y/y", ctx => D.div(MS[t2 + "|Variación x Fondo y/y"](ctx), MS[t2 + "|Comisiones x Fondo PY"](ctx)));
    def2("% x Fondo YTD", ctx => D.div(MS[t2 + "|Variación x Fondo YTD"](ctx), MS[t2 + "|Comisiones x Fondo YTD PY"](ctx)));
    for (const n of ["m/m", "y/y", "YTD"])
      def2("% Explicación x Fondo " + n, ctx => D.div(MS[t2 + "|Variación x Fondo " + n](ctx), MS[t2 + "|Variación x Fondo " + n](D.with(ctx, [{ rm: [K2("Fondo Corregido")] }]))));

    MS["Cantidad de Cuotapartistas|Importe_Millones_USD"] = ctx => D.sum("Cantidad de Cuotapartistas", ctx, r => r.v);
    MS["Compra_Venta_Contrapartes_|Monto Operado Bruto"] = ctx => D.sum("Compra_Venta_Contrapartes_", ctx, r => r.monto_usd_mill);
  }
  hechos("CSV_1816", ""); hechos("Fondos_1816_USD", " U$S");
  comisiones();

  /* ---------------- evaluacion de campos ---------------- */
  // valor de una proyeccion (medida, agregacion, aritmetica) en el contexto
  D.evalField = function (fd, ctx, vis) {
    if (fd.k === "M") return D.measure(fd.t, fd.p, ctx);
    if (fd.k === "A") {
      const e = fd.e, rows = D.rows(e.t, ctx), col = T[e.t].cols[e.p];
      if (!rows.length) return null;
      const vals = rows.map(col).filter(v => v != null);
      switch (fd.f) {
        case 0: return vals.reduce((a, b) => a + b, 0);
        case 1: return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        case 2: return new Set(vals).size;
        case 3: return vals.length ? vals.reduce((a, b) => (b < a ? b : a)) : null;
        case 4: return vals.length ? vals.reduce((a, b) => (b > a ? b : a)) : null;
        case 5: return vals.length;
        default: return vals.reduce((a, b) => a + b, 0);
      }
    }
    if (fd.k === "X") {
      const a = D.evalField(fd.l, ctx, vis), b = D.evalField(fd.r, ctx, vis);
      if (a == null) return null;
      switch (fd.op) { case 0: return a + (b || 0); case 1: return a - (b || 0); case 2: return a * (b || 0); case 3: return b ? a / b : null; }
      return null;
    }
    if (fd.k === "S") {
      // ScopedEval: el mismo valor quitando el agrupamiento del visual (scope [] = total general; RoleRef = conserva ese rol)
      const keep = new Set();
      for (const s of fd.scope || []) if (s.raw && s.raw.RoleRef && vis) for (const k of (vis.roleKeys[s.raw.RoleRef.Role] || [])) keep.add(k);
      const rm = [...ctx.scope].filter(k => !keep.has(k));
      const c2 = D.with(ctx, [{ rm }, { allsel: rm }]);
      c2.scope = new Set([...ctx.scope].filter(k => keep.has(k)));
      return D.evalField(fd.e, c2, vis);
    }
    if (fd.k === "C") { const rows = D.rows(fd.t, ctx); return rows.length ? T[fd.t].cols[fd.p](rows[0]) : null; }
    if (fd.k === "L") return fd.v;
    return null;
  };
  D.fieldKey = fd => fd.t + "." + fd.p + (fd.k === "H" ? "#" + fd.lvl : "");
  D.fieldTable = function (fd) {
    if (fd.k === "M" || fd.k === "C" || fd.k === "H") return fd.t;
    if (fd.k === "A" || fd.k === "S") return D.fieldTable(fd.e);
    if (fd.k === "X") return D.fieldTable(fd.l);
    return null;
  };

  /* ---------------- filtros del reporte -> predicados ---------------- */
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  function litVal(x) {
    if (x == null) return null;
    if (typeof x === "object" && x.date) return x.date.slice(0, 10);
    return x;
  }
  function dexpr(e) {   // expresiones de fecha (DateSpan/DateAdd/Now/Literal)
    if (!e) return null;
    if (e.k === "L") return litVal(e.v);
    if (e.k === "NOW") return today();
    if (e.k === "DS") { const v = dexpr(e.e); if (v == null) return null; if (e.u === 2) return v.slice(0, 8) + "01"; if (e.u === 3) return v.slice(0, 5) + "01-01"; return v; }
    if (e.k === "DA") {
      const v = dexpr(e.e); if (v == null) return null;
      const d = new Date(v + "T00:00:00Z");
      if (e.u === 0) d.setUTCDate(d.getUTCDate() + e.n); else if (e.u === 1) d.setUTCDate(d.getUTCDate() + 7 * e.n);
      else if (e.u === 2) d.setUTCMonth(d.getUTCMonth() + e.n); else if (e.u === 3) d.setUTCFullYear(d.getUTCFullYear() + e.n);
      return d.toISOString().slice(0, 10);
    }
    return null;
  }
  const cmp = (kind, a, b) => { if (a == null || b == null) return false; switch (kind) { case 0: return a === b; case 1: return a > b; case 2: return a >= b; case 3: return a < b; case 4: return a <= b; } return false; };
  // condicion -> lista de {key, pred} (columnas) o {measure: fd, test} (filtro sobre medida)
  D.condToFilters = function (c, ctxFn) {
    const out = [];
    const key = e => D.fieldKey(e);
    if (c.op === "in" && c.v) {
      if (c.e.length === 1) out.push({ key: key(c.e[0]), pred: D.pIn(c.v.map(r => litVal(r[0]))) });
      else { const set = new Set(c.v.map(r => JSON.stringify(r.map(litVal)))); out.push({ multi: c.e.map(key), pred: set }); }
    } else if (c.op === "in" && c.tbl) {
      out.push({ key: key(c.e[0]), topn: c.tbl });
    } else if (c.op === "not") {
      const inner = D.condToFilters(c.c, ctxFn);
      for (const f of inner) {
        if (f.pred) out.push({ key: f.key, pred: D.pFn("not(" + f.pred.sig + ")", v => !f.pred.test(v)) });
        else if (f.measure) out.push({ measure: f.measure, test: v => !f.test(v) });
      }
    } else if (c.op === "cmp" || c.op === "between" || c.op === "and" || c.op === "or" || c.op === "contains" || c.op === "starts") {
      const fld = c.l || c.e || (c.op === "and" || c.op === "or" ? null : null);
      const test = D.condTest(c);
      const f0 = D.condField(c);
      if (f0 && f0.k === "M") out.push({ measure: f0, test });
      else if (f0) out.push({ key: key(f0), pred: D.pFn("c:" + JSON.stringify(c), test) });
    }
    return out;
  };
  D.condField = function (c) { if (c.l && (c.l.k === "C" || c.l.k === "M" || c.l.k === "H")) return c.l; if (c.e && c.e.k) return c.e; if (c.op === "and" || c.op === "or") return D.condField(c.l); return null; };
  D.condTest = function (c) {
    if (c.op === "cmp") { const r = dexpr(c.r); return v => cmp(c.kind, typeof v === "string" && typeof r === "string" ? v.slice(0, Math.max(r.length, 10)) : v, r); }
    if (c.op === "between") { const lo = dexpr(c.lo), hi = dexpr(c.hi); return v => v != null && v >= lo && v <= hi; }
    if (c.op === "and") { const a = D.condTest(c.l), b = D.condTest(c.r); return v => a(v) && b(v); }
    if (c.op === "or") { const a = D.condTest(c.l), b = D.condTest(c.r); return v => a(v) || b(v); }
    if (c.op === "contains") { const r = String(dexpr(c.r) || "").toLowerCase(); return v => v != null && String(v).toLowerCase().includes(r); }
    if (c.op === "starts") { const r = String(dexpr(c.r) || "").toLowerCase(); return v => v != null && String(v).toLowerCase().startsWith(r); }
    return () => true;
  };
  D.today = today;
})();
