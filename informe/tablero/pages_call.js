/* Paginas "Call de Fondos" del Power BI */
(function () {
  const P = window.P, def = p => P.pages.push(p), C = M.COL;
  const m26 = () => M.mi2026();
  const tipoSeries = (cats, mp) => [["Bancarias", C.banc], ["Independientes", C.ind]].map(([t, col]) => ({ name: t, color: col, data: cats.map(c => (mp.get(c + "|" + t) || 0)) }));
  const cumHasta = (rows, mi) => { let s = 0; for (const r of rows) if (r.mi >= m26() && r.mi <= mi) s += r.su; return s; };
  const RFUSD = ["RF USD corp loc", "RF USD CP", "RF USD GL Ex ARG", "RF USD GL Inc ARG", "RF USD Disc"];

  def({ id: "call-1", group: "Call de Fondos", name: "Call de Fondos 1", render(st, side, content, rf) {
    U.monthSlicer(side, st, "meses", rf, { single: true });
    const ctx = P.ctx(st), mi = M.maxMi(ctx), rows = M.rows(ctx).filter(r => r.mi === mi);
    const r = U.row(content, "r2");
    const bg = M.sumBy(rows, x => x.g, x => x.aP), top = [...bg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(x => x[0]);
    const mg = M.sumBy(rows, x => x.g + "|" + x.t, x => x.aP);
    const b1 = U.box(r, "AUM por Gerente"); U.legendTipo(b1); U.hbar(b1, top, tipoSeries(top, mg), { fmt: v => M.money(v, { d: 2, sym: false }), height: 760 });
    const col = U.el("div", "content"); r.appendChild(col);
    U.cards(U.box(col, "Activos Bajo Administración:"), [{ v: M.money(M.sum(rows, "aP"), { d: 2, sym: false }), big: true }]);
    const bt = M.sumBy(rows, x => x.t, x => x.aP);
    U.hbar(U.box(col, "AUM por Tipo de Gerente"), ["Bancarias", "Independientes"], [{ name: "AUM", color: C.banc, data: [bt.get("Bancarias") || 0, bt.get("Independientes") || 0] }], { fmt: v => M.money(v, { sym: false }), h: "short", catColors: [C.banc, C.ind] });
    const cats = [...M.sumBy(rows, x => x.c, x => x.aP).entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
    const b3 = U.box(col, "AUM por Categoría de Fondo"); U.legendTipo(b3); U.hbar(b3, cats, tipoSeries(cats, M.sumBy(rows, x => x.c + "|" + x.t, x => x.aP)), { fmt: v => M.money(v, { sym: false }) });
  } });

  // crecimiento Industria vs Balanz desde dic-2025 (industria con piso 0 como la medida del Power BI)
  function crec(parent, title, filt) {
    const base = M.idx("2025-12"), mis = P.mesesDesde("2025-12");
    const rows = M.ARS.filter(filt), by = M.sumBy(rows, r => r.mi, r => r.aF), bz = M.sumBy(rows.filter(r => r.g === "Balanz"), r => r.mi, r => r.aF);
    U.line(U.box(parent, title), mis.map(mi => M.fechas[mi].split("-").reverse().join("/")), [{ name: "Industria", color: C.banc, data: mis.map(m => Math.max(0, M.div(by.get(m), by.get(base)) - 1)) },
      { name: "Balanz", color: C.balanz, data: mis.map(m => M.div(bz.get(m), bz.get(base)) - 1) }], { fmt: v => M.pct(v), endLabels: true, h: "tall" });
  }
  def({ id: "call-2", group: "Call de Fondos", name: "Call de Fondos 2", render(st, side, content, rf) {
    P.catSlicer(content, st, rf);
    const r = U.row(content, "r2");
    crec(r, "Crecimiento de AUMs en Industria y en Balanz", x => !st.cats || st.cats.has(x.c));
    crec(r, "Crecimiento de AUMs en T+1 y en Balanz", x => x.c === "T+1");
  } });
  def({ id: "call-11", group: "Call de Fondos", name: "Call de Fondos 11", render(st, side, content, rf) {
    P.catSlicer(content, st, rf);
    const r = U.row(content, "r2");
    crec(r, "Crecimiento de AUMs en Industria y en Balanz", x => !st.cats || st.cats.has(x.c));
    crec(r, "Crecimiento de AUMs Renta Fija USD en Industria y en Balanz", x => RFUSD.includes(x.s));
  } });

  function scatterGer(content, st, title, subs, yfn, yname, fy) {
    const ctx = P.ctx(st, { subs: st.subs || new Set(subs) }), mi = M.maxMi(ctx), rows = M.rows(ctx, ["ger"]);
    const g = new Map();
    for (const r of rows) { const x = g.get(r.g) || { su: 0, re: 0, aF: 0 }; if (r.mi >= m26() && M.inMeses(r, ctx)) { x.su += r.su; x.re += r.re; } if (r.mi === mi) x.aF += r.aF; g.set(r.g, x); }
    const pts = [...g.entries()].filter(([n]) => !st.ger || st.ger.has(n)).filter(([, x]) => x.aF > 0).map(([n, x]) => ({ name: n, x: x.su, y: yfn(x, n), size: x.aF, color: n === "Balanz" ? "#2f80ed" : undefined }));
    U.scatter(U.box(content, title), pts, { xname: "Suscripciones 2026", yname, fx: v => M.money(v), fy, sname: "AUM", fs: v => M.money(v), h: "xtall", colors: ["#13306a"] });
  }
  def({ id: "call-12", group: "Call de Fondos", name: "Call de Fondos 12", init: st => { st.subs = new Set(RFUSD); }, render(st, side, content, rf) {
    U.listSlicer(side, "Gerente", M.gerentes, st, "ger", rf);
    U.buttons(content, M.subcats, st, "subs", rf);
    scatterGer(content, st, "Ganancia de Capital, Suscripciones y AUM en Renta Fija USD", RFUSD, x => x.re, "Ganancia de Capital 2026", v => M.money(v));
  } });

  def({ id: "call-3", group: "Call de Fondos", name: "Call de Fondos 3", init: st => { st.meses = new Set([M.lastMi]); }, render(st, side, content, rf) {
    U.monthSlicer(side, st, "meses", rf, { single: true });
    P.catSlicer(content, st, rf);
    const ctx = P.ctx(st), mi = M.maxMi(ctx), base = M.idx("2025-12"), rows = M.rows(ctx);
    const g = new Map();
    for (const r of rows) { const x = g.get(r.g) || { su: 0, aP: 0, b: 0 }; if (r.mi >= m26() && r.mi <= mi) x.su += r.su; if (r.mi === mi) x.aP += r.aP; if (r.mi === base) x.b += r.aF; g.set(r.g, x); }
    const pts = [...g.entries()].filter(([n, x]) => x.aP >= 2.3e6 && n !== "Investis").map(([n, x]) => ({ name: n, x: x.su, y: Math.max(0, M.div(x.aP, x.b) - 1), size: x.aP, color: n === "Balanz" ? "#2f80ed" : undefined }));
    U.scatter(U.box(content, "Crecimiento, Suscripciones y AUM por Gerente"), pts, { xname: "Suscripciones 2026", yname: "Crecimiento 2026", fx: v => M.money(v), fy: v => M.pct(v, 0), sname: "AUM promedio", fs: v => M.money(v), h: "xtall", colors: ["#13306a"] });
    U.note(content, "Gerentes con AUM promedio del mes de 2,3 bill. o más, sin Investis (filtros del visual del Power BI).");
  } });

  def({ id: "call-4", group: "Call de Fondos", name: "Call de Fondos 4", render(st, side, content, rf) {
    const ctx = P.ctx(st), mis = P.mesesDesde("2026-01"), rows = M.rows(ctx);
    const r = U.row(content, "r2");
    const ap = M.sumBy(rows, x => x.mi, x => x.aP);
    U.combo(U.box(r, "AUMs en Industria y Market Share de Balanz"), P.lbl(mis), { name: "AUM Promedio Mes", data: mis.map(m => ap.get(m) || 0) },
      { name: "Market Share de Balanz", data: M.msDinamico(ctx, "Balanz", mis) }, { fbar: v => M.money(v, { d: 0, sym: false }), fline: v => M.pct(v), h: "tall" });
    const tot = mis.map(m => cumHasta(M.ARS, m)), bz = mis.map(m => cumHasta(M.ARS.filter(x => x.g === "Balanz"), m));
    U.combo(U.box(r, "Flujo en Industria y % de Balanz"), P.lbl(mis), { name: "Flujo Total Industria 2026", data: tot },
      { name: "% de Flujo de Balanz sobre Industria", data: bz.map((b, i) => M.div(b, tot[i])) }, { fbar: v => M.money(v, { sym: false }), fline: v => M.pct(v), h: "tall" });
  } });

  function compOtros(parent, title, rowsNum, rowsDen, key, val, cum) {
    const mis = P.mesesDesde("2026-01"), cats = ["Money Market", "Renta Fija", "T+1", "Otros"], pal = ["#13306a", "#2f80ed", "#7fa9df", "#3e8bd8"];
    const series = cats.map((c, i) => ({ name: c, color: pal[i], data: mis.map(m => cum ? M.div(cumHasta(rowsNum.filter(x => x.co === c), m), cumHasta(rowsDen, m))
      : M.div(M.sum(rowsNum.filter(x => x.co === c && x.mi === m), val), M.sum(rowsDen.filter(x => x.mi === m), val))) }));
    U.line(U.box(parent, title), P.lbl(mis), series, { fmt: v => M.pct(v), endLabels: true, h: "tall" });
  }
  def({ id: "call-5", group: "Call de Fondos", name: "Call de Fondos 5", init: st => { st.ger = new Set(["Balanz"]); }, render(st, side, content, rf) {
    U.listSlicer(side, "Gerente", M.gerentes, st, "ger", rf);
    const r = U.row(content, "r2"), g = M.ARS.filter(x => !st.ger || st.ger.has(x.g));
    compOtros(r, "Evolutivo Composición de Flujo de Industria 2026", M.ARS, M.ARS, "co", "su", true);
    compOtros(r, "Evolutivo Composición de Flujo 2026 de " + (st.ger ? [...st.ger].join(", ") : "Industria"), g, g, "co", "su", true);
  } });
  def({ id: "call-6", group: "Call de Fondos", name: "Call de Fondos 6", init: st => { st.ger = new Set(["Balanz"]); }, render(st, side, content, rf) {
    U.listSlicer(side, "Gerente", M.gerentes, st, "ger", rf);
    const r = U.row(content, "r2"), g = M.ARS.filter(x => !st.ger || st.ger.has(x.g));
    compOtros(r, "Evolutivo Composición AUM Industria", M.ARS, M.ARS, "co", "aF", false);
    compOtros(r, "Evolutivo Composición AUM " + (st.ger ? [...st.ger].join(", ") : "Industria"), g, g, "co", "aF", false);
  } });

  def({ id: "call-7", group: "Call de Fondos", name: "Call de Fondos 7", init: st => { st.cats = new Set(["Destino Esp.", "Renta Mixta", "Renta Variable", "T+1", "Renta Fija"]); }, render(st, side, content, rf) {
    P.catSlicer(content, st, rf);
    const rows = M.rows(P.ctx(st)), acum = new Map();
    for (const x of rows) if (x.mi >= m26()) acum.set(x.n, (acum.get(x.n) || 0) + x.su);
    const top = [...acum.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    U.vbar(U.box(content, "Top Fondos Ex-MM en Flujo 2026 (en pesos)"), top.map(x => x[0]), top.map(x => x[1]), { fmt: v => M.money(v) });
  } });

  def({ id: "call-8", group: "Call de Fondos", name: "Call de Fondos 8", render(st, side, content, rf) {
    const mi = M.lastMi, rows = M.ARS;
    const subs = [...new Set(rows.filter(r => r.g === "Balanz" && r.mi >= m26()).map(r => r.s))];
    const data = [];
    for (const s of subs) {
      const rs = rows.filter(r => r.s === s && r.mi >= m26());
      const byG = M.sumBy(rs, r => r.g, r => r.su), ranking = [...byG.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      const bzS = byG.get("Balanz") || 0; if (bzS < 0) continue;
      const tot = [...byG.values()].reduce((a, b) => a + b, 0);
      data.push({ s, r: ranking.findIndex(x => x[0] === "Balanz") + 1, aum: M.sum(rows.filter(r => r.s === s && r.mi === mi && r.g === "Balanz"), "aF"), su: bzS, sh: M.div(bzS, tot),
        n: new Set(rows.filter(r => r.s === s).map(r => r.g)).size, lider: ranking[0][0] });
    }
    const bg = v => (v <= 3 ? "#3fd15f" : v <= 10 ? "#e8e04a" : "#f04a3a");
    U.table(U.box(content, "Balanz por Subcategoría"), [{ k: "s", h: "Categoría", l: 1 }, { k: "r", h: "Ranking", bg }, { k: "aum", h: "AUM (Pesos)", f: v => M.money(v, { d: 0 }) }, { k: "su", h: "Flujo (Pesos)", f: v => M.money(v, { d: 0 }) },
      { k: "sh", h: "Share Flujo", f: v => M.pct(v, 2) }, { k: "n", h: "Cant. Gerentes" }, { k: "lider", h: "Líder", l: 1 }], data, { sort: "su" });
    U.note(content, "Subcategorías con flujo 2026 de Balanz mayor o igual a cero. Ranking y líder por suscripciones 2026.");
  } });

  function scatterFondos(content, st, title, cur, subs, maxPct, excl) {
    const src = cur === "usd" ? M.USD : M.ARS, mi = M.lastMi, ene = M.mi2026();
    const g = new Map();
    for (const r of src) {
      if (!subs.has(r.s) || (st.ger && !st.ger.has(r.g)) || (st.fondo && !st.fondo.has(r.n)) || (excl && excl.includes(r.n))) continue;
      const x = g.get(r.n) || { g: r.g, su: 0, re: 0, ini: 0, aF: 0 };
      if (r.mi >= ene) { x.su += r.su; x.re += r.re; } if (r.mi === ene) x.ini += r.aI; if (r.mi === mi) x.aF += r.aF; g.set(r.n, x);
    }
    const usd = cur === "usd";
    const pts = [...g.entries()].filter(([, x]) => x.aF > 0).map(([n, x]) => ({ name: n, group: x.g, x: x.su, y: M.div(x.re, x.ini), size: x.aF })).filter(p => p.y != null && p.y < maxPct);
    U.scatter(U.box(content, title), pts, { xname: usd ? "Suscripciones U$S 2026" : "Suscripciones 2026", yname: usd ? "% Rendimiento U$S 2026" : "% Rendimiento 2026",
      fx: v => M.money(v, { usd, sym: !usd }), fy: v => M.pct(v, 0), sname: "AUM", fs: v => M.money(v, { usd }), h: "xtall" });
  }
  def({ id: "call-9", group: "Call de Fondos", name: "Call de Fondos 9", init: st => { st.subs = new Set(["RF USD corp loc", "RF USD CP"]); }, render(st, side, content, rf) {
    U.listSlicer(side, "Gerente", M.gerentes, st, "ger", rf);
    U.buttons(content, M.subcats, st, "subs", rf);
    scatterFondos(content, st, "Fondos Renta Fija USD Corporativa Local", "usd", st.subs || new Set(M.subcats), 12);
  } });
  def({ id: "call-10", group: "Call de Fondos", name: "Call de Fondos 10", init: st => { st.subs = new Set(["T+1"]); }, render(st, side, content, rf) {
    U.listSlicer(side, "Gerente", M.gerentes, st, "ger", rf);
    U.buttons(content, M.subcats, st, "subs", rf);
    scatterFondos(content, st, "Fondos T+1 Pesos", "ars", st.subs || new Set(M.subcats), 1, ["Quiron Savings"]);
  } });
})();
