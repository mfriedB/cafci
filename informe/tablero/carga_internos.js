/* Datos internos de Balanz cargados a mano desde el tablero (facturación y AUM interno).
   Matías baja los archivos del Power BI (o corre las consultas DAX) y los sube acá; el tablero los procesa en el navegador,
   los guarda en la base del artifact (colección "cargas", un documento por tipo y mes más el registro de cada archivo) y los usa enseguida.
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

  /* Compra/venta de especies (carpeta Compra_Venta_Contrapartes_): mismas reglas que internos.py → contrapartes() */
  const CV_COLS = ["fondo", "op", "tipo_op", "especie", "ticker", "fecha_txt", "fecha", "anio", "trimestre", "categoria", "categoria_pase", "vn",
    "moneda", "bruto", "gastos", "neto", "agente", "agente_norm", "tipo_especie", "monto_usd_mill"];
  const TIPO_ESPECIE = {"Acciones": "Acciones", "Acciones ADR": "Acciones", "Acciones CEDEAR": "CEDEARs", "Amortizaciones a Cobrar": "Rentas", "Apertura Colocadora": "Cauciones", "Bono Dual": "Bonos AR$", "Bono Provincial CER": "Bonos AR$", "Bono Soberano CER": "Bonos AR$", "Bono Soberano Dolar Link": "Bonos AR$", "Bono Tasa Fija Provincial": "Bonos U$S", "Bono Tasa Fija Soberano": "Bonos U$S", "Cheque de Pago Diferido": "Cheques", "Cheque de Pago Diferido a Cobrar": "Cheques", "CUENTA CORRIENTE": "Cuentas Corrientes", "CUENTA CORRIENTE REMUNERADA": "Cuentas Corrientes", "Derivado Agropecuario (SOJA)": "ROFEX", "Derivado Dólar Futuro": "ROFEX", "Deudores por Operaciones a Liquidar": "Deudores", "Dividendos en Efectivo a Cobrar": "Dividendos", "ETF": "CEDEARs", "Fideicomiso Financiero": "ONs AR$", "Fideicomiso Financiero Badlar ($)": "ONs AR$", "Fideicomiso Financiero TAMAR": "ONs AR$", "Fondo Común de Inversión": "FCI", "Garantía por Operaciones": "Garantías", "Intereses a Cobrar": "Intereses", "Letra Provincial Tasa Fija": "Bonos AR$", "LETRAS DEL TESORO": "Bonos AR$", "Letras del tesoro TAMAR": "Bonos AR$", "Letras Provinciales TAMAR": "Bonos AR$", "Obligación Negociable Badlar": "ONs AR$", "Obligación Negociable Dólar Linked": "ONs AR$", "Obligación Negociable TAMAR": "ONs AR$", "Obligación Negociable Tasa Fija": "ONs U$S", "Obligaciones Negociables UVA": "ONs AR$", "Obligaciones por Garantía": "Garantías", "Plazo Fijo": "Plazos Fijos", "Provisión de Gastos Varios": "Provisiones", "Renta Fija Soberana Paraguay": "Bonos U$S", "Renta Fija Soberana Uruguay": "Bonos U$S", "Rentas a Cobrar": "Rentas", "Títulos Entregados en Garantía": "Garantías", "Renta Fija Corporativa Agro": "ONs U$S", "Renta Fija Corporativa Brasil": "ONs U$S", "Renta Fija Corporativa Chile": "ONs U$S", "Renta Fija Corporativa Consumo": "ONs U$S", "Renta Fija Corporativa Energía": "ONs U$S", "Renta Fija Corporativa Financiera": "ONs U$S", "Renta Fija Corporativa Mexico": "ONs U$S", "Renta Fija Corporativa Oil y Gas": "ONs U$S", "Renta Fija Corporativa Paraguay": "ONs U$S", "Renta Fija Corporativa Telco": "ONs U$S"};
  for (const s of ["Agro", "Brasil", "Chile", "Consumo", "Energía", "Financiera", "Mexico", "Oil y Gas", "Paraguay", "Telco"]) TIPO_ESPECIE["Renta Fija Corporativa " + s] = "ONs U$S";
  function compraventa(tab) {
    const hn = tab[0].map(c => limpio(c)), ix = n => hn.indexOf(n);
    const need = ["Fondo", "Operación_Numero", "Tipo_Operación", "Especie", "Tipo de Especie", "Fecha_Concertacion", "Valor Nominal", "Moneda de Concertación", "Bruto_Concertación", "Agente"];
    const falta = need.filter(n => ix(n) < 0); if (falta.length) throw new Error("Faltan columnas de compra/venta: " + falta.join(", "));
    const g = (r, n) => (ix(n) < 0 ? null : r[ix(n)]);
    const txtFecha = v => { if (v instanceof Date && !isNaN(v)) return `${pad(v.getUTCDate())}/${pad(v.getUTCMonth() + 1)}/${v.getUTCFullYear()}`;
      if (typeof v === "number" && v > 20000 && v < 80000) return txtFecha(new Date(Date.UTC(1899, 11, 30) + v * 864e5)); return limpio(v); };
    const vistos = new Set(), o = [];
    for (const r of tab.slice(1)) {
      if (!r || !limpio(g(r, "Fondo"))) continue;
      const clave = JSON.stringify(r); if (vistos.has(clave)) continue; vistos.add(clave);   // filas repetidas
      const tipo = limpio(g(r, "Tipo de Especie")), tu = tipo.toUpperCase(), esp = limpio(g(r, "Especie")).toUpperCase(), f0 = esp.slice(0, 1);
      let cp;
      if (esp.includes("B 10032026")) cp = "Bonos U$S"; else if (esp.includes("BF34O")) cp = "Bonos AR$";
      else if (esp.includes("PDCAR29M") || esp.includes("REPUBLIC CHILE") || esp.includes("REP BRAZIL")) cp = "Bonos U$S";
      else if (esp.includes("PSSYO") || esp.includes("PS38O")) cp = "ONs AR$"; else if (esp.includes("TLCRO")) cp = "ONS AR$";
      else if (tu.includes("BONO TASA FIJA SOBERANO") && (f0 === "S" || f0 === "T")) cp = "Bonos AR$";
      else if (esp.includes("TREASURY BILL")) cp = "Bonos U$S"; else cp = TIPO_ESPECIE[tipo] || tipo;
      const mon = limpio(g(r, "Moneda de Concertación"));
      const cat = mon === "$" ? ({ "Bonos U$S": "Bonos U$S en AR$", "ONs U$S": "ONs U$S en AR$" })[cp] || cp : cp;
      const ft = txtFecha(g(r, "Fecha_Concertacion")), m = ft.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      const fecha = m ? `${m[3]}-${pad(+m[2])}-${pad(+m[1])}` : null;
      const opv = g(r, "Operación_Numero"), op = opv == null || opv === "" ? null : num(opv);
      const bruto = num(g(r, "Bruto_Concertación")), pesos = mon.includes("$") && !mon.includes("U");
      const ag = limpio(g(r, "Agente")), au = ag.toUpperCase();
      const agn = !ag || ag.toLowerCase() === "nan" ? null : au.startsWith("MAX") ? "Max Capital"
        : [["ALLARIA", "Allaria"], ["ADCAP", "AdCap"], ["COMAFI", "Banco Comafi"], ["BALANZ", "Balanz"]].find(([k]) => au.includes(k))?.[1] || ag;
      const tick = limpio(g(r, "Ticker"));
      o.push({ fondo: limpio(g(r, "Fondo")), op, tipo_op: limpio(g(r, "Tipo_Operación")), especie: limpio(g(r, "Especie")), ticker: tick || null, fecha_txt: ft, fecha,
        anio: fecha ? +fecha.slice(0, 4) : null, trimestre: fecha ? "Qtr " + Math.ceil(+fecha.slice(5, 7) / 3) : null, categoria: cat, vn: num(g(r, "Valor Nominal")),
        moneda: mon, bruto, gastos: num(g(r, "Gastos_Concertación")), neto: num(g(r, "Neto_Concertación")), agente: ag, agente_norm: agn, tipo_especie: tipo,
        monto_usd_mill: (pesos ? bruto / 1400 : bruto) / 1e6, _u: limpio(g(r, "Tipo_Operación")).toUpperCase() });
    }
    // Categoría_Pase: hay una operación opuesta (compra/venta) del mismo fondo, especie, VN y agente a menos de 5 números
    const opu = { COMPRA: "VENTA", VENTA: "COMPRA" }, grp = new Map();
    for (const x of o) { const k = [x.fondo, x.especie, x.vn, x.agente].join("|"); (grp.get(k) || grp.set(k, []).get(k)).push(x); }
    const meses = {};
    for (const x of o) {
      const t = opu[x._u]; let es = false;
      if (t && x.op != null) es = grp.get([x.fondo, x.especie, x.vn, x.agente].join("|")).some(y => y._u === t && y.op != null && Math.abs(y.op - x.op) < 5);
      x.categoria_pase = es ? "Pase" : x.categoria;
      if (!x.fecha) continue;
      (meses[x.fecha.slice(0, 7)] = meses[x.fecha.slice(0, 7)] || []).push(CV_COLS.map(c => x[c] === undefined ? null : x[c]));
    }
    return { tipo: "compraventa", meses };
  }

  /* Cantidad de Cuotapartistas (foto del momento, sin fecha): mismas reglas que internos.py → cuotapartistas().
     Se guarda en el mes en que se sube; vale la foto más nueva. */
  const TIPO_INV = {"Agentes de Colocacion y distribucion Integral de FCIs": "ACDIs", "Cajas de Prevision": "Institucionales", "Compañias de Seguros": "Institucionales", "Inversores Corporativo.": "Corporativos", "Inversores Corporativos": "Corporativos", "Personas Humanas Argentinas Mayores de Edad": "P. Humanas", "Personas Humanas con Residencia en el Exterior": "P. Humanas", "Pymes": "PyMEs", "Aseguradoras de Riesgos de Trabajo": "Institucionales", "Personas Humanas Argentinas Menores de Edad": "P. Humanas", "Entidades Financieras Autorizadas por el BCRA": "Institucionales", "Fondos Comunes de Inversion": "Institucionales", "Personas Jurídicas con Residencia en el Exterior": "Institucionales"};
  function cuotapartistas(tab) {
    const hn = tab[0].map(c => limpio(c)), ix = n => hn.indexOf(n);
    const falta = ["Fondo", "Tipo Inversor", "Importe", "Moneda", "Cuotapartista"].filter(n => ix(n) < 0);
    if (falta.length) throw new Error("Faltan columnas de cuotapartistas: " + falta.join(", "));
    const acc = new Map();
    for (const r of tab.slice(1)) {
      if (!r || !limpio(r[ix("Fondo")])) continue;
      const t = limpio(r[ix("Tipo Inversor")]), cat = TIPO_INV[t] || t, k = limpio(r[ix("Fondo")]) + "|" + cat;
      const imp = num(r[ix("Importe")]), usd = (limpio(r[ix("Moneda")]) !== "$" ? imp : imp / 1535) / 1e6;
      const x = acc.get(k) || { f: limpio(r[ix("Fondo")]), c: cat, v: 0, n: new Set() }; x.v += usd; x.n.add(limpio(r[ix("Cuotapartista")])); acc.set(k, x);
    }
    const hoy = new Date(), mes = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}`;
    return { tipo: "cuotapartistas", meses: { [mes]: [...acc.values()].map(x => [x.f, x.c, x.v, x.n.size]) } };
  }

  const TIPOS = {
    com_unidad: { nombre: "Facturación por unidad de negocio", cols: ["unidad", "comisiones"], unidad: "USD" },
    com_fondo: { nombre: "Facturación por fondo", cols: ["fondo", "comisiones"], unidad: "USD" },
    aum_unidad: { nombre: "AUM interno por unidad (DAX 1)", cols: ["unidad", "aum_orig", "ten", "fact", "flujo"], unidad: "USD" },
    aum_unidad_fondo: { nombre: "AUM interno por unidad y fondo (DAX 2)", cols: ["unidad", "fondo", "aum", "fact", "flujo"], unidad: "USD" },
    clientes: { nombre: "Clientes: top facturación y ACDIs (DAX 3)", cols: ["nombre", "unidad", "aum", "fact", "flujo"], unidad: "USD" },
    inversores: { nombre: "Inversores por tipo y fondo (DAX 4)", cols: ["categoria", "tipopersona", "fondo", "aum", "n"], unidad: "" },
    terceros: { nombre: "Fondos de terceros colocados vía Balanz", cols: ["fondo", "gerente", "aum_ars"], unidad: "ARS" },
    emisiones: { nombre: "Facturación por emisiones primarias", cols: ["emision", "emisor", "fact"], unidad: "USD" },
    cerrados: { nombre: "Fondos fuera de CAFCI (cerrados, FCICC)", cols: ["fondo", "aum", "fact"], unidad: "USD" },
    exclusiones: { nombre: "Clientes excluidos (Ex Meli)", cols: ["cliente", "motivo"], unidad: "" },
    textos: { nombre: "Textos del mes (acciones, destacados, ratings, follow-ups)", cols: ["seccion", "texto"], unidad: "" },
    compraventa: { nombre: "Compra/venta de especies de los fondos (contrapartes)", cols: CV_COLS, unidad: "USD" },
    cuotapartistas: { nombre: "Cantidad de cuotapartistas por fondo y tipo de inversor", cols: ["Fondo", "categoria_tipo_inversor", "importe_usd_mill", "cuotapartistas"], unidad: "USD" }
  };
  /* Plantillas Excel (una hoja, encabezados en la primera fila). Las de AUM, clientes e inversores reemplazan a las
     consultas DAX y se guardan con el mismo formato. Columnas: nombre normalizado → posibles encabezados. */
  const PLANT = [
    { id: "p_aum", tipo: "aum_unidad_fondo", req: { mes: ["mes", "fecha"], area: ["areacomercial", "area", "unidaddenegocio", "unidad"], fondo: ["fondo"], aum: ["aumusd", "aum"] },
      opc: { flujo: ["flujousd", "flujo"], fact: ["facturacionusd", "facturacion"] }, fila: r => [r.area, r.fondo, r.aum, r.fact, r.flujo] },
    { id: "p_cli", tipo: "clientes", req: { mes: ["mes", "fecha"], cliente: ["cliente", "cuotapartista", "nombre"], area: ["areacomercial", "area", "unidaddenegocio", "unidad"] },
      opc: { aum: ["aumusd", "aum"], fact: ["facturacionusd", "facturacion"], flujo: ["flujousd", "flujo"] }, fila: r => [r.cliente, r.area, r.aum, r.fact, r.flujo] },
    { id: "p_inv", tipo: "inversores", req: { mes: ["mes", "fecha"], fondo: ["fondo"], tp: ["tipopersona", "phpj", "tipo"], n: ["cantidad", "cuotapartistas", "n"] },
      opc: { cat: ["categoria", "tipoinversor"], aum: ["aum", "aumusd", "monto"] }, fila: r => [r.cat || "", r.tp, r.fondo, r.aum, r.n] },
    { id: "p_ter", tipo: "terceros", req: { mes: ["mes", "fecha"], fondo: ["fondo"], aum: ["aumars", "aum", "monto"] }, opc: { ger: ["gerente", "sociedadgerente"] }, fila: r => [r.fondo, r.ger || "", r.aum] },
    { id: "p_emi", tipo: "emisiones", req: { mes: ["mes", "fecha"], emision: ["emision", "instrumento", "especie"], fact: ["facturacionusd", "facturacion"] }, opc: { emisor: ["emisor"] }, fila: r => [r.emision, r.emisor || "", r.fact] },
    { id: "p_cer", tipo: "cerrados", req: { mes: ["mes", "fecha"], fondo: ["fondo"], fact: ["facturacionusd", "facturacion"] }, opc: { aum: ["aumusd", "aum"] }, fila: r => [r.fondo, r.aum, r.fact] },
    { id: "p_exc", tipo: "exclusiones", req: { cliente: ["cliente", "cuotapartista", "nombre"] }, opc: { motivo: ["motivo", "comentario"] }, sinMes: true, fila: r => [r.cliente, r.motivo || ""] },
    { id: "p_txt", tipo: "textos", req: { mes: ["mes", "fecha"], seccion: ["seccion", "slide", "tema"], texto: ["texto", "comentario"] }, fila: r => [r.seccion, r.texto] }
  ];
  const TXT = new Set(["area", "fondo", "cliente", "cat", "tp", "ger", "emision", "emisor", "motivo", "seccion", "texto"]);
  const norm = s => limpio(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
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
    // 4) compra/venta de especies (Compra_Venta_Contrapartes_)
    if ((!forzar || forzar === "compraventa") && idx("Operación_Numero") >= 0 && idx("Tipo de Especie") >= 0) return compraventa(tab);
    if (forzar === "compraventa") return compraventa(tab);
    // 5) cantidad de cuotapartistas
    if ((!forzar || forzar === "cuotapartistas") && idx("Tipo Inversor") >= 0 && idx("Cuotapartista") >= 0) return cuotapartistas(tab);
    if (forzar === "cuotapartistas") return cuotapartistas(tab);
    // 6) plantillas Excel de Claude
    const hn = (tab[0] || []).map(norm);
    const pos = alias => { for (const a of alias) { const i = hn.indexOf(a); if (i >= 0) return i; } return -1; };
    const cand = PLANT.filter(p => !forzar || p.tipo === forzar || (forzar === "aum_unidad" && p.tipo === "aum_unidad_fondo"))
      .map(p => ({ p, ix: Object.fromEntries([...Object.entries(p.req), ...Object.entries(p.opc || {})].map(([k, al]) => [k, pos(al)])) }))
      .filter(c => Object.keys(c.p.req).every(k => c.ix[k] >= 0))
      .sort((a, b) => Object.values(b.ix).filter(i => i >= 0).length - Object.values(a.ix).filter(i => i >= 0).length);
    if (cand.length) {
      const { p, ix } = cand[0], meses = {};
      for (const r of tab.slice(1)) {
        const o = {}; for (const [k, i] of Object.entries(ix)) o[k] = i < 0 ? (TXT.has(k) ? "" : 0) : (TXT.has(k) ? limpio(r[i]) : num(r[i]));
        const mes = p.sinMes ? "fijo" : aMes(r[ix.mes]); if (!mes) continue;
        if (Object.keys(p.req).filter(k => k !== "mes").every(k => o[k] === "" || o[k] == null)) continue;
        (meses[mes] = meses[mes] || []).push(p.fila(o));
      }
      if (p.tipo === "aum_unidad_fondo") return { tipo: "aum_unidad_fondo", meses, extra: aUnidad(meses) };
      return { tipo: p.tipo, meses };
    }
    throw new Error("No reconozco el archivo. Formatos aceptados: la matriz exportada del Power BI de comisiones (Datos con diseño actual), "
      + "los Excel mensuales de comisiones (FechaFinMes, Unidad Negocio, ComisionYTM) o el resultado de las consultas DAX.");
  }
  function aUnidad(meses) {      // la plantilla de AUM por área y fondo también arma el total por área (DAX 1)
    const out = {};
    for (const [mes, filas] of Object.entries(meses)) {
      const acc = new Map();
      for (const [a, , aum, fact, flujo] of filas) { const x = acc.get(a) || [0, 0, 0]; x[0] += aum; x[1] += fact; x[2] += flujo; acc.set(a, x); }
      out[mes] = [...acc.entries()].map(([a, x]) => [a, x[0], x[0], x[1], x[2]]);
    }
    return { tipo: "aum_unidad", meses: out };
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

  /* ---- base del artifact ----
     Colección "cargas":
     - datos: un documento por tipo y mes (id tipo_AAAA-MM; si no entra en un documento sigue en tipo_AAAA-MM__2, __3...),
       con tipo, mes, cols, filas, archivo, archivoId, at, parte, partes. Una carga nueva del mismo tipo y mes la reemplaza.
     - registro de archivos: archivo_<id> con registro: true (sin "mes", así la tarea del comité lo ignora), nombre, tipo,
       meses guardados, meses que traía, totales y la copia del archivo (CSV en los archivos del tablero).
     Así queda el histórico: los meses se van acumulando y cada archivo subido queda listado, con su copia, para bajarlo o borrarlo. */
  const C = { db: null, assets: null, docs: [], regs: [], estado: "cargando" };
  window.CARGAS = C;
  async function conectar() {
    try {
      const db = await (window.claude && claude.use ? claude.use("db") : null);
      if (!db) { C.estado = "sin_db"; return; }
      C.db = db;
      try { C.assets = await claude.use("assets"); } catch (e) { C.assets = null; }
      const snap = await Promise.race([db.collection("cargas").get(), new Promise((_, mal) => setTimeout(() => mal(new Error("timeout")), 10000))]);
      const todos = snap.docs.filter(d => d.exists).map(d => Object.assign({ id: d.id }, d.data()));
      C.regs = todos.filter(d => d.registro);
      C.docs = todos.filter(d => !d.registro && d.tipo && d.mes);
      C.estado = "ok";
      aplicar();
    } catch (e) { console.error(e); C.estado = "error"; C.err = e.message || String(e); }
    finally { if (window.APP && APP.rerender) APP.rerender(); }
  }
  /* Cada archivo guarda su propia versión de cada mes (tipo_mes_archivo, partida en __2, __3... si no entra en un documento).
     Vale la versión del archivo subido más recientemente; si se elimina, vuelve a valer la anterior. */
  function versiones(tipo) {
    const g = new Map();
    for (const d of C.docs) {
      if (tipo && d.tipo !== tipo) continue;
      const k = d.tipo + "|" + d.mes + "|" + (d.archivoId || "previo:" + (d.at || "")); const x = g.get(k);
      if (!x) g.set(k, Object.assign({}, d, { filas: d.filas.slice(), ids: [d.id], _p: d.parte || 1 }));
      else { x.filas = (d.parte || 1) < x._p ? d.filas.concat(x.filas) : x.filas.concat(d.filas); x.ids.push(d.id); }
    }
    return [...g.values()];
  }
  function datos(tipo) {
    const vig = new Map();
    for (const v of versiones(tipo)) { const k = v.tipo + "|" + v.mes, x = vig.get(k); if (!x || (v.at || "") > (x.at || "")) vig.set(k, v); }
    return [...vig.values()].sort((a, b) => (a.mes < b.mes ? -1 : 1));
  }

  /* ---- mezcla con los datos de la carpeta (data/internos.json): la carga manual gana mes por mes ---- */
  let base = null;
  function aplicar() {
    const I = M.I || (M.I = {});
    if (!base) base = { comisiones: (I.comisiones || []).slice(), comisiones_fondo: (I.comisiones_fondo || []).slice(), serie_facturacion: (I.serie_facturacion || []).slice() };
    const mezclar = (lista, tipo, col) => {
      const docs = datos(tipo); if (!docs.length) return lista;
      const meses = new Set(docs.map(d => d.mes));
      const out = lista.filter(r => !meses.has(String(r.mes).slice(0, 7)));
      for (const d of docs) { const [y, m] = d.mes.split("-").map(Number);
        for (const [k, v] of d.filas) out.push({ mes: finMes(y, m), [col]: k, comisiones: v }); }
      return out.sort((a, b) => a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : 0);
    };
    I.comisiones = mezclar(base.comisiones, "com_unidad", "unidad");
    I.comisiones_fondo = mezclar(base.comisiones_fondo, "com_fondo", "fondo");
    const su = datos("com_unidad");
    if (su.length) {
      const meses = new Set(su.map(d => d.mes));
      const se = base.serie_facturacion.filter(r => !meses.has(String(r.fecha).slice(0, 7)));
      for (const d of su) { const [y, m] = d.mes.split("-").map(Number); se.push({ fecha: finMes(y, m), facturacion: Math.round(d.filas.reduce((a, r) => a + r[1], 0)) }); }
      I.serie_facturacion = se.sort((a, b) => a.fecha < b.fecha ? -1 : 1);
    } else I.serie_facturacion = base.serie_facturacion;
    const cv = datos("compraventa");
    if (!base.contrapartes) base.contrapartes = (I.contrapartes || []).slice();
    if (cv.length) {
      const meses = new Set(cv.map(d => d.mes));
      const out = base.contrapartes.filter(r => !meses.has(String(r.fecha || "").slice(0, 7)));
      for (const d of cv) for (const f of d.filas) out.push(Object.fromEntries(CV_COLS.map((c, k) => [c, f[k]])));
      I.contrapartes = out;
    } else I.contrapartes = base.contrapartes;
    const cq = datos("cuotapartistas");
    if (!base.cuotapartistas) base.cuotapartistas = I.cuotapartistas || { archivo: null, filas: [] };
    if (cq.length) { const u = cq[cq.length - 1];
      I.cuotapartistas = { archivo: u.archivo, filas: u.filas.map(f => ({ Fondo: f[0], categoria_tipo_inversor: f[1], importe_usd_mill: f[2], cuotapartistas: f[3] })) };
    } else I.cuotapartistas = base.cuotapartistas;
    I.manual = {};
    for (const t of ORDEN) { const docs = datos(t); if (docs.length) I.manual[t] = docs; }
    try { if (window.D && D.build) D.build(); } catch (e) { console.error(e); }
  }

  /* ---- página ---- */
  const fmt = (v, d = 0) => (v == null || !isFinite(v) ? "–" : v.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const mesTxt = m => { if (m === "fijo") return "sin mes"; const [y, mm] = m.split("-"); return ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][+mm - 1] + "-" + y.slice(2); };
  const rango = ms => (ms.length ? mesTxt(ms[0]) + (ms.length > 1 ? " a " + mesTxt(ms[ms.length - 1]) : "") : "–");
  function total(tipo, filas) {
    const c = { com_unidad: 1, com_fondo: 1, aum_unidad: 1, aum_unidad_fondo: 2, clientes: 2, inversores: 3, terceros: 2, emisiones: 2, cerrados: 2, compraventa: 19, cuotapartistas: 2 }[tipo];
    return c == null ? filas.length : filas.reduce((a, r) => a + (+r[c] || 0), 0);
  }
  const queMide = t => ({ com_unidad: "Facturación USD", com_fondo: "Facturación USD", inversores: "AUM", clientes: "AUM USD",
    terceros: "AUM ARS", emisiones: "Facturación USD", cerrados: "Facturación USD", exclusiones: "Clientes", textos: "Textos", compraventa: "Monto USD mill.", cuotapartistas: "AUM USD mill." })[t] || "AUM USD";
  const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  // partes de hasta ~180 KB (límite de 256 KB por documento)
  function partir(filas) {
    const out = []; let cur = [], tam = 0;
    for (const f of filas) { const t = JSON.stringify(f).length + 1; if (cur.length && tam + t > 180000) { out.push(cur); cur = []; tam = 0; } cur.push(f); tam += t; }
    out.push(cur); return out;
  }
  const aCsv = tab => tab.map(r => (r || []).map(v => { if (v instanceof Date) v = v.toISOString().slice(0, 10); const x = v == null ? "" : String(v); return /[";\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(";")).join("\r\n");

  let pendientes = [];   // archivos procesados y todavía no guardados
  let soloUltimo = true;  // de cada archivo se guarda solo su último mes (el histórico se arma mes a mes)
  P.pages.push({ id: "datos-internos", group: "Datos internos", name: "Cargar facturación y AUM interno", render(st, side, content) {
    const w = U.el("div", "ci-wrap"); content.appendChild(w);
    w.innerHTML = `<h2>Cargar datos internos de Balanz</h2>
      <p class="ci-intro">Subí acá lo que bajes del Power BI o de tus planillas. Se procesa en tu navegador y se guarda en el tablero: cada mes se suma al histórico,
      y todo lo que no depende de CAFCI se actualiza enseguida. Si un mes ya estaba cargado, vale el archivo más nuevo (el anterior queda guardado en el histórico).</p>
      <details class="ci-ayuda"><summary>Qué bajar y de dónde</summary><ol>
        <li><b>Facturación</b>: Power BI Service › <i>Rporte de Comision por Fondos v2</i> › página <i>Fondos YTD</i>. En la matriz grande: <i>Más opciones › Exportar datos › Datos con diseño actual</i> (.xlsx), una vez con <i>Analisis por = Unidad Negocio</i> y otra con <i>Fondos</i>. También sirven los Excel mensuales de las carpetas (<i>comisiones_fci_*.xlsx</i>, <i>comisiones_fondo_*.xlsx</i>).</li>
        <li><b>AUM interno, clientes e inversores</b>: modelo <i>DS Fondos - AM - Comisiones - Volumen - CuotaPartes</i> (área SelfService_Fondos) › <i>Abrir en la vista de consulta DAX</i>. Corré las 4 consultas de <code>informe/comite/consultas_dax.dax</code> y copiá cada resultado con <i>Copia › Toda la tabla</i>: pegalo abajo o guardalo como .txt.</li>
        <li><b>Plantillas de Excel</b> (<a href="https://github.com/mfriedB/cafci/tree/main/informe/plantillas" target="_blank" rel="noopener">bajarlas del repo</a>; cada una tiene una hoja de instrucciones): AUM y flujo por área comercial y fondo, clientes, inversores PH/PJ, fondos de terceros, emisiones primarias, fondos fuera de CAFCI, clientes excluidos (Ex Meli) y textos del mes.</li>
        <li><b>Cantidad de cuotapartistas</b> (hoja Tipo de Inversor): el Excel de la carpeta <i>Cantidad de Cuotapartistas</i>. No trae fecha: se guarda en el mes en que lo subís.</li>
        <li><b>Compra/venta de especies</b> (slides de contrapartes): el mismo Excel que va a la carpeta <i>Compra_Venta_Contrapartes_</i>.</li>
        <li>El tipo de archivo se reconoce solo; si se equivoca, cambialo en la lista antes de guardar.</li>
        <li>Si un archivo trae varios meses (por ejemplo el acumulado del año), se guarda solo el último. Para cargar el histórico de una vez, destildá <i>Guardar solo el último mes de cada archivo</i>.</li></ol></details>
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
    async function archivos(fs) { for (const f of fs) { try { await agregar(f.name, await leerTabla(f)); } catch (e) { pendientes.push({ archivo: f.name, error: e.message }); dibujarPrev(); } } inp.value = ""; }
    inp.addEventListener("change", () => archivos([...inp.files]));
    zona.addEventListener("dragover", e => { e.preventDefault(); zona.classList.add("on"); });
    zona.addEventListener("dragleave", () => zona.classList.remove("on"));
    zona.addEventListener("drop", e => { e.preventDefault(); zona.classList.remove("on"); archivos([...e.dataTransfer.files]); });
    w.querySelector(".ci-pegar button").addEventListener("click", () => { if (ta.value.trim()) { agregar("pegado " + new Date().toLocaleString("es-AR"), textoATabla(ta.value)); ta.value = ""; } });

    const aGuardar = p => { const ms = Object.keys(p.meses).sort(); return soloUltimo && ms.length > 1 ? ms.slice(-1) : ms; };
    const cargadoDe = (tipo, mes) => datos(tipo).find(d => d.mes === mes);
    const ultimoCargado = tipo => { const ms = C.docs.filter(d => d.tipo === tipo).map(d => d.mes).filter(m => m !== "fijo").sort(); return ms[ms.length - 1]; };

    function dibujarPrev() {
      if (!pendientes.length) { prev.innerHTML = ""; return; }
      const ok = pendientes.filter(p => !p.error);
      let h = `<h3>Para guardar</h3><label class="ci-sub"><input type="checkbox" class="ci-ult"${soloUltimo ? " checked" : ""}> Guardar solo el último mes de cada archivo</label>
        <table class="ci-t"><thead><tr><th>Archivo</th><th>Tipo</th><th>Trae</th><th>Se guarda</th><th class="n">Total del último mes</th><th></th></tr></thead><tbody>`;
      pendientes.forEach((p, i) => {
        if (p.error) { h += `<tr class="err"><td>${esc(p.archivo)}</td><td colspan="4">${esc(p.error)}</td><td><button class="ci-x" data-i="${i}" type="button" aria-label="Quitar">✕</button></td></tr>`; return; }
        const ms = Object.keys(p.meses).sort(), ult = ms[ms.length - 1], g = aGuardar(p);
        const reemp = g.filter(m => cargadoDe(p.tipo, m)), uc = ultimoCargado(p.tipo);
        const nota = (reemp.length ? `<div class="ci-sub">reemplaza ${reemp.length === 1 ? mesTxt(reemp[0]) : reemp.length + " meses"} ya cargado${reemp.length === 1 ? "" : "s"}</div>` : "")
          + (uc && ult && ult !== "fijo" && ult < uc ? `<div class="mal">es anterior al último mes cargado (${mesTxt(uc)})</div>` : "");
        h += `<tr><td>${esc(p.archivo)}</td><td><select data-i="${i}">${ORDEN.map(t => `<option value="${t}"${t === p.tipo ? " selected" : ""}>${TIPOS[t].nombre}</option>`).join("")}</select></td>
          <td>${rango(ms)}</td><td>${rango(g)}${nota}</td>
          <td class="n">${ult ? queMide(p.tipo) + " " + mesTxt(ult) + ": " + fmt(total(p.tipo, p.meses[ult])) : ""}</td><td><button class="ci-x" data-i="${i}" type="button" aria-label="Quitar">✕</button></td></tr>`;
      });
      h += `</tbody></table><div class="ci-ctrl">${controles(ok)}</div>
        <button class="ci-btn ci-guardar" type="button"${ok.length && C.db ? "" : " disabled"}>Guardar ${ok.length} archivo${ok.length === 1 ? "" : "s"} en el tablero</button>
        ${C.db ? "" : `<span class="ci-sub"> ${C.estado === "cargando" ? "Conectando con la base del tablero…" : "La base del tablero no está disponible en esta vista: abrilo desde claude.ai con tu usuario."}</span>`}`;
      prev.innerHTML = h;
      prev.querySelector(".ci-ult").addEventListener("change", e => { soloUltimo = e.target.checked; dibujarPrev(); });
      prev.querySelectorAll("select").forEach(s => s.addEventListener("change", () => { const p = pendientes[+s.dataset.i];
        try { Object.assign(p, procesar(p.tab, s.value)); delete p.error; } catch (e) { p.error = e.message; } dibujarPrev(); }));
      prev.querySelectorAll(".ci-x").forEach(b => b.addEventListener("click", () => { pendientes.splice(+b.dataset.i, 1); dibujarPrev(); }));
      const g = prev.querySelector(".ci-guardar"); if (g) g.addEventListener("click", guardar);
    }
    function controles(ok) {   // facturación por unidad y por fondo del mismo mes tienen que sumar lo mismo
      const u = ok.find(p => p.tipo === "com_unidad"), f = ok.find(p => p.tipo === "com_fondo"); if (!u || !f) return "";
      const ms = Object.keys(u.meses).filter(m => f.meses[m]).sort();
      const mal = ms.filter(m => { const a = total("com_unidad", u.meses[m]), b = total("com_fondo", f.meses[m]); return Math.abs(a - b) / Math.max(1, a) > 0.01; });
      const ult = ms[ms.length - 1];
      return (ult ? `<div class="bien">Control: la facturación por unidad y por fondo coincide en ${ms.length - mal.length} de ${ms.length} meses (${mesTxt(ult)}: USD ${fmt(total("com_unidad", u.meses[ult]))}).</div>` : "")
        + mal.map(m => `<div class="mal">⚠ ${mesTxt(m)}: por unidad USD ${fmt(total("com_unidad", u.meses[m]))} · por fondo USD ${fmt(total("com_fondo", f.meses[m]))}</div>`).join("");
    }
    async function guardar() {
      const g = prev.querySelector(".ci-guardar"); g.disabled = true; g.textContent = "Guardando…";
      const at = new Date().toISOString(); let n = 0, err = null, sinCopia = 0;
      for (const p of pendientes.filter(p => !p.error)) {
        const archivoId = nuevoId(), meses = aGuardar(p);
        const grupos = [[p.tipo, p.meses]].concat(p.extra ? [[p.extra.tipo, p.extra.meses]] : []);
        try {
          for (const [tipo, mm] of grupos) for (const mes of meses) {
            if (!mm[mes]) continue;
            const partes = partir(mm[mes]);
            for (let k = 0; k < partes.length; k++) {
              const id = `${tipo}_${mes}_${archivoId}` + (k ? `__${k + 1}` : "");
              const doc = { tipo, mes, cols: TIPOS[tipo].cols, filas: partes[k], archivo: p.archivo, archivoId, at, parte: k + 1, partes: partes.length };
              await C.db.doc("cargas/" + id).set(doc); C.docs.push(Object.assign({ id }, doc));
            }
            n++;
          }
          // copia del archivo (como CSV de su primera hoja) para el histórico
          let copia = null;
          if (C.assets && p.tab) {
            try { const r = await C.assets.upload(new Blob(["\ufeff" + aCsv(p.tab)], { type: "text/csv" }), { type: "text/csv" }); copia = { id: r.id, bytes: r.sizeBytes }; }
            catch (e) { console.error(e); sinCopia++; }
          } else sinCopia++;
          const ult = meses[meses.length - 1];
          const reg = { registro: true, archivo: p.archivo, archivoId, tipo: p.tipo, extra: p.extra ? p.extra.tipo : null, meses, mesesArchivo: Object.keys(p.meses).sort(),
            filas: meses.reduce((a, m) => a + (p.meses[m] || []).length, 0), ultimo: ult || null, total: ult ? total(p.tipo, p.meses[ult]) : null, at, copia };
          await C.db.doc("cargas/archivo_" + archivoId).set(reg); C.regs.push(Object.assign({ id: "archivo_" + archivoId }, reg));
        } catch (e) { err = e; break; }
      }
      if (err) { g.disabled = false; g.textContent = "Reintentar"; est.insertAdjacentHTML("afterbegin", `<div class="mal">No se pudo guardar: ${esc(err.message || err.code || String(err))}</div>`); return; }
      pendientes = []; aplicar(); dibujarPrev();
      dibujarEstado(`Guardados ${n} mes${n === 1 ? "" : "es"}.` + (sinCopia ? ` (${sinCopia} archivo${sinCopia === 1 ? "" : "s"} sin copia descargable)` : ""));
    }

    // archivos subidos: los registrados + los de cargas anteriores (sin registro), agrupados por archivo
    function listaArchivos() {
      const vig = new Set(datos(null).map(d => d.tipo + "|" + d.mes + "|" + (d.archivoId || "previo:" + (d.at || ""))));
      const out = C.regs.map(r => Object.assign({}, r, { enUso: r.meses.filter(m => vig.has(r.tipo + "|" + m + "|" + r.archivoId)) }));
      const viejos = new Map();
      for (const d of C.docs.filter(d => !d.archivoId)) {
        const k = d.tipo + "|" + (d.archivo || "") + "|" + (d.at || "").slice(0, 16);
        const x = viejos.get(k) || { id: null, viejo: true, archivo: d.archivo || "(sin nombre)", tipo: d.tipo, meses: [], at: d.at, enUso: [], docs: [] };
        if (!x.meses.includes(d.mes)) { x.meses.push(d.mes); if (vig.has(d.tipo + "|" + d.mes + "|previo:" + (d.at || ""))) x.enUso.push(d.mes); } x.docs.push(d); viejos.set(k, x);
      }
      for (const x of viejos.values()) { x.meses.sort(); x.enUso.sort(); const u = x.meses[x.meses.length - 1]; x.ultimo = u; x.total = total(x.tipo, versiones(x.tipo).find(d => d.mes === u && !d.archivoId && d.at === x.at)?.filas || []); out.push(x); }
      return out.sort((a, b) => ((b.at || "") < (a.at || "") ? -1 : 1));
    }
    let filtro = "";
    function dibujarEstado(msg) {
      let h = `<h3>Histórico cargado</h3>${msg ? `<div class="bien">${esc(msg)}</div>` : ""}`;
      if (C.estado === "cargando") h += `<p class="ci-sub">Leyendo la base del tablero…</p>`;
      else if (!C.db) h += `<p class="ci-sub">La base del tablero no está disponible en esta vista${C.err ? " (" + esc(C.err) + ")" : ""}.</p>`;
      else if (!C.docs.length && !C.regs.length) h += `<p class="ci-sub">Todavía no hay cargas: el tablero usa los archivos de la carpeta (data/internos.json).</p>`;
      else {
        // meses acumulados por tipo
        h += `<table class="ci-t"><thead><tr><th>Tipo</th><th>Meses cargados</th><th class="n">Último mes</th></tr></thead><tbody>`;
        for (const t of ORDEN) {
          const ds = datos(t); if (!ds.length) continue;
          const u = ds[ds.length - 1];
          h += `<tr><td>${TIPOS[t].nombre}</td><td>${rango(ds.map(d => d.mes))} <span class="ci-sub">(${ds.length})</span></td><td class="n">${queMide(t)} ${mesTxt(u.mes)}: ${fmt(total(t, u.filas))}</td></tr>`;
        }
        h += `</tbody></table>`;
        // archivos subidos
        const lista = listaArchivos(), tipos = [...new Set(lista.map(x => x.tipo))];
        h += `<h3>Archivos subidos</h3><div class="ci-fil"><label class="ci-sub">Ver <select class="ci-ft"><option value="">todos los tipos</option>${tipos.map(t => `<option value="${t}"${t === filtro ? " selected" : ""}>${TIPOS[t] ? TIPOS[t].nombre : t}</option>`).join("")}</select></label></div>
          <table class="ci-t"><thead><tr><th>Archivo</th><th>Tipo</th><th>Mes guardado</th><th class="n">Total</th><th>Subido</th><th>Estado</th><th></th></tr></thead><tbody>`;
        lista.forEach((x, i) => {
          if (filtro && x.tipo !== filtro) return;
          const usado = x.enUso.length, estado = usado === x.meses.length ? "en uso" : usado ? `en uso ${usado} de ${x.meses.length}` : "reemplazado";
          h += `<tr${usado ? "" : ' class="ci-off"'}><td>${esc(x.archivo)}</td><td>${TIPOS[x.tipo] ? TIPOS[x.tipo].nombre : esc(x.tipo)}</td><td>${rango(x.meses)}</td>
            <td class="n">${x.ultimo ? queMide(x.tipo) + " " + fmt(x.total) : ""}</td><td>${x.at ? new Date(x.at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "–"}</td>
            <td>${estado}</td><td class="ci-acc">${x.copia && x.copia.id ? `<a class="ci-lnk" href="/_blob/${esc(x.copia.id)}" download="${esc(x.archivo.replace(/\.[^.]+$/, "") + ".csv")}" target="_blank" rel="noopener">Bajar</a>` : ""}
            <button class="ci-btn ci-borrar" data-i="${i}" type="button">Eliminar</button></td></tr>`;
        });
        h += `</tbody></table><p class="ci-sub">Eliminar saca el archivo y sus datos: cada mes vuelve a la versión anterior que se haya subido o, si no hay, a los archivos de la carpeta (data/internos.json).
          Un archivo "reemplazado" no se usa porque después se subió otro del mismo mes; si eliminás el más nuevo, vuelve a usarse el anterior.</p>`;
        est._lista = lista;
      }
      const fi = M.I.comisiones || [], ult = fi.length ? fi[fi.length - 1].mes : null;
      if (ult) h += `<p class="ci-sub">Facturación que usa hoy el tablero: hasta ${mesTxt(ult.slice(0, 7))}.</p>`;
      est.innerHTML = h;
      const ft = est.querySelector(".ci-ft"); if (ft) ft.addEventListener("change", () => { filtro = ft.value; dibujarEstado(); });
      est.querySelectorAll(".ci-borrar").forEach(b => b.addEventListener("click", async () => {
        const x = est._lista[+b.dataset.i]; if (b.dataset.ok !== "1") { b.dataset.ok = "1"; b.textContent = "¿Seguro?"; return; }
        b.disabled = true; b.textContent = "Eliminando…";
        try {
          const docs = x.viejo ? x.docs : C.docs.filter(d => d.archivoId === x.archivoId);
          for (const d of docs) await C.db.doc("cargas/" + d.id).delete();
          const ids = new Set(docs.map(d => d.id)); C.docs = C.docs.filter(d => !ids.has(d.id));
          if (!x.viejo) {
            if (x.copia && x.copia.id && C.assets) { try { await C.assets.delete(x.copia.id); } catch (e) { console.error(e); } }
            await C.db.doc("cargas/" + x.id).delete(); C.regs = C.regs.filter(r => r.id !== x.id);
          }
          aplicar(); dibujarEstado(`Eliminado ${x.archivo}.`);
        } catch (e) { b.disabled = false; b.textContent = "Eliminar"; est.insertAdjacentHTML("afterbegin", `<div class="mal">No se pudo eliminar: ${esc(e.message || e.code || String(e))}</div>`); }
      }));
    }
    dibujarPrev(); dibujarEstado();
  } });
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  window.CARGAS.conectar = conectar;
  window.CARGAS.procesar = procesar; window.CARGAS.textoATabla = textoATabla;   // para pruebas
})();
