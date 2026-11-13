/* Paginas con bases internas de Balanz: facturacion (comisiones), tipo de inversor y compraventa con contrapartes */
(function () {
  const P = window.P, def = p => P.pages.push(p);
  const PAL = ["#13306a", "#2f80ed", "#3e8bd8", "#7fa9df", "#0b1c45", "#5d7aa7", "#9cc6f2", "#1d4fa3", "#b9cbe6", "#4a64a8", "#d06666", "#5aa469", "#e0a03a", "#8e6cc9", "#4bb4c4", "#a07850"];
  const mesLbl = s => { const [y, m] = s.split("-").map(Number); return ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][m - 1] + " " + y; };
  const mesLargo = s => { const [y, m] = s.split("-").map(Number); return ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"][m - 1] + " de " + y; };
  const sinDatos = (content, que) => U.empty(content, `No hay datos de ${que}: la actualización semanal los toma de la carpeta "FCI - PBI - Fondos" de tu OneDrive.`);
  const eom = (s, k) => { const [y, m] = s.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + k + 1, 0)); return d.toISOString().slice(0, 10); };

  // segmentador de meses para las tablas internas (fechas fin de mes)
  function mesesSlicer(side, st, key, meses, rf, opt) {
    opt = opt || {};
    const box = U.el("div", "slicer"); box.appendChild(U.el("h4", null, opt.title || "Fecha"));
    const acts = U.el("div", "acts"); const all = U.el("button", null, "Seleccionar todo"); acts.appendChild(all); box.appendChild(acts);
    const list = U.el("div", "opts");
    [...meses].sort().reverse().forEach(m => {
      const lab = U.el("label"); const cb = U.el("input"); cb.type = opt.single ? "radio" : "checkbox"; cb.name = key + "_r";
      cb.checked = st[key] ? st[key].has(m) : !opt.single || m === meses[meses.length - 1];
      cb.addEventListener("change", () => { const s = new Set([...list.querySelectorAll("input")].filter(x => x.checked).map(x => x.dataset.m)); st[key] = s.size === meses.length ? null : s; rf(); });
      cb.dataset.m = m; lab.append(cb, document.createTextNode(mesLargo(m))); list.appendChild(lab);
    });
    all.addEventListener("click", () => { st[key] = null; rf(true); });
    box.appendChild(list); side.appendChild(box);
  }
  const datos = k => (M.I && M.I[k]) || [];
  const meses = (rows) => [...new Set(rows.map(r => r.mes))].sort();
  const maxSel = (st, key, ms) => (st[key] && st[key].size ? [...st[key]].sort().pop() : ms[ms.length - 1]);

  // medidas de comisiones (DAX): mes maximo, PM, PY, YTD, YTD PY, explicacion
  function medidas(rows, dim, fin) {
    const s = (filt) => { const m = new Map(); for (const r of rows) if (filt(r)) m.set(r[dim], (m.get(r[dim]) || 0) + r.comisiones); return m; };
    const y = fin.slice(0, 4), pm = eom(fin, -1), py = eom(fin, -12), ypy = py.slice(0, 4);
    const cur = s(r => r.mes === fin), ant = s(r => r.mes === pm), pya = s(r => r.mes === py);
    const ytd = s(r => r.mes.slice(0, 4) === y && r.mes <= fin), ytdpy = s(r => r.mes.slice(0, 4) === ypy && r.mes <= py);
    const keys = [...new Set(rows.map(r => r[dim]))];
    const tot = m => [...m.values()].reduce((a, b) => a + b, 0);
    const T = { cur: tot(cur), ant: tot(ant), py: tot(pya), ytd: tot(ytd), ytdpy: tot(ytdpy) };
    const fila = k => {
      const c = cur.get(k) || 0, a = ant.get(k) || 0, p = pya.get(k) || 0, Y = ytd.get(k) || 0, YP = ytdpy.get(k) || 0;
      return { k, ytd: Y, sytd: M.div(Y, T.ytd), cur: c, scur: M.div(c, T.cur), pmm: M.div(c - a, a), dmm: c - a, pyy: M.div(c - p, p), dyy: c - p, pytd: M.div(Y - YP, YP), dytd: Y - YP,
        emm: M.div(c - a, T.cur - T.ant), eyy: M.div(c - p, T.cur - T.py), eytd: M.div(Y - YP, T.ytd - T.ytdpy) };
    };
    return { filas: keys.map(fila).filter(f => f.ytd || f.cur), T, total: { ytd: T.ytd, sytd: 1, cur: T.cur, scur: 1, pmm: M.div(T.cur - T.ant, T.ant), dmm: T.cur - T.ant, pyy: M.div(T.cur - T.py, T.py), dyy: T.cur - T.py, pytd: M.div(T.ytd - T.ytdpy, T.ytdpy), dytd: T.ytd - T.ytdpy, emm: 1, eyy: 1, eytd: 1 } };
  }
  function tablaComisiones(content, rows, dim, fin, titulo, nombre) {
    const md = medidas(rows, dim, fin), u = v => M.usd(v), p = v => M.pct(v);
    U.table(U.box(content, titulo), [{ k: "k", h: nombre, l: 1 }, { k: "ytd", h: "Fact. YTD", f: u }, { k: "sytd", h: "Share YTD", f: p }, { k: "cur", h: "Fact. Mes Act.", f: u }, { k: "scur", h: "Share Mes Act.", f: p },
      { k: "pmm", h: "% m/m", f: p, cls: M.cls }, { k: "dmm", h: "$ m/m", f: u, cls: M.cls }, { k: "pyy", h: "% y/y", f: p, cls: M.cls }, { k: "dyy", h: "$ y/y", f: u, cls: M.cls },
      { k: "pytd", h: "% YTD", f: p, cls: M.cls }, { k: "dytd", h: "$ YTD", f: u, cls: M.cls }, { k: "emm", h: "% Explicación m/m", f: p }, { k: "eyy", h: "% Explicación y/y", f: p }, { k: "eytd", h: "% Explicación YTD", f: p }],
    md.filas, { sort: "ytd", total: md.total, maxh: 640 });
  }
  // participacion de cada unidad/fondo en el total del mes
  function shareLines(content, rows, dim, ms, keys, title, h) {
    const tot = M.sumBy(rows, r => r.mes, r => r.comisiones), by = M.sumBy(rows, r => r[dim] + "|" + r.mes, r => r.comisiones);
    U.line(U.box(content, title), ms.map(mesLbl), keys.map((k, i) => ({ name: k, color: PAL[i % PAL.length], data: ms.map(m => M.div(by.get(k + "|" + m) || 0, tot.get(m))) })),
      { fmt: v => M.pct(v), endLabels: true, labels: false, yAxis: true, h: h || "tall" });
  }
  const topKeys = (rows, dim, n) => [...M.sumBy(rows, r => r[dim], r => r.comisiones).entries()].sort((a, b) => b[1] - a[1]).slice(0, n || 99).map(x => x[0]);

  def({ id: "fi-total", group: "Facturación interna", name: "Facturación Interna - Evolutivo Total", render(st, side, content) {
    const s = datos("serie_facturacion"); if (!s.length) return sinDatos(content, "la serie de facturación");
    U.line(U.box(content, "Evolutivo Facturación Fondos Balanz"), s.map(x => mesLbl(x.fecha)), [{ name: "Facturación", color: "#13306a", data: s.map(x => x.facturacion) }], { fmt: v => M.mill(v), h: "xtall", labelEvery: 2 });
  } });

  def({ id: "fi-un", group: "Facturación interna", name: "Facturación Interna - Evolutivo UN", render(st, side, content, rf) {
    const c = datos("comisiones"); if (!c.length) return sinDatos(content, "comisiones");
    const ms = meses(c); mesesSlicer(side, st, "im", ms, rf);
    const sel = st.im ? ms.filter(m => st.im.has(m)) : ms, fin = maxSel(st, "im", ms), md = medidas(c, "unidad", fin);
    const r = U.row(content, "r2");
    U.cards(U.box(r, "Facturación del Mes (USD)"), [{ v: M.mill(md.T.cur), l: "Facturación" }, { v: M.pct(md.total.pmm), l: "% m/m", cls: M.cls(md.total.pmm) }, { v: M.pct(md.total.pyy), l: "% y/y", cls: M.cls(md.total.pyy) }]);
    U.cards(U.box(r, "Facturación del Año (USD)"), [{ v: M.mill(md.T.ytd), l: "Facturación" }, { v: M.pct(md.total.pytd), l: "% vs mismo período año ant.", cls: M.cls(md.total.pytd) }]);
    const rs = c.filter(x => sel.includes(x.mes));
    shareLines(content, rs, "unidad", sel, ["IFA", "Corporate"], "Evolutivo Facturación por Unidad de Negocio", "short");
    shareLines(content, rs.filter(x => x.unidad !== "IFA" && x.unidad !== "Corporate"), "unidad", sel, topKeys(rs.filter(x => x.unidad !== "IFA" && x.unidad !== "Corporate"), "unidad", 16), "Composición de Facturación YTD");
  } });

  def({ id: "fi-2", group: "Facturación interna", name: "Facturación Interna 2", init: st => { st.im = null; }, render(st, side, content, rf) {
    const c = datos("comisiones"); if (!c.length) return sinDatos(content, "comisiones");
    const ms = meses(c); mesesSlicer(side, st, "im", ms, rf);
    U.listSlicer(side, "Unidad de Negocio", [...new Set(c.map(x => x.unidad))].sort(), st, "un", rf);
    const sel = st.im ? ms.filter(m => st.im.has(m)) : ms.filter(m => m >= "2025-03");
    shareLines(content, c.filter(x => sel.includes(x.mes)), "unidad", sel, st.un ? [...st.un] : topKeys(c, "unidad", 22), "Evolutivo Facturación por Unidad de Negocio", "xtall");
  } });

  def({ id: "fi-3", group: "Facturación interna", name: "Facturación interna 3", render(st, side, content, rf) {
    const c = datos("comisiones").filter(x => x.unidad !== "Advisory" && x.unidad !== "Investment Ideas"); if (!c.length) return sinDatos(content, "comisiones");
    const ms = meses(c); mesesSlicer(side, st, "im", ms, rf, { single: true });
    tablaComisiones(content, c, "unidad", maxSel(st, "im", ms), "Facturación por Unidad de Negocio (USD)", "Unidad de Negocio");
  } });

  def({ id: "fi-largo", group: "Facturación interna", name: "Evolutivo Largo Facturación", render(st, side, content, rf) {
    const c = datos("comisiones"); if (!c.length) return sinDatos(content, "comisiones");
    const ms = meses(c); mesesSlicer(side, st, "im", ms, rf);
    const sel = st.im ? ms.filter(m => st.im.has(m)) : ms, by = M.sumBy(c, x => x.mes, x => x.comisiones);
    U.line(U.box(content, "Evolutivo Facturación Total"), sel.map(mesLbl), [{ name: "Facturación", color: "#13306a", data: sel.map(m => by.get(m) || 0) }], { fmt: v => M.mill(v), h: "xtall" });
  } });

  function torta(st, side, content, rf, k, dim, titulo, ytd) {
    const c = datos(k); if (!c.length) return sinDatos(content, "comisiones");
    const ms = meses(c); mesesSlicer(side, st, "im", ms, rf);
    const fin = maxSel(st, "im", ms);
    const rows = ytd ? c.filter(x => x.mes.slice(0, 4) === fin.slice(0, 4) && x.mes <= fin) : c.filter(x => (st.im ? st.im.has(x.mes) : x.mes.slice(0, 4) === ms[ms.length - 1].slice(0, 4)));
    const by = [...M.sumBy(rows, x => x[dim], x => x.comisiones).entries()].sort((a, b) => b[1] - a[1]);
    U.pie(U.box(content, titulo), by.map(([n, v]) => ({ name: n, value: v })), { donut: true, fmt: v => M.mill(v), h: "xtall", colors: PAL, short: true });
  }
  def({ id: "fi-torta", group: "Facturación interna", name: "Facturación Interna - Torta", render: (st, s, c, rf) => torta(st, s, c, rf, "comisiones", "unidad", "Composición de Facturación " + (M.I.comisiones ? meses(M.I.comisiones).pop().slice(0, 4) : "") + " (en USD)", true) });
  def({ id: "ff-torta", group: "Facturación interna", name: "Facturación x Fondo - Torta", render: (st, s, c, rf) => torta(st, s, c, rf, "comisiones_fondo", "fondo", "Composición de Facturación por Fondo (en USD)", false) });

  def({ id: "ff-evol", group: "Facturación interna", name: "Facturación x Fondo - Evolutivo", render(st, side, content, rf) {
    const c = datos("comisiones_fondo"); if (!c.length) return sinDatos(content, "comisiones por fondo");
    const ms = meses(c); mesesSlicer(side, st, "im", ms, rf);
    const sel = st.im ? ms.filter(m => st.im.has(m)) : ms, by = M.sumBy(c, x => x.fondo + "|" + x.mes, x => x.comisiones), keys = topKeys(c, "fondo", 20);
    U.line(U.box(content, "Evolutivo de Facturación por Fondo (en términos nominales)"), sel.map(mesLbl), keys.map((k, i) => ({ name: k, color: PAL[i % PAL.length], data: sel.map(m => by.get(k + "|" + m) || 0) })),
      { fmt: v => M.mill(v), endLabels: true, labels: false, yAxis: true, h: "xtall" });
  } });

  def({ id: "ff-3", group: "Facturación interna", name: "Facturación x Fondo 3", render(st, side, content, rf) {
    const c = datos("comisiones_fondo"); if (!c.length) return sinDatos(content, "comisiones por fondo");
    const ms = meses(c); mesesSlicer(side, st, "im", ms, rf, { single: true });
    tablaComisiones(content, c, "fondo", maxSel(st, "im", ms), "Facturación por Fondo (USD)", "Fondo");
  } });

  def({ id: "ff-4", group: "Facturación interna", name: "Facturación x Fondo 4", render(st, side, content, rf) {
    const c = datos("comisiones_fondo"); if (!c.length) return sinDatos(content, "comisiones por fondo");
    const ms = meses(c); mesesSlicer(side, st, "im", ms, rf);
    U.listSlicer(side, "Fondo", [...new Set(c.map(x => x.fondo))].sort(), st, "ff", rf);
    const sel = st.im ? ms.filter(m => st.im.has(m)) : ms;
    shareLines(content, c.filter(x => sel.includes(x.mes)), "fondo", sel, st.ff ? [...st.ff] : topKeys(c, "fondo", 20), "Evolutivo de Share de Facturación por Fondo", "xtall");
  } });

  def({ id: "fi-tabla-share", group: "Facturación interna", name: "Tabla Share Fact. x Unidad Negocio", render(st, side, content, rf) {
    const c = datos("comisiones"); if (!c.length) return sinDatos(content, "comisiones");
    const tot = M.sumBy(c, x => x.mes, x => x.comisiones);
    const rows = c.map(x => ({ mes: x.mes, ml: mesLargo(x.mes), u: x.unidad, s: M.div(x.comisiones, tot.get(x.mes)) })).sort((a, b) => b.mes.localeCompare(a.mes) || a.u.localeCompare(b.u));
    U.table(U.box(content, "Composición de Facturación YTD"), [{ k: "ml", h: "Mes", l: 1 }, { k: "u", h: "Unidad de Negocio", l: 1 }, { k: "s", h: "Share Fact.", f: v => M.pct(v, 2) }], rows, { maxh: 700 });
  } });

  def({ id: "tipo-inversor", group: "Tipo de inversor", name: "Tipo de Inversor - AUM x Fondo (tabla ppt)", render(st, side, content) {
    const d = M.I.cuotapartistas; if (!d || !d.filas || !d.filas.length) return sinDatos(content, "posición de cuotapartistas");
    const f = d.filas.filter(x => x.Fondo !== "MELIFCIC"), tipos = ["ACDIs", "Corporativos", "Institucionales", "P. Humanas", "PyMEs"];
    const by = new Map(); for (const x of f) { const o = by.get(x.Fondo) || { k: x.Fondo, tot: 0 }; o[x.categoria_tipo_inversor] = (o[x.categoria_tipo_inversor] || 0) + x.importe_usd_mill; o.tot += x.importe_usd_mill; by.set(x.Fondo, o); }
    const rows = [...by.values()].map(o => { tipos.forEach(t => { o[t + "_p"] = M.div(o[t] || 0, o.tot); }); return o; });
    const T = { tot: rows.reduce((s, o) => s + o.tot, 0) }; tipos.forEach(t => { T[t] = rows.reduce((s, o) => s + (o[t] || 0), 0); T[t + "_p"] = T[t] / T.tot; });
    const cols = [{ k: "k", h: "Fondo", l: 1 }];
    tipos.forEach(t => cols.push({ k: t, h: t + " AUM (mill. USD)", f: v => (v ? "$ " + M.num(v, 1) : "") }, { k: t + "_p", h: "% del Total", f: v => (v ? M.pct(v, 2) : "") }));
    cols.push({ k: "tot", h: "Total AUM (mill. USD)", f: v => "$ " + M.num(v, 1) });
    U.table(U.box(content, "AUM por Fondo y Tipo de Inversor"), cols, rows, { sort: "tot", total: T, maxh: 700 });
    U.note(content, `Fuente: ${d.archivo || "posición de cuotapartistas"}. Pesos convertidos a 1.535, como el Power BI.`);
  } });

  // compraventa con contrapartes (sin FCI ni suscripciones/rescates, como los filtros del Power BI)
  const cv = () => datos("contrapartes").filter(x => x.categoria_pase !== "FCI" && x.tipo_op !== "Suscripcion Compra" && x.tipo_op !== "Suscripcion Venta");
  def({ id: "cv-montos", group: "Contrapartes", name: "Compraventa a Contrapartes: Montos", render(st, side, content) {
    const d = cv(); if (!d.length) return sinDatos(content, "compraventa con contrapartes");
    const cats = [...new Set(d.map(x => x.categoria_pase))].sort(), trims = [...new Set(d.map(x => x.anio + " " + x.trimestre))].sort();
    const by = new Map(); for (const x of d) { const o = by.get(x.agente_norm) || { k: x.agente_norm, tot: 0 }; o[x.categoria_pase] = (o[x.categoria_pase] || 0) + x.monto_usd_mill; o.tot += x.monto_usd_mill; by.set(x.agente_norm, o); }
    const T = { tot: d.reduce((s, x) => s + x.monto_usd_mill, 0) }; cats.forEach(c => T[c] = d.filter(x => x.categoria_pase === c).reduce((s, x) => s + x.monto_usd_mill, 0));
    U.note(content, "Montos en millones de USD, los $ dolarizados a 1400. Trimestres: " + trims.join(", "));
    const r = U.row(content, "r2");
    U.table(U.box(r, "Monto operado por Agente y Categoría"), [{ k: "k", h: "Agente", l: 1 }, ...cats.map(c => ({ k: c, h: c, f: v => (v ? "$ " + M.num(v, 1) : "") })), { k: "tot", h: "Total", f: v => "$ " + M.num(v, 1) }], [...by.values()], { sort: "tot", total: T, maxh: 700 });
    const bt = new Map(); for (const x of d) { const o = bt.get(x.agente_norm) || { k: x.agente_norm, tot: 0 }; const q = x.anio + " " + x.trimestre; o[q] = (o[q] || 0) + x.monto_usd_mill; o.tot += x.monto_usd_mill; bt.set(x.agente_norm, o); }
    U.table(U.box(r, "Totales"), [{ k: "k", h: "Agente", l: 1 }, ...trims.map(q => ({ k: q, h: q, f: v => (v ? "$ " + M.num(v, 1) : "") })), { k: "tot", h: "Total", f: v => "$ " + M.num(v, 1) }], [...bt.values()], { sort: "tot", total: { tot: T.tot }, maxh: 700 });
  } });
  def({ id: "cv-pct", group: "Contrapartes", name: "Compraventa a Contrapartes: %", render(st, side, content) {
    const d = cv(); if (!d.length) return sinDatos(content, "compraventa con contrapartes");
    const cats = [...new Set(d.map(x => x.categoria_pase))].sort();
    const tc = {}; cats.forEach(c => tc[c] = d.filter(x => x.categoria_pase === c).reduce((s, x) => s + x.monto_usd_mill, 0));
    const by = new Map(); for (const x of d) { const o = by.get(x.agente) || { k: x.agente }; o[x.categoria_pase] = (o[x.categoria_pase] || 0) + x.monto_usd_mill / tc[x.categoria_pase]; by.set(x.agente, o); }
    const T = {}; cats.forEach(c => T[c] = 1);
    const tot = Object.values(tc).reduce((a, b) => a + b, 0);
    U.cards(U.box(content, "Monto operado por Categoría (mill. USD)"), cats.map(c => ({ v: "$ " + M.num(tc[c], 1), l: c + " · " + M.pct(tc[c] / tot) })));
    U.table(U.box(content, "Participación de cada Agente en la Categoría"), [{ k: "k", h: "Agente", l: 1 }, ...cats.map(c => ({ k: c, h: c, f: v => (v ? M.pct(v, 2) : "") }))], [...by.values()], { sort: "k", dir: 1, total: T, maxh: 700 });
  } });
  def({ id: "cv-tabla", group: "Contrapartes", name: "Compraventa a Contrapartes: Tabla Completa", render(st, side, content) {
    const d = cv(); if (!d.length) return sinDatos(content, "compraventa con contrapartes");
    U.table(U.box(content, "Operaciones"), [{ k: "fondo", h: "Fondo", l: 1 }, { k: "op", h: "Operación_Numero" }, { k: "tipo_op", h: "Tipo_Operación", l: 1 }, { k: "especie", h: "Especie", l: 1 }, { k: "ticker", h: "Ticker", l: 1 },
      { k: "fecha_txt", h: "Fecha_Concertacion", l: 1 }, { k: "categoria_pase", h: "Categoría", l: 1 }, { k: "vn", h: "Valor Nominal", f: v => M.num(v, 2) }, { k: "moneda", h: "Moneda", l: 1 },
      { k: "bruto", h: "Bruto_Concertación", f: v => M.num(v, 2) }, { k: "gastos", h: "Gastos", f: v => M.num(v, 2) }, { k: "neto", h: "Neto", f: v => M.num(v, 2) }, { k: "agente", h: "Agente", l: 1 }], d, { sort: "fondo", dir: 1, maxh: 720 });
  } });
})();
