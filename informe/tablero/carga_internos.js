/* Datos internos de Balanz cargados a mano desde el tablero (facturación y AUM interno).
   Matías baja los archivos del Power BI (o corre las consultas DAX) y los sube acá; el tablero los procesa en el navegador,
   los guarda en la base del artifact (colección "cargas", un documento por tipo y mes) y los usa enseguida.
   La tarea mensual del comité lee la misma colección (db_list "cargas") y convierte los datos con informe/cargas_a_archivos.py.
   Si un mes está en la carga manual y en los archivos de la carpeta, gana la carga manual. */
(function () {
  const P = window.P;
  const XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";

  // mismas equivalencias que internos.py (columnas calculadas del Power BI)
  const UNIDAD = {"Corporate": "Corporate", "Externos": "Externos", "IFA": "IFA", "Individuos": "Individuos", "IR": "IR", "BLNZ": "Otros",
    "Canales": "Canales", "Banca Privada": "Banca Privada", "Sector Público": "Sector Público", "University Inversiones": "Academy Inversiones",
    "Academy Inversiones": "Academy Inversiones", "Advisory": "Advisory", "Sales & Trading": "Sales & Trading", "Private Wealth": "Private Wealth",
    "Wealth Management": "Wealth Management", "Productores Exclusivos": "Productores Exclusivos", "Productores": "Productores Exclusivos",
    "Banca de Inversión": "Banca de Inversión", "WM UY": "WM UY", "Inst.": "Institucionales", "Institucionales": "Institucionales",
    "Inst. No Reg": "Institucionales No Regulados", "Inst. No Reg 2": "Institucionales No Regulados2", "Mesa Sales & Trading": "Sales & Trading",
    "WM": "Wealth Management", "PyME": "Pyme", "Pyme": "Pyme", "Prod Exc": "Productores Exclusivos", "IB-Banca de Inversión": "Banca de Inversión",
    "IB - Banca de Inversión": "Banca de Inversión", "Wealth Management Uruguay": "WM UY", "Auditoria Interna": "Otros"};
  const FONDO_CORR = {"Institucional (IL)": "Inflation linked", "Retorno Total": "Renta Mixta", "Performance II": "Lecaps", "Performance XIV": "Crédito Privado"};

  const TIPOS = {
    com_unidad: { nombre: "Facturación por unidad de negocio", cols: ["unidad", "comisiones"], unidad: "USD" },
    com_fondo: { nombre: "Facturación por fondo", cols: ["fondo", "comisiones"], unidad: "USD" },
    aum_unidad: { nombre: "AUM interno por unidad (DAX 1)", cols: ["unidad", "aum_orig", "ten", "fact", "flujo"], unidad: "USD" },
    aum_unidad_fondo: { nombre: "AUM interno por unidad y fondo (DAX 2)", cols: ["unidad", "fondo", "aum", "fact", "flujo"], unidad: "USD" },
    clientes: { nombre: "Clientes: top facturación y ACDIs (DAX 3)", cols: ["nombre", "unidad", "aum", "fact", "flujo"], unidad: "USD" },
    inversores: { nombre: "Inversores por tipo y fondo (DAX 4)", cols: ["categoria", "tipopersona", "fondo", "aum", "n"], unidad: "" }
  };
  const ORDEN = Object.keys(TIPOS);
  const MESES_EN = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    ene: 1, abr: 4, ago: 8, dic: 12 };

  const limpio = s => String(s == null ? "" : s).replace(/ /g, " ").trim();
  const num = v => { if (v == null || v === "") return 0; if (typeof v === "number") return v;
    const s = String(v).trim(); const x = Number(s.includes(",") && !s.includes(".") ? s.replace(",", ".") : s.replace(/,/g, "")); return isFinite(x) ? x : 0; };
  const pad = n => String(n).padStart(2, "0");
  const finMes = (y, m) => `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
  function aMes(v) {           // cualquier fecha → "AAAA-MM"
    if (v instanceof Date && !isNaN(v)) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}`;
    if (typeof v === "number" && v > 20000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + v * 864e5); return aMes(d); }
    const s = limpio(v); let m;
    if ((m = s.match(/^(\d{4})-(\d{2})/))) return `${m[1]}-${m[2]}`;
    if ((m = s.match(/^([A-Za-zé]{3})[a-z]*-(\d{2})$/))) { const mm = MESES_EN[m[1].toLowerCase()]; if (mm) return `20${m[2]}-${pad(mm)}`; }
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return `${m[3]}-${pad(+m[2])}`;   // dd/mm/aaaa
    const d = new Date(s); if (!isNaN(d)) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    return null;
  }

  let xlsxP = null;
  const xlsx = () => xlsxP || (xlsxP = new Promise((ok, mal) => { if (window.XLSX) return ok(window.XLSX);
    const s = document.createElement("script"); s.src = XLSX_URL; s.onload = () => ok(window.XLSX); s.onerror = () => mal(new Error("no se pudo cargar el lector de Excel")); document.head.appendChild(s); }));

  async function leerTabla(file) {      // → matriz de celdas (array de filas)
    const nom = file.name.toLowerCase();
    if (/\.(xlsx|xlsm|xls)$/.test(nom)) {
      const X = await xlsx(); const wb = X.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      return X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
    }
    return textoATabla(await file.text());
  }
  function textoATabla(t) {
    const lineas = t.replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim() !== "");
    const sep = lineas[0].includes("\t") ? "\t" : (lineas[0].split(";").length > lineas[0].split(",").length ? ";" : ",");
    return lineas.map(l => l.split(sep).map(c => c.replace(/^"|"$/g, "")));
  }
  const colNom = c => { const s = limpio(c); const m = s.match(/\[([^\]]+)\]/g); return m ? m[m.length - 1].slice(1, -1) : s; };

  /* ---- detección y normalización: devuelve {tipo, meses: {AAAA-MM: [[...], ...]}, aviso} ---- */
  function procesar(tab, forzar) {
    const h0 = limpio(tab[0] && tab[0][0]);
    // 1) matriz del Power BI "Rporte de Comision por Fondos v2" (Datos con diseño actual): meses en filas
    if ((h0 === "Unidad Negocio" || h0 === "Fondos") && limpio(tab[1] && tab[1][0]) === "AnoMesCorto") {
      const tipo = forzar || (h0 === "Fondos" ? "com_fondo" : "com_unidad"), nombres = tab[0].slice(1).map(limpio), meses = {};
      for (let i = 2; i < tab.length; i++) {
        const lab = limpio(tab[i][0]); if (!lab || lab === "Total" || lab.startsWith("Filtros")) continue;
        const mes = aMes(lab); if (!mes) continue;
        nombres.forEach((n, j) => { const v = tab[i][j + 1]; if (!n || n === "Total" || v == null || v === "") return; (meses[mes] = meses[mes] || []).push([n, num(v)]); });
      }
      return finCom(tipo, meses);
    }
    const cols = (tab[0] || []).map(colNom), idx = n => cols.indexOf(n);
    // 2) formato mensual de las carpetas (AnoMesCorto, FechaFinMes, Unidad Negocio, ComisionYTM)
    if (idx("FechaFinMes") >= 0 && idx("Unidad Negocio") >= 0 && idx("ComisionYTM") >= 0) {
      const meses = {}, nombres = new Set();
      for (const r of tab.slice(1)) { const mes = aMes(r[idx("FechaFinMes")]), n = limpio(r[idx("Unidad Negocio")]); if (!mes || !n) continue;
        nombres.add(n); (meses[mes] = meses[mes] || []).push([n, num(r[idx("ComisionYTM")])]); }
      const enUnidad = [...nombres].filter(n => UNIDAD[n]).length;
      return finCom(forzar || (enUnidad >= nombres.size / 2 ? "com_unidad" : "com_fondo"), meses);
    }
    // 3) resultados de las consultas DAX (consultas_dax.dax), copiados con "Copia > Toda la tabla" o exportados
    if (idx("Fecha Mes") >= 0) {
      let tipo = forzar;
      if (!tipo) tipo = idx("tipopersona") >= 0 ? "inversores" : idx("nombre") >= 0 ? "clientes" : idx("nombre_corto_fdo_ok") >= 0 ? "aum_unidad_fondo" : idx("aum_orig") >= 0 ? "aum_unidad" : null;
      if (!tipo) throw new Error("No reconozco las columnas de esta consulta DAX: " + cols.join(", "));
      const mapa = { aum_unidad: ["unidad", "aum_orig", "ten", "fact", "flujo"], aum_unidad_fondo: ["unidad", "nombre_corto_fdo_ok", "aum", "fact", "flujo"],
        clientes: ["nombre", "unidad", "aum", "fact", "flujo"], inversores: ["Categoria", "tipopersona", "nombre_corto_fdo_ok", "aum", "n"] }[tipo];
      const falta = mapa.filter(c => idx(c) < 0); if (falta.length) throw new Error("Faltan columnas para " + TIPOS[tipo].nombre + ": " + falta.join(", "));
      const nTxt = { aum_unidad: 1, aum_unidad_fondo: 2, clientes: 2, inversores: 3 }[tipo];   // columnas de texto al principio
      const meses = {};
      for (const r of tab.slice(1)) { const mes = aMes(r[idx("Fecha Mes")]); if (!mes) continue;
        (meses[mes] = meses[mes] || []).push(mapa.map((c, k) => k < nTxt ? limpio(r[idx(c)]) : num(r[idx(c)]))); }
      return { tipo, meses };
    }
    throw new Error("No reconozco el archivo. Formatos aceptados: la matriz exportada del Power BI de comisiones (Datos con diseño actual), "
      + "los Excel mensuales de comisiones (FechaFinMes, Unidad Negocio, ComisionYTM) o el resultado de las consultas DAX.");
  }
  function finCom(tipo, meses) {        // aplica equivalencias y suma por unidad o fondo corregido
    const out = {};
    for (const [mes, filas] of Object.entries(meses)) {
      const acc = new Map();
      for (const [n, v] of filas) { const k = tipo === "com_unidad" ? (UNIDAD[n] || n) : (FONDO_CORR[n] || n); acc.set(k, (acc.get(k) || 0) + v); }
      out[mes] = [...acc.entries()].map(([k, v]) => [k, Math.round(v * 100) / 100]);
    }
    return { tipo, meses: out };
  }

  /* ---- base del artifact ---- */
  const C = { db: null, docs: [], estado: "cargando" };
  window.CARGAS = C;
  async function conectar() {
    try {
      const db = await (window.claude && claude.use ? claude.use("db") : null);
      if (!db) { C.estado = "sin_db"; return; }
      C.db = db;
      const snap = await Promise.race([db.collection("cargas").get(), new Promise((_, mal) => setTimeout(() => mal(new Error("timeout")), 10000))]);
      C.docs = snap.docs.filter(d => d.exists).map(d => Object.assign({ id: d.id }, d.data()));
      C.estado = "ok";
      aplicar();
    } catch (e) { console.error(e); C.estado = "error"; C.err = e.message || String(e); }
    if (window.APP && APP.rerender) APP.rerender();
  }

  /* ---- mezcla con los datos de la carpeta (data/internos.json): la carga manual gana mes por mes ---- */
  let base = null;
  function aplicar() {
    const I = M.I || (M.I = {});
    if (!base) base = { comisiones: (I.comisiones || []).slice(), comisiones_fondo: (I.comisiones_fondo || []).slice(), serie_facturacion: (I.serie_facturacion || []).slice() };
    const por = t => C.docs.filter(d => d.tipo === t);
    const mezclar = (lista, tipo, col) => {
      const docs = por(tipo); if (!docs.length) return lista;
      const meses = new Set(docs.map(d => d.mes));
      const out = lista.filter(r => !meses.has(String(r.mes).slice(0, 7)));
      for (const d of docs) { const [y, m] = d.mes.split("-").map(Number);
        for (const [k, v] of d.filas) out.push({ mes: finMes(y, m), [col]: k, comisiones: v }); }
      return out.sort((a, b) => a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : 0);
    };
    I.comisiones = mezclar(base.comisiones, "com_unidad", "unidad");
    I.comisiones_fondo = mezclar(base.comisiones_fondo, "com_fondo", "fondo");
    const su = por("com_unidad");
    if (su.length) {
      const meses = new Set(su.map(d => d.mes));
      const se = base.serie_facturacion.filter(r => !meses.has(String(r.fecha).slice(0, 7)));
      for (const d of su) { const [y, m] = d.mes.split("-").map(Number); se.push({ fecha: finMes(y, m), facturacion: Math.round(d.filas.reduce((a, r) => a + r[1], 0)) }); }
      I.serie_facturacion = se.sort((a, b) => a.fecha < b.fecha ? -1 : 1);
    } else I.serie_facturacion = base.serie_facturacion;
    I.manual = {};
    for (const t of ORDEN) { const docs = por(t); if (docs.length) I.manual[t] = docs; }
    try { if (window.D && D.build) D.build(); } catch (e) { console.error(e); }
  }

  /* ---- página ---- */
  const fmt = (v, d = 0) => (v == null || !isFinite(v) ? "–" : v.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const mesTxt = m => { const [y, mm] = m.split("-"); return ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][+mm - 1] + "-" + y.slice(2); };
  function total(tipo, filas) {
    const c = { com_unidad: 1, com_fondo: 1, aum_unidad: 1, aum_unidad_fondo: 2, clientes: 2, inversores: 3 }[tipo];
    return filas.reduce((a, r) => a + (+r[c] || 0), 0);
  }
  const queMide = t => t.startsWith("com_") ? "Facturación USD" : t === "inversores" ? "AUM" : t === "clientes" ? "AUM USD (top + ACDIs)" : "AUM USD";

  let pendientes = [];   // archivos procesados y todavía no guardados
  P.pages.push({ id: "datos-internos", group: "Datos internos", name: "Cargar facturación y AUM interno", render(st, side, content) {
    const w = U.el("div", "ci-wrap"); content.appendChild(w);
    w.innerHTML = `<h2>Cargar datos internos de Balanz</h2>
      <p class="ci-intro">Subí acá lo que bajes del Power BI. Se procesa en tu navegador, se guarda en el tablero y lo usan el tablero y la presentación del comité.
      La tarea automática sigue bajándolos sola; si un mes está en las dos fuentes, vale la carga manual.</p>
      <details class="ci-ayuda"><summary>Qué bajar y de dónde</summary><ol>
        <li><b>Facturación</b>: Power BI Service › <i>Rporte de Comision por Fondos v2</i> › página <i>Fondos YTD</i>. En la matriz grande: <i>Más opciones › Exportar datos › Datos con diseño actual</i> (.xlsx), una vez con <i>Analisis por = Unidad Negocio</i> y otra con <i>Fondos</i>. También sirven los Excel mensuales de las carpetas (<i>comisiones_fci_*.xlsx</i>, <i>comisiones_fondo_*.xlsx</i>).</li>
        <li><b>AUM interno, clientes e inversores</b>: modelo <i>DS Fondos - AM - Comisiones - Volumen - CuotaPartes</i> (área SelfService_Fondos) › <i>Abrir en la vista de consulta DAX</i>. Corré las 4 consultas de <code>informe/comite/consultas_dax.dax</code> y copiá cada resultado con <i>Copia › Toda la tabla</i>: pegalo abajo o guardalo como .txt.</li>
        <li>El tipo de archivo se reconoce solo; si se equivoca, cambialo en la lista antes de guardar.</li></ol></details>
      <div class="ci-zona" tabindex="0"><b>Arrastrá los archivos acá</b> o <label class="ci-btn">elegilos<input type="file" multiple accept=".xlsx,.xls,.xlsm,.txt,.csv,.tsv" hidden></label><div class="ci-sub">.xlsx, .txt, .csv – varios a la vez</div></div>
      <details class="ci-pegar"><summary>Pegar el resultado de una consulta DAX</summary><textarea rows="6" placeholder="Pegá acá lo copiado con Copia › Toda la tabla"></textarea><button class="ci-btn" type="button">Procesar lo pegado</button></details>
      <div class="ci-prev"></div><div class="ci-estado"></div>`;
    const prev = w.querySelector(".ci-prev"), est = w.querySelector(".ci-estado"), zona = w.querySelector(".ci-zona"), inp = w.querySelector("input[type=file]");
    const ta = w.querySelector("textarea");

    async function agregar(nombre, tab) {
      try { const r = procesar(tab); pendientes.push(Object.assign({ archivo: nombre, tab }, r)); }
      catch (e) { pendientes.push({ archivo: nombre, error: e.message }); }
      dibujarPrev();
    }
    async function archivos(fs) { for (const f of fs) { try { await agregar(f.name, await leerTabla(f)); } catch (e) { pendientes.push({ archivo: f.name, error: e.message }); dibujarPrev(); } } }
    inp.addEventListener("change", () => archivos([...inp.files]));
    zona.addEventListener("dragover", e => { e.preventDefault(); zona.classList.add("on"); });
    zona.addEventListener("dragleave", () => zona.classList.remove("on"));
    zona.addEventListener("drop", e => { e.preventDefault(); zona.classList.remove("on"); archivos([...e.dataTransfer.files]); });
    w.querySelector(".ci-pegar button").addEventListener("click", () => { if (ta.value.trim()) { agregar("pegado " + new Date().toLocaleTimeString("es-AR"), textoATabla(ta.value)); ta.value = ""; } });

    function dibujarPrev() {
      if (!pendientes.length) { prev.innerHTML = ""; return; }
      const ok = pendientes.filter(p => !p.error);
      let h = `<h3>Para guardar</h3><table class="ci-t"><thead><tr><th>Archivo</th><th>Tipo</th><th>Meses</th><th class="n">Filas</th><th class="n">Último mes</th><th></th></tr></thead><tbody>`;
      pendientes.forEach((p, i) => {
        if (p.error) { h += `<tr class="err"><td>${esc(p.archivo)}</td><td colspan="4">${esc(p.error)}</td><td><button class="ci-x" data-i="${i}" type="button" aria-label="Quitar">✕</button></td></tr>`; return; }
        const ms = Object.keys(p.meses).sort(), ult = ms[ms.length - 1], n = ms.reduce((a, m) => a + p.meses[m].length, 0);
        h += `<tr><td>${esc(p.archivo)}</td><td><select data-i="${i}">${ORDEN.map(t => `<option value="${t}"${t === p.tipo ? " selected" : ""}>${TIPOS[t].nombre}</option>`).join("")}</select></td>
          <td>${ms.length ? mesTxt(ms[0]) + (ms.length > 1 ? " a " + mesTxt(ult) : "") : "–"}</td><td class="n">${fmt(n)}</td>
          <td class="n">${ult ? queMide(p.tipo) + " " + mesTxt(ult) + ": " + fmt(total(p.tipo, p.meses[ult])) : ""}</td><td><button class="ci-x" data-i="${i}" type="button" aria-label="Quitar">✕</button></td></tr>`;
      });
      h += `</tbody></table><div class="ci-ctrl">${controles(ok)}</div>
        <button class="ci-btn ci-guardar" type="button"${ok.length && C.db ? "" : " disabled"}>Guardar ${ok.length} archivo${ok.length === 1 ? "" : "s"} en el tablero</button>
        ${C.db ? "" : `<span class="ci-sub"> ${C.estado === "cargando" ? "Conectando con la base del tablero…" : "La base del tablero no está disponible en esta vista: abrilo desde claude.ai con tu usuario."}</span>`}`;
      prev.innerHTML = h;
      prev.querySelectorAll("select").forEach(s => s.addEventListener("change", () => { const p = pendientes[+s.dataset.i];
        try { Object.assign(p, procesar(p.tab, s.value)); } catch (e) { p.error = e.message; } dibujarPrev(); }));
      prev.querySelectorAll(".ci-x").forEach(b => b.addEventListener("click", () => { pendientes.splice(+b.dataset.i, 1); dibujarPrev(); }));
      const g = prev.querySelector(".ci-guardar"); if (g) g.addEventListener("click", guardar);
    }
    function controles(ok) {   // facturación por unidad y por fondo del mismo mes tienen que sumar lo mismo
      const u = ok.find(p => p.tipo === "com_unidad"), f = ok.find(p => p.tipo === "com_fondo"); if (!u || !f) return "";
      return Object.keys(u.meses).filter(m => f.meses[m]).map(m => { const a = total("com_unidad", u.meses[m]), b = total("com_fondo", f.meses[m]);
        const d = Math.abs(a - b) / Math.max(1, a); return `<div class="${d > 0.01 ? "mal" : "bien"}">${mesTxt(m)}: por unidad USD ${fmt(a)} · por fondo USD ${fmt(b)} ${d > 0.01 ? "⚠ no coinciden" : "✓"}</div>`; }).join("");
    }
    async function guardar() {
      const g = prev.querySelector(".ci-guardar"); g.disabled = true; g.textContent = "Guardando…";
      const at = new Date().toISOString(); let n = 0, err = null;
      for (const p of pendientes.filter(p => !p.error)) {
        for (const [mes, filas] of Object.entries(p.meses)) {
          const id = `${p.tipo}_${mes}`, doc = { tipo: p.tipo, mes, cols: TIPOS[p.tipo].cols, filas, archivo: p.archivo, at };
          try { await C.db.doc("cargas/" + id).set(doc); n++; const i = C.docs.findIndex(d => d.id === id); const v = Object.assign({ id }, doc); if (i >= 0) C.docs[i] = v; else C.docs.push(v); }
          catch (e) { err = e; break; }
        }
        if (err) break;
      }
      if (err) { g.disabled = false; g.textContent = "Reintentar"; est.insertAdjacentHTML("afterbegin", `<div class="mal">No se pudo guardar: ${esc(err.message || err.code || String(err))}</div>`); return; }
      pendientes = []; aplicar(); dibujarPrev(); dibujarEstado(`Guardados ${n} meses.`);
    }
    function dibujarEstado(msg) {
      const docs = C.docs;
      let h = `<h3>Guardado en el tablero</h3>${msg ? `<div class="bien">${esc(msg)}</div>` : ""}`;
      if (C.estado === "cargando") h += `<p class="ci-sub">Leyendo la base del tablero…</p>`;
      else if (!C.db) h += `<p class="ci-sub">La base del tablero no está disponible en esta vista${C.err ? " (" + esc(C.err) + ")" : ""}.</p>`;
      else if (!docs.length) h += `<p class="ci-sub">Todavía no hay cargas manuales: el tablero usa los archivos de la carpeta (data/internos.json).</p>`;
      else {
        h += `<table class="ci-t"><thead><tr><th>Tipo</th><th>Meses</th><th class="n">Último mes</th><th>Cargado</th><th></th></tr></thead><tbody>`;
        for (const t of ORDEN) {
          const ds = docs.filter(d => d.tipo === t).sort((a, b) => a.mes < b.mes ? -1 : 1); if (!ds.length) continue;
          const u = ds[ds.length - 1], at = ds.map(d => d.at).sort().pop();
          h += `<tr><td>${TIPOS[t].nombre}</td><td>${mesTxt(ds[0].mes)}${ds.length > 1 ? " a " + mesTxt(u.mes) : ""} (${ds.length})</td>
            <td class="n">${queMide(t)} ${mesTxt(u.mes)}: ${fmt(total(t, u.filas))}</td><td>${new Date(at).toLocaleString("es-AR")}<div class="ci-sub">${esc(u.archivo || "")}</div></td>
            <td><button class="ci-btn ci-borrar" data-t="${t}" type="button">Borrar</button></td></tr>`;
        }
        h += `</tbody></table><p class="ci-sub">Borrar quita la carga manual de ese tipo y el tablero vuelve a usar los archivos de la carpeta.</p>`;
      }
      const fi = M.I.comisiones || [], ult = fi.length ? fi[fi.length - 1].mes : null;
      if (ult) h += `<p class="ci-sub">Facturación que usa hoy el tablero: hasta ${mesTxt(ult.slice(0, 7))}.</p>`;
      est.innerHTML = h;
      est.querySelectorAll(".ci-borrar").forEach(b => b.addEventListener("click", async () => {
        const t = b.dataset.t; if (b.dataset.ok !== "1") { b.dataset.ok = "1"; b.textContent = "¿Seguro? Borrar"; return; }
        b.disabled = true;
        for (const d of C.docs.filter(d => d.tipo === t)) { try { await C.db.doc("cargas/" + d.id).delete(); } catch (e) { console.error(e); } }
        C.docs = C.docs.filter(d => d.tipo !== t); aplicar(); dibujarEstado("Carga borrada.");
      }));
    }
    dibujarPrev(); dibujarEstado();
  } });
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  window.CARGAS.conectar = conectar;
  window.CARGAS.procesar = procesar; window.CARGAS.textoATabla = textoATabla;   // para pruebas
})();
