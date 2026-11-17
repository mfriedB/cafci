/* Cambios pedidos por Matías sobre las hojas del Power BI (se aplican encima del diseño del .pbix).
   Cada entrada: hoja (nombre de la pestaña) + id del visual en el .pbix + qué hacer:
   - texto: reemplaza el texto de un cuadro de texto (conserva su formato);
   - dibujar(v, env, R): reemplaza el visual por uno propio en la misma posición y tamaño.
   Si el visual ya no existe en el .pbix (se borró o se rehízo), el cambio no se aplica. */
(function () {
  const C = window.PBI_CUSTOM = [];
  const AUM = { k: "M", t: "CSV_1816", p: "AUM (Mes máximo visible)" };
  const MON = { k: "C", t: "CSV_1816", p: "Moneda" }, TIPO = { k: "C", t: "CSV_1816", p: "Tipo_Gerente" };

  /* Industria FCI - AUM Resumen: "AUM por Moneda de Suscripción" -> "Composición por Moneda según Gerente"
     (100% por tipo de gerente, ARS y USD, con el AUM total de cada fila y la industria abajo) */
  C.push({ hoja: "Industria FCI - AUM Resumen", id: "354eade8e481f50a7570", texto: "Composición por Moneda según Gerente" });
  /* Industria FCI - AUM Resumen: las leyendas de los tres gráficos de abajo a la misma altura, con la misma letra y estilo */
  const LEY_RESUMEN = { top: 6, left: 8, icon: "circle", itemWidth: 10, itemHeight: 10, itemGap: 18, textStyle: { fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: 13, color: "#605E5C", padding: [0, 0, 0, 0] } };
  C.push({ hoja: "Industria FCI - AUM Resumen", leyenda: LEY_RESUMEN });
  /* Compraventa a Contrapartes: los pesos se dolarizan al oficial vendedor del BCRA de cada fecha (antes, 1.400 fijo) */
  /* Compraventa a Contrapartes: tablas completas, sin barras de desplazamiento (la hoja crece en alto y ancho) */
  //   "pantalla": la hoja entera entra en la pantalla (para sacarle un screenshot); "largo": escala al ancho y se recorre con el scroll
  for (const h of ["Compraventa a Contrapartes: Montos", "Compraventa a Contrapartes: %"]) C.push({ hoja: h, ajustar: "pantalla" });
  C.push({ hoja: "Compraventa a Contrapartes: Tabla Completa", ajustar: "largo" });
  C.push({ hoja: "Compraventa a Contrapartes: Montos", id: "96ea618686bb0cb03467", texto: "Montos en millones de USD, los $ dolarizados al dólar oficial vendedor del BCRA de cada operación" });
  C.push({ hoja: "Industria FCI - AUM Resumen", id: "ed7a3bd05e7571b7549c", dibujar(v, env, R) {
    const { body } = R.container(v, env.host, null);
    const ctx = R.visualCtx(env.page, env.st, v);
    const rows = R.query(v, ctx, [TIPO, MON], [AUM]);
    const val = (t, m) => rows.filter(r => (t == null || r.k[0] === t) && (m == null || r.k[1] === m)).reduce((a, r) => a + (r.v[0] || 0), 0);
    const filas = [["Bancarias", "Bancarias"], ["Independientes", "Independientes"], ["Total Industria", null]];
    const data = filas.map(([n, t]) => { const ars = val(t, "ARS"), usd = val(t, "USD"), tot = ars + usd; return { n, ars, usd, tot, pa: tot ? ars / tot : null, pu: tot ? usd / tot : null }; });
    const navy = "#0F3D6E", azul = "rgba(11,111,191,0.8)";
    const pct = x => (x == null ? "" : F.num(x, "0.0 %;-0.0 %;0.0 %"));
    const monto = x => F.num(x, "\\$\\ #,0;-\\$\\ #,0;\\$\\ #,0", { units: 0, prec: 1 });
    const d = document.createElement("div"); d.className = "pv-chart"; body.appendChild(d);
    const ch = echarts.init(d, null, { renderer: "svg" }); R.track(ch);
    const lbl = { show: true, position: "inside", color: "#FFFFFF", fontWeight: "bold", fontSize: 12, formatter: p => pct(p.value) };
    ch.setOption({
      animation: false, textStyle: { fontFamily: "'Segoe UI', Arial, sans-serif" },
      legend: Object.assign({}, LEY_RESUMEN, { top: LEY_RESUMEN.top + 3, textStyle: Object.assign({}, LEY_RESUMEN.textStyle) }),   // este visual arranca 3 px más arriba en el .pbix
      grid: { left: 10, right: 10, top: 40, bottom: 8, containLabel: true },
      xAxis: { type: "value", show: false, max: 1 },
      yAxis: [{ type: "category", inverse: true, data: data.map(x => x.n), axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { fontWeight: "bold", fontSize: 13, color: "#121212", margin: 10 } },
        { type: "category", inverse: true, position: "right", data: data.map(x => monto(x.tot)), axisLine: { show: false }, axisTick: { show: false },
          axisLabel: { fontWeight: "bold", fontSize: 13, color: "#121212", margin: 12 } }],
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, confine: true,
        formatter: ps => `<b>${data[ps[0].dataIndex].n}</b><br>` + ps.map(p => `${p.marker}${p.seriesName}: ${pct(p.value)} (${monto(p.seriesName === "ARS" ? data[p.dataIndex].ars : data[p.dataIndex].usd)})`).join("<br>") },
      series: [
        { name: "ARS", type: "bar", stack: "m", barWidth: "55%", itemStyle: { color: navy }, label: lbl, data: data.map(x => x.pa) },
        { name: "USD", type: "bar", stack: "m", itemStyle: { color: azul }, label: lbl, data: data.map(x => x.pu) },
      ]
    });
    ch.setOption({ legend: { data: ["ARS", "USD"] } });
    // linea que separa la industria de los tipos de gerente
    const y = (ch.convertToPixel({ yAxisIndex: 0 }, data[1].n) + ch.convertToPixel({ yAxisIndex: 0 }, data[2].n)) / 2;
    ch.setOption({ graphic: [{ type: "line", shape: { x1: 10, y1: y, x2: d.clientWidth - 10, y2: y }, style: { stroke: "#C8C6C4", lineWidth: 1 }, silent: true }] });
  } });

  /* Facturación Interna - Evolutivo UN: los dos gráficos (IFA y Corporate arriba, el resto abajo) en un solo visual de reporte:
     dos franjas con su propia escala y un eje de meses común, marcador en cada punto, todas las etiquetas de datos visibles
     y el nombre de cada unidad al final de su línea. Las unidades que nunca llegan al 1% se suman en "Resto (<1%)". */
  const UN_TOP = "d150fe869d4ad07f2d80", UN_BOT = "13279595ac2ad27205ac", HOJA_UN = "Facturación Interna - Evolutivo UN";
  C.push({ hoja: HOJA_UN, id: UN_BOT, dibujar() {} });
  C.push({ hoja: HOJA_UN, ajustar: "pantalla" });
  C.push({ hoja: HOJA_UN, id: UN_TOP, dibujar(v0, env, R) {
    const vb = env.page.visuals.find(x => x.id === UN_BOT);
    const x0 = 166, y0 = v0.y, x1 = (vb ? vb.x + vb.w : v0.x + v0.w) + 4;
    const v = Object.assign({}, v0, { x: x0, w: x1 - x0, h: 760 });
    const { body } = R.container(v, env.host, "Evolutivo Facturación por Unidad de Negocio");
    const cat = v0.proj.Category[0], ser = v0.proj.Series[0], y = v0.proj.Y[0];
    const filas = [v0, vb].filter(Boolean).flatMap(vv => R.query(vv, R.visualCtx(env.page, env.st, vv), [cat, ser], [y]));
    const mes = k => { const m = String(k).match(/(\d{4})-(\d{2})/); return m ? m[1] + "-" + m[2] : String(k); };
    const meses = [...new Set(filas.map(r => mes(r.k[0])))].sort();
    if (!meses.length) { body.appendChild(Object.assign(document.createElement("div"), { className: "pv-empty", textContent: "Sin datos" })); return; }
    const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    const lab = m => MES[+m.slice(5) - 1] + "-" + m.slice(2, 4);
    const por = new Map();
    for (const r of filas) { const n = String(r.k[1] ?? ""), i = meses.indexOf(mes(r.k[0])), val = r.v[0];
      if (!n || val == null) continue; const a = por.get(n) || por.set(n, meses.map(() => null)).get(n); a[i] = (a[i] || 0) + val; }
    const TOPS = ["IFA", "Corporate"], resto = meses.map(() => null), chicos = [];
    const lista = [];
    for (const [n, a] of por) {
      const mx = Math.max(...a.map(x => x || 0)); if (!(mx > 0)) continue;
      if (!TOPS.includes(n) && mx < 0.01) { chicos.push(n); a.forEach((x, i) => { if (x != null) resto[i] = (resto[i] || 0) + x; }); continue; }
      lista.push({ n, a });
    }
    const ult = a => { for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return a[i]; return 0; };
    const prom = a => { const vs = a.filter(z => z != null).slice(-6); return vs.length ? vs.reduce((p, q) => p + q, 0) / vs.length : 0; };   // últimos 6 meses
    lista.sort((p, q) => ult(q.a) - ult(p.a));
    if (chicos.length) lista.push({ n: "Resto (<1%)", a: resto, resto: true });
    // una fila por unidad (de mayor a menor participación en los últimos 6 meses), cada una con su propia escala y el mismo eje de meses:
    // así ninguna línea pisa a otra y se leen todas las etiquetas
    const filasU = lista.filter(x => !x.resto).sort((p, q) => prom(q.a) - prom(p.a)).concat(lista.filter(x => x.resto));
    const pct = x => (x == null ? "" : (x * 100).toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%");
    const d = document.createElement("div"); d.className = "pv-chart"; body.appendChild(d);
    const ch = echarts.init(d, null, { renderer: "svg" }); R.track(ch);
    const font = "'Segoe UI', Arial, sans-serif", NAVY = "#123A73";
    const H = d.clientHeight || 700, W = d.clientWidth || 1000, L = 205, RT = 22, TOP = 6, BOT = 44;
    const rowH = (H - TOP - BOT) / filasU.length;
    const grids = [], xAxes = [], yAxes = [], series = [], g = [];
    filasU.forEach((x, i) => {
      const vs = x.a.filter(z => z != null), mn = Math.min(...vs), mx = Math.max(...vs), r = Math.max(mx - mn, mx * 0.15, 0.002);
      const top = TOP + i * rowH, last = i === filasU.length - 1, col = x.resto ? "#8A8F9C" : NAVY;
      if (i % 2 === 0) g.push({ type: "rect", shape: { x: 0, y: top, width: W, height: rowH }, style: { fill: "#F4F6FA" }, silent: true, z: -10 });
      grids.push({ left: L, right: RT, top: top + 15, height: rowH - 19 });
      xAxes.push({ type: "category", gridIndex: i, data: meses.map(lab), boundaryGap: false, axisTick: { show: false }, axisLine: { show: last, lineStyle: { color: "#C8C6C4" } },
        axisLabel: { show: last, fontSize: 10.5, color: "#605E5C", interval: 0, fontFamily: font, margin: 8 }, splitLine: { show: false } });
      yAxes.push({ type: "value", gridIndex: i, min: Math.max(0, mn - r * 0.15), max: mx + r * 0.05, show: false });
      series.push({ type: "line", name: x.n, xAxisIndex: i, yAxisIndex: i, data: x.a, symbol: "circle", symbolSize: 5.5,
        lineStyle: { width: 1.8, color: col, type: x.resto ? "dashed" : "solid" }, itemStyle: { color: col, borderColor: "#fff", borderWidth: 1 },
        label: { show: true, position: "top", distance: 3, formatter: p => pct(p.value), fontSize: 9, color: "#3B3A39", fontFamily: font,
          fontWeight: 400, textBorderColor: i % 2 === 0 ? "#F4F6FA" : "#fff", textBorderWidth: 2 },
        emphasis: { disabled: true } });
      // nombre de la unidad y participación del último mes, a la izquierda de su fila
      g.push({ type: "text", x: 10, y: top + rowH / 2 + 2, style: { text: x.n, fill: x.resto ? "#8A8F9C" : "#1B2A4A", fontSize: 11.5, fontWeight: 600, fontFamily: font, verticalAlign: "middle", lineHeight: 13,
        width: L - 72, overflow: "break" }, silent: true });
      g.push({ type: "text", x: L - 14, y: top + rowH / 2 + 2, style: { text: pct(ult(x.a)), fill: NAVY, fontSize: 11.5, fontWeight: 700, fontFamily: font, verticalAlign: "middle", align: "right" }, silent: true });
    });
    g.push({ type: "text", left: 10, bottom: 4, style: { text: "Participación de cada unidad en la facturación del mes; a la izquierda, la del último mes. Cada fila tiene su propia escala." + (chicos.length ? "  Resto (<1%): " + chicos.sort().join(", ") + "." : ""), width: W - 20, overflow: "truncate", fill: "#8A8F9C", fontSize: 9.5, fontFamily: font }, silent: true });
    ch.setOption({ animation: false, textStyle: { fontFamily: font }, tooltip: { trigger: "item", confine: true, formatter: p => `${p.seriesName}<br>${meses.map(lab)[p.dataIndex]}: <b>${pct(p.value)}</b>` },
      grid: grids, xAxis: xAxes, yAxis: yAxes, series, graphic: g });
  } });
})();
