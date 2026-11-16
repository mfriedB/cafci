/* Call de Fondos: slides 3 a 10 de la presentación, con el mismo diseño (lienzo 16:9 de 1280 x 720 px),
   para armar cada slide con un screenshot del tablero. Datos: base CAFCI/CNV (montos en millones de $). */
(function () {
  const P = window.P, def = p => P.pages.push(p);
  const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const MESL = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const NAVY = "#293486", IND = "#6B7FD7", LINEA = "#5B5BF0", TXT = "#0B1F5C", GRIS = "#6B6F7B";
  const F = '"Inter", "Open Sans", Arial, sans-serif', FB = '"Barlow", "Open Sans", Arial, sans-serif';
  const nf = d => new Intl.NumberFormat("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const bill = (v, d = 2) => nf(d).format(v / 1e6) + " bill.";                 // v en millones
  const milM = v => "$ " + nf(0).format(v / 1e3) + " mil M";
  const pct = (v, d = 1) => (v == null || !isFinite(v) ? "" : nf(d).format(v * 100) + " %");
  const m26 = () => M.mi2026(), base = () => M.idx((M.meses[m26()].slice(0, 4) - 1) + "-12");
  const fecha = mi => { const [y, m, d] = M.fechas[mi].split("-"); return { y: +y, m: +m - 1, d: +d, txt: `${d}/${m}/${y}` }; };
  const alDia = mi => { const f = fecha(mi); return `al ${f.d} de ${MESL[f.m]} de ${f.y}`; };
  const mesesAnio = () => { const out = []; for (let mi = m26(); mi <= M.lastMi; mi++) out.push(mi); return out; };
  const lblMes = mi => { const f = fecha(mi); return MES[f.m] + " " + f.y; };
  const RFUSD = ["RF USD corp loc", "RF USD CP", "RF USD GL Ex ARG", "RF USD GL Inc ARG", "RF USD Disc"];

  function slide(content, titulo, nota, extra) {
    const w = U.el("div", "cs-wrap"), s = U.el("div", "cs-slide");
    if (extra && extra.pill) s.appendChild(U.el("div", "cs-pill", extra.pill));
    const t = U.el("div", "cs-title" + (extra && extra.pill ? " con-pill" : "")); t.innerHTML = titulo; s.appendChild(t);
    const b = U.el("div", "cs-body"); s.appendChild(b);
    if (nota) s.appendChild(U.el("div", "cs-nota", nota));
    s.appendChild(U.el("div", "cs-logo", "BALANZ"));
    w.appendChild(s); content.appendChild(w); return b;
  }
  function caja(parent, titulo, css) {
    const c = U.el("div", "cs-box"); if (css) Object.assign(c.style, css);
    c.appendChild(U.el("div", "cs-band", titulo)); const b = U.el("div", "cs-boxbody"); c.appendChild(b); parent.appendChild(c); return b;
  }
  function chart(parent, h, opt) { const d = U.el("div", "cs-chart"); d.style.height = h + "px"; parent.appendChild(d); opt.textStyle = { fontFamily: FB, color: TXT }; return U.chart(d, opt); }
  const ley = items => { const l = U.el("div", "cs-ley"); l.innerHTML = items.map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join(""); return l; };

  /* ---------- Slide 3: En números ---------- */
  def({ id: "call-s3", group: "Call de Fondos", name: "Slide 3 · En números", render(st, side, content) {
    const mi = M.lastMi, rows = M.ARS.filter(r => r.mi === mi), bz = rows.filter(r => r.g === "Balanz");
    const aum = M.sum(bz, "aF");
    const ind = M.sumBy(rows.filter(r => r.t === "Independientes" && r.c !== "Money Market"), r => r.g, r => r.aF);
    const rank = [...ind.entries()].sort((a, b) => b[1] - a[1]).findIndex(x => x[0] === "Balanz") + 1;
    const nF = new Set(bz.filter(r => r.aF > 0).map(r => r.n)).size;
    const dic = M.sum(M.ARS.filter(r => r.mi === base() && r.g === "Balanz"), "aF");
    const b = slide(content, "Balanz Asset Management", "(*) Datos " + fecha(mi).txt.replace(/^/, "al ") + ". Fuente: CAFCI / CNV.", { pill: "En números" });
    const g = U.el("div", "cs-nums");
    const items = [
      ["+ARS " + nf(1).format(Math.floor(aum / 1e5) / 10), "Billones de activos bajo administración"],
      ["TOP " + rank, "Administradora independiente ex Money Market"],
      ["11 Managers", "Portfolio managers con foco exclusivo en fund management"],
      ["+" + Math.floor(nF / 5) * 5 + " Fondos", "Para satisfacer las necesidades de los inversores"],
      ["+15 Años", "De trayectoria en administrando FCI"],
      ["+" + nf(0).format((aum / dic - 1) * 100) + "%", "Crecimiento de AUM en " + fecha(mi).y]];
    for (const [v, t] of items) { const c = U.el("div", "cs-num"); c.append(U.el("div", "cs-numv", v), U.el("div", "cs-numt", t)); g.appendChild(c); }
    b.appendChild(g);
    U.note(content, "“11 Managers” y “+15 Años” son textos fijos; el resto se calcula con la base CAFCI/CNV.");
  } });

  /* ---------- Slide 4: Snapshot de la industria ---------- */
  def({ id: "call-s4", group: "Call de Fondos", name: "Slide 4 · Snapshot", render(st, side, content) {
    const mi = M.lastMi, rows = M.ARS.filter(r => r.mi === mi);
    const b = slide(content, "Snapshot de la Industria de FCI", `AUM Promedio del mes ${alDia(mi)} en pesos. Fuente: CAFCI / CNV.`);
    b.classList.add("cs-snap");
    const tipo = new Map(rows.map(r => [r.g, r.t]));
    const top = [...M.sumBy(rows, r => r.g, r => r.aP).entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
    const pos = top.findIndex(x => x[0] === "Balanz");
    const izq = U.el("div", "cs-col"); b.appendChild(izq);
    const c1 = chart(izq, 610, {
      grid: { left: 92, right: 70, top: 4, bottom: 4 },
      xAxis: { type: "value", show: false }, yAxis: { type: "category", inverse: true, data: top.map(x => x[0]), axisTick: { show: false }, axisLine: { show: false },
        axisLabel: { fontWeight: 700, fontSize: 11, color: "#111" } },
      series: [{ type: "bar", barWidth: "72%", data: top.map(x => ({ value: x[1], itemStyle: { color: tipo.get(x[0]) === "Bancarias" ? NAVY : IND } })),
        label: { show: true, position: "right", formatter: p => bill(p.value), fontWeight: 700, fontSize: 11, color: "#111" } }]
    });
    if (pos >= 0) {                                   // flecha "TOP n" al lado de la barra de Balanz
      izq.style.position = "relative";
      const [x, y] = c1.convertToPixel({ seriesIndex: 0 }, [top[pos][1], pos]);
      const t = U.el("div", "cs-topflecha", "⟵ TOP " + (pos + 1)); t.style.left = (x + 82) + "px"; t.style.top = (y - 12) + "px"; izq.appendChild(t);
    }
    const med = U.el("div", "cs-col"); b.appendChild(med);
    const aba = caja(med, "Activos Bajo Administración:", { marginTop: "60px" }); aba.appendChild(U.el("div", "cs-aba", bill(M.sum(rows, "aP"))));
    const bt = M.sumBy(rows, r => r.t, r => r.aP);
    const tb = caja(med, "AUM por Tipo de Gerente", { marginTop: "90px", border: "none" });
    chart(tb, 130, { grid: { left: 100, right: 80, top: 6, bottom: 6 }, xAxis: { type: "value", show: false },
      yAxis: { type: "category", inverse: true, data: ["Bancarias", "Independientes"], axisTick: { show: false }, axisLine: { show: false }, axisLabel: { fontWeight: 700, fontSize: 12, color: "#111" } },
      series: [{ type: "bar", barWidth: "75%", data: [{ value: bt.get("Bancarias") || 0, itemStyle: { color: NAVY } }, { value: bt.get("Independientes") || 0, itemStyle: { color: IND } }],
        label: { show: true, position: "right", formatter: p => bill(p.value, 1), fontWeight: 700, fontSize: 12, color: "#111" } }] });
    const der = U.el("div", "cs-col"); b.appendChild(der);
    const cb = caja(der, "AUM por Categoría de Fondo", { border: "none" });
    cb.appendChild(ley([[NAVY, "Bancarias"], [IND, "Independientes"]]));
    const cats = [...M.sumBy(rows, r => r.c, r => r.aP).entries()].sort((a, b) => b[1] - a[1]);
    const ct = M.sumBy(rows, r => r.c + "|" + r.t, r => r.aP);
    chart(cb, 300, { grid: { left: 100, right: 80, top: 20, bottom: 6 }, xAxis: { type: "value", show: false },
      yAxis: { type: "category", inverse: true, data: cats.map(x => x[0]), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { fontWeight: 700, fontSize: 12, color: "#111" } },
      series: [["Bancarias", NAVY], ["Independientes", IND]].map(([t, col], i) => ({ type: "bar", stack: "a", barWidth: "75%", itemStyle: { color: col }, data: cats.map(x => ct.get(x[0] + "|" + t) || 0),
        label: i === 1 ? { show: true, position: "right", formatter: p => bill(cats[p.dataIndex][1], 1), fontWeight: 700, fontSize: 12, color: "#111" } : { show: false } })) });
  } });

  /* ---------- Slide 5: crecimiento de AUM ---------- */
  function crec(parent, titulo, filt) {
    const b0 = base(), mis = [b0, ...mesesAnio()], rows = M.ARS.filter(filt);
    const by = M.sumBy(rows, r => r.mi, r => r.aF), bz = M.sumBy(rows.filter(r => r.g === "Balanz"), r => r.mi, r => r.aF);
    const s = [["Industria", NAVY, mis.map(m => M.div(by.get(m), by.get(b0)) - 1)], ["Balanz", LINEA, mis.map(m => M.div(bz.get(m), bz.get(b0)) - 1)]];
    const c = caja(parent, titulo);
    chart(c, 300, { grid: { left: 24, right: 78, top: 30, bottom: 58 },
      xAxis: { type: "category", data: mis.map(m => fecha(m).txt), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { rotate: 35, fontSize: 9.5, color: GRIS, interval: 0 } },
      yAxis: { type: "value", show: false, scale: true },
      series: s.map(([n, col, data]) => ({ type: "line", name: n, data, symbol: "circle", symbolSize: 7, lineStyle: { color: col, width: 2.5 }, itemStyle: { color: col },
        label: { show: true, position: "top", formatter: p => pct(p.value, 0), fontWeight: 700, fontSize: 10.5, color: "#111" },
        endLabel: { show: true, formatter: "— " + n, color: n === "Balanz" ? NAVY : GRIS, fontWeight: 700, fontSize: 11.5, distance: 6 } })) });
  }
  def({ id: "call-s5", group: "Call de Fondos", name: "Slide 5 · Crecimiento AUM", render(st, side, content) {
    const b = slide(content, "Capilaridad Comercial + Productos Competitivos", `AUM a fin de cada mes (último dato ${fecha(M.lastMi).txt}) en pesos. Fuente: CAFCI / CNV.`);
    b.classList.add("cs-dos");
    crec(b, "Crecimiento de AUMs en Industria y en Balanz", () => true);
    crec(b, "Crecimiento de AUMs Renta Fija USD en Industria y en Balanz", r => RFUSD.includes(r.s));
  } });

  /* ---------- Slide 6: burbujas por gerente ---------- */
  const COLB = { Balanz: "#4B1E9E", Galicia: "#F7931E", Santander: "#E05A73", Delta: "#C0394B", Provinfondos: "#9BE21F", Macro: "#2F3437", ICBC: "#3D5A6C",
    BIND: "#4F9FC9", Schroder: "#7CA6F2", Pellegrini: "#4A4F5A", BBVA: "#6C63FF", Allaria: "#3A6FB0", "Mercado Pago": "#D7A2B5", Adcap: "#2D3A6B", One618: "#1F2A33" };
  def({ id: "call-s6", group: "Call de Fondos", name: "Slide 6 · Burbujas", render(st, side, content) {
    const mi = M.lastMi, b0 = base(), g = new Map();
    for (const r of M.ARS) { const x = g.get(r.g) || { su: 0, aP: 0, b: 0 }; if (r.mi >= m26() && r.mi <= mi) x.su += r.su; if (r.mi === mi) x.aP += r.aP; if (r.mi === b0) x.b += r.aF; g.set(r.g, x); }
    const pts = [...g.entries()].filter(([n, x]) => x.aP >= 2.3e6 && n !== "Investis").map(([n, x]) => [x.su, Math.max(0, M.div(x.aP, x.b) - 1), x.aP, n]);
    const maxA = Math.max(...pts.map(p => p[2]));
    const b = slide(content, "Desarrollo, crecimiento y volumen", `Datos ${alDia(mi)} en pesos. Crecimiento del AUM promedio del mes vs. diciembre; gerentes con AUM de 2,3 bill. o más. Fuente: CAFCI / CNV.`);
    const c = caja(b, "Crecimiento, Suscripciones y AUM por Gerente", { width: "820px", margin: "0 auto" });
    chart(c, 455, { grid: { left: 70, right: 30, top: 24, bottom: 52 },
      xAxis: { type: "value", name: "Suscripciones " + fecha(mi).y, nameLocation: "middle", nameGap: 32, nameTextStyle: { fontSize: 14, color: "#333" },
        axisLabel: { formatter: v => nf(0).format(v / 1e6) + " bill.", fontWeight: 700, color: GRIS }, splitLine: { lineStyle: { type: "dashed", color: "#bbb" } }, axisLine: { show: false } },
      yAxis: { type: "value", name: "Crecimiento " + fecha(mi).y, nameLocation: "middle", nameGap: 48, nameRotate: 90, nameTextStyle: { fontSize: 14, color: "#333" }, scale: true,
        axisLabel: { formatter: v => nf(0).format(v * 100) + " %", fontWeight: 700, color: GRIS }, splitLine: { lineStyle: { type: "dashed", color: "#bbb" } } },
      tooltip: { formatter: p => `${p.value[3]}<br>Suscripciones: ${bill(p.value[0])}<br>Crecimiento: ${pct(p.value[1], 0)}<br>AUM: ${bill(p.value[2])}` },
      series: [{ type: "scatter", data: pts.map(p => ({ value: p, itemStyle: { color: COLB[p[3]] || "#3B4A6B", opacity: 0.92 } })),
        symbolSize: v => 12 + 34 * Math.sqrt(v[2] / maxA), label: { show: true, position: "bottom", formatter: p => p.value[3], fontSize: 10, fontWeight: 700, color: "#111" } }] });
  } });

  /* ---------- Slide 7: AUM y flujo de la industria ---------- */
  function combo(parent, titulo, leyendas, mis, barras, linea, fBar) {
    const c = caja(parent, titulo); c.appendChild(ley([[NAVY, leyendas[0]], [LINEA, leyendas[1]]]));
    const maxB = Math.max(...barras), lv = linea.filter(v => v != null), maxL = Math.max(...lv), minL = Math.min(...lv);
    chart(c, 290, { grid: { left: 6, right: 6, top: 24, bottom: 24 },
      xAxis: { type: "category", data: mis.map(lblMes), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { fontSize: 10, color: GRIS, interval: 1 } },
      yAxis: [{ type: "value", show: false, max: maxB * 1.08 }, { type: "value", show: false, min: minL - (maxL - minL) * 0.08, max: maxL + (maxL - minL) * 0.9 }],
      series: [{ type: "bar", data: barras, barWidth: "78%", itemStyle: { color: NAVY }, label: { show: true, position: "top", formatter: p => fBar(p.value), fontWeight: 700, fontSize: 10.5, color: "#111" } },
        { type: "line", yAxisIndex: 1, data: linea, symbol: "circle", symbolSize: 7, lineStyle: { color: LINEA, width: 2.5 }, itemStyle: { color: LINEA },
          label: { show: true, position: "top", formatter: p => pct(p.value), fontWeight: 700, fontSize: 10.5, color: "#111", backgroundColor: "#D6D9E3", padding: [2, 5], borderRadius: 2 } }] });
  }
  def({ id: "call-s7", group: "Call de Fondos", name: "Slide 7 · AUM y flujo", render(st, side, content) {
    const mis = mesesAnio(), ap = M.sumBy(M.ARS, r => r.mi, r => r.aP), bzP = M.sumBy(M.ARS.filter(r => r.g === "Balanz"), r => r.mi, r => r.aP);
    const b = slide(content, "Capilaridad Comercial + Productos Competitivos", `AUM Promedio del mes y Flujos ${alDia(M.lastMi)} en pesos. Fuente: CAFCI / CNV.`);
    b.classList.add("cs-dos");
    combo(b, "AUMs en Industria y Market Share de Balanz", ["AUM Promedio Mes", "Market Share de Balanz"], mis, mis.map(m => ap.get(m) || 0), mis.map(m => M.div(bzP.get(m), ap.get(m))), v => nf(0).format(v / 1e6) + " bill.");
    let t = 0, z = 0; const tot = [], sh = [];
    for (const m of mis) { for (const r of M.ARS) if (r.mi === m) { t += r.su; if (r.g === "Balanz") z += r.su; } tot.push(t); sh.push(M.div(z, t)); }
    combo(b, "Flujo en Industria y % de Balanz", ["Flujo Total Industria " + fecha(M.lastMi).y, "% de Flujo de Balanz sobre Industria"], mis, tot, sh, v => nf(1).format(v / 1e6) + " bill.");
  } });

  /* ---------- Slide 8: composición por asset class ---------- */
  const COMP = [["Money Market", NAVY], ["Renta Fija", "#7B2FF7"], ["T+1", "#6878B8"], ["Otros", LINEA]];
  function comp(parent, titulo, rows) {
    const mis = mesesAnio(), tot = M.sumBy(rows, r => r.mi, r => r.aF), by = M.sumBy(rows, r => r.co + "|" + r.mi, r => r.aF);
    const c = caja(parent, titulo);
    chart(c, 320, { grid: { left: 14, right: 92, top: 26, bottom: 22 },
      xAxis: { type: "category", data: mis.map(lblMes), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { fontSize: 10, color: GRIS, interval: 1 } },
      yAxis: { type: "value", show: false, scale: true },
      series: COMP.map(([n, col]) => ({ type: "line", name: n, data: mis.map(m => M.div(by.get(n + "|" + m) || 0, tot.get(m))), symbol: "circle", symbolSize: 7,
        lineStyle: { color: col, width: 2.5 }, itemStyle: { color: col }, label: { show: true, position: "top", formatter: p => pct(p.value), fontSize: 9.5, fontWeight: 700, color: "#555" },
        endLabel: { show: true, formatter: "— " + n, color: col, fontSize: 10.5, fontWeight: 700 } })) });
  }
  def({ id: "call-s8", group: "Call de Fondos", name: "Slide 8 · Asset class", render(st, side, content) {
    const b = slide(content, "Composición por Asset Class", `AUM ${alDia(M.lastMi)} en pesos. Fuente: CAFCI / CNV.`);
    b.classList.add("cs-dos");
    comp(b, "Evolutivo Composición AUM Industria", M.ARS);
    comp(b, "Evolutivo Composición AUM Balanz", M.ARS.filter(r => r.g === "Balanz"));
  } });

  /* ---------- Slide 9: top fondos ex-MM en flujo ---------- */
  def({ id: "call-s9", group: "Call de Fondos", name: "Slide 9 · Top fondos", render(st, side, content) {
    const ac = new Map(), ger = new Map();
    for (const r of M.ARS) if (r.mi >= m26() && r.c !== "Money Market") { ac.set(r.n, (ac.get(r.n) || 0) + r.su); ger.set(r.n, r.g); }
    const top = [...ac.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const b = slide(content, "Capilaridad Comercial + Productos Competitivos", `Flujos ${alDia(M.lastMi)} en pesos. Fuente: CAFCI / CNV.`);
    const c = caja(b, `Top Fondos Ex-MM en Flujo ${fecha(M.lastMi).y} (en pesos)`, { width: "530px", margin: "40px auto 0" });
    const cols = U.el("div", "cs-top");
    const mx = top[0][1];
    for (const [n, v] of top) {
      const k = U.el("div", "cs-topc");
      k.append(U.el("div", "cs-topv", milM(v)));
      const bar = U.el("div", "cs-topb"); bar.style.height = Math.round(120 * v / mx) + "px"; k.appendChild(bar);
      k.appendChild(U.el("div", "cs-topn" + (ger.get(n) === "Balanz" ? " bz" : ""), n));
      cols.appendChild(k);
    }
    c.appendChild(cols);
  } });

  /* ---------- Slide 10: Fondos ARS short duration YTD ---------- */
  const COLR = ["#E06C8F", "#E04848", "#5FA8B8", "#4E9A3E"];
  def({ id: "call-s10", group: "Call de Fondos", name: "Slide 10 · Short duration", render(st, side, content) {
    const R = M.R || {};
    if (!R.fechas || !R.fechas.length) { U.empty(content, "Sin datos de rendimiento diario"); return; }
    const u = R.fechas[R.fechas.length - 1].split("-").reverse().join("/");
    const b = slide(content, "Fondos ARS – short duration <span class='cs-ytd'>YTD</span>", `Rendimiento neto acumulado desde el 31/12. Datos al ${u}. Fuente: CAFCI / CNV.`);
    const c = U.el("div", "cs-plain"); b.appendChild(c);
    c.appendChild(ley(R.series.map((s, i) => [COLR[i % 4], s.n])));
    chart(c, 470, { grid: { left: 60, right: 120, top: 14, bottom: 40 },
      xAxis: { type: "category", data: R.fechas.map(f => { const [y, m, d] = f.split("-"); return +d + "/" + +m + "/" + y.slice(2); }), axisTick: { show: false },
        axisLabel: { fontSize: 9, color: GRIS, rotate: 90 }, axisLine: { lineStyle: { color: "#ccc" } } },
      yAxis: { type: "value", axisLabel: { formatter: v => nf(3).format(v * 100) + "%", fontSize: 10, color: GRIS }, splitLine: { lineStyle: { color: "#eee" } } },
      tooltip: { trigger: "axis", valueFormatter: v => pct(v, 2) },
      series: R.series.map((s, i) => ({ type: "line", name: s.n, data: s.v, showSymbol: false, lineStyle: { color: COLR[i % 4], width: 1.6 }, itemStyle: { color: COLR[i % 4] },
        endLabel: { show: true, formatter: p => nf(2).format(p.value * 100) + "%", fontSize: 17, color: "#111", fontFamily: F, offset: [10, 0] }, labelLayout: { moveOverlap: "shiftY" } })) });
  } });
})();
