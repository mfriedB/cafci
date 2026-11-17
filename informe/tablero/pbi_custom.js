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
    const MODO = window.UN_MODO || "log";
    if (MODO !== "filas") return variante(MODO);
    function variante(modo) {
      const font = "'Segoe UI', Arial, sans-serif";
      const pct = x => (x == null ? "" : (x * 100).toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%");
      const PAL = ["#0F2A6B", "#3D5AFE", "#1E88E5", "#E67E22", "#00897B", "#8E24AA", "#C62828", "#2E7D32", "#D81B60", "#F9A825", "#3949AB", "#00ACC1", "#6D4C41", "#7CB342", "#5E35B1", "#455A64"];
      const orden = lista.filter(x => !x.resto).sort((p, q) => prom(q.a) - prom(p.a)).concat(lista.filter(x => x.resto));
      orden.forEach((x, i) => { x.c = x.resto ? "#8A8F9C" : PAL[i % PAL.length]; });
      const grupo = x => { const m = prom(x.a); return x.resto || m < 0.02 ? 3 : m < 0.05 ? 2 : m < 0.1 ? 1 : 0; };
      const NOMG = ["Unidades grandes (más de 10%)", "Unidades medianas (5% a 10%)", "Unidades chicas (2% a 5%)", "Unidades menores (menos de 2%)"];
      const grupos = [0, 1, 2, 3].map(gi => orden.filter(x => grupo(x) === gi)).map((xs, gi) => ({ xs, gi })).filter(g => g.xs.length);
      grupos.forEach(g => g.xs.forEach((x, i) => { if (!x.resto) x.c = PAL[(g.gi * 4 + i) % PAL.length]; }));
      if (grupos[0]) grupos[0].xs.forEach((x, i) => { x.c = ["#0F2A6B", "#3D5AFE", "#1E88E5"][i % 3]; });
      const d = document.createElement("div"); d.className = "pv-chart"; body.appendChild(d);
      const W = d.clientWidth || 1000, H = d.clientHeight || 700;
      if (modo === "calor") {   // mapa de calor: el color de cada celda va del mínimo al máximo de su unidad
        d.style.overflow = "hidden"; d.style.fontFamily = font;
        const t = document.createElement("table"); Object.assign(t.style, { borderCollapse: "collapse", width: "100%", fontSize: "11px", tableLayout: "fixed" });
        let h = `<thead><tr><th style="width:170px;text-align:left;padding:4px 6px;color:#605E5C;font-weight:600">Unidad</th>${meses.map(m => `<th style="padding:4px 0;color:#605E5C;font-weight:600;font-size:10px">${lab(m)}</th>`).join("")}</tr></thead><tbody>`;
        for (const x of orden) {
          const vs = x.a.filter(z => z != null), mn = Math.min(...vs), mx = Math.max(...vs);
          h += `<tr><td style="padding:5px 6px;font-weight:600;color:#1B2A4A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${x.n}</td>` + x.a.map(z => {
            if (z == null) return `<td></td>`;
            const k = mx > mn ? (z - mn) / (mx - mn) : 0.5, bg = `rgba(16,66,128,${(0.08 + k * 0.82).toFixed(2)})`;
            return `<td style="background:${bg};color:${k > 0.55 ? "#fff" : "#1B2A4A"};text-align:center;padding:5px 0;border:1px solid #fff">${pct(z).replace("%", "")}</td>`; }).join("") + `</tr>`;
        }
        t.innerHTML = h + `</tbody>`; d.appendChild(t);
        const n = document.createElement("div"); n.textContent = "Participación (%) de cada unidad en la facturación del mes. El color de cada fila va del mínimo (claro) al máximo (oscuro) de esa unidad, para marcar sus subas y bajas.";
        Object.assign(n.style, { fontSize: "10px", color: "#8A8F9C", margin: "8px 6px" }); d.appendChild(n);
        return;
      }
      const ch = echarts.init(d, null, { renderer: "svg" }); R.track(ch);
      const RT = 190, L = 54, g = [], grids = [], xAxes = [], yAxes = [], series = [];
      const linea = (x, gi, opt) => ({ type: "line", name: x.n, xAxisIndex: gi, yAxisIndex: gi, data: x.a, symbol: "circle", symbolSize: 6,
        lineStyle: { width: x.resto ? 1.6 : 2.2, color: x.c, type: x.resto ? "dashed" : "solid" }, itemStyle: { color: x.c, borderColor: "#fff", borderWidth: 1 },
        label: { show: true, position: (opt && opt.pos) || "top", distance: 3, formatter: p => pct(p.value), fontSize: (opt && opt.fs) || 9, fontWeight: 600, color: x.c, fontFamily: font, textBorderColor: "#fff", textBorderWidth: 2.5 },
        labelLayout: { moveOverlap: "shiftY", hideOverlap: false }, emphasis: { focus: "series" } });
      const ejeX = (gi, show, r) => ({ type: "category", gridIndex: gi, data: meses.map(lab), boundaryGap: false, axisTick: { show: false }, axisLine: { show, lineStyle: { color: "#C8C6C4" } },
        axisLabel: { show, fontSize: r ? 9 : 10.5, color: "#605E5C", interval: 0, fontFamily: font, rotate: r || 0 }, splitLine: { show: true, lineStyle: { color: "#F2F2F2" } } });
      const ejeY = (gi, mn, mx, paso, tipo) => Object.assign({ type: tipo || "value", gridIndex: gi, axisLabel: { formatter: z => (z * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "%", fontSize: 10.5, color: "#605E5C", fontFamily: font },
        splitLine: { lineStyle: { color: "#E3E3E3", type: "dashed" } }, axisLine: { show: false }, axisTick: { show: false } }, tipo === "log" ? { logBase: 2, min: mn, max: mx } : { min: mn, max: mx, interval: paso });
      const escala = xs => { const vs = xs.flatMap(x => x.a).filter(z => z != null), mn = Math.min(...vs), mx = Math.max(...vs), r = Math.max(mx - mn, 0.004);
        const paso = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1].find(q => r / q <= 4) || 0.1;
        return [Math.max(0, Math.floor((mn - r * 0.04) / paso) * paso), Math.ceil((mx + r * 0.18) / paso) * paso, paso]; };
      const nombres = (gi, xs, xr) => {   // nombre de cada línea al final, separados
        const pts = xs.map(x => { let i = x.a.length - 1; while (i >= 0 && x.a[i] == null) i--; if (i < 0) return null;
          const [px, py] = ch.convertToPixel({ xAxisIndex: gi, yAxisIndex: gi }, [i, x.a[i]]); return { x: px, y: py, ty: py, n: x.n, c: x.c }; }).filter(Boolean).sort((p, q) => p.y - q.y);
        for (let k = 1; k < pts.length; k++) if (pts[k].ty - pts[k - 1].ty < 13) pts[k].ty = pts[k - 1].ty + 13;
        for (const p of pts) { g.push({ type: "polyline", shape: { points: [[p.x + 28, p.y], [xr - 4, p.ty]] }, style: { stroke: "#D0D0D0", lineWidth: 1 }, silent: true });
          g.push({ type: "text", x: xr, y: p.ty, style: { text: p.n, fill: p.c, fontSize: 11, fontWeight: 600, fontFamily: font, verticalAlign: "middle", width: 160, overflow: "truncate" }, silent: true }); }
      };
      const nota = t => g.push({ type: "text", left: 8, bottom: 2, style: { text: t + (chicos.length ? "  Resto (<1%): " + chicos.sort().join(", ") + "." : ""), width: W - 16, overflow: "truncate", fill: "#8A8F9C", fontSize: 9.5, fontFamily: font }, silent: true });
      if (modo === "log") {   // escala logarítmica de ~1% a 35%, sin la línea "Resto"; grilla en valores redondos
        const xs = orden.filter(x => !x.resto), vs = xs.flatMap(x => x.a).filter(z => z > 0);
        const ymin = Math.min(0.01, Math.floor(Math.min(...vs) * 1000 * 0.92) / 1000), ymax = 0.35;
        grids.push({ left: L, right: RT, top: 18, bottom: 46 }); xAxes.push(ejeX(0, true));
        yAxes.push({ type: "log", logBase: 10, gridIndex: 0, min: ymin, max: ymax, axisLabel: { show: false }, splitLine: { show: false }, axisLine: { show: false }, axisTick: { show: false } });
        xs.forEach(x => series.push(linea(x, 0, { fs: 8.5 })));
        ch.setOption({ animation: false, tooltip: { trigger: "axis", confine: true, order: "valueDesc", valueFormatter: z => pct(z) }, grid: grids, xAxis: xAxes, yAxis: yAxes, series });
        for (const t of [0.01, 0.015, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35].filter(t => t >= ymin)) {
          const yp = ch.convertToPixel({ yAxisIndex: 0 }, t);
          g.push({ type: "line", z: -1, shape: { x1: L, y1: yp, x2: W - RT, y2: yp }, style: { stroke: t === 0.1 || t === 0.01 ? "#C8C6C4" : "#E6E6E6", lineDash: [4, 4], lineWidth: 1 }, silent: true });
          g.push({ type: "text", x: L - 6, y: yp, style: { text: (t * 100).toLocaleString("es-AR") + "%", fill: "#605E5C", fontSize: 10.5, fontFamily: font, align: "right", verticalAlign: "middle" }, silent: true });
        }
        nombres(0, xs, W - RT + 30);
        g.push({ type: "text", left: 8, bottom: 2, style: { text: "Escala logarítmica de 1% a 35%: la misma variación porcentual se ve igual en una unidad grande que en una chica." + (chicos.length ? "  No se muestran las unidades que nunca superan el 1%: " + chicos.sort().join(", ") + "." : ""), width: W - 16, overflow: "truncate", fill: "#8A8F9C", fontSize: 9.5, fontFamily: font }, silent: true });
      } else if (modo === "unica") {
        grids.push({ left: L, right: RT, top: 18, bottom: 46 }); xAxes.push(ejeX(0, true));
        { const [a, b] = escala(orden); yAxes.push(ejeY(0, 0, b, 0.05)); }
        orden.forEach(x => series.push(linea(x, 0, { fs: 8.5 })));
        ch.setOption({ animation: false, tooltip: { trigger: "axis", confine: true, order: "valueDesc", valueFormatter: z => pct(z) }, grid: grids, xAxis: xAxes, yAxis: yAxes, series });
        nombres(0, orden, W - RT + 30);
        nota("Todas las unidades en la misma escala lineal.");
      } else if (modo === "grupos") {
        const GAP = 34, util = H - 14 - 44 - GAP * (grupos.length - 1), pesos = grupos.map(gr => gr.gi === 0 ? 0.8 : 1 + gr.xs.length * 0.12), tp = pesos.reduce((p, q) => p + q, 0);
        let yy = 22;
        grupos.forEach((gr, k) => { const h = Math.round(util * pesos[k] / tp), [a, b, paso] = escala(gr.xs);
          grids.push({ left: L, right: RT, top: yy, height: h }); xAxes.push(ejeX(k, k === grupos.length - 1)); yAxes.push(ejeY(k, a, b, paso));
          gr.xs.forEach(x => series.push(linea(x, k)));
          g.push({ type: "text", x: 8, y: yy - 17, style: { text: NOMG[gr.gi], fill: "#123A73", fontSize: 11.5, fontWeight: 700, fontFamily: font }, silent: true });
          if (k) g.push({ type: "line", shape: { x1: 6, y1: yy - 22, x2: W - 6, y2: yy - 22 }, style: { stroke: "#C8C6C4", lineWidth: 1 }, silent: true });
          yy += h + GAP; });
        ch.setOption({ animation: false, tooltip: { trigger: "axis", confine: true, order: "valueDesc", valueFormatter: z => pct(z) }, grid: grids, xAxis: xAxes, yAxis: yAxes, series });
        grupos.forEach((gr, k) => nombres(k, gr.xs, W - RT + 30));
        nota("Unidades agrupadas por tamaño (promedio de los últimos 6 meses); cada grupo tiene su escala, así se ven las diferencias entre unidades parecidas.");
      } else if (modo === "grilla") {
        const cols = 2, filasG = Math.ceil(grupos.length / cols), cw = (W - 16) / cols, chh = (H - 40) / filasG, RTg = 128;
        grupos.forEach((gr, k) => { const cx = 8 + (k % cols) * cw, cy = 8 + Math.floor(k / cols) * chh, [a, b, paso] = escala(gr.xs);
          grids.push({ left: cx + 44, width: cw - 44 - RTg, top: cy + 26, height: chh - 26 - 40 }); xAxes.push(ejeX(k, true, 90)); yAxes.push(ejeY(k, a, b, paso));
          gr.xs.forEach(x => series.push(linea(x, k, { fs: 8 })));
          g.push({ type: "rect", shape: { x: cx, y: cy, width: cw - 8, height: chh - 6 }, style: { fill: "none", stroke: "#DADDE5" }, silent: true });
          g.push({ type: "text", x: cx + 8, y: cy + 7, style: { text: NOMG[gr.gi], fill: "#123A73", fontSize: 11.5, fontWeight: 700, fontFamily: font }, silent: true }); });
        ch.setOption({ animation: false, tooltip: { trigger: "axis", confine: true, order: "valueDesc", valueFormatter: z => pct(z) }, grid: grids, xAxis: xAxes, yAxis: yAxes, series });
        grupos.forEach((gr, k) => nombres(k, gr.xs, 8 + (k % cols) * cw + cw - RTg + 8));
        nota("Un panel por grupo de tamaño, cada uno con su escala.");
      }
      ch.setOption({ graphic: g });
    }
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
