/* Call de Fondos: visuales "Consistencia en la captación de flujos" y "Segundo semestre: captación sostenida".
   Mismo diseño que las slides (panel de 1320 px = recuadro de la slide), para pegarlos con un screenshot.
   Todo se calcula de la base CAFCI/CNV: suscripciones netas ex-Money Market (categoría distinta de Money Market). */
(function () {
  const P = window.P, def = p => P.pages.push(p);
  const MES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const MESL = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const nf = d => new Intl.NumberFormat("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
  // montos en millones de $: 143.000 -> "143 mil M"; 1.180.000 -> "1,18 bill."
  const monto = (v, sym = true) => { const s = Math.abs(v) >= 1e6 ? nf(2).format(v / 1e6) + " bill." : nf(0).format(v / 1e3) + " mil M"; return (sym ? "$ " : "") + s; };
  const pct = (v, d = 1) => nf(d).format(v * 100) + " %";
  const exmm = r => r.c !== "Money Market";

  function meses() {                       // meses de 2026 disponibles, con marca de parcial para el último
    const a = M.mi2026(), out = [];
    for (let mi = a; mi <= M.lastMi; mi++) {
      const f = M.fechas[mi], [y, m, d] = f.split("-").map(Number);
      const fin = new Date(y, m, 0).getDate(), parcial = mi === M.lastMi && d < fin;
      out.push({ mi, m: m - 1, y, d, parcial, lbl: MES[m - 1] + (parcial ? "*" : "") });
    }
    return out;
  }
  const rankDe = (map, g) => { const s = [...map.entries()].sort((a, b) => b[1] - a[1]); return { rank: s.findIndex(x => x[0] === g) + 1, orden: s }; };
  function shareExmm(mi) {
    const rows = M.ARS.filter(r => r.mi === mi && exmm(r)), tot = M.sum(rows, "aF");
    return M.div(M.sum(rows.filter(r => r.g === "Balanz"), "aF"), tot);
  }
  function nota(content, txt) {
    const n = U.el("p", "sl-nota", txt); content.appendChild(n);
  }
  function pie(ms) {
    const u = ms[ms.length - 1];
    return u.parcial ? ` ${MESL[u.m][0].toUpperCase() + MESL[u.m].slice(1)} parcial, al ${u.d} de ${MESL[u.m][0].toUpperCase() + MESL[u.m].slice(1)} de ${u.y}.` : "";
  }
  function panel(content, titulo) {
    const w = U.el("div", "sl-wrap"), p = U.el("div", "sl-panel"), h = U.el("div", "sl-band", titulo), b = U.el("div", "sl-body");
    p.append(h, b); w.appendChild(p); content.appendChild(w); return b;
  }
  function kpi(parent, big, txt) {
    const k = U.el("div", "sl-kpi"); k.append(U.el("div", "sl-big", big), U.el("div", "sl-txt", txt)); parent.appendChild(k); return k;
  }

  /* ---------- 1) Consistencia en la captación de flujos ---------- */
  def({ id: "call-13", group: "Call de Fondos", name: "Consistencia en flujos", render(st, side, content) {
    const ms = meses(), rows = M.ARS.filter(r => r.mi >= M.mi2026() && exmm(r));
    const acum = new Map(), datos = [];
    for (const x of ms) {
      for (const r of rows) if (r.mi === x.mi) acum.set(r.g, (acum.get(r.g) || 0) + r.su);
      const { rank, orden } = rankDe(acum, "Balanz"), tot = [...acum.values()].reduce((a, b) => a + b, 0), bz = acum.get("Balanz") || 0;
      datos.push({ ...x, rank, bz, sh: M.div(bz, tot), seg: orden[rank === 1 ? 1 : 0] });
    }
    const b = panel(content, `Puesto de Balanz en suscripciones netas ex-Money Market acumuladas en ${ms[0].y}`);
    const grid = U.el("div", "sl-tiles"); grid.style.gridTemplateColumns = `repeat(${datos.length},1fr)`;
    for (const d of datos) {
      const c = U.el("div", "sl-col");
      c.append(U.el("div", "sl-mes", d.lbl), U.el("div", "sl-tile" + (d.rank === 1 ? "" : " alt"), d.rank + "°"),
        U.el("div", "sl-val", monto(d.bz)), U.el("div", "sl-sub", pct(d.sh) + " del total"));
      grid.appendChild(c);
    }
    b.appendChild(grid);
    const u = datos[datos.length - 1];
    let n = 0; for (let i = datos.length - 1; i >= 0 && datos[i].rank === 1; i--) n++;
    const desde = datos[datos.length - n];
    const k = U.el("div", "sl-kpis");
    if (n > 0) kpi(k, n + (n === 1 ? " mes" : " meses"), (n === 1 ? "en el puesto N°1 de la industria" : "consecutivos en el puesto N°1 de la industria, desde " + MESL[desde.m]));
    else kpi(k, u.rank + "°", "puesto de Balanz en la industria");
    const seg = u.seg;
    if (u.rank === 1) kpi(k, (u.bz >= seg[1] ? "+" : "") + nf(0).format((M.div(u.bz, seg[1]) - 1) * 100) + " %", `de flujo acumulado sobre el segundo (${seg[0]}, ${monto(seg[1])})`);
    else kpi(k, monto(seg[1] - u.bz), `de diferencia con el primero (${seg[0]}, ${monto(seg[1])})`);
    kpi(k, pct(u.sh), `del flujo ex-Money Market de ${u.y}, con ${pct(shareExmm(M.lastMi))} de share`);
    b.appendChild(k);
    nota(content, "Suscripciones netas ex-Money Market acumuladas desde enero, en pesos." + pie(ms) + " Fuente: CAFCI / CNV.");
  } });

  /* ---------- 2) Segundo semestre: captación sostenida ---------- */
  def({ id: "call-14", group: "Call de Fondos", name: "Segundo semestre", render(st, side, content) {
    const ms = meses(), rows = M.ARS.filter(r => r.mi >= M.mi2026() && exmm(r));
    const datos = ms.map(x => {
      const rs = rows.filter(r => r.mi === x.mi), tot = M.sum(rs, "su"), byG = M.sumBy(rs, r => r.g, r => r.su);
      const bz = byG.get("Balanz") || 0;
      return { ...x, tot, bz, sh: tot > 0 ? bz / tot : null, rank: rankDe(byG, "Balanz").rank };
    });
    const cerr = datos.filter(d => !d.parcial), ven = cerr.slice(-3);            // últimos 3 meses cerrados
    const semIni = Math.min(6, datos.length - 1);                                  // segundo semestre: desde julio
    const b = panel(content, `Flujo ex-Money Market de la industria y porcentaje captado por Balanz (${ms[0].y})`);
    const fila = U.el("div", "sl-row2"), izq = U.el("div", "sl-chartbox"), der = U.el("div", "sl-kcol");
    fila.append(izq, der); b.appendChild(fila);
    const ley = U.el("div", "sl-ley");
    ley.innerHTML = '<span><i class="sq"></i>Flujo neto de la industria</span><span><i class="dot"></i>% del flujo captado por Balanz</span>';
    izq.appendChild(ley);
    const ch = U.el("div", "sl-chart"); izq.appendChild(ch);
    const vIdx = new Set(ven.map(v => datos.indexOf(v)));
    const maxT = Math.max(...datos.map(d => d.tot)), minT = Math.min(0, ...datos.map(d => d.tot));
    const shs = datos.map(d => (d.parcial || d.sh == null ? null : d.sh)), maxS = Math.max(...shs.filter(v => v != null)), minS = Math.min(0, ...shs.filter(v => v != null));
    const F = '"Open Sans", Arial, sans-serif';
    U.chart(ch, {
      textStyle: { fontFamily: F, color: "#07204F" },
      grid: { left: 8, right: 8, top: 34, bottom: 40, containLabel: false },
      xAxis: { type: "category", data: datos.map(d => d.lbl), axisTick: { show: false }, axisLine: { show: false },
        axisLabel: { fontFamily: F, fontWeight: 700, fontSize: 15, color: "#07204F", margin: 22 } },
      yAxis: [{ type: "value", show: false, min: minT * 1.25 - maxT * 0.02, max: maxT * 1.18 },
        { type: "value", show: false, min: Math.min(minS, 0) - (maxS - minS) * 0.55, max: maxS * 1.12 }],
      tooltip: { trigger: "axis", confine: true },
      series: [
        { type: "bar", name: "Flujo neto de la industria", yAxisIndex: 0, barWidth: "62%", z: 2,
          data: datos.map((d, i) => ({ value: d.tot, itemStyle: { color: i >= semIni ? "#6281D4" : "#C5CEEA" },
            label: { show: true, position: d.tot < 0 ? "bottom" : (i >= semIni ? "top" : "insideBottom"), distance: 6, formatter: () => monto(d.tot, false),
              fontFamily: F, fontWeight: 700, fontSize: 12.5, color: "#07204F" } })),
          markArea: ven.length ? { silent: true, itemStyle: { color: "#F1F3FA" }, data: [[{ xAxis: ven[0].lbl }, { xAxis: ven[ven.length - 1].lbl }]] } : undefined,
          markLine: { silent: true, symbol: "none", lineStyle: { color: "#B0B4C0", width: 1, type: "solid" }, label: { show: false }, data: [{ yAxis: 0 }] } },
        { type: "line", name: "% del flujo captado por Balanz", yAxisIndex: 1, z: 5, symbol: "circle", symbolSize: 11, connectNulls: false,
          lineStyle: { color: "#6A3DE8", width: 3 }, itemStyle: { color: "#6A3DE8" },
          data: shs.map((v, i) => ({ value: v, label: { show: v != null, position: "top", distance: 9, formatter: () => pct(v, Math.abs(v) < 0.05 ? 1 : 0),
            fontFamily: F, fontWeight: 700, fontSize: 14, color: vIdx.has(i) ? "#fff" : "#6A3DE8",
            backgroundColor: vIdx.has(i) ? "#6A3DE8" : "#fff", padding: [3, 6] } })) }
      ]
    });
    // KPIs
    const fb = ven.reduce((a, d) => a + d.bz, 0), ft = ven.reduce((a, d) => a + d.tot, 0);
    const rng = ven.length ? `entre ${MESL[ven[0].m]} y ${MESL[ven[ven.length - 1].m]}` : "";
    kpi(der, nf(0).format(M.div(fb, ft) * 100) + " %", `del flujo de la industria ${rng} fue a Balanz: ${monto(fb)} de ${monto(ft)}`);
    const uno = ven.filter(d => d.rank === 1), otros = ven.filter(d => d.rank !== 1);
    const lista = a => a.length === 1 ? a[0] : a.slice(0, -1).join(", ") + " y en " + a[a.length - 1];
    if (uno.length) kpi(der, "N°1", `de la industria en ${lista(uno.map(d => MESL[d.m]))}` + (otros.length ? `, y ${otros.map(d => d.rank + "° en " + MESL[d.m]).join(", ")}` : ""));
    else kpi(der, Math.min(...ven.map(d => d.rank)) + "°", "mejor puesto mensual: " + ven.map(d => d.rank + "° en " + MESL[d.m]).join(", "));
    const shU = shareExmm(M.lastMi), dic = M.idx((ms[0].y - 1) + "-12"), shD = dic >= 0 ? shareExmm(dic) : null;
    const shAnio = ms.map(x => shareExmm(x.mi)), esMax = shU >= Math.max(...shAnio) - 1e-9;
    kpi(der, pct(shU), `de share ex-Money Market${esMax ? ", el máximo del año" : ""}` + (shD != null ? ` (${pct(shD)} en diciembre)` : ""));
    nota(content, "Suscripciones netas ex-Money Market, en pesos." + pie(ms) + " Fuente: CAFCI / CNV.");
  } });
})();
