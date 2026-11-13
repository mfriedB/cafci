/* Paginas de Flujo, Facturacion de la industria, Detalle de fondos y Crecimiento */
(function () {
  const P = window.P, def = p => P.pages.push(p), C = M.COL;
  const tipoSeries = (cats, mp) => [["Bancarias", C.banc], ["Independientes", C.ind]].map(([t, col]) => ({ name: t, color: col, data: cats.map(c => (mp.get(c + "|" + t) || 0)) }));
  const m26 = () => M.mi2026();
  const PAL = ["#13306a", "#2f80ed", "#3e8bd8", "#7fa9df", "#0b1c45", "#5d7aa7", "#9cc6f2", "#d06666", "#5aa469", "#e0a03a"];

  // Suscripciones 2026 dentro de los meses elegidos
  const susc26 = (rows, ctx) => rows.filter(r => r.mi >= m26() && M.inMeses(r, ctx));
  // acumulado desde enero 2026 hasta el mes mi
  const cumHasta = (rows, mi) => { let s = 0; for (const r of rows) if (r.mi >= m26() && r.mi <= mi) s += r.su; return s; };
  // denominador de Ratio_Susc_Ind (Susc. Acumulada Total desde Ene-2026)
  function denTotal(st, mi) {
    let rows;
    if (st.ger) rows = M.ARS.filter(r => st.ger.has(r.g));
    else if (st.cats) rows = M.ARS.filter(r => st.cats.has(r.c));
    else rows = M.ARS;
    return cumHasta(rows, mi);
  }

  def({ id: "flujo-resumen", group: "Flujo", name: "Industria FCI - Flujo Resumen", render(st, side, content, rf) {
    U.monthSlicer(side, st, "meses", rf);
    P.catSlicer(content, st, rf);
    const ctx = P.ctx(st), mi = M.maxMi(ctx), rows = M.rows(ctx);
    const r1 = U.row(content);
    const col1 = U.el("div", "content"), col2 = U.el("div", "content"); r1.append(col1, col2);
    for (const [t, lab] of [[null, "Industria"], ["Bancarias", "Bancarias"], ["Independientes", "Independientes"]]) {
      const rs = rows.filter(r => !t || r.t === t);
      U.cards(U.box(col1, "Flujo Acumulado 2026 " + lab), [{ v: M.money(M.sum(susc26(rs, ctx), "su")), big: true }]);
      U.cards(U.box(col2, "Flujo del Mes " + lab), [{ v: M.money(M.sum(rs.filter(r => r.mi === mi), "su")), big: true }]);
    }
    const den = denTotal(st, mi), by = M.sumBy(rows, r => r.g, () => 0);
    const rk = [...by.keys()].map(g => ({ g, v: cumHasta(rows.filter(r => r.g === g), mi) })).sort((a, b) => b.v - a.v).map((x, i) => ({ r: i + 1, g: x.g, v: x.v, ms: M.div(x.v, den), _hl: x.g === "Balanz" }));
    const b = U.box(r1, "Ranking Gerente Flujo YTD");
    U.table(b, [{ k: "r", h: "Ranking" }, { k: "g", h: "Gerente", l: 1 }, { k: "v", h: "Flujo YTD", f: v => M.money(v), cls: M.cls }, { k: "ms", h: "Market Share en Flujo", f: v => M.pct(v) }], rk, { sort: "r", dir: 1, maxh: 420 });
    P.tresGraficos(content, ctx, mi, "su", { multi: true, catKey: "c3", money: true, t1: "Flujo por Gerente", t2: "Flujo por Categoría", t3: "Flujo por Moneda de Suscripción" });
  } });

  function compFlujo(st, side, content, rf, balanz) {
    U.monthSlicer(side, st, "meses", rf, { desde: m26() });
    U.listSlicer(side, "Gerente", M.gerentes, st, "ger", rf);
    P.catSlicer(content, st, rf);
    const ctx = P.ctx(st), mis = P.mesesDesde("2026-01", ctx), rows = M.rows(ctx);
    const r = U.row(content, "r2");
    const ratio = (filt) => mis.map(mi => M.div(cumHasta(rows.filter(filt), mi), denTotal(st, mi)));
    const c3s = [...new Set(rows.filter(x => x.mi >= m26()).map(x => x.c3))];
    const b1 = U.box(r, balanz ? "Evolutivo Composición de Flujo de Balanz 2026" : "Evolutivo Composición de Flujo de Industria 2026");
    U.line(b1, P.lbl(mis), c3s.map((c, i) => ({ name: c, color: PAL[i % PAL.length], data: ratio(x => x.c3 === c) })), { fmt: v => M.pct(v), endLabels: true, h: "xtall" });
    const col = U.el("div", "content"); r.appendChild(col);
    for (const [c3, t] of [["Renta Fija USD", "Renta Fija USD"], ["Renta Fija ARS", "Renta Fija ARS"]]) {
      const subs = [...new Set(rows.filter(x => x.c3 === c3 && x.mi >= m26()).map(x => x.s))];
      const b = U.box(col, `Evolutivo Composición de Flujo de ${t} 2026`);
      U.line(b, P.lbl(mis), subs.map((s, i) => ({ name: s, color: PAL[i % PAL.length], data: ratio(x => x.c3 === c3 && x.s === s) })), { fmt: v => M.pct(v), endLabels: true, legend: false });
    }
  }
  def({ id: "flujo-comp-ind", group: "Flujo", name: "Industria FCI - Composición Flujo", render: (st, s, c, rf) => compFlujo(st, s, c, rf, false) });
  def({ id: "flujo-comp-bz", group: "Flujo", name: "Balanz - Composición Flujo", init: st => { st.ger = new Set(["Balanz"]); }, render: (st, s, c, rf) => compFlujo(st, s, c, rf, true) });

  def({ id: "flujo-2", group: "Flujo", name: "Industria FCI - Flujo 2", render(st, side, content, rf) {
    U.monthSlicer(side, st, "meses", rf);
    P.catSlicer(content, st, rf);
    const ctx = P.ctx(st), mi = M.maxMi(ctx), rows = M.rows(ctx);
    const r = U.row(content);
    for (const [t, f] of [["Total Industria", () => true], ["Total Bancarias", x => x.t === "Bancarias"], ["Total Independientes", x => x.t === "Independientes"], ["Balanz", x => x.g === "Balanz"]]) {
      const rs = rows.filter(f), a = M.sum(rs.filter(x => x.mi === mi), "su"), p = M.sum(rs.filter(x => x.mi === mi - 1), "su");
      U.cards(U.box(r, t), [{ v: M.money(a), l: "Flujo del mes" }, { v: M.pct(M.varPct(a, p)), l: "% vs mes ant.", cls: M.cls(M.varPct(a, p)) }]);
    }
    const mis = P.mesesDesde("2026-01", ctx), by = M.sumBy(rows, x => x.mi, x => x.su), bz = M.sumBy(rows.filter(x => x.g === "Balanz"), x => x.mi, x => x.su);
    const b = U.box(content, "Flujo Mensual 2026");
    U.line(b, P.lbl(mis), [{ name: "Flujo Mensual Industria", color: C.banc, data: mis.map(m => by.get(m) || 0) }, { name: "Flujo Mensual Balanz", color: C.ind, data: mis.map(m => bz.get(m) || 0) }], { fmt: v => M.money(v), legend: true, h: "tall" });
  } });

  def({ id: "flujo-bz", group: "Flujo", name: "Balanz - Flujo Resumen", render(st, side, content, rf) {
    U.monthSlicer(side, st, "meses", rf);
    P.catSlicer(content, st, rf);
    const ctx = P.ctx(st), mi = M.maxMi(ctx), rows = M.rows(ctx), bz = rows.filter(r => r.g === "Balanz");
    const r1 = U.row(content);
    const col = U.el("div", "content"); r1.appendChild(col);
    U.cards(U.box(col, "Flujo Acumulado 2026 Balanz"), [{ v: M.money(M.sum(susc26(bz, ctx), "su")), big: true }]);
    U.cards(U.box(col, "Flujo del Mes Balanz"), [{ v: M.money(M.sum(bz.filter(r => r.mi === mi), "su")), big: true }]);
    const mis = P.mesesDesde("2026-01", ctx);
    const b = U.box(r1, "Share en Flujo Balanz 2026");
    const st2 = Object.assign({}, st, { ger: null });
    U.line(b, P.lbl(mis), [{ name: "Balanz", color: C.balanz, data: mis.map(m => M.div(cumHasta(bz, m), denTotal(st2, m))) }], { fmt: v => M.pct(v), endLabels: true });
    const r2 = U.row(content, "r2");
    const s = susc26(bz, ctx), bc = M.sumBy(s, x => x.c3, x => x.su), cats = [...bc.entries()].sort((a, b) => b[1] - a[1]);
    U.hbar(U.box(r2, "Flujo por Categoría"), cats.map(x => x[0]), [{ name: "Flujo", color: "#1f6fe0", data: cats.map(x => x[1]) }], { fmt: v => M.money(v) });
    const bm = M.sumBy(s, x => x.mon, x => x.su), t = M.sum(s, "su");
    U.hbar(U.box(r2, "Flujo por Moneda de Suscripción"), ["ARS", "USD"], [{ name: "%", color: "#1f6fe0", data: ["ARS", "USD"].map(m => M.div(bm.get(m) || 0, t)) }], { fmt: v => M.pct(v) });
  } });

  def({ id: "flujo-fondo", group: "Flujo", name: "Industria FCI - Flujo x Fondo",
    init: st => { st.ger = new Set(["Balanz"]); st.cats = new Set(["Destino Esp.", "Renta Fija", "Renta Mixta", "Renta Variable", "T+1"]); },
    render(st, side, content, rf) {
      U.monthSlicer(side, st, "meses", rf);
      U.listSlicer(side, "Gerente", M.gerentes, st, "ger", rf);
      const fondos = [...new Set(M.ARS.filter(r => r.mi === M.lastMi && (!st.ger || st.ger.has(r.g))).map(r => r.n))].sort();
      U.listSlicer(side, "Fondo", fondos, st, "fondo", rf);
      P.catSlicer(content, st, rf);
      const ctx = P.ctx(st), mi = M.maxMi(ctx), rows = M.rows(ctx);
      const sumMi = k => M.sum(rows.filter(r => r.mi === mi), k);
      U.cards(U.box(content, null), [{ v: M.money(sumMi("aF")), l: "AUM promedio" }, { v: M.money(cumHasta(rows, mi)), l: "Flujo 2026" }, { v: M.money(sumMi("su")), l: "Flujo mes actual" },
        { v: M.money(rows.filter(r => r.mi >= m26() && r.mi <= mi).reduce((s, r) => s + r.re, 0)), l: "Rendimiento 2026" }, { v: M.money(sumMi("aF") - sumMi("aI") - sumMi("su")), l: "Rendimiento mes actual" }]);
      const r = U.row(content, "r2");
      const mes = M.sumBy(rows.filter(x => x.mi === mi), x => x.n, x => x.su);
      const acum = new Map(); for (const x of rows) if (x.mi >= m26() && x.mi <= mi) acum.set(x.n, (acum.get(x.n) || 0) + x.su);
      const top = (m, desc) => [...m.entries()].sort((a, b) => desc ? b[1] - a[1] : a[1] - b[1]).slice(0, 5);
      for (const [t, m, d] of [["Top 5 Fondos con mayor Flujo del mes", mes, 1], ["Top 5 Fondos con mayor Flujo 2026", acum, 1], ["Top 5 Fondos con menor Flujo del mes", mes, 0], ["Top 5 Fondos con menor Flujo 2026", acum, 0]]) {
        const x = top(m, d); U.vbar(U.box(r, t), x.map(y => y[0]), x.map(y => y[1]), { fmt: v => M.money(v), h: "short" });
      }
    } });

  def({ id: "facturacion", group: "Facturación industria", name: "Industria FCI - Facturación", render(st, side, content, rf) {
    U.monthSlicer(side, st, "meses", rf);
    U.listSlicer(side, "Gerente", M.gerentes, st, "ger", rf);
    P.catSlicer(content, st, rf);
    const ctx = P.ctx(st), mi = M.maxMi(ctx), rows = M.rows(ctx), sel = rows.filter(r => M.inMeses(r, ctx));
    const fact = r => r.fg + r.fd;
    const r1 = U.row(content);
    const mp = M.sumBy(sel, r => r.c + "|" + r.t, fact), cats = [...M.sumBy(sel, r => r.c, fact).entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
    const b1 = U.box(r1, "Facturación en los meses seleccionados por Categoría"); U.legendTipo(b1); U.hbar(b1, cats, tipoSeries(cats, mp), { fmt: v => M.money(v, { d: 2 }) });
    const bt = M.sumBy(sel, r => r.t, fact);
    const b2 = U.box(r1, "Facturación en los meses seleccionados por Tipo Gerente");
    U.hbar(b2, ["Bancarias", "Independientes"], [{ name: "Facturación", color: C.banc, data: [bt.get("Bancarias") || 0, bt.get("Independientes") || 0] }], { fmt: v => M.money(v, { d: 2 }), h: "short", catColors: [C.banc, C.ind] });
    const all = M.rows(P.ctx(st, { ger: null })), allSel = all.filter(r => M.inMeses(r, ctx));
    const fa = (rs, m) => M.sum(rs.filter(r => r.mi === m), "fg") + M.sum(rs.filter(r => r.mi === m), "fd");
    const cc = U.el("div", "content"); r1.appendChild(cc);
    for (const [t, rs] of [["Total Industria", all], ["Balanz", all.filter(r => r.g === "Balanz")]]) {
      const a = fa(rs, mi), p = fa(rs, mi - 1);
      U.cards(U.box(cc, t), [{ v: M.money(a, { d: 2 }), l: "Facturación del mes" }, { v: M.pct(M.varPct(a, p), 2), l: "% vs mes ant.", cls: M.cls(M.varPct(a, p)) }]);
    }
    const r2 = U.row(content, "r2");
    const bg = M.sumBy(sel, r => r.g, fact), topG = [...bg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(x => x[0]);
    const mg = M.sumBy(sel, r => r.g + "|" + r.t, fact);
    const b3 = U.box(r2, "Facturación en los meses seleccionados por Gerente"); U.legendTipo(b3); U.hbar(b3, topG, tipoSeries(topG, mg), { fmt: v => M.money(v, { d: 2 }), height: 420 });
    const fTot = M.sum(allSel, "fg") + M.sum(allSel, "fd"), aTot = M.sum(allSel, "aF");
    const bfa = M.sumBy(allSel, r => r.g, fact), baF = M.sumBy(allSel, r => r.g, r => r.aF), bMes = M.sumBy(all.filter(r => r.mi === mi), r => r.g, r => r.aF);
    const tMes = [...bMes.values()].reduce((a, b) => a + b, 0);
    const rk = [...bfa.entries()].sort((a, b) => b[1] - a[1]).map(([g, v], i) => ({ r: i + 1, g, aum: M.div(bMes.get(g) || 0, tMes), pf: v / fTot, fm: (v / fTot) / ((baF.get(g) || 0) / aTot), _hl: g === "Balanz" }));
    U.table(U.box(r2, "Ranking de Facturación"), [{ k: "r", h: "Ranking" }, { k: "g", h: "Gerente", l: 1 }, { k: "aum", h: "M. Share", f: v => M.pct(v, 2) }, { k: "pf", h: "% de Facturación", f: v => M.pct(v) }, { k: "fm", h: "Facturación/M.Share", f: v => M.num(v, 2) }], rk, { sort: "r", dir: 1, maxh: 420 });
  } });

  def({ id: "facturacion-2", group: "Facturación industria", name: "Industria FCI - Facturación 2",
    init: st => { st.tipo = new Set(["Independientes"]); st.meses = new Set([M.lastMi]); st.exGer = new Set(["Mercado Pago"]); },
    render(st, side, content, rf) {
      U.monthSlicer(side, st, "meses", rf);
      U.buttons(content, ["Bancarias", "Independientes"], st, "tipo", rf);
      P.catSlicer(content, st, rf);
      const ctx = P.ctx(st, { exGer: st.exGer }), rows = M.rows(ctx), sel = rows.filter(r => M.inMeses(r, ctx)), mi = M.maxMi(ctx);
      const mis = ctx.meses ? [...ctx.meses] : [mi];
      const fT = M.sum(sel, "fg") + M.sum(sel, "fd"), bf = M.sumBy(sel, r => r.g, r => r.fg + r.fd), am = M.sumBy(rows.filter(r => r.mi === mi), r => r.g, r => r.aF);
      const pts = [...bf.keys()].map(g => ({ name: g, x: M.msDinamico(ctx, g, mis).reduce((a, b) => a + (b || 0), 0), y: bf.get(g) / fT, size: am.get(g) || 0, color: g === "Balanz" ? "#2f80ed" : "#13306a" }));
      const b = U.box(content, "Market Share por AUM, Share de Facturación por Gerente");
      U.scatter(b, pts, { xname: "Market Share por AUM", yname: "% de Facturación", fx: v => M.pct(v, 0), fy: v => M.pct(v, 0), sname: "AUM", fs: v => M.money(v), h: "xtall" });
      U.note(content, "Mercado Pago excluido, como en el segmentador del Power BI.");
    } });

  def({ id: "detalle-fondos", group: "Detalle fondos", name: "Detalle Fondos", init: st => { st.meses = new Set([M.lastMi]); }, render(st, side, content, rf) {
    U.monthSlicer(side, st, "meses", rf, { single: true });
    const ctx = P.ctx(st, { ger: new Set(["Balanz"]) }), mi = M.maxMi(ctx), rows = M.rows(ctx).filter(r => r.mi === mi);
    const g = new Map(); for (const r of rows) { const x = g.get(r.com) || { k: r.com, aF: 0, aI: 0, su: 0 }; x.aF += r.aF; x.aI += r.aI; x.su += r.su; g.set(r.com, x); }
    const data = [...g.values()].map(x => ({ k: x.k, aum: x.aF, vt: M.div(x.aF, x.aI) - 1, vs: M.div(x.su, x.aI), vr: M.div(x.aF - x.aI - x.su, x.aI) }));
    const T = { aF: M.sum(rows, "aF"), aI: M.sum(rows, "aI"), su: M.sum(rows, "su") };
    U.table(U.box(content, "Fondos Balanz"), [{ k: "k", h: "Fondo Comercial", l: 1 }, { k: "aum", h: "AUM Final Mes", f: v => M.money(v) }, { k: "vt", h: "Variación AUM Total (%)", f: v => M.pct(v, 2), cls: M.cls },
      { k: "vs", h: "Variación x Flujo (%)", f: v => M.pct(v), cls: M.cls }, { k: "vr", h: "Variación x Rendimiento (%)", f: v => M.pct(v, 2), cls: M.cls }], data,
    { sort: "aum", total: { aum: T.aF, vt: T.aF / T.aI - 1, vs: T.su / T.aI, vr: (T.aF - T.aI - T.su) / T.aI }, maxh: 700 });
  } });

  def({ id: "detalle-grafico", group: "Detalle fondos", name: "Detalle Fondos - Gráfico", init: st => { st.ger = new Set(["Balanz"]); }, render(st, side, content, rf) {
    U.monthSlicer(side, st, "meses", rf);
    U.listSlicer(side, "Gerente", M.gerentes, st, "ger", rf);
    const ctx = P.ctx(st), mi = M.maxMi(ctx), rows = M.rows(ctx).filter(r => r.mi === mi);
    const g = new Map(); for (const r of rows) { const x = g.get(r.n) || { n: r.n, c: r.c, aF: 0, aI: 0, su: 0 }; x.aF += r.aF; x.aI += r.aI; x.su += r.su; g.set(r.n, x); }
    const pts = [...g.values()].map(x => ({ name: x.n, group: x.c, x: M.div(x.su, x.aI), y: M.div(x.aF - x.aI - x.su, x.aI), size: x.aF })).filter(p => p.x != null && p.x > -0.99 && p.x < 50);
    U.scatter(U.box(content, "Gráfico de Dispersión de Fondos por Flujo, Rendimiento y AUM"), pts, { groupBy: true, xname: "% Suscripciones", yname: "% Rendimiento", fx: v => M.pct(v, 0), fy: v => M.pct(v, 0), sname: "AUM", fs: v => M.money(v), h: "xtall" });
  } });

  function crecimientoSM(st, content, key, values, title) {
    const base = M.idx("2025-12"), mis = P.mesesDesde("2025-12");
    const b = U.box(content, title); const grid = U.el("div", "sm"); b.appendChild(grid);
    for (const v of values) {
      const rows = M.ARS.filter(r => r[key] === v), by = M.sumBy(rows, r => r.mi, r => r.aF), bz = M.sumBy(rows.filter(r => r.g === "Balanz"), r => r.mi, r => r.aF);
      const cell = U.el("div", "cell"); cell.appendChild(U.el("h5", null, v)); grid.appendChild(cell);
      U.line(cell, P.lbl(mis), [{ name: "Industria", color: C.banc, data: mis.map(m => Math.max(0, M.div(by.get(m), by.get(base)) - 1)) },
        { name: "Balanz", color: C.balanz, data: bz.get(base) ? mis.map(m => M.div(bz.get(m), bz.get(base)) - 1) : mis.map(() => null) }], { fmt: v => M.pct(v), endLabels: true, h: "short" });
    }
  }
  def({ id: "crec-cat", group: "Crecimiento", name: "Crecimiento por Categoría", init: st => { st.cats = new Set(["Money Market", "Renta Fija", "Renta Variable", "T+1"]); }, render(st, side, content, rf) {
    P.catSlicer(content, st, rf);
    crecimientoSM(st, content, "c", st.cats ? [...st.cats] : M.CATS, "Crecimiento de AUMs en Categorías de FCI");
  } });
  def({ id: "crec-sub", group: "Crecimiento", name: "Crecimiento por Subcategoría", init: st => { st.s2 = new Set(["MM ARS", "MM USD", "RF ARS Lecap", "RF MULT", "RF USD", "RF USD Linked"]); }, render(st, side, content, rf) {
    const vals = ["Destino Esp.", "MM ARS", "MM USD", "RF ARS", "RF ARS Lecap", "RF MULT", "RF USD", "RF USD Linked", "RM y Otros", "RV", "T+1"];
    U.buttons(content, vals, st, "s2", rf);
    crecimientoSM(st, content, "s2", st.s2 ? [...st.s2] : vals, "Crecimiento de AUMs en Categorías de FCI");
  } });
})();
