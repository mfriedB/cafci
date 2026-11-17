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
  /* ---- lectura flexible de planillas (compra/venta y posición de cuotapartistas) ----
     Busca la fila (o las 2-3 filas) de encabezados en las primeras filas, une los encabezados de varios niveles
     ("Operación" + "Número" → "Operación Número"), reconoce cada columna por sinónimos y revisa que el contenido
     tenga sentido (fechas, números, moneda). Si falta algo, arma una alarma con lo que hay que cambiar en el archivo. */
  const ESQ = {
    compraventa: { nombre: "compra/venta de especies", campos: [
      { k: "fondo", req: 1, ej: "Fondo", al: ["fondonombre", "fondo", "fondocodigo", "fondoabreviatura", "nombrefondo"] },
      { k: "op", req: 1, ej: "Operación Número", tipo: "num", al: ["operacionnumero", "numerooperacion", "nrooperacion", "nrodeoperacion", "numerodeoperacion", "operacionnro", "nroop", "operacion"] },
      { k: "tipo_op", req: 1, ej: "Operación Tipo (Compra / Venta)", tipo: "txt", al: ["operaciontipo", "tipooperacion", "tipodeoperacion", "tipoop", "compraventa"] },
      { k: "especie", req: 1, ej: "Especie", tipo: "txt", al: ["especiedescripcion", "especie", "especienombre", "descripcionespecie", "instrumento"] },
      { k: "tipo_especie", req: 1, ej: "Tipo de Especie", tipo: "txt", al: ["tipodeespecie", "tipoespecie", "tipodeinstrumento", "tipoinstrumento"] },
      { k: "fecha", req: 1, ej: "Fecha Concertación", tipo: "fecha", al: ["fechaconcertacion", "fechadeconcertacion", "concertacion", "fechaoperacion", "fecha"] },
      { k: "vn", req: 1, ej: "Valor Nominal", tipo: "num", al: ["valornominal", "vn", "nominales", "nominal", "cantidad"] },
      { k: "moneda", req: 1, ej: "Moneda de Concertación (Símbolo: $ / u$s)", tipo: "mon", al: ["monedadeconcertacionsimbolo", "monedadeconcertacion", "monedasimbolo", "moneda"] },
      { k: "bruto", req: 1, ej: "Bruto (Moneda de Concertación)", tipo: "num", al: ["monedadeconcertacionbruto", "brutoconcertacion", "brutodeconcertacion", "bruto", "importebruto", "montobruto", "monto", "importe"] },
      { k: "gastos", ej: "Gastos", tipo: "num", al: ["monedadeconcertaciongastos", "gastosconcertacion", "gastos"] },
      { k: "neto", ej: "Neto", tipo: "num", al: ["monedadeconcertacionneto", "netoconcertacion", "neto", "importeneto"] },
      { k: "agente", req: 1, ej: "Agente", tipo: "txt", al: ["agentedescripcion", "agente", "agentenombre", "contraparte", "contraparteagente"] },
      { k: "ticker", ej: "Ticker", al: ["ticker", "especieticker", "codigoespecie", "simboloespecie"] }] },
    cuotapartistas: { nombre: "posición de cuotapartistas", campos: [
      { k: "fondo", req: 1, ej: "Fondo", al: ["fondonombre", "fondo", "fondocodigo", "fondoabreviatura", "nombrefondo"] },
      { k: "clase", ej: "Tipo de Valor Cuotaparte (clase)", al: ["tipodevalorcuotaparte", "tipovalorcuotaparte", "clase", "clasecuotaparte"] },
      { k: "tipo", req: 1, ej: "Tipo de Inversor", tipo: "txt", al: ["tipodeinversor", "tipoinversor", "tipodeinversornombre", "tipoinversornombre", "categoriainversor"] },
      { k: "cp", req: 1, ej: "Cuotapartista (Número o Nombre)", al: ["cuotapartistanumero", "numerocuotapartista", "nrocuotapartista", "cuotapartistanro", "cuotapartista", "cuotapartistanombre", "comitente", "cliente"] },
      { k: "importe", req: 1, ej: "Inversión (importe)", tipo: "num", al: ["importe", "inversion", "importeinversion", "monto", "valuacion", "saldo", "tenencia"] },
      { k: "moneda", req: 1, ej: "Moneda (Símbolo: $ / u$s)", tipo: "mon", al: ["monedasimbolo", "moneda", "monedadelfondo"] }] }
  };
  const RE_MON = /^(\$|ars|\$ar|ar\$|pesos?|u\$s|us\$|u\$d|usd|usc|dolar(es)?|d[oó]lar(es)?|eur|€)$/i;
  const esNum = v => typeof v === "number" ? isFinite(v) : (typeof v === "string" && /^\s*-?[\d.,]+\s*$/.test(v) && /\d/.test(v));
  const esPesos = v => { const u = limpio(v).toUpperCase(); return u === "ARS" || u === "PESOS" || u === "PESO" || (u.includes("$") && !u.includes("U")); };
  function aFecha(v) {          // → "AAAA-MM-DD" o null
    if (v instanceof Date && !isNaN(v)) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
    if (typeof v === "number") return v > 20000 && v < 80000 ? aFecha(new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5)) : null;
    const s = limpio(v); let m;
    if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/))) return +m[2] >= 1 && +m[2] <= 12 ? `${m[3]}-${pad(+m[2])}-${pad(+m[1])}` : null;
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
    return null;
  }
  const VALIDA = { num: esNum, fecha: v => !!aFecha(v), mon: v => RE_MON.test(limpio(v)), txt: v => !esNum(v) };
  const pareceEncabezado = r => { const ne = (r || []).filter(v => v != null && limpio(v) !== ""); return ne.length > 0 && ne.filter(v => esNum(v) || v instanceof Date || aFecha(v)).length <= ne.length * 0.3; };
  function unirEncabezados(tab, h, d) {
    const filas = tab.slice(h, h + d).map(r => (r || []).map(limpio)), n = Math.max(...filas.map(r => r.length));
    const niv = filas.map(r => Array.from({ length: n }, (_, j) => r[j] || ""));
    for (let i = 0; i < d - 1; i++) for (let j = 1; j < n; j++)   // celdas combinadas: el grupo de arriba vale para las columnas de abajo
      if (!niv[i][j] && niv.slice(i + 1).some(r => r[j]) && niv[i][j - 1] && niv.slice(i + 1).some(r => r[j - 1])) niv[i][j] = niv[i][j - 1];
    return Array.from({ length: n }, (_, j) => niv.map(r => r[j]).filter((x, i, a) => x && x !== a[i - 1]).join(" "));
  }
  function asignar(nombres, tab, ini, esq) {
    const hn = nombres.map(norm), muestra = tab.slice(ini, ini + 300), cand = [];
    esq.campos.forEach((c, fi) => hn.forEach((h, j) => { if (!h) return;
      c.al.forEach((a, ai) => { const p = h === a ? 1000 - ai : h.includes(a) && a.length >= 4 ? 500 + a.length - ai : 0; if (p) cand.push({ c, j, p, fi }); }); }));
    cand.sort((a, b) => b.p - a.p || a.fi - b.fi);
    const cols = {}, usada = new Set(), exactos = new Set(), malas = {};
    const sirve = (c, j) => { if (!c.tipo) return true; const vs = muestra.map(r => r && r[j]).filter(v => v != null && limpio(v) !== "");
      return vs.length > 0 && vs.filter(VALIDA[c.tipo]).length >= vs.length * 0.8; };
    for (const x of cand) {
      if (cols[x.c.k] != null || usada.has(x.j)) continue;
      if (!sirve(x.c, x.j)) { malas[x.c.k] = malas[x.c.k] || nombres[x.j]; continue; }
      cols[x.c.k] = x.j; usada.add(x.j); if (x.p >= 900) exactos.add(x.c.k);
    }
    // por contenido: moneda y fecha se reconocen aunque el encabezado no se parezca
    for (const c of esq.campos) if (cols[c.k] == null && (c.tipo === "mon" || c.tipo === "fecha"))
      for (let j = 0; j < nombres.length; j++) if (!usada.has(j) && muestra.length && sirve(c, j)) { cols[c.k] = j; usada.add(j); break; }
    const req = esq.campos.filter(c => c.req), faltan = req.filter(c => cols[c.k] == null);
    return { cols, faltan, malas, ok: req.length - faltan.length, exactos: exactos.size };
  }
  function mapear(tab, esq) {
    let mejor = null;
    for (let h = 0; h < Math.min(15, tab.length); h++) {
      for (let d = 1; d <= 3 && h + d <= tab.length; d++) {
        if (!pareceEncabezado(tab[h + d - 1])) break;
        const nombres = unirEncabezados(tab, h, d), a = asignar(nombres, tab, h + d, esq);
        const x = Object.assign(a, { h, d, datos: h + d, nombres });
        if (!mejor || x.ok > mejor.ok || (x.ok === mejor.ok && (x.exactos > mejor.exactos || (x.exactos === mejor.exactos && x.datos > mejor.datos)))) mejor = x;
      }
    }
    if (!mejor) mejor = { cols: {}, faltan: esq.campos.filter(c => c.req), malas: {}, ok: 0, exactos: 0, h: 0, d: 1, datos: 1, nombres: (tab[0] || []).map(limpio) };
    // fecha escrita arriba de los encabezados (ej. "Posición de Cuotapartista al 30/10/2026")
    for (const r of tab.slice(0, mejor.h)) for (const v of r || []) { const m = limpio(v).match(/(\d{1,2}\/\d{1,2}\/20\d{2}|20\d{2}-\d{2}-\d{2})/); if (m && !mejor.fechaTitulo) mejor.fechaTitulo = aFecha(m[1]); }
    mejor.hoja = tab.hoja;
    return mejor;
  }
  const cabeza = tab => { const t = tab.slice(0, 400); t.hoja = tab.hoja; return t; };
  function puntaje(tab) {         // qué tan bien encaja una hoja con alguno de los formatos flexibles (0 a 1)
    let b = 0; for (const e of Object.values(ESQ)) { const m = mapear(tab.slice(0, 60), e); b = Math.max(b, m.ok / e.campos.filter(c => c.req).length); } return b;
  }
  // alarma: qué no encontré y cómo dejar el archivo para que se pueda cargar
  function alarma(esq, m, extra) {
    const vistos = (m.nombres || []).filter(Boolean);
    const err = new Error(extra || `No pude leer el archivo como ${esq.nombre}: no encuentro ${m.faltan.map(c => "«" + c.ej + "»").join(", ")}.`);
    err.ayuda = { titulo: `No se pudo cargar como ${esq.nombre}`, hoja: m.hoja, fila: m.h + 1,
      faltan: m.faltan.map(c => ({ ej: c.ej, malo: m.malas[c.k] || null, tipo: c.tipo })),
      vistos: vistos.slice(0, 25),
      pasos: [
        "Dejá los datos en la primera hoja (o en una hoja que tenga estos encabezados), con los encabezados arriba de todo: una fila, o hasta 3 filas como sale del sistema (por ejemplo «Operación» arriba y «Número» abajo).",
        "A la columna que tiene cada dato faltante ponele de encabezado el nombre indicado (no importan mayúsculas, acentos, espacios ni guiones bajos).",
        "Fechas como fecha de Excel o texto dd/mm/aaaa; importes y valores nominales como número (sin texto); moneda con el símbolo ($ o u$s).",
        "Sin filas vacías entre los encabezados y los datos. Las filas de totales, títulos o columnas de más no molestan."] };
    return err;
  }

  function compraventa(tab) {
    const m = mapear(tab, ESQ.compraventa); if (m.faltan.length) throw alarma(ESQ.compraventa, m);
    const g = (r, k) => (m.cols[k] == null ? null : r[m.cols[k]]);
    const txtFecha = v => { const f = aFecha(v); return f ? f.split("-").reverse().join("/") : limpio(v); };
    const vistos = new Set(), o = [];
    for (const r of tab.slice(m.datos)) {
      const fondo = limpio(g(r, "fondo")); if (!r || !fondo || /^total/i.test(fondo) || !aFecha(g(r, "fecha"))) continue;
      const clave = JSON.stringify(r); if (vistos.has(clave)) continue; vistos.add(clave);   // filas repetidas
      const tipo = limpio(g(r, "tipo_especie")), tu = tipo.toUpperCase(), esp = limpio(g(r, "especie")).toUpperCase(), f0 = esp.slice(0, 1);
      let cp;
      if (esp.includes("B 10032026")) cp = "Bonos U$S"; else if (esp.includes("BF34O")) cp = "Bonos AR$";
      else if (esp.includes("PDCAR29M") || esp.includes("REPUBLIC CHILE") || esp.includes("REP BRAZIL")) cp = "Bonos U$S";
      else if (esp.includes("PSSYO") || esp.includes("PS38O")) cp = "ONs AR$"; else if (esp.includes("TLCRO")) cp = "ONS AR$";
      else if (tu.includes("BONO TASA FIJA SOBERANO") && (f0 === "S" || f0 === "T")) cp = "Bonos AR$";
      else if (esp.includes("TREASURY BILL")) cp = "Bonos U$S"; else cp = TIPO_ESPECIE[tipo] || tipo;
      const mon = limpio(g(r, "moneda"));
      const cat = mon === "$" ? ({ "Bonos U$S": "Bonos U$S en AR$", "ONs U$S": "ONs U$S en AR$" })[cp] || cp : cp;
      const fecha = aFecha(g(r, "fecha")), ft = txtFecha(g(r, "fecha"));
      const opv = g(r, "op"), op = opv == null || opv === "" ? null : num(opv);
      const bruto = num(g(r, "bruto"));
      const ag = limpio(g(r, "agente")), au = ag.toUpperCase();
      const agn = !ag || ag.toLowerCase() === "nan" ? null : au.startsWith("MAX") ? "Max Capital"
        : [["ALLARIA", "Allaria"], ["ADCAP", "AdCap"], ["COMAFI", "Banco Comafi"], ["BALANZ", "Balanz"]].find(([k]) => au.includes(k))?.[1] || ag;
      const tick = limpio(g(r, "ticker"));
      o.push({ fondo, op, tipo_op: limpio(g(r, "tipo_op")), especie: limpio(g(r, "especie")), ticker: tick || null, fecha_txt: ft, fecha,
        anio: +fecha.slice(0, 4), trimestre: "Qtr " + Math.ceil(+fecha.slice(5, 7) / 3), categoria: cat, vn: num(g(r, "vn")),
        moneda: mon, bruto, gastos: num(g(r, "gastos")), neto: num(g(r, "neto")), agente: ag, agente_norm: agn, tipo_especie: tipo,
        monto_usd_mill: (esPesos(mon) ? bruto / ((window.M && M.tcAl && M.tcAl(fecha) || [0, 1400])[1]) : bruto) / 1e6, _u: limpio(g(r, "tipo_op")).toUpperCase() });
    }
    if (!o.length) throw alarma(ESQ.compraventa, m, "Encontré los encabezados pero ninguna fila con fondo y fecha de concertación válida (dd/mm/aaaa).");
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
    return { tipo: "compraventa", hoja: tab.hoja, meses };
  }

  /* Cantidad de Cuotapartistas (foto del momento, sin fecha): mismas reglas que internos.py → cuotapartistas().
     Se guarda en el mes en que se sube; vale la foto más nueva. */
  const TIPO_INV = {"Agentes de Colocacion y distribucion Integral de FCIs": "ACDIs", "Cajas de Prevision": "Institucionales", "Compañias de Seguros": "Institucionales", "Inversores Corporativo.": "Corporativos", "Inversores Corporativos": "Corporativos", "Personas Humanas Argentinas Mayores de Edad": "P. Humanas", "Personas Humanas con Residencia en el Exterior": "P. Humanas", "Pymes": "PyMEs", "Aseguradoras de Riesgos de Trabajo": "Institucionales", "Personas Humanas Argentinas Menores de Edad": "P. Humanas", "Entidades Financieras Autorizadas por el BCRA": "Institucionales", "Fondos Comunes de Inversion": "Institucionales", "Personas Jurídicas con Residencia en el Exterior": "Institucionales"};
  // mes de un archivo sin columna de fecha: el del nombre del archivo, si lo trae; si no, el mes cerrado (o el actual después del 20)
  function mesDeNombre(nombre) {
    const s = String(nombre || ""); let m;
    if ((m = s.match(/(20\d{2})[-_. ]?(0[1-9]|1[0-2])(?!\d)/))) return `${m[1]}-${m[2]}`;
    if ((m = s.match(/(\d{1,2})[-_.](\d{1,2})[-_.](20\d{2})/))) return `${m[3]}-${pad(+m[2])}`;
    if ((m = s.match(/(?:^|\D)(0?[1-9]|1[0-2])[-_.](20\d{2})(?!\d)/))) return `${m[2]}-${pad(+m[1])}`;   // MM-AAAA (ej. "Posición CP TODOS 10-2026")
    const h = new Date(), d = h.getDate() <= 20 ? new Date(h.getFullYear(), h.getMonth() - 1, 1) : h;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  }
  function fechaDeNombre(nombre) {   // fecha completa en el nombre del archivo (AAAA-MM-DD o DD-MM-AAAA), si la tiene
    const s = String(nombre || ""); let m;
    if ((m = s.match(/(20\d{2})[-_.](\d{2})[-_.](\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
    if ((m = s.match(/(\d{1,2})[-_.](\d{1,2})[-_.](20\d{2})/))) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
    return null;
  }
  // AUM en pesos → USD al dólar oficial vendedor del BCRA de la fecha de la planilla (o del cierre del mes)
  function tcPara(mes, nombre, fecha) {
    const fn = fecha || fechaDeNombre(nombre), [y, m] = mes.split("-").map(Number);
    const ref = fn && fn.slice(0, 7) === mes ? fn : finMes(y, m);
    const x = window.M && M.tcAl ? M.tcAl(ref) : null;
    return x ? { fecha: x[0], valor: x[1], fuente: "BCRA" } : { fecha: null, valor: 1535, fuente: "fijo" };
  }
  function cuotapartistas(tab, nombre, mesF) {
    const m = mapear(tab, ESQ.cuotapartistas); if (m.faltan.length) throw alarma(ESQ.cuotapartistas, m);
    const g = (r, k) => (m.cols[k] == null ? null : r[m.cols[k]]);
    // fecha de la foto: la del título de la planilla ("Posición de Cuotapartista al 30/10/2026") o la del nombre del archivo
    const fecha = m.fechaTitulo || fechaDeNombre(nombre);
    const acc = new Map(), inv = new Map(), mes = mesF || (fecha ? fecha.slice(0, 7) : mesDeNombre(nombre)), tc = tcPara(mes, nombre, fecha);
    let filas = 0;
    for (const r of tab.slice(m.datos)) {
      const f = limpio(g(r, "fondo")), iv = g(r, "importe");
      if (!r || !f || /^total/i.test(f) || iv == null || iv === "" || !esNum(iv)) continue;
      const t = limpio(g(r, "tipo")), cat = TIPO_INV[t] || t, k = f + "|" + cat, cp = limpio(g(r, "cp"));
      const imp = num(iv), usd = (esPesos(g(r, "moneda")) ? imp / tc.valor : imp) / 1e6; filas++;
      const x = acc.get(k) || { f, c: cat, v: 0, n: new Set() }; x.v += usd; x.n.add(cp); acc.set(k, x);
      // también arma "Inversores por tipo y fondo" (la consulta DAX 4 del comité): persona humana (PF) o jurídica (PJ)
      const tp = /personas humanas/i.test(t) ? "PF" : "PJ", ki = cat + "|" + tp + "|" + f;
      const y = inv.get(ki) || { c: cat, tp, f, v: 0, n: new Set() }; y.v += usd * 1e6; y.n.add(cp); inv.set(ki, y);
    }
    if (!filas) throw alarma(ESQ.cuotapartistas, m, "Encontré los encabezados pero ninguna fila con fondo e importe numérico.");
    return { tipo: "cuotapartistas", sinFecha: true, tc, hoja: tab.hoja, meses: { [mes]: [...acc.values()].map(x => [x.f, x.c, x.v, x.n.size]) },
      extra: { tipo: "inversores", meses: { [mes]: [...inv.values()].map(y => [y.c, y.tp, y.f, Math.round(y.v), y.n.size]) } } };
  }

  // Pase: compra y venta opuestas del mismo fondo, especie, VN y agente con números de operación a menos de 5
  function marcarPases(filas) {
    const opu = { COMPRA: "VENTA", VENTA: "COMPRA" }, grp = new Map(), U = x => limpio(x.tipo_op).toUpperCase();
    for (const x of filas) { const k = [x.fondo, x.especie, x.vn, x.agente].join("|"); (grp.get(k) || grp.set(k, []).get(k)).push(x); }
    for (const x of filas) {
      const t = opu[U(x)];
      const es = !!t && x.op != null && grp.get([x.fondo, x.especie, x.vn, x.agente].join("|")).some(y => U(y) === t && y.op != null && Math.abs(y.op - x.op) < 5);
      x.categoria_pase = es ? "Pase" : x.categoria;
    }
    return filas;
  }

  const TIPOS = {
    com_unidad: { nombre: "Facturación por unidad de negocio", cols: ["unidad", "comisiones"], unidad: "USD" },
    com_fondo: { nombre: "Facturación por fondo", cols: ["fondo", "comisiones"], unidad: "USD" },
    aum_unidad: { nombre: "AUM interno por unidad (DAX 1)", cols: ["unidad", "aum_orig", "ten", "fact", "flujo"], unidad: "USD" },
    aum_unidad_fondo: { nombre: "AUM interno por unidad y fondo (DAX 2)", cols: ["unidad", "fondo", "aum", "fact", "flujo"], unidad: "USD" },
    clientes: { nombre: "Clientes: top facturación y ACDIs (DAX 3)", cols: ["nombre", "unidad", "aum", "fact", "flujo"], unidad: "USD" },
    inversores: { nombre: "Posición CP: inversores por tipo y fondo", cols: ["categoria", "tipopersona", "fondo", "aum", "n"], unidad: "" },
    terceros: { nombre: "Fondos de terceros colocados vía Balanz", cols: ["fondo", "gerente", "aum_ars"], unidad: "ARS" },
    emisiones: { nombre: "Facturación por emisiones primarias", cols: ["emision", "emisor", "fact"], unidad: "USD" },
    cerrados: { nombre: "Fondos fuera de CAFCI (cerrados, FCICC)", cols: ["fondo", "aum", "fact"], unidad: "USD" },
    exclusiones: { nombre: "Clientes excluidos (Ex Meli)", cols: ["cliente", "motivo"], unidad: "" },
    textos: { nombre: "Textos del mes (acciones, destacados, ratings, follow-ups)", cols: ["seccion", "texto"], unidad: "" },
    compraventa: { nombre: "Compra/venta de especies de los fondos (contrapartes)", cols: CV_COLS, unidad: "USD" },
    serie_facturacion: { nombre: "Serie de facturación mensual (Serie Facturación)", cols: ["fecha", "facturacion"], unidad: "USD" },
    cuotapartistas: { nombre: "Posición CP: cuotapartistas por fondo y tipo de inversor", cols: ["Fondo", "categoria_tipo_inversor", "importe_usd_mill", "cuotapartistas"], unidad: "USD" }
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
  const ORDEN = Object.keys(TIPOS).filter(t => t !== "inversores").flatMap(t => t === "cuotapartistas" ? [t, "inversores"] : [t]);   // las dos bases de la Posición CP juntas
  const MESES_EN = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    ene: 1, abr: 4, ago: 8, dic: 12 };

  const limpio = s => String(s == null ? "" : s).replace(/ /g, " ").trim();
  const num = v => { if (v == null || v === "") return 0; if (typeof v === "number") return v;
    const s = String(v).trim();
    const x = Number(s.includes(",") && (!s.includes(".") || s.lastIndexOf(",") > s.lastIndexOf(".")) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "")); return isFinite(x) ? x : 0; };
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

  /* Lector rápido para .xlsx grandes (ej. la posición de cuotapartistas, 300 mil filas y varias hojas): descomprime cada hoja
     en streaming y la recorre fila por fila sin armar el libro entero. Mira las primeras filas de cada hoja, elige la que
     tiene los encabezados que se reconocen y lee completa solo esa. */
  async function leerXlsxGrande(file) {
    const buf = async (a, b) => new Uint8Array(await file.slice(a, b).arrayBuffer());
    const tail = await buf(Math.max(0, file.size - 70000), file.size), dv = new DataView(tail.buffer);
    let eo = -1; for (let i = tail.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eo = i; break; }
    if (eo < 0) throw new Error("no es un .xlsx válido");
    const n = dv.getUint16(eo + 10, true), cdSize = dv.getUint32(eo + 12, true), cdOff = dv.getUint32(eo + 16, true);
    const cd = await buf(cdOff, cdOff + cdSize), cv = new DataView(cd.buffer), ent = {}, td = new TextDecoder();
    for (let i = 0, p = 0; i < n; i++) {
      const met = cv.getUint16(p + 10, true), cs = cv.getUint32(p + 20, true), ln = cv.getUint16(p + 28, true), lx = cv.getUint16(p + 30, true), lc = cv.getUint16(p + 32, true), off = cv.getUint32(p + 42, true);
      ent[td.decode(cd.subarray(p + 46, p + 46 + ln))] = { met, cs, off }; p += 46 + ln + lx + lc;
    }
    async function stream(nombre) {
      const e = ent[nombre]; const h = await buf(e.off, e.off + 30), hv = new DataView(h.buffer);
      const ini = e.off + 30 + hv.getUint16(26, true) + hv.getUint16(28, true);
      let st = file.slice(ini, ini + e.cs).stream(); if (e.met === 8) st = st.pipeThrough(new DecompressionStream("deflate-raw"));
      return st.pipeThrough(new TextDecoderStream());
    }
    const texto = async nombre => { if (!ent[nombre]) return ""; let t = ""; for await (const ch of await stream(nombre)) t += ch; return t; };
    const ent_ = s => s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, c) => ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" })[c.toLowerCase()] || String.fromCodePoint(c[1] === "x" || c[1] === "X" ? parseInt(c.slice(2), 16) : +c.slice(1)));
    const textoDe = x => { let t = "", m; const re = /<t\b[^>]*>([\s\S]*?)<\/t>/g; while ((m = re.exec(x))) t += m[1]; return ent_(t); };
    const ss = [];
    { const txt = await texto("xl/sharedStrings.xml"); const re = /<si>([\s\S]*?)<\/si>/g; let m; while ((m = re.exec(txt))) ss.push(textoDe(m[1])); }
    // hojas en el orden del libro, con su nombre
    const wbx = await texto("xl/workbook.xml"), rels = await texto("xl/_rels/workbook.xml.rels"), destino = {};
    { const re = /<Relationship\b[^>]*>/g; let m; while ((m = re.exec(rels))) { const id = (/\bId="([^"]+)"/.exec(m[0]) || [])[1], t = (/\bTarget="([^"]+)"/.exec(m[0]) || [])[1]; if (id && t) destino[id] = t.replace(/^\/?(xl\/)?/, "xl/"); } }
    const hojas = []; { const re = /<sheet\b[^>]*>/g; let m; while ((m = re.exec(wbx))) { const nm = ent_((/\bname="([^"]*)"/.exec(m[0]) || [])[1] || ""), id = (/\br:id="([^"]+)"/.exec(m[0]) || [])[1]; if (destino[id] && ent[destino[id]]) hojas.push({ nombre: nm, path: destino[id] }); } }
    if (!hojas.length) Object.keys(ent).filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort().forEach(k => hojas.push({ nombre: k.split("/").pop(), path: k }));
    const col = r => { let c = 0; for (const ch of r) { const k = ch.charCodeAt(0); if (k < 65) break; c = c * 26 + (k - 64); } return c - 1; };
    const fila = x => {
      const r = []; const re = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g; let m;
      while ((m = re.exec(x))) {
        const at = m[1], rr = /\br="([A-Z]+)/.exec(at), t = (/\bt="(\w+)"/.exec(at) || [])[1], ci = rr ? col(rr[1]) : r.length, inner = m[2] || "";
        let v = null;
        if (t === "inlineStr") v = textoDe(inner);
        else { const vv = /<v>([\s\S]*?)<\/v>/.exec(inner); if (vv) v = t === "s" ? ss[+vv[1]] : t === "str" || t === "e" ? ent_(vv[1]) : t === "b" ? vv[1] === "1" : +vv[1]; }
        r[ci] = v;
      }
      for (let i = 0; i < r.length; i++) if (r[i] === undefined) r[i] = null;
      return r;
    };
    async function leerHoja(path, max) {
      const filas = [], rd = (await stream(path)).getReader(); let resto = "";
      while (true) {
        const { done, value } = await rd.read(); if (done) break;
        resto += value; const fin = resto.lastIndexOf("</row>"); if (fin < 0) continue;
        const bloque = resto.slice(0, fin + 6); resto = resto.slice(fin + 6);
        const re = /<row\b[^>]*>([\s\S]*?)<\/row>/g; let m; while ((m = re.exec(bloque))) filas.push(fila(m[1]));
        if (max && filas.length >= max) { try { await rd.cancel(); } catch (e) {} break; }
      }
      return max ? filas.slice(0, max) : filas;
    }
    let elegida = hojas[0];
    if (hojas.length > 1) {
      let mejor = -1;
      for (const h of hojas) { const p = puntaje(await leerHoja(h.path, 40)); if (p > mejor + 1e-9) { mejor = p; elegida = h; } }
      if (mejor < 0.5) elegida = hojas[0];
    }
    const tab = await leerHoja(elegida.path); tab.hoja = elegida.nombre; return tab;
  }

  async function leerTabla(file) {      // → matriz de celdas (array de filas) de la hoja que tiene los datos
    const nom = file.name.toLowerCase();
    if (/\.(xlsx|xlsm)$/.test(nom) && file.size > 4e6 && window.DecompressionStream) {
      try { return await leerXlsxGrande(file); } catch (e) { console.error("lector rápido", e); }
    }
    if (/\.(xlsx|xlsm|xls)$/.test(nom)) {
      const X = await xlsx(); const wb = X.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const hojas = wb.SheetNames.map(nm => { const t = X.utils.sheet_to_json(wb.Sheets[nm], { header: 1, raw: true, defval: null }); t.hoja = nm; return t; });
      if (hojas.length === 1) return hojas[0];
      const pts = hojas.map(puntaje), mx = Math.max(...pts);
      return mx >= 0.5 ? hojas[pts.indexOf(mx)] : hojas[0];
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
  function procesar(tab, forzar, nombre) {
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
    // (también "Exportar datos › Datos resumidos" de la matriz, por Unidad Negocio o por Fondos)
    const pri = ns => ns.map(idx).find(i => i >= 0) ?? -1;
    const iMes = pri(["FechaFinMes", "AnoMesCorto", "Mes", "Fecha"]), iNom = pri(["Unidad Negocio", "Fondos", "Fondo", "Analisis por"]), iVal = pri(["ComisionYTM", "Comision", "Comisión"]);
    if (iMes >= 0 && iNom >= 0 && iVal >= 0 && (idx("ComisionYTM") >= 0 || idx("FechaFinMes") >= 0 || idx("AnoMesCorto") >= 0)) {
      const meses = {}, nombres = new Set();
      for (const r of tab.slice(1)) { const mes = aMes(r[iMes]), n = limpio(r[iNom]); if (!mes || !n || n === "Total" || r[iVal] == null || r[iVal] === "") continue;
        nombres.add(n); (meses[mes] = meses[mes] || []).push([n, num(r[iVal])]); }
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
    if (forzar === "compraventa" || (!forzar && !mapear(cabeza(tab), ESQ.compraventa).faltan.length)) return compraventa(tab);
    // 5) serie de facturación (carpeta Serie Facturación: Fecha, Facturación)
    if ((!forzar || forzar === "serie_facturacion") && cols.length <= 3 && idx("Fecha") >= 0 && (idx("Facturación") >= 0 || idx("Facturacion") >= 0)) {
      const iv = idx("Facturación") >= 0 ? idx("Facturación") : idx("Facturacion"), meses = {};
      for (const r of tab.slice(1)) { const mes = aMes(r[idx("Fecha")]); if (!mes || r[iv] == null || r[iv] === "") continue; const [y, mm] = mes.split("-").map(Number); meses[mes] = [[finMes(y, mm), num(r[iv])]]; }
      return { tipo: "serie_facturacion", meses };
    }
    // 6) cantidad de cuotapartistas
    if (forzar === "cuotapartistas" || (!forzar && !mapear(cabeza(tab), ESQ.cuotapartistas).faltan.length)) return cuotapartistas(tab, nombre);
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
    // se parece a una compra/venta o a una posición de cuotapartistas pero le falta algo: alarma con cómo arreglarlo
    if (!forzar) { const cs = Object.entries(ESQ).map(([t, e]) => ({ e, m: mapear(cabeza(tab), e), n: e.campos.filter(c => c.req).length })).sort((a, b) => b.m.ok / b.n - a.m.ok / a.n);
      if (cs[0].m.ok / cs[0].n >= 0.5) throw alarma(cs[0].e, cs[0].m); }
    throw new Error("No reconozco el archivo. Formatos aceptados: la matriz exportada del Power BI de comisiones (Datos con diseño actual), "
      + "los Excel mensuales de comisiones (FechaFinMes, Unidad Negocio, ComisionYTM), el resultado de las consultas DAX, la compra/venta de especies, "
      + "la posición de cuotapartistas, la serie de facturación o las plantillas. Si es uno de esos, elegí el tipo en la lista para ver qué columnas le faltan.");
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
    // serie de facturación: la cargada (archivo Serie Facturación) y, para los meses que no trae, la suma de la facturación por unidad cargada
    const ss = datos("serie_facturacion"), su = datos("com_unidad");
    if (ss.length || su.length) {
      const deSerie = new Set(ss.map(d => d.mes)), deUnidad = new Set(su.filter(d => !deSerie.has(d.mes)).map(d => d.mes));
      const se = base.serie_facturacion.filter(r => !deSerie.has(String(r.fecha).slice(0, 7)) && !deUnidad.has(String(r.fecha).slice(0, 7)));
      for (const d of ss) for (const [f, v] of d.filas) se.push({ fecha: f, facturacion: v });
      for (const d of su) if (deUnidad.has(d.mes)) { const [y, m] = d.mes.split("-").map(Number); se.push({ fecha: finMes(y, m), facturacion: Math.round(d.filas.reduce((a, r) => a + r[1], 0)) }); }
      I.serie_facturacion = se.sort((a, b) => a.fecha < b.fecha ? -1 : 1);
    } else I.serie_facturacion = base.serie_facturacion;
    const cv = datos("compraventa");
    if (!base.contrapartes) base.contrapartes = (I.contrapartes || []).slice();
    if (cv.length) {
      const meses = new Set(cv.map(d => d.mes));
      const out = base.contrapartes.filter(r => !meses.has(String(r.fecha || "").slice(0, 7)));
      for (const d of cv) for (const f of d.filas) out.push(Object.fromEntries(CV_COLS.map((c, k) => [c, f[k]])));
      marcarPases(out);   // los pases se recalculan sobre todo el histórico (una punta puede venir en otro archivo)
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
    const c = { com_unidad: 1, com_fondo: 1, aum_unidad: 1, aum_unidad_fondo: 2, clientes: 2, inversores: 3, terceros: 2, emisiones: 2, cerrados: 2, compraventa: 19, cuotapartistas: 2, serie_facturacion: 1 }[tipo];
    return c == null ? filas.length : filas.reduce((a, r) => a + (+r[c] || 0), 0);
  }
  const queMide = t => ({ com_unidad: "Facturación USD", com_fondo: "Facturación USD", inversores: "AUM", clientes: "AUM USD",
    terceros: "AUM ARS", emisiones: "Facturación USD", cerrados: "Facturación USD", exclusiones: "Clientes", textos: "Textos", compraventa: "Monto USD mill.", cuotapartistas: "AUM USD mill.", serie_facturacion: "Facturación USD" })[t] || "AUM USD";
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
        <li><b>AUM interno y clientes</b>: modelo <i>DS Fondos - AM - Comisiones - Volumen - CuotaPartes</i> (área SelfService_Fondos) › <i>Abrir en la vista de consulta DAX</i>. Corré las consultas 1 a 3 de <code>informe/comite/consultas_dax.dax</code> y copiá cada resultado con <i>Copia › Toda la tabla</i>: pegalo abajo o guardalo como .txt.</li>
        <li><b>Plantillas de Excel</b> (<a href="https://github.com/mfriedB/cafci/tree/main/informe/plantillas" target="_blank" rel="noopener">bajarlas del repo</a>; cada una tiene una hoja de instrucciones): AUM y flujo por área comercial y fondo, clientes, inversores PH/PJ, fondos de terceros, emisiones primarias, fondos fuera de CAFCI, clientes excluidos (Ex Meli) y textos del mes.</li>
        <li><b>Serie de facturación</b>: no hace falta subirla todos los meses. Los meses que no trae se completan solos con el total de la facturación por unidad de negocio (los archivos de comisiones). Si subís el Excel de la carpeta <i>Serie Facturación</i> (Fecha, Facturación), sus meses tienen prioridad.</li>
        <li><b>Posición CP</b> (cuotapartistas por fondo y tipo de inversor, e inversores por tipo y fondo: los dos salen de este archivo): el Excel <i>Posición CP TODOS los fondos dd-mm-aaaa.xlsx</i> tal como sale del sistema (título, encabezados en varias filas y varias hojas: se usa la que tiene Fondo, Tipo de Inversor, Cuotapartista, Inversión y Moneda). La fecha sale del título (<i>Posición de Cuotapartista al 30/10/2026</i>) o del nombre del archivo, y la podés cambiar antes de guardar. El AUM en pesos se pasa a dólares al dólar oficial vendedor del BCRA de esa fecha, que el tablero baja solo todos los días. También arma la base de inversores (personas humanas y jurídicas) de la presentación del comité.</li>
        <li><b>Compra/venta de especies</b> (slides de contrapartes): el Excel de operaciones de los fondos (<i>compra_vta_*.xls</i> o .xlsx), con los encabezados de dos o tres filas como sale del sistema. Se guardan todos los meses que trae. Los montos en pesos se pasan a dólares al oficial vendedor del BCRA del día de cada operación; u$s y Usc quedan en dólares.</li>
        <li>Las columnas se reconocen por nombre y por contenido, aunque cambien de lugar, de nombre o haya columnas de más. Si falta algo aparece una alarma con lo que no encontré y cómo modificar el archivo.</li>
        <li>El tipo de archivo se reconoce solo; si se equivoca, cambialo en la lista antes de guardar.</li>
        <li>Si un archivo trae varios meses (por ejemplo el acumulado del año), se guarda solo el último. Para cargar el histórico de una vez, destildá <i>Guardar solo el último mes de cada archivo</i>.</li></ol></details>
      <div class="ci-zona" tabindex="0"><b>Arrastrá los archivos acá</b> o <label class="ci-btn">elegilos<input type="file" multiple accept=".xlsx,.xls,.xlsm,.txt,.csv,.tsv" hidden></label><div class="ci-sub">.xlsx, .txt, .csv – varios a la vez</div></div>
      <details class="ci-pegar"><summary>Pegar el resultado de una consulta DAX</summary><textarea rows="6" placeholder="Pegá acá lo copiado con Copia › Toda la tabla"></textarea><button class="ci-btn" type="button">Procesar lo pegado</button></details>
      <div class="ci-prev"></div><div class="ci-estado"></div>`;
    const prev = w.querySelector(".ci-prev"), est = w.querySelector(".ci-estado"), zona = w.querySelector(".ci-zona"), inp = w.querySelector("input[type=file]");
    const ta = w.querySelector("textarea");

    async function agregar(nombre, tab) {
      try { const r = procesar(tab, null, nombre); pendientes.push(Object.assign({ archivo: nombre, tab }, r)); }
      catch (e) { pendientes.push({ archivo: nombre, error: e.message, ayuda: e.ayuda, tab }); }
      dibujarPrev();
    }
    async function archivos(fs) { for (const f of fs) { try { await agregar(f.name, await leerTabla(f)); } catch (e) { pendientes.push({ archivo: f.name, error: e.message }); dibujarPrev(); } } inp.value = ""; }
    inp.addEventListener("change", () => archivos([...inp.files]));
    zona.addEventListener("dragover", e => { e.preventDefault(); zona.classList.add("on"); });
    zona.addEventListener("dragleave", () => zona.classList.remove("on"));
    zona.addEventListener("drop", e => { e.preventDefault(); zona.classList.remove("on"); archivos([...e.dataTransfer.files]); });
    w.querySelector(".ci-pegar button").addEventListener("click", () => { if (ta.value.trim()) { agregar("pegado " + new Date().toLocaleString("es-AR"), textoATabla(ta.value)); ta.value = ""; } });

    // de los archivos acumulados (facturación YTD, consultas DAX, plantillas) se guarda el último mes; la compraventa y la serie
    // de facturación traen meses distintos que no se repiten en el archivo siguiente: se guardan enteros
    const TODOS = new Set(["compraventa", "serie_facturacion"]);
    const aGuardar = p => { const ms = Object.keys(p.meses).sort(); return soloUltimo && ms.length > 1 && !TODOS.has(p.tipo) ? ms.slice(-1) : ms; };
    const cargadoDe = (tipo, mes) => datos(tipo).find(d => d.mes === mes);
    const ultimoCargado = tipo => { const ms = C.docs.filter(d => d.tipo === tipo).map(d => d.mes).filter(m => m !== "fijo").sort(); return ms[ms.length - 1]; };

    function dibujarPrev() {
      if (!pendientes.length) { prev.innerHTML = ""; return; }
      const ok = pendientes.filter(p => !p.error);
      let h = `<h3>Para guardar</h3><label class="ci-sub"><input type="checkbox" class="ci-ult"${soloUltimo ? " checked" : ""}> Guardar solo el último mes de cada archivo</label>
        <table class="ci-t"><thead><tr><th>Archivo</th><th>Tipo</th><th>Trae</th><th>Se guarda</th><th class="n">Total del último mes</th><th></th></tr></thead><tbody>`;
      pendientes.forEach((p, i) => {
        if (p.error) { h += `<tr class="err"><td>${esc(p.archivo)}</td><td colspan="4">${p.tab ? `<select data-i="${i}"><option value="">elegir tipo…</option>${ORDEN.map(t => `<option value="${t}">${TIPOS[t].nombre}</option>`).join("")}</select>` : ""}${p.ayuda ? alarmaHtml(p) : esc(p.error)}</td><td><button class="ci-x" data-i="${i}" type="button" aria-label="Quitar">✕</button></td></tr>`; return; }
        const ms = Object.keys(p.meses).sort(), ult = ms[ms.length - 1], g = aGuardar(p);
        const reemp = g.filter(m => cargadoDe(p.tipo, m)), uc = ultimoCargado(p.tipo);
        const nota = (reemp.length ? `<div class="ci-sub">reemplaza ${reemp.length === 1 ? mesTxt(reemp[0]) : reemp.length + " meses"} ya cargado${reemp.length === 1 ? "" : "s"}</div>` : "")
          + (uc && ult && ult !== "fijo" && ult < uc ? `<div class="mal">es anterior al último mes cargado (${mesTxt(uc)})</div>` : "");
        h += `<tr><td>${esc(p.archivo)}</td><td><select data-i="${i}">${ORDEN.map(t => `<option value="${t}"${t === p.tipo ? " selected" : ""}>${TIPOS[t].nombre}</option>`).join("")}</select></td>
          <td>${p.sinFecha ? `<input type="month" class="ci-mes" data-i="${i}" value="${ult}" title="El archivo no trae fecha: elegí a qué mes corresponde">` : rango(ms)}</td><td>${rango(g)}${nota}${p.extra ? `<div class="ci-sub">también arma: ${TIPOS[p.extra.tipo].nombre}</div>` : ""}${p.hoja ? `<div class="ci-sub">hoja «${esc(p.hoja)}»</div>` : ""}${p.tipo === "com_unidad" ? `<div class="ci-sub">también completa la serie de facturación (total ${g.length === 1 ? mesTxt(g[0]) : rango(g)}${datos("serie_facturacion").some(d => g.includes(d.mes)) ? ", salvo los meses que ya trae la serie subida" : ""})</div>` : ""}${p.tc ? (p.tc.fuente === "BCRA"
            ? `<div class="ci-sub">pesos a USD al dólar oficial vendedor BCRA del ${p.tc.fecha.split("-").reverse().join("/")}: ${fmt(p.tc.valor, 2)}</div>`
            : `<div class="mal">sin dólar oficial del BCRA para esa fecha: se usa ${fmt(p.tc.valor)}</div>`) : ""}</td>
          <td class="n">${ult ? queMide(p.tipo) + " " + mesTxt(ult) + ": " + fmt(total(p.tipo, p.meses[ult])) : ""}</td><td><button class="ci-x" data-i="${i}" type="button" aria-label="Quitar">✕</button></td></tr>`;
      });
      h += `</tbody></table><div class="ci-ctrl">${controles(ok)}</div>
        <button class="ci-btn ci-guardar" type="button"${ok.length && C.db ? "" : " disabled"}>Guardar ${ok.length} archivo${ok.length === 1 ? "" : "s"} en el tablero</button>
        ${C.db ? "" : `<span class="ci-sub"> ${C.estado === "cargando" ? "Conectando con la base del tablero…" : "La base del tablero no está disponible en esta vista: abrilo desde claude.ai con tu usuario."}</span>`}`;
      prev.innerHTML = h;
      prev.querySelector(".ci-ult").addEventListener("change", e => { soloUltimo = e.target.checked; dibujarPrev(); });
      prev.querySelectorAll("select").forEach(s => s.addEventListener("change", () => { const p = pendientes[+s.dataset.i];
        try { Object.assign(p, { sinFecha: false, extra: null, tc: null }, procesar(p.tab, s.value, p.archivo)); delete p.error; delete p.ayuda; } catch (e) { p.error = e.message; p.ayuda = e.ayuda; } dibujarPrev(); }));
      prev.querySelectorAll(".ci-mes").forEach(m => m.addEventListener("change", () => { const p = pendientes[+m.dataset.i]; if (!/^\d{4}-\d{2}$/.test(m.value)) return;
        try { Object.assign(p, cuotapartistas(p.tab, p.archivo, m.value)); } catch (e) { p.error = e.message; p.ayuda = e.ayuda; } dibujarPrev(); }));
      prev.querySelectorAll(".ci-x").forEach(b => b.addEventListener("click", () => { pendientes.splice(+b.dataset.i, 1); dibujarPrev(); }));
      const g = prev.querySelector(".ci-guardar"); if (g) g.addEventListener("click", guardar);
    }
    function alarmaHtml(p) {
      const a = p.ayuda;
      return `<div class="ci-alarma" role="alert"><b>⚠ ${esc(a.titulo)}</b><div>${esc(p.error)}</div>
        <div class="ci-sub">Leí ${a.hoja ? `la hoja «${esc(a.hoja)}», ` : ""}encabezados desde la fila ${a.fila}${a.vistos.length ? ": " + a.vistos.map(v => "«" + esc(v) + "»").join(", ") : " (no encontré encabezados)"}.</div>
        <div><b>Falta:</b><ul>${a.faltan.map(f => `<li>«${esc(f.ej)}»${f.malo ? ` – la columna «${esc(f.malo)}» tiene ese nombre pero su contenido no es ${f.tipo === "num" ? "numérico" : f.tipo === "fecha" ? "una fecha" : f.tipo === "mon" ? "un símbolo de moneda ($, u$s)" : "texto"}` : ""}</li>`).join("")}</ul></div>
        <div><b>Cómo arreglar el archivo:</b><ol>${a.pasos.map(x => `<li>${esc(x)}</li>`).join("")}</ol></div></div>`;
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
            try {
              let tab = p.tab, csv = aCsv(tab);
              if (csv.length > 18e6) {   // archivos muy grandes (ej. cuotapartistas): la copia guarda solo las columnas que usa el tablero
                const usa = ["Fondo", "Clase", "Tipo Inversor", "Cuotapartista", "Importe", "Moneda"], ix = usa.map(c => tab[0].indexOf(c)).filter(i => i >= 0);
                if (ix.length) csv = aCsv(tab.map(r => ix.map(i => r[i])));
              }
              // si no entra en un archivo (límite ~20 MB), la copia se guarda en partes, cada una con su encabezado
              const lineas = csv.split("\r\n"), enc = lineas.shift(), partes = []; let cur = [], tam = 0;
              for (const l of lineas) { if (cur.length && tam + l.length > 18e6) { partes.push(cur); cur = []; tam = 0; } cur.push(l); tam += l.length + 2; }
              partes.push(cur);
              const ids = [];
              for (const pt of partes) { const r = await C.assets.upload(new Blob(["\ufeff" + enc + "\r\n" + pt.join("\r\n")], { type: "text/csv" }), { type: "text/csv" }); ids.push(r.id); }
              copia = { id: ids[0], ids, bytes: csv.length };
            }
            catch (e) { console.error(e); sinCopia++; }
          } else sinCopia++;
          const ult = meses[meses.length - 1];
          const reg = { registro: true, archivo: p.archivo, archivoId, tipo: p.tipo, extra: p.extra ? p.extra.tipo : null, meses, mesesArchivo: Object.keys(p.meses).sort(),
            filas: meses.reduce((a, m) => a + (p.meses[m] || []).length, 0), ultimo: ult || null, total: ult ? total(p.tipo, p.meses[ult]) : null, at, copia, tc: p.tc || null };
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
    const abiertos = new Set();
    // grupos del histórico: un botón por tipo de archivo (la Posición CP arma cuotapartistas e inversores)
    const grupoDe = t => (t === "cuotapartistas" || t === "inversores" ? "Posición CP" : TIPOS[t] ? TIPOS[t].nombre : t);
    const ordenGrupo = g => { const i = ORDEN.findIndex(t => grupoDe(t) === g); return i < 0 ? 99 : i; };
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
        const lista = listaArchivos(), grupos = new Map();
        lista.forEach((x, i) => { const g = grupoDe(x.tipo); (grupos.get(g) || grupos.set(g, []).get(g)).push(i); });
        const orden = [...grupos.keys()].sort((a, b) => ordenGrupo(a) - ordenGrupo(b));
        h += `<h3>Archivos subidos</h3><p class="ci-sub">Un botón por tipo de archivo: tocalo para ver, bajar o eliminar sus archivos.</p><div class="ci-grupos">`;
        for (const g of orden) {
          const is = grupos.get(g), xs = is.map(i => lista[i]), meses = [...new Set(xs.flatMap(x => x.meses))].sort();
          const enUso = xs.filter(x => x.enUso.length).length;
          h += `<details class="ci-grupo" data-g="${esc(g)}"${abiertos.has(g) ? " open" : ""}><summary><b>${esc(g)}</b><span class="ci-sub">${xs.length} archivo${xs.length === 1 ? "" : "s"} · ${rango(meses)}${enUso < xs.length ? ` · ${xs.length - enUso} reemplazado${xs.length - enUso === 1 ? "" : "s"}` : ""}</span></summary>
            <table class="ci-t"><thead><tr><th>Archivo</th><th>Mes guardado</th><th class="n">Total</th><th>Subido</th><th>Estado</th><th></th></tr></thead><tbody>`;
          for (const i of is) {
            const x = lista[i];
            const usado = x.enUso.length, estado = usado === x.meses.length ? "en uso" : usado ? `en uso ${usado} de ${x.meses.length}` : "reemplazado";
            h += `<tr${usado ? "" : ' class="ci-off"'}><td>${esc(x.archivo)}${x.tipo === "cuotapartistas" ? `<div class="ci-sub">arma cuotapartistas por fondo y tipo de inversor, e inversores por tipo y fondo</div>` : x.tipo === "inversores" ? `<div class="ci-sub">inversores por tipo y fondo</div>` : ""}</td><td>${rango(x.meses)}</td>
              <td class="n">${x.ultimo ? queMide(x.tipo) + " " + fmt(x.total) : ""}</td><td>${x.at ? new Date(x.at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "–"}</td>
              <td>${estado}</td><td class="ci-acc">${x.copia && x.copia.id ? (x.copia.ids || [x.copia.id]).map((id, k, a) => `<a class="ci-lnk" href="/_blob/${esc(id)}" download="${esc(x.archivo.replace(/\.[^.]+$/, "") + (a.length > 1 ? "_parte" + (k + 1) : "") + ".csv")}" target="_blank" rel="noopener">Bajar${a.length > 1 ? " " + (k + 1) + "/" + a.length : ""}</a>`).join("") : ""}
              <button class="ci-btn ci-borrar" data-i="${i}" type="button">Eliminar</button></td></tr>`;
          }
          h += `</tbody></table></details>`;
        }
        h += `</div>`;
        h += `<p class="ci-sub">Eliminar saca el archivo y sus datos: cada mes vuelve a la versión anterior que se haya subido o, si no hay, a los archivos de la carpeta (data/internos.json).
          Un archivo "reemplazado" no se usa porque después se subió otro del mismo mes; si eliminás el más nuevo, vuelve a usarse el anterior.</p>`;
        est._lista = lista;
      }
      const fi = M.I.comisiones || [], ult = fi.length ? fi[fi.length - 1].mes : null;
      if (ult) h += `<p class="ci-sub">Facturación que usa hoy el tablero: hasta ${mesTxt(ult.slice(0, 7))}.</p>`;
      est.innerHTML = h;
      est.querySelectorAll(".ci-grupo").forEach(d => d.addEventListener("toggle", () => { d.open ? abiertos.add(d.dataset.g) : abiertos.delete(d.dataset.g); }));
      est.querySelectorAll(".ci-borrar").forEach(b => b.addEventListener("click", async () => {
        const x = est._lista[+b.dataset.i]; if (b.dataset.ok !== "1") { b.dataset.ok = "1"; b.textContent = "¿Seguro?"; return; }
        b.disabled = true; b.textContent = "Eliminando…";
        try {
          const docs = x.viejo ? x.docs : C.docs.filter(d => d.archivoId === x.archivoId);
          for (const d of docs) await C.db.doc("cargas/" + d.id).delete();
          const ids = new Set(docs.map(d => d.id)); C.docs = C.docs.filter(d => !ids.has(d.id));
          if (!x.viejo) {
            if (x.copia && x.copia.id && C.assets) for (const id of (x.copia.ids || [x.copia.id])) { try { await C.assets.delete(id); } catch (e) { console.error(e); } }
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
  window.CARGAS.procesar = procesar; window.CARGAS.textoATabla = textoATabla; window.CARGAS.leerTabla = leerTabla;   // para pruebas
})();
