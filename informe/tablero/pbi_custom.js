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
})();
