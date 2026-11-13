/* Paginas de AUM (Industria y Balanz) */
(function () {
  const P = window.P = window.P || { pages: [] };
  const def = p => P.pages.push(p);
  const C = M.COL;
  // contexto de filtro a partir del estado de la pagina
  P.ctx = function (st, extra) { return Object.assign({ meses: st.meses || null, cats: st.cats || null, subs: st.subs || null, ger: st.ger || null, tipo: st.tipo || null, fondo: st.fondo || null, s2: st.s2 || null, c3: st.c3 || null }, extra || {}); };
  P.catSlicer = (content, st, rf, vals) => U.buttons(content, vals || M.CATS, st, "cats", rf);
  P.mesesDesde = (mes, ctx) => { const a = M.idx(mes), out = []; for (let mi = Math.max(0, a); mi <= M.lastMi; mi++) if (!ctx || !ctx.meses || ctx.meses.has(mi)) out.push(mi); return out; };
  P.lbl = mis => mis.map(mi => M.mesLabel(mi));
  const tipoSeries = (cats, mp) => [["Bancarias", C.banc], ["Independientes", C.ind]].map(([t, col]) => ({ name: t, color: col, data: cats.map(c => (mp.get(c + "|" + t) || 0)) }));

  // tarjeta de resumen (AUM final del mes, variacion vs mes anterior, var. por suscripcion y por rendimiento)
  P.resumenCards = function (parent, title, ctx, cur) {
    const b = U.box(parent, title);
    const rows = M.rows(ctx, [], cur), mi = M.maxMi(ctx);
    const fin = M.sum(rows.filter(r => r.mi === mi), "aF"), ant = M.sum(rows.filter(r => r.mi === mi - 1), "aF");
    const ini = M.sum(rows.filter(r => r.mi === mi), "aI"), su = M.sum(rows.filter(r => r.mi === mi), "su");
    const usd = cur === "usd";
    const fv = M.varPct(fin, ant), fs = M.div(su, ini), fr = M.div(fin - ini - su, ini);
    U.cards(b, [{ v: M.money(fin, { usd, sym: !usd }), l: "AUM Final del mes" }, { v: M.pct(fv), l: "Variación (vs mes ant.)", cls: M.cls(fv) },
      { v: M.pct(fs, 2), l: "Var. x Suscripción", cls: M.cls(fs) }, { v: M.pct(fr, 2), l: "Var. x Rendimiento", cls: M.cls(fr) }]);
  };

  function aumResumen(st, side, content, rf, backup) {
    U.monthSlicer(side, st, "meses", rf, { single: true });
    P.catSlicer(content, st, rf);
    const ctx = P.ctx(st);
    const r1 = U.row(content, "r2");
    if (backup) {
      const a = U.el("div", "content"), b = U.el("div", "content"); r1.append(a, b);
      P.resumenCards(a, "Total Industria en Dólares", ctx, "usd"); P.resumenCards(b, "Total Industria en Pesos", ctx, "ars");
      P.resumenCards(a, "Total Independientes", P.ctx(st, { tipo: new Set(["Independientes"]) }), "usd"); P.resumenCards(b, "Total Independientes", P.ctx(st, { tipo: new Set(["Independientes"]) }), "ars");
      P.resumenCards(a, "Total Bancarias", P.ctx(st, { tipo: new Set(["Bancarias"]) }), "usd"); P.resumenCards(b, "Total Bancarias", P.ctx(st, { tipo: new Set(["Bancarias"]) }), "ars");
    } else {
      P.resumenCards(r1, "Total Industria en Dólares", ctx, "usd"); P.resumenCards(r1, "Total Industria en Pesos", ctx, "ars");
    }
    const mi = M.maxMi(ctx);
    if (!backup) {
      // matriz Moneda x Tipo de gerente (AUM final del mes y % de la fila)
      const rows = M.rows(ctx).filter(r => r.mi === mi);
      const mp = M.sumBy(rows, r => r.mon + "|" + r.t, r => r.aF);
      const fila = mon => { const b = mp.get(mon + "|Bancarias") || 0, i = mp.get(mon + "|Independientes") || 0; return { k: mon, b, bp: M.div(b, b + i), i, ip: M.div(i, b + i), t: b + i, tp: 1 }; };
      const fs = [fila("ARS"), fila("USD")];
      const tot = { b: fs[0].b + fs[1].b, i: fs[0].i + fs[1].i }; tot.t = tot.b + tot.i; tot.bp = tot.b / tot.t; tot.ip = tot.i / tot.t; tot.tp = 1;
      const bx = U.box(content, "AUM por Tipo de Gerente y Moneda");
      U.table(bx, [{ k: "k", h: "Moneda", l: 1 }, { k: "b", h: "Bancarias AUM", f: v => M.money(v) }, { k: "bp", h: "%", f: v => M.pct(v, 0) },
        { k: "i", h: "Independientes AUM", f: v => M.money(v) }, { k: "ip", h: "%", f: v => M.pct(v, 0) }, { k: "t", h: "Total AUM", f: v => M.money(v) }, { k: "tp", h: "%", f: v => M.pct(v, 0) }], fs, { total: tot });
    }
    P.tresGraficos(content, ctx, mi, "aF");
  }
  // AUM por Gerente (torta tipo), por Categoria2 (barras por tipo) y por Moneda (% AUM Moneda)
  P.tresGraficos = function (content, ctx, mi, k, opt) {
    opt = opt || {};
    const r = U.row(content);
    const rows = M.rows(ctx).filter(x => opt.multi ? x.mi >= M.mi2026() && M.inMeses(x, ctx) : x.mi === mi);
    const tot = M.sum(rows, k);
    const bt = M.sumBy(rows, x => x.t, x => x[k]);
    const b1 = U.box(r, opt.t1 || "AUM por Gerente"); U.legendTipo(b1);
    U.pie(b1, [{ name: "Bancarias", value: bt.get("Bancarias") || 0, color: C.banc }, { name: "Independientes", value: bt.get("Independientes") || 0, color: C.ind }],
      { fmt: v => M.money(v), inside: true, h: "short" });
    const ck = opt.catKey || "c2";
    const mp = M.sumBy(rows, x => x[ck] + "|" + x.t, x => x[k]);
    const cats = [...M.sumBy(rows, x => x[ck], x => x[k]).entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
    const b2 = U.box(r, opt.t2 || "AUM por Categoría de Fondo"); U.legendTipo(b2);
    U.hbar(b2, cats, tipoSeries(cats, mp), { fmt: v => (opt.money ? M.money(v) : M.pct(v / tot)), h: "short" });
    const mm = M.sumBy(rows, x => x.mon + "|" + x.t, x => x[k]);
    const mons = ["ARS", "USD"];
    const b3 = U.box(r, opt.t3 || "AUM por Moneda de Suscripción"); U.legendTipo(b3);
    U.hbar(b3, mons, tipoSeries(mons, mm).map(s => ({ ...s, data: s.data.map(v => v / tot) })), { fmt: v => M.pct(v), inner: v => M.pct(v), h: "short" });
  };

  def({ id: "aum-resumen", group: "AUM", name: "Industria FCI - AUM Resumen", render: (st, s, c, rf) => aumResumen(st, s, c, rf, false) });

  def({ id: "ranking", group: "AUM", name: "Ranking", init: st => { st.meses = new Set([M.lastMi]); }, render(st, side, content, rf) {
    U.monthSlicer(side, st, "meses", rf, { single: true });
    P.catSlicer(content, st, rf);
    const ctx = P.ctx(st), mi = M.maxMi(ctx);
    const rows = M.rows(ctx);
    const cur = M.sumBy(rows.filter(r => r.mi === mi), r => r.g, r => r.aF), tot = [...cur.values()].reduce((a, b) => a + b, 0);
    const rk = [...cur.entries()].filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).map(([g, v], i) => ({ r: i + 1, g, v, ms: v / tot, _hl: g === "Balanz" }));
    const r = U.row(content, "r2");
    const b1 = U.box(r, "Ranking AUM"); U.table(b1, [{ k: "r", h: "Ranking AUM" }, { k: "g", h: "Gerente", l: 1 }, { k: "v", h: "AUM (Pesos)", f: v => M.money(v) }, { k: "ms", h: "M. Share", f: v => M.pct(v) }], rk, { sort: "r", dir: 1, maxh: 600 });
    const col = U.el("div", "content"); r.appendChild(col);
    const varT = (filt) => {
      const a = M.sumBy(rows.filter(r => r.mi === mi && filt(r)), r => r.c2, r => r.aF), p = M.sumBy(rows.filter(r => r.mi === mi - 1 && filt(r)), r => r.c2, r => r.aF);
      return k => { const x = a.get(k) || 0, y = p.get(k) || 0; return { abs: x - y, pct: M.varPct(x, y) }; };
    };
    const cats2 = [...new Set(rows.filter(r => r.mi === mi).map(r => r.c2))].sort();
    const vb = varT(r => r.t === "Bancarias"), vi = varT(r => r.t === "Independientes"), vt = varT(() => true), vz = varT(r => r.g === "Balanz");
    const fm = v => M.money(v), fp = v => M.pct(v);
    const tr = (f) => { const t = cats2.map(c => f(c)); return { abs: t.reduce((s, x) => s + x.abs, 0) }; };
    const b2 = U.box(col, "Variación de AUM vs mes anterior por Tipo de Gerente");
    const rowsV = cats2.map(c => ({ c, ba: vb(c).abs, bp: vb(c).pct, ia: vi(c).abs, ip: vi(c).pct, ta: vt(c).abs, tp: vt(c).pct }));
    const tt = M.sum(rows.filter(r => r.mi === mi), "aF"), tp = M.sum(rows.filter(r => r.mi === mi - 1), "aF");
    const sb = (t, m) => M.sum(rows.filter(r => r.mi === m && r.t === t), "aF");
    U.table(b2, [{ k: "c", h: "Categoría", l: 1 }, { k: "ba", h: "Bancarias Var. Abs.", f: fm, cls: M.cls }, { k: "bp", h: "Var. %", f: fp, cls: M.cls }, { k: "ia", h: "Independientes Var. Abs.", f: fm, cls: M.cls }, { k: "ip", h: "Var. %", f: fp, cls: M.cls },
      { k: "ta", h: "Total Var. Abs.", f: fm, cls: M.cls }, { k: "tp", h: "Var. %", f: fp, cls: M.cls }], rowsV,
      { total: { ba: sb("Bancarias", mi) - sb("Bancarias", mi - 1), bp: M.varPct(sb("Bancarias", mi), sb("Bancarias", mi - 1)), ia: sb("Independientes", mi) - sb("Independientes", mi - 1), ip: M.varPct(sb("Independientes", mi), sb("Independientes", mi - 1)), ta: tt - tp, tp: M.varPct(tt, tp) } });
    const b3 = U.box(col, "Balanz");
    const zb = M.sum(rows.filter(r => r.mi === mi && r.g === "Balanz"), "aF"), zp = M.sum(rows.filter(r => r.mi === mi - 1 && r.g === "Balanz"), "aF");
    U.table(b3, [{ k: "c", h: "Categoría", l: 1 }, { k: "a", h: "Var. Abs.", f: fm, cls: M.cls }, { k: "p", h: "Var. %", f: fp, cls: M.cls }], cats2.map(c => ({ c, a: vz(c).abs, p: vz(c).pct })), { total: { a: zb - zp, p: M.varPct(zb, zp) } });
  } });

  def({ id: "aum-evolutivo", group: "AUM", name: "Industria FCI - AUM Evolutivo", render(st, side, content, rf) {
    U.monthSlicer(side, st, "meses", rf);
    P.catSlicer(content, st, rf);
    const ctx = P.ctx(st), mis = P.mesesDesde("2025-01", ctx);
    const rows = M.rows(ctx), by = M.sumBy(rows, r => r.mi, r => r.aF), bz = M.sumBy(rows.filter(r => r.g === "Balanz"), r => r.mi, r => r.aF);
    const b1 = U.box(content, "Evolutivo de AUM en Pesos"); U.note(b1, "Industria");
    U.line(b1, P.lbl(mis), [{ name: "Industria", data: mis.map(m => by.get(m) || 0), color: C.banc }], { fmt: v => M.money(v) });
    const b2 = U.box(content, "Evolutivo de AUM en la Industria"); U.note(b2, "Balanz");
    U.line(b2, P.lbl(mis), [{ name: "Balanz", data: mis.map(m => bz.get(m) || 0), color: C.banc }], { fmt: v => M.money(v) });
  } });

  function composicion(st, side, content, rf, balanz) {
    U.listSlicer(side, "Gerente", M.gerentes, st, "ger", rf);
    const ctx = P.ctx(st), mi = M.maxMi(ctx);
    const rows = M.rows(ctx), mis = P.mesesDesde("2026-01");
    const r = U.row(content, "r2");
    const tot = M.sumBy(rows, x => x.mi, x => x.aF), cats = [...new Set(rows.filter(x => x.mi === mi).map(x => x.c2))];
    const byc = M.sumBy(rows, x => x.c2 + "|" + x.mi, x => x.aF);
    const pal = ["#13306a", "#2f80ed", "#3e8bd8", "#1d4fa3", "#7fa9df", "#0b1c45", "#5d7aa7"];
    const b1 = U.box(r, balanz ? "Evolutivo Composición AUM Balanz" : "Evolutivo Composición AUM Industria");
    U.line(b1, P.lbl(mis), cats.sort((a, b) => (byc.get(b + "|" + mi) || 0) - (byc.get(a + "|" + mi) || 0)).map((c, i) => ({ name: c, color: pal[i % pal.length], data: mis.map(m => M.div(byc.get(c + "|" + m) || 0, tot.get(m))) })),
      { fmt: v => M.pct(v), endLabels: true, h: "tall" });
    const b2 = U.box(r, balanz ? "Composición AUM Balanz" : "Composición AUM Industria");
    const now = M.sumBy(rows.filter(x => x.mi === mi), x => x.c2, x => x.aF);
    U.pie(b2, [...now.entries()].sort((a, b) => b[1] - a[1]).map(([n, v]) => ({ name: n, value: v })), { donut: true, fmt: v => M.money(v), h: "tall" });
  }
  def({ id: "aum-comp-ind", group: "AUM", name: "Industria FCI - AUM Composición", render: (st, s, c, rf) => composicion(st, s, c, rf, false) });
  def({ id: "aum-comp-bz", group: "AUM", name: "Balanz - AUM Composición", init: st => { st.ger = new Set(["Balanz"]); }, render: (st, s, c, rf) => composicion(st, s, c, rf, true) });

  def({ id: "elegir-gerente", group: "AUM", name: "Elegir Gerente - AUM MS", init: st => { st.ger = new Set(["Balanz"]); }, render(st, side, content, rf) {
    U.monthSlicer(side, st, "meses", rf);
    U.listSlicer(side, "Gerente", M.gerentes, st, "ger", rf);
    P.catSlicer(content, st, rf);
    const ctx = P.ctx(st), mi = M.maxMi(ctx), sel = st.ger ? [...st.ger] : ["Balanz"];
    const r = U.row(content, "r1");
    const rows = M.rows(P.ctx(st, { ger: new Set(sel) }));
    const a = M.sum(rows.filter(x => x.mi === mi), "aF"), p = M.sum(rows.filter(x => x.mi === mi - 1), "aF");
    const b0 = U.box(r, sel.join(", ")); U.cards(b0, [{ v: M.money(a), l: "AUM promedio mes" }, { v: M.pct(M.varPct(a, p), 2), l: "Variación % (vs ant)", cls: M.cls(M.varPct(a, p)) }]);
    const mis = P.mesesDesde("2025-01", ctx);
    const pal = ["#13306a", "#2f80ed", "#3e8bd8", "#d06666", "#5aa469", "#e0a03a"];
    const b1 = U.box(content, "Evolutivo de Market Share");
    U.line(b1, P.lbl(mis), sel.map((g, i) => ({ name: g, color: pal[i % pal.length], data: M.msDinamico(ctx, g, mis) })), { fmt: v => M.pct(v), endLabels: true, h: "tall" });
  } });

  def({ id: "crecimiento", group: "AUM", name: "Informe de Gestión FCI - Crecimiento", render(st, side, content, rf) {
    P.catSlicer(content, st, rf);
    const ctx = P.ctx(st), base = M.idx("2022-12"), mis = P.mesesDesde("2023-01");
    const rows = M.rows(ctx), by = M.sumBy(rows, r => r.mi, r => r.aF), bz = M.sumBy(rows.filter(r => r.g === "Balanz"), r => r.mi, r => r.aF);
    const b = U.box(content, "Crecimiento de AUMs en Industria y en Balanz");
    U.line(b, P.lbl(mis), [{ name: "Industria", color: C.banc, data: mis.map(m => Math.max(0, M.div(by.get(m), by.get(base)) - 1)) },
      { name: "Balanz", color: C.balanz, data: mis.map(m => M.div(bz.get(m), bz.get(base)) - 1) }], { fmt: v => M.pct(v, 0), endLabels: true, h: "tall", labelEvery: 2 });
    U.note(content, "Variación del AUM final de cada mes contra diciembre de 2022, como la medida del Power BI.");
  } });

  def({ id: "balanz-resumen", group: "AUM", name: "Balanz - AUM Resumen", init: st => { st.ger = new Set(["Balanz"]); }, render(st, side, content, rf) {
    U.monthSlicer(side, st, "meses", rf, { single: true });
    U.listSlicer(side, "Gerente", M.gerentes, st, "ger", rf);
    P.catSlicer(content, st, rf);
    const ctx = P.ctx(st), mi = M.maxMi(ctx);
    const r1 = U.row(content, "r2");
    P.resumenCards(r1, "Balanz en Dólares", ctx, "usd"); P.resumenCards(r1, "Balanz en Pesos", ctx, "ars");
    const r2 = U.row(content, "r2");
    const u = M.rows(ctx, [], "usd").filter(r => r.mi === mi), bc = M.sumBy(u, r => r.c3, r => r.aF);
    const cats = [...bc.entries()].sort((a, b) => b[1] - a[1]);
    const b1 = U.box(r2, "AUM por Categoría de Fondo (USD)");
    U.hbar(b1, cats.map(x => x[0]), [{ name: "AUM", color: C.blue || "#1f6fe0", data: cats.map(x => x[1]) }], { fmt: v => M.money(v, { usd: true, sym: false }) });
    const a = M.rows(ctx).filter(r => r.mi === mi), bm = M.sumBy(a, r => r.mon, r => r.aF), t = M.sum(a, "aF");
    const b2 = U.box(r2, "AUM por Moneda de Suscripción");
    U.hbar(b2, ["ARS", "USD"], [{ name: "%", color: "#1f6fe0", data: ["ARS", "USD"].map(m => (bm.get(m) || 0) / t) }], { fmt: v => M.pct(v) });
  } });

  function msPage(st, side, content, rf, title, extra, card) {
    P.catSlicer(content, st, rf);
    const ctx = P.ctx(st, extra), mis = P.mesesDesde("2020-01");
    if (card) {
      const mi = M.maxMi(ctx), rb = M.rows(P.ctx(st, { ger: new Set(["Balanz"]) }));
      const a = M.sum(rb.filter(x => x.mi === mi), "aF"), p = M.sum(rb.filter(x => x.mi === mi - 1), "aF");
      const b0 = U.box(U.row(content, "r1"), "Balanz"); U.cards(b0, [{ v: M.money(a), l: "AUM promedio mes" }, { v: M.pct(M.varPct(a, p)), l: "Variación % (vs ant)", cls: M.cls(M.varPct(a, p)) }]);
    }
    // MS AUM: AUM final de Balanz / AUM final de todos los gerentes, dentro de las categorias elegidas
    const rows = M.rows(ctx), tot = M.sumBy(rows, r => r.mi, r => r.aF), bz = M.sumBy(rows.filter(r => r.g === "Balanz"), r => r.mi, r => r.aF);
    const b = U.box(content, title);
    U.line(b, P.lbl(mis), [{ name: "Balanz", color: C.banc, data: mis.map(m => M.div(bz.get(m) || 0, tot.get(m))) }], { fmt: v => M.pct(v), h: "tall", labelEvery: 2 });
  }
  def({ id: "ms-balanz", group: "AUM", name: "Balanz MS AUM", render: (st, s, c, rf) => msPage(st, s, c, rf, "MS de Balanz en AUM Promedio mensual", {}, true) });
  def({ id: "ms-exmm", group: "AUM", name: "Balanz MS AUM - Ex Money Market", init: st => { st.cats = new Set(["Destino Esp.", "Renta Fija", "Renta Mixta", "Renta Variable", "T+1"]); },
    render: (st, s, c, rf) => msPage(st, s, c, rf, "MS de Balanz en AUM Promedio mensual - Ex Money Market", {}) });
  def({ id: "ms-rf", group: "AUM", name: "Balanz MS AUM - Renta Fija", init: st => { st.cats = new Set(["Renta Fija"]); }, render(st, side, content, rf) {
    msPage(st, side, content, rf, "MS de Balanz en AUM Promedio mensual - Renta Fija ARS", { c3: new Set(["Renta Fija ARS"]) });
    const ctx = P.ctx(st, { c3: new Set(["Renta Fija USD"]) }), mis = P.mesesDesde("2020-01");
    const rows = M.rows(ctx), tot = M.sumBy(rows, r => r.mi, r => r.aF), bz = M.sumBy(rows.filter(r => r.g === "Balanz"), r => r.mi, r => r.aF);
    const b = U.box(content, "MS de Balanz en AUM Promedio mensual - Renta Fija USD");
    U.line(b, P.lbl(mis), [{ name: "Balanz", color: C.banc, data: mis.map(m => M.div(bz.get(m) || 0, tot.get(m))) }], { fmt: v => M.pct(v), h: "tall", labelEvery: 2 });
  } });
  def({ id: "ms-t1", group: "AUM", name: "Balanz MS AUM - T+1", init: st => { st.cats = new Set(["T+1"]); }, render: (st, s, c, rf) => msPage(st, s, c, rf, "MS de Balanz en AUM Promedio mensual - T+1", {}) });
  def({ id: "aum-backup", group: "AUM", name: "(Backup) Industria FCI - AUM Resumen", render: (st, s, c, rf) => aumResumen(st, s, c, rf, true) });
  def({ id: "barras-ranking", group: "AUM", name: "Gráfico Barras Ranking AUM", init: st => { st.meses = new Set([M.lastMi]); }, render(st, side, content, rf) {
    U.monthSlicer(side, st, "meses", rf, { single: true });
    const ctx = P.ctx(st), mi = M.maxMi(ctx);
    const rows = M.rows(ctx).filter(r => r.mi === mi), by = M.sumBy(rows, r => r.g, r => r.aF), tot = M.sum(rows, "aF");
    const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
    const mp = M.sumBy(rows, r => r.g + "|" + r.t, r => r.aF);
    const cats = top.map(([g, v]) => `${g} (${M.num(v / tot * 100, 1)}%)`);
    const b = U.box(content, "AUM por Gerente"); U.legendTipo(b);
    U.hbar(b, cats, [["Bancarias", C.banc], ["Independientes", C.ind]].map(([t, col]) => ({ name: t, color: col, data: top.map(([g]) => mp.get(g + "|" + t) || 0) })), { fmt: v => M.money(v, { d: 2 }), height: 900 });
  } });
})();
