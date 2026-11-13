/* Componentes visuales (equivalentes a los visuales del Power BI) */
(function () {
  const U = {};
  window.U = U;
  const charts = [];
  U.disposeAll = () => { while (charts.length) { try { charts.pop().dispose(); } catch (e) {} } };
  U.resizeAll = () => charts.forEach(c => { try { c.resize(); } catch (e) {} });
  window.addEventListener("resize", () => charts.forEach(c => c.resize()));
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  U.el = el;

  U.box = function (parent, title, opt) {
    opt = opt || {};
    const v = el("section", "vis"); if (opt.id) v.id = opt.id;
    if (title) v.appendChild(el("h3", null, title));
    const b = el("div", "b"); v.appendChild(b); parent.appendChild(v);
    return b;
  };
  U.row = function (parent, cls) { const r = el("div", "row " + (cls || "")); parent.appendChild(r); return r; };
  U.chartEl = function (parent, h) { const d = el("div", "chart " + (h || "")); parent.appendChild(d); return d; };
  U.empty = (parent, msg) => parent.appendChild(el("div", "empty", msg || "Sin datos para la selección"));

  const BASE_TXT = { fontFamily: "Barlow, Arial, sans-serif", color: "#1b2333" };
  U.chart = function (d, option) {
    const c = echarts.init(d, null, { renderer: "canvas" });
    option.textStyle = Object.assign({}, BASE_TXT, option.textStyle || {});
    option.animation = false;
    if (!option.tooltip) option.tooltip = { trigger: "item", confine: true };
    c.setOption(option); charts.push(c);
    return c;
  };

  /* ---- tarjetas ---- */
  U.cards = function (parent, items) {
    const w = el("div", "cards");
    for (const it of items) {
      const k = el("div", "kpi");
      const v = el("div", "v" + (it.big ? " big" : "") + (it.cls ? " " + it.cls : ""), it.v);
      k.appendChild(v); if (it.l) k.appendChild(el("div", "l", it.l)); w.appendChild(k);
    }
    parent.appendChild(w); return w;
  };

  /* ---- barras horizontales (apiladas por serie), con etiqueta de total ---- */
  U.hbar = function (parent, cats, series, opt) {
    opt = opt || {};
    if (!cats.length) return U.empty(parent);
    const d = U.chartEl(parent, opt.h); if (opt.height) d.style.height = opt.height + "px";
    const tot = cats.map((_, i) => series.reduce((s, x) => s + (x.data[i] || 0), 0));
    const fmt = opt.fmt || (v => v);
    const ser = series.map((s, j) => ({
      name: s.name, type: "bar", stack: opt.stack === false ? undefined : "a", itemStyle: { color: s.color },
      data: opt.catColors ? s.data.map((v, i) => ({ value: v, itemStyle: { color: opt.catColors[i] } })) : s.data,
      barMaxWidth: 26,
      label: opt.inner ? { show: true, position: "inside", color: "#fff", fontSize: 10, formatter: p => opt.inner(p.value, p.dataIndex, j) } : { show: false },
      emphasis: { focus: "series" }
    }));
    if (opt.totals !== false) ser.push({
      type: "bar", stack: opt.stack === false ? undefined : "a", data: cats.map(() => 0), silent: true, itemStyle: { color: "transparent" },
      label: { show: true, position: "right", fontWeight: 600, fontSize: 11, formatter: p => fmt(opt.totalVal ? opt.totalVal[p.dataIndex] : tot[p.dataIndex]) },
      tooltip: { show: false }
    });
    U.chart(d, {
      legend: opt.legend ? { top: 0, left: 0, icon: "circle", itemWidth: 8, textStyle: { fontSize: 11 } } : undefined,
      grid: { left: 8, right: opt.right || 80, top: opt.legend ? 24 : 6, bottom: 4, containLabel: true },
      xAxis: { type: "value", show: false },
      yAxis: { type: "category", data: cats, inverse: true, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { fontWeight: 600, fontSize: 11 } },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, confine: true, valueFormatter: v => fmt(v) },
      series: ser
    });
  };

  /* ---- columnas verticales ---- */
  U.vbar = function (parent, cats, vals, opt) {
    opt = opt || {};
    if (!cats.length) return U.empty(parent);
    const d = U.chartEl(parent, opt.h); if (opt.height) d.style.height = opt.height + "px";
    U.chart(d, {
      grid: { left: 6, right: 6, top: 26, bottom: 6, containLabel: true },
      xAxis: { type: "category", data: cats, axisLabel: { interval: 0, width: opt.labelW || 90, overflow: "break", fontSize: 10.5 }, axisTick: { show: false } },
      yAxis: { type: "value", show: false },
      series: [{ type: "bar", data: vals, itemStyle: { color: opt.color || "#13306a" }, barMaxWidth: 46,
        label: { show: true, position: "top", fontSize: 10.5, fontWeight: 600, formatter: p => opt.fmt(p.value) } }],
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, confine: true, valueFormatter: v => opt.fmt(v) }
    });
  };

  /* ---- lineas con etiquetas en cada punto (estilo Power BI) ---- */
  U.line = function (parent, x, series, opt) {
    opt = opt || {};
    if (!x.length) return U.empty(parent);
    const d = U.chartEl(parent, opt.h); if (opt.height) d.style.height = opt.height + "px";
    const fmt = opt.fmt || (v => v);
    U.chart(d, {
      legend: opt.legend ? { top: 0, left: 0, icon: "circle", itemWidth: 8, textStyle: { fontSize: 11 }, type: "scroll" } : undefined,
      grid: { left: 8, right: opt.endLabels ? 120 : 24, top: opt.legend ? 30 : 14, bottom: 4, containLabel: true },
      xAxis: { type: "category", data: x, boundaryGap: false, axisLabel: { fontSize: 10.5, color: "#6a7487", hideOverlap: true }, axisTick: { show: false } },
      yAxis: { type: "value", show: !!opt.yAxis, splitLine: { lineStyle: { color: "#eef1f6" } }, axisLabel: { formatter: v => fmt(v), fontSize: 10 }, min: opt.ymin, max: opt.ymax },
      tooltip: { trigger: "axis", confine: true, valueFormatter: v => fmt(v) },
      series: series.map(s => ({
        name: s.name, type: "line", data: s.data, symbol: "circle", symbolSize: 5, connectNulls: true,
        itemStyle: { color: s.color }, lineStyle: { width: s.width || 2, color: s.color },
        label: { show: opt.labels !== false && (s.labels !== false), position: "top", fontSize: 9.5, color: "#3a4356", formatter: p => fmt(p.value),
          ...(opt.labelEvery ? { formatter: p => (p.dataIndex % opt.labelEvery === 0 || p.dataIndex === x.length - 1 ? fmt(p.value) : "") } : {}) },
        endLabel: opt.endLabels ? { show: true, formatter: s.name, color: s.color, fontWeight: 600, fontSize: 11, width: 110, overflow: "truncate" } : undefined,
        labelLayout: { hideOverlap: true }
      }))
    });
  };

  /* ---- combo columnas + linea (eje secundario) ---- */
  U.combo = function (parent, x, bar, line, opt) {
    const d = U.chartEl(parent, opt.h);
    U.chart(d, {
      legend: { top: 0, left: 0, icon: "circle", itemWidth: 8, textStyle: { fontSize: 11 } },
      grid: { left: 8, right: 8, top: 30, bottom: 4, containLabel: true },
      xAxis: { type: "category", data: x, axisTick: { show: false }, axisLabel: { fontSize: 10.5, color: "#6a7487" } },
      yAxis: [{ type: "value", show: false }, { type: "value", show: false, min: 0, max: v => v.max * 1.6 }],
      tooltip: { trigger: "axis", confine: true },
      series: [
        { name: bar.name, type: "bar", data: bar.data, itemStyle: { color: "#13306a" }, barMaxWidth: 34,
          label: { show: true, position: "top", fontSize: 9.5, formatter: p => opt.fbar(p.value) }, tooltip: { valueFormatter: v => opt.fbar(v) } },
        { name: line.name, type: "line", yAxisIndex: 1, data: line.data, symbol: "circle", symbolSize: 6, itemStyle: { color: "#3e8bd8" },
          lineStyle: { width: 2, color: "#3e8bd8" }, label: { show: true, position: "top", fontSize: 9.5, backgroundColor: "#dfeafa", padding: [1, 3], formatter: p => opt.fline(p.value) },
          tooltip: { valueFormatter: v => opt.fline(v) } }
      ]
    });
  };

  /* ---- torta / anillo ---- */
  U.pie = function (parent, items, opt) {
    opt = opt || {};
    if (!items.length) return U.empty(parent);
    const d = U.chartEl(parent, opt.h);
    const tot = items.reduce((s, x) => s + Math.max(0, x.value), 0);
    U.chart(d, {
      legend: opt.legend ? { top: 0, left: 0, icon: "circle", itemWidth: 8, textStyle: { fontSize: 11 } } : undefined,
      tooltip: { trigger: "item", confine: true, formatter: p => `${p.name}<br>${opt.fmt(p.value)} (${M.pct(p.value / tot)})` },
      series: [{ type: "pie", radius: opt.donut ? ["45%", "72%"] : ["0%", "72%"], center: ["50%", opt.legend ? "56%" : "52%"],
        data: items.map(x => ({ name: x.name, value: Math.max(0, x.value), itemStyle: x.color ? { color: x.color } : undefined })),
        label: opt.inside ? { position: "inside", color: "#fff", fontWeight: 600, formatter: p => M.pct(p.percent / 100, 2) }
          : { fontSize: 10.5, formatter: p => opt.short ? `${p.name} ${opt.fmt(p.value)} (${M.pct(p.percent / 100)})` : `${p.name}\n${opt.fmt(p.value)} (${M.pct(p.percent / 100)})` },
        labelLine: { length: 8, length2: 8 }, minShowLabelAngle: 2 }],
      color: opt.colors || ["#13306a", "#3e8bd8", "#1f6fe0", "#7fa9df", "#0b1c45", "#5d7aa7", "#9cc6f2", "#2b4d94", "#b9cbe6", "#4a64a8"]
    });
  };

  /* ---- dispersion con burbujas ---- */
  U.scatter = function (parent, pts, opt) {
    if (!pts.length) return U.empty(parent);
    const d = U.chartEl(parent, opt.h || "tall");
    const maxS = Math.max(...pts.map(p => Math.abs(p.size || 1))) || 1;
    const groups = opt.groupBy ? [...new Set(pts.map(p => p.group))] : ["_"];
    const palette = opt.colors || ["#13306a", "#3e8bd8", "#d06666", "#e0a03a", "#5aa469", "#8e6cc9", "#4bb4c4", "#a07850", "#c86fa0", "#6b7a99", "#2f80ed", "#9ab85b"];
    U.chart(d, {
      legend: opt.groupBy ? { top: 0, left: 0, icon: "circle", itemWidth: 8, textStyle: { fontSize: 11 } } : undefined,
      grid: { left: 10, right: 30, top: opt.groupBy ? 30 : 16, bottom: 10, containLabel: true },
      xAxis: { type: "value", name: opt.xname, nameLocation: "middle", nameGap: 26, nameTextStyle: { fontWeight: 600 }, scale: true,
        axisLabel: { formatter: v => opt.fx(v), fontSize: 10 }, splitLine: { lineStyle: { color: "#dde3ee", type: "dashed" } } },
      yAxis: { type: "value", name: opt.yname, nameLocation: "middle", nameGap: 48, nameTextStyle: { fontWeight: 600 }, scale: true,
        axisLabel: { formatter: v => opt.fy(v), fontSize: 10 }, splitLine: { lineStyle: { color: "#dde3ee", type: "dashed" } } },
      tooltip: { trigger: "item", confine: true, formatter: p => `<b>${p.data.name}</b><br>${opt.xname}: ${opt.fx(p.data.value[0])}<br>${opt.yname}: ${opt.fy(p.data.value[1])}` + (opt.fs ? `<br>${opt.sname}: ${opt.fs(p.data.size)}` : "") },
      series: groups.map((g, i) => ({
        name: g, type: "scatter",
        data: pts.filter(p => !opt.groupBy || p.group === g).map(p => ({ name: p.name, value: [p.x, p.y], size: p.size, itemStyle: { color: p.color || palette[i % palette.length], opacity: .85 } })),
        symbolSize: v => 8 + 42 * Math.sqrt(Math.abs((v && v.size) || 0) / maxS),
        label: { show: true, position: "bottom", fontSize: 9.5, fontWeight: 600, formatter: p => p.data.name }, labelLayout: { hideOverlap: true }
      })).map((s, i, arr) => { s.symbolSize = (val, p) => 8 + 42 * Math.sqrt(Math.abs(p.data.size || 0) / maxS); return s; })
    });
  };

  /* ---- tabla ordenable (tableEx / matriz) ---- */
  U.table = function (parent, cols, rows, opt) {
    opt = opt || {};
    const wrap = el("div", "tw"); if (opt.maxh) wrap.style.maxHeight = opt.maxh + "px";
    const t = el("table", "t"); const th = el("thead"); const tr = el("tr");
    let sortK = opt.sort || null, dir = opt.dir || -1;
    cols.forEach(c => { const h = el("th", c.l ? "l" : "", c.h); h.addEventListener("click", () => { if (sortK === c.k) dir = -dir; else { sortK = c.k; dir = c.l ? 1 : -1; } body(); }); tr.appendChild(h); });
    th.appendChild(tr); t.appendChild(th);
    const tb = el("tbody"); t.appendChild(tb);
    function body() {
      const rs = [...rows];
      if (sortK) rs.sort((a, b) => { const x = a[sortK], y = b[sortK]; if (typeof x === "string") return dir * String(x).localeCompare(String(y), "es"); return dir * ((x ?? -Infinity) - (y ?? -Infinity)); });
      tb.replaceChildren(...rs.map(r => {
        const tr = el("tr", r._hl ? "hl" : "");
        cols.forEach(c => { const td = el("td", c.l ? "l" : "", c.f ? c.f(r[c.k], r) : r[c.k]); if (c.cls) td.className += " " + (c.cls(r[c.k], r) || ""); if (c.bg) { const bg = c.bg(r[c.k], r); if (bg) td.style.background = bg; } tr.appendChild(td); });
        return tr;
      }));
      if (opt.total) { const tr = el("tr", "tot"); cols.forEach((c, i) => tr.appendChild(el("td", c.l ? "l" : "", i === 0 ? "Total" : (opt.total[c.k] != null ? (c.f ? c.f(opt.total[c.k], opt.total) : opt.total[c.k]) : "")))); tb.appendChild(tr); }
    }
    body(); wrap.appendChild(t); parent.appendChild(wrap); return wrap;
  };

  /* ---- segmentadores ---- */
  // lista de meses (Calendario[AñoMes]) con seleccion multiple; sel = Set de mi | null (todos)
  U.monthSlicer = function (parent, st, key, onChange, opt) {
    opt = opt || {};
    const box = el("div", "slicer"); box.appendChild(el("h4", null, opt.title || "Fecha"));
    const acts = el("div", "acts");
    const all = el("button", null, "Seleccionar todo"), last = el("button", null, "Último mes");
    acts.append(all, last); box.appendChild(acts);
    const list = el("div", "opts");
    const desde = opt.desde != null ? opt.desde : 0;
    for (let mi = M.lastMi; mi >= desde; mi--) {
      const lab = el("label"); const cb = el("input"); cb.type = opt.single ? "radio" : "checkbox"; cb.name = key + "_r";
      cb.checked = st[key] ? st[key].has(mi) : !opt.single || mi === M.lastMi; cb.value = mi;
      cb.addEventListener("change", () => {
        const sel = new Set([...list.querySelectorAll("input")].filter(x => x.checked).map(x => +x.value));
        st[key] = sel.size === (M.lastMi - desde + 1) ? null : sel; onChange();
      });
      lab.append(cb, document.createTextNode(M.mesLabel(mi, true))); list.appendChild(lab);
    }
    all.addEventListener("click", () => { st[key] = null; onChange(true); });
    last.addEventListener("click", () => { st[key] = new Set([M.lastMi]); onChange(true); });
    box.appendChild(list); parent.appendChild(box); return box;
  };
  // botones (segmentador avanzado del Power BI): sel = Set | null (todas)
  U.buttons = function (parent, values, st, key, onChange, opt) {
    opt = opt || {};
    const bar = el("div", "btnbar");
    values.forEach(v => {
      const b = el("button", null, v); b.type = "button";
      b.setAttribute("aria-pressed", String(!!(st[key] && st[key].has(v))));
      b.addEventListener("click", () => {
        let s = st[key] ? new Set(st[key]) : new Set();
        if (opt.single) s = s.has(v) ? new Set() : new Set([v]); else s.has(v) ? s.delete(v) : s.add(v);
        st[key] = s.size ? s : null; onChange(true);
      });
      bar.appendChild(b);
    });
    parent.appendChild(bar); return bar;
  };
  // lista con busqueda (Gerente / Fondo)
  U.listSlicer = function (parent, title, values, st, key, onChange, opt) {
    opt = opt || {};
    const box = el("div", "slicer"); box.appendChild(el("h4", null, title));
    const q = el("input"); q.type = "search"; q.placeholder = "Buscar"; q.setAttribute("aria-label", "Buscar " + title.toLowerCase()); box.appendChild(q);
    const acts = el("div", "acts"); const all = el("button", null, opt.single ? "Quitar selección" : "Seleccionar todo"); acts.appendChild(all); box.appendChild(acts);
    const list = el("div", "opts"); box.appendChild(list);
    function draw() {
      const f = q.value.trim().toLowerCase();
      list.replaceChildren(...values.filter(v => !f || v.toLowerCase().includes(f)).map(v => {
        const lab = el("label"); const cb = el("input"); cb.type = "checkbox"; cb.checked = !!(st[key] && st[key].has(v));
        cb.addEventListener("change", () => { let s = st[key] ? new Set(st[key]) : new Set(); if (opt.single) s = new Set(); cb.checked ? s.add(v) : s.delete(v); st[key] = s.size ? s : null; onChange(true); });
        lab.append(cb, document.createTextNode(v)); return lab;
      }));
    }
    q.addEventListener("input", draw); all.addEventListener("click", () => { st[key] = null; onChange(true); });
    draw(); parent.appendChild(box); return box;
  };
  U.legendTipo = function (parent) {
    const l = el("div", "legend");
    [["Bancarias", M.COL.banc], ["Independientes", M.COL.ind]].forEach(([n, c]) => { const s = el("span"); const i = el("i"); i.style.background = c; s.append(i, document.createTextNode(n)); l.appendChild(s); });
    parent.appendChild(l);
  };
  U.note = (parent, txt) => parent.appendChild(el("p", "note", txt));
})();
