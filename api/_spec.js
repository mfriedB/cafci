// Guia de la API: fuente unica para /docs (pagina web), /api/docs (JSON), /api/guia (markdown, llms.txt) y /api/openapi.
// Al agregar o cambiar un endpoint, actualizar aca: el router usa esta lista para avisar de parametros mal escritos.
const SITIO = "https://cafci.vercel.app";
const RAW = "https://raw.githubusercontent.com/mfriedB/cafci/datos/procesado/";

const INFO = {
  titulo: "API de Fondos Comunes de Inversión — base oficial CAFCI / CNV",
  version: "2.0",
  sitio: SITIO,
  resumen: "Datos diarios y mensuales de toda la industria de FCI abiertos de Argentina (desde enero 2020), armados solo con " +
    "fuentes oficiales: la Planilla Diaria de CAFCI archivada por la CNV y los Informes Mensuales de CAFCI. Mismo formato y " +
    "clasificación que 1816 (categoría, subcategoría, gerente). Se actualiza sola de lunes a viernes. Sin usuario ni clave.",
  fuente: "Planilla Diaria CAFCI archivada por la CNV + Informes Mensuales CAFCI",
  actualizacion: "Lunes a viernes a las 12:47 y 18:47 (hora Argentina). La CNV publica la planilla de cada día hábil al día siguiente, " +
    "así que el último dato suele ser del día hábil anterior.",
  codigo: "https://github.com/mfriedB/cafci",
};

// ---------------------------------------------------------------- parametros comunes
const COMUNES = [
  { n: "formato", d: "json (default) o csv. CSV es lo más simple para Power BI, Excel y Google Sheets.", valores: ["json", "csv"], ej: "csv" },
  { n: "excel", d: "Con formato=csv: 1 = CSV para Excel en castellano (separador ; , coma decimal y BOM UTF-8 para los acentos).", valores: ["1"], ej: "1" },
  { n: "descargar", d: "Con formato=csv: 1 = el navegador lo baja como archivo.", valores: ["1"], ej: "1" },
  { n: "columnas", d: "Devuelve solo estas columnas, separadas por coma (y en ese orden).", ej: "Fondo,Gerente,AUM_promedio" },
  { n: "ordenar", d: "Ordena por una o varias columnas separadas por coma; con - adelante es descendente.", ej: "-AUM_promedio" },
  { n: "limite", d: "Cantidad máxima de filas (paginación). La respuesta trae total_filas y siguiente_offset.", ej: "1000" },
  { n: "offset", d: "Filas a saltear (paginación, se usa con limite).", ej: "1000" },
];

// ---------------------------------------------------------------- diccionarios de columnas reutilizados
const MENSUAL = {
  Fecha: "Último día con dato del mes (en el mes en curso, la última planilla).",
  Categoria: "Tipo de fondo según 1816 (Money Market, T+1, Renta Fija, Renta Mixta, Renta Variable, Destino Esp.).",
  Subcategoria: "Subtipo de fondo según 1816 (ej. MM ARS Clásico, RF USD corp loc).",
  Fondo: "Nombre del fondo como lo muestra 1816.",
  Gerente: "Sociedad gerente, nombre corto de 1816 (ej. Balanz, Galicia).",
  AUM_promedio: "Patrimonio promedio del mes: suma del patrimonio de cada día calendario / días del mes.",
  AUM_Inicial: "Patrimonio al cierre del mes anterior.",
  AUM_Final: "Patrimonio al último día del mes.",
  Susc_Netas: "Suscripciones menos rescates del mes (flujo diario = variación de cuotapartes × valor de cuotaparte).",
  Rendimiento: "Resultado por variación de cuotaparte: AUM_Final − AUM_Inicial − Susc_Netas.",
  Facturacion_Gerente: "Honorarios de la sociedad gerente devengados en el mes (honorario % anual × patrimonio diario / 365).",
  Facturacion_Depo: "Honorarios de la sociedad depositaria devengados en el mes.",
  suma_aums_mensual: "AUM_promedio total de la industria en el mes (se repite en todas las filas).",
  suma_mensual_balanz: "AUM_promedio total de los fondos Balanz (solo en filas de Balanz, 0 en el resto).",
  suma_aums_mm_mensual: "AUM_promedio total de Money Market (solo en filas de Money Market, 0 en el resto).",
  suma_aums_no_mm_mensual: "AUM_promedio total sin Money Market (solo en filas que no son Money Market, 0 en el resto).",
  Codigo_CNV: "Código CNV del fondo (identificador estable: no cambia si cambia el nombre o el gerente).",
  Tipo_Gerente: "Bancaria o Independiente (como 1816).",
  Sociedad_Gerente: "Razón social de la gerente según CAFCI.",
  Fondo_CAFCI: "Nombre del fondo según CAFCI.",
  Clasificacion_CAFCI: "Clasificación oficial de CAFCI (ej. Renta Fija Dolar Estadounidense).",
};
const CLASE_DIARIO = {
  fecha: "Fecha del dato.", planilla: "Planilla CNV de la que sale el dato.", fecha_ant: "Fecha del dato anterior informado.",
  codigo_cafci: "Código CAFCI de la clase (cuotaparte).", codigo_cnv: "Código CNV del fondo.", fondo_clase: "Nombre de la clase.",
  fondo: "Nombre del fondo (CAFCI).", gerente: "Razón social de la gerente.", clasificacion_cafci: "Clasificación CAFCI.",
  categoria_1816: "Tipo 1816.", subcategoria_1816: "Subtipo 1816.", gerente_1816: "Gerente (nombre corto 1816).",
  tipo_gerente: "Bancaria / Independiente.", fondo_1816: "Nombre del fondo en 1816.",
  cuota_referencia: "1 si es la clase que se usa para rankings de rendimiento (una por fondo, como 1816).",
  moneda: "Moneda de la clase (ARS, USD...).", moneda_fondo: "Moneda del fondo.", horizonte: "Horizonte de inversión (CAFCI).",
  plazo_liq: "Plazo de liquidación del rescate, en días hábiles.", decreto_596: "S si es fondo del Decreto 596/2019 (se excluyen de los totales).",
  ley_27743: "S si es fondo de la Ley 27.743 (blanqueo).", tipo_dinero: "Tipo de dinero (CAFCI).",
  vcp: "Valor de cuotaparte (por 1.000 cuotapartes, en la moneda de la clase).", ccp: "Cantidad de cuotapartes.",
  patrimonio: "Patrimonio de la clase en su moneda (en unidades, no millones).", fx: "Tipo de cambio usado para pasar a pesos (promedio MEP-CCL del día).",
  fx_planilla: "Tipo de cambio implícito en la planilla CAFCI.", patrimonio_ars: "Patrimonio en pesos (en unidades, no millones).",
  flujo_ars: "Suscripciones netas del día en pesos (en unidades).", hon_sg: "Honorario de la gerente, % anual (0.85 = 0,85%).",
  hon_sd: "Honorario de la depositaria, % anual.", minimo_inversion: "Mínimo de inversión.", calificado: "S si es solo para inversores calificados.",
  region: "Región (CAFCI).", depositaria: "Sociedad depositaria.", calificacion: "Calificación de riesgo.",
  comision_ingreso: "Comisión de ingreso, %.", comision_rescate: "Comisión de rescate, %.", comision_transferencia: "Comisión de transferencia, %.",
  gastos_gestion: "Gastos de gestión, %.", hon_exito: "S si cobra honorario de éxito.", indice_mm: "Índice de referencia (Money Market).",
  repatriacion: "S si es fondo de repatriación.", tipo_escision: "Tipo de escisión (si el fondo viene de otro).",
  id_cafci_padre: "Clase de origen de la escisión.", id_cnv_padre: "Fondo de origen de la escisión.",
  var_mes: "Variación de cuotaparte del mes informada por CAFCI, %.", var_anio: "Variación del año, %.", var_12m: "Variación 12 meses, %.",
};
const SNAP = {
  grupo: "Valor del agrupador elegido en por=.", codigo_cnv: "Código CNV (por=fondo o cuota).", fondo: "Fondo (1816).",
  gerente: "Gerente (1816).", tipo_gerente: "Bancaria / Independiente.", tipo: "Tipo 1816.", subtipo: "Subtipo 1816.",
  codigo_cafci: "Código CAFCI (por=cuota).", cuota: "Clase (por=cuota).", moneda_clase: "Moneda de la clase (por=cuota).",
  cuotas: "Cantidad de clases sumadas.", patrimonio_inicio: "Patrimonio el día desde (millones).", patrimonio_fin: "Patrimonio el día hasta (millones).",
  patrimonio_promedio: "Patrimonio promedio por día calendario del período (millones).", susc_netas: "Suscripciones netas del período (millones).",
  rendimiento: "patrimonio_fin − patrimonio_inicio − susc_netas (millones).", var_total_pct: "Variación total del patrimonio (decimal: 0.05 = 5%).",
  susc_netas_pct: "Suscripciones netas / patrimonio de inicio (decimal).", rendimiento_pct: "Rendimiento / patrimonio de inicio (decimal).",
  honorarios_gerente: "Honorarios de la gerente del período (millones).", honorarios_depositaria: "Honorarios de la depositaria (millones).",
  honorarios_total: "Gerente + depositaria (millones).", honorarios_gerente_pct: "Honorarios de la gerente anualizados sobre el patrimonio promedio (decimal).",
  honorarios_depositaria_pct: "Ídem depositaria (decimal).", honorarios_total_pct: "Ídem total (decimal).",
  participacion: "Participación en el patrimonio_fin del total listado (decimal).",
};

// ---------------------------------------------------------------- endpoints
const FILTROS_1816 = [
  { n: "gerente", d: "Texto en el nombre corto del gerente (sin distinguir mayúsculas ni acentos).", ej: "balanz" },
  { n: "categoria", d: "Texto en la categoría 1816.", ej: "money" },
  { n: "subcategoria", d: "Texto en la subcategoría 1816.", ej: "MM ARS" },
  { n: "tipo_gerente", d: "Bancaria o Independiente.", ej: "bancaria" },
];
const MONEDA_MENSUAL = { n: "moneda", d: "ars (default) o usd. En USD cada día se convierte al dólar de ese día (promedio MEP-CCL, como 1816) y después se agrega al mes.", valores: ["ars", "usd"], ej: "usd" };

const ENDPOINTS = [
  // ---- empezar
  { ruta: "estado", grupo: "Empezar", titulo: "Estado de la base",
    descripcion: "Fecha del último dato, última actualización, meses disponibles y si la base está al día. Útil para mostrar \"datos al ...\" en un tablero.",
    parametros: [], ejemplos: [{ url: "/api/estado" }],
    columnas: { estado: "ok o revisar (más de un día hábil sin planilla nueva; puede ser un feriado).", ultima_planilla: "Fecha del último dato diario.",
      actualizado: "Momento de la última corrida (UTC).", primer_mes: "Primer mes con datos.", ultimo_mes: "Último mes (puede ser parcial)." } },
  { ruta: "catalogo", grupo: "Empezar", titulo: "Buscador de fondos y clases",
    descripcion: "Lista de fondos (o clases) vigentes con sus códigos CNV y CAFCI, clasificación, moneda, honorarios y patrimonio. Es el punto de partida para encontrar el código de un fondo.",
    parametros: [
      { n: "nivel", d: "fondo (default, una fila por fondo) o clase (una fila por clase/cuotaparte).", valores: ["fondo", "clase"], ej: "clase" },
      { n: "buscar", d: "Texto en el nombre del fondo, la clase o el gerente.", ej: "ahorro dolares" },
      { n: "fondo", d: "Texto en el nombre del fondo.", ej: "renta fija" },
      ...FILTROS_1816,
      { n: "moneda", d: "Moneda de la clase (ARS, USD).", ej: "USD" },
      { n: "codigo", d: "Código CNV (uno o varios separados por coma).", ej: "876" },
      { n: "clase", d: "Código CAFCI de la clase (uno o varios).", ej: "2096" },
      { n: "incluir_596", d: "1 = incluye los fondos del Decreto 596 (por default se excluyen, como en el resto de la base).", valores: ["1"] },
    ],
    ejemplos: [{ url: "/api/catalogo?gerente=balanz", d: "fondos de Balanz" }, { url: "/api/catalogo?nivel=clase&buscar=ahorro%20en%20dolares", d: "clases de un fondo" },
      { url: "/api/catalogo?subcategoria=MM%20ARS&ordenar=-patrimonio_fondo&limite=10", d: "10 Money Market más grandes" }],
    columnas: { fecha: "Fecha del último dato.", codigo_cnv: "Código CNV del fondo.", codigo_cafci: "Código CAFCI de la clase (nivel=clase).",
      cuota: "Nombre de la clase (nivel=clase).", fondo: "Fondo (1816).", fondo_cafci: "Fondo (CAFCI).", gerente: "Gerente (1816).",
      sociedad_gerente: "Razón social de la gerente.", tipo_gerente: "Bancaria / Independiente.", categoria: "Tipo 1816.", subcategoria: "Subtipo 1816.",
      clasificacion_cafci: "Clasificación CAFCI.", moneda_clase: "Moneda de la clase.", monedas: "Monedas de las clases del fondo (nivel=fondo).",
      clases: "Cantidad de clases (nivel=fondo).", cuota_referencia: "1 si es la clase de referencia para rankings.",
      codigo_cafci_referencia: "Clase de referencia del fondo (nivel=fondo).", patrimonio_clase: "Patrimonio de la clase, millones de ARS.",
      patrimonio_fondo: "Patrimonio del fondo, millones de ARS.", hon_gerente: "Honorario de la gerente, % anual (0.85 = 0,85%).",
      hon_depositaria: "Honorario de la depositaria, % anual.", calificacion: "Calificación de riesgo.", depositaria: "Sociedad depositaria.",
      decreto_596: "S si es fondo del Decreto 596.", fuente_clasificacion: "1816, manual o regla automática (fondos nuevos sin dato de 1816)." } },
  { ruta: "taxonomia", grupo: "Empezar", titulo: "Clasificación 1816 de cada fondo",
    descripcion: "Tipo, subtipo, gerente y tipo de gerente de cada fondo como en 1816, y de dónde sale la clasificación (1816, manual o regla automática para fondos nuevos).",
    parametros: [{ n: "tipo", d: "Texto en el tipo 1816.", ej: "renta fija" }, { n: "subtipo", d: "Texto en el subtipo.", ej: "USD" },
      { n: "gerente", d: "Texto en el gerente.", ej: "balanz" }, { n: "tipo_gerente", d: "Bancaria / Independiente." },
      { n: "fuente", d: "1816, manual o regla.", ej: "regla" }, { n: "codigo", d: "Código CNV (uno o varios).", ej: "876" }],
    ejemplos: [{ url: "/api/taxonomia?fuente=regla", d: "fondos nuevos clasificados automáticamente (conviene revisarlos)" }],
    columnas: { Codigo_CNV: "Código CNV.", fondo: "Fondo (CAFCI).", gerente: "Razón social.", clasificacion_cafci: "Clasificación CAFCI.",
      Fondo_1816: "Fondo (1816).", Tipo_1816: "Tipo.", Subtipo_1816: "Subtipo.", Gerente_1816: "Gerente (nombre corto).",
      Tipo_Gerente_1816: "Bancaria / Independiente.", fuente_tax: "1816, manual o \"regla: ...\"." } },

  // ---- mensual
  { ruta: "fondos", grupo: "Mensual por fondo", titulo: "Un mes, todos los fondos",
    descripcion: "Una fila por fondo para un mes: AUM promedio, inicial y final, suscripciones netas, rendimiento y facturación. Es la bajada \"Métricas por Fondo\" de 1816.",
    parametros: [{ n: "mes", d: "AAAA-MM (default: último mes, que puede estar en curso).", ej: "2026-10" }, MONEDA_MENSUAL,
      ...FILTROS_1816, { n: "fondo", d: "Texto en el nombre del fondo.", ej: "ahorro" }, { n: "codigo", d: "Código CNV (uno o varios separados por coma).", ej: "876" }],
    ejemplos: [{ url: "/api/fondos?mes=2026-10&gerente=balanz" }, { url: "/api/fondos?mes=2026-10&categoria=money&moneda=usd&formato=csv" }],
    columnas: MENSUAL, unidad: "millones de ARS (o de USD con moneda=usd)" },
  { ruta: "serie", grupo: "Mensual por fondo", titulo: "Serie mensual de fondos",
    descripcion: "Las mismas columnas que /api/fondos pero para varios meses (desde enero 2020), con la columna Mes. Pedir al menos un filtro.",
    parametros: [{ n: "codigo", d: "Código CNV (uno o varios separados por coma).", ej: "876,445" }, { n: "fondo", d: "Texto en el nombre del fondo." },
      ...FILTROS_1816, { n: "desde", d: "Mes inicial AAAA-MM.", ej: "2024-01" }, { n: "hasta", d: "Mes final AAAA-MM.", ej: "2026-10" }, MONEDA_MENSUAL],
    ejemplos: [{ url: "/api/serie?codigo=876&desde=2024-01" }, { url: "/api/serie?gerente=balanz&desde=2025-01&moneda=usd&columnas=Mes,Fondo,AUM_promedio,Susc_Netas" }],
    columnas: { Mes: "Mes AAAA-MM.", ...MENSUAL }, unidad: "millones de ARS (o de USD con moneda=usd)" },
  { ruta: "industria", grupo: "Mensual por fondo", titulo: "Totales mensuales de la industria",
    descripcion: "Totales por mes, de toda la industria o agrupados por categoría, subcategoría, gerente o tipo de gerente.",
    parametros: [{ n: "desde", d: "Mes inicial AAAA-MM.", ej: "2025-01" }, { n: "hasta", d: "Mes final AAAA-MM." },
      { n: "por", d: "Agrupador.", valores: ["total", "categoria", "subcategoria", "gerente", "tipo_gerente"], ej: "categoria" }, ...FILTROS_1816, MONEDA_MENSUAL],
    ejemplos: [{ url: "/api/industria?desde=2025-01&por=categoria" }, { url: "/api/industria?por=gerente&gerente=balanz&moneda=usd" }],
    columnas: { Mes: "Mes.", Grupo: "Industria (por=total) o el valor del agrupador (la columna se llama como el agrupador).", Fondos: "Cantidad de fondos.",
      AUM_promedio: MENSUAL.AUM_promedio, AUM_Inicial: MENSUAL.AUM_Inicial, AUM_Final: MENSUAL.AUM_Final, Susc_Netas: MENSUAL.Susc_Netas,
      Rendimiento: MENSUAL.Rendimiento, Facturacion_Gerente: MENSUAL.Facturacion_Gerente, Facturacion_Depo: MENSUAL.Facturacion_Depo },
    unidad: "millones de ARS (o de USD con moneda=usd)" },
  { ruta: "ranking", grupo: "Mensual por fondo", titulo: "Ranking de gerentes o fondos",
    descripcion: "Ranking de un mes por AUM, suscripciones netas o facturación, con participación sobre el total.",
    parametros: [{ n: "mes", d: "AAAA-MM (default: último).", ej: "2026-10" },
      { n: "por", d: "gerente (default) o fondo.", valores: ["gerente", "fondo"] },
      { n: "metrica", d: "Métrica a rankear.", valores: ["AUM_promedio", "AUM_Final", "Susc_Netas", "Facturacion_Gerente"], ej: "Susc_Netas" },
      { n: "categoria", d: "Texto en la categoría 1816." }, { n: "subcategoria", d: "Texto en la subcategoría 1816." }, { n: "tipo_gerente", d: "Bancaria / Independiente." },
      { n: "top", d: "Cantidad de puestos (default 30).", ej: "10" }, MONEDA_MENSUAL],
    ejemplos: [{ url: "/api/ranking?mes=2026-10&metrica=Susc_Netas&top=10" }, { url: "/api/ranking?mes=2026-10&por=fondo&subcategoria=MM%20ARS" }],
    columnas: { Puesto: "Puesto.", Gerente: "Gerente.", Fondo: "Fondo (por=fondo).", Codigo_CNV: "Código CNV (por=fondo).",
      "<metrica>": "Valor de la métrica pedida.", Participacion: "Participación sobre el total (decimal)." },
    unidad: "millones de ARS (o de USD con moneda=usd)" },

  // ---- periodo a medida
  { ruta: "snapshot", grupo: "Período a medida", titulo: "Snapshot de cualquier período",
    descripcion: "Patrimonio de inicio, fin y promedio, suscripciones netas, rendimiento y honorarios entre dos fechas cualquiera (Snapshot Industria de 1816). Máximo 400 días.",
    parametros: [{ n: "desde", d: "Fecha inicial AAAA-MM-DD (patrimonio de inicio = ese día). Default: último día del mes anterior.", ej: "2026-06-30" },
      { n: "hasta", d: "Fecha final AAAA-MM-DD (default: último dato).", ej: "2026-11-14" },
      { n: "por", d: "Agrupador (default fondo).", valores: ["total", "tipo", "subtipo", "tipo_gerente", "gerente", "fondo", "cuota", "moneda", "depositaria"], ej: "gerente" },
      { n: "moneda", d: "ars (default) o usd (cada día al dólar de ese día).", valores: ["ars", "usd"] },
      { n: "tipo", d: "Texto en el tipo 1816." }, { n: "subtipo", d: "Texto en el subtipo 1816." }, { n: "gerente", d: "Texto en el gerente." },
      { n: "tipo_gerente", d: "Bancaria / Independiente." }, { n: "fondo", d: "Texto en el fondo." }, { n: "codigo", d: "Código CNV (uno o varios)." },
      { n: "incluir_596", d: "1 = suma los fondos del Decreto 596.", valores: ["1"] }],
    ejemplos: [{ url: "/api/snapshot?desde=2025-12-31&hasta=2026-10-31&por=gerente&moneda=usd", d: "ranking de gerentes en el año" },
      { url: "/api/snapshot?por=subtipo&gerente=balanz", d: "Balanz por subtipo en el mes en curso" }],
    columnas: SNAP, unidad: "millones de ARS o USD; los _pct son decimales (0.05 = 5%)",
    notas: ["Períodos largos con toda la industria pueden tardar 20 a 30 segundos: conviene filtrar por gerente, tipo o código."] },

  // ---- diario
  { ruta: "diario", grupo: "Diario", titulo: "Serie diaria por fondo",
    descripcion: "Patrimonio, suscripciones netas del día y flujo como % del patrimonio previo, por fondo o agregado. Hasta 13 meses por consulta.",
    parametros: [{ n: "desde", d: "Fecha AAAA-MM-DD (default: inicio del mes de hasta).", ej: "2026-10-01" }, { n: "hasta", d: "Fecha AAAA-MM-DD (default: último dato)." },
      { n: "por", d: "fondo (default) o agregado por día.", valores: ["fondo", "gerente", "categoria", "subcategoria", "tipo_gerente", "total"], ej: "categoria" },
      { n: "codigo", d: "Código CNV (uno o varios)." }, { n: "fondo", d: "Texto en el fondo." }, ...FILTROS_1816],
    ejemplos: [{ url: "/api/diario?desde=2026-10-01&por=categoria" }, { url: "/api/diario?codigo=876&desde=2026-01-01" }],
    columnas: { fecha: "Fecha.", codigo_cnv: "Código CNV.", fondo: "Fondo (1816).", gerente: "Gerente.", tipo_gerente: "Bancaria / Independiente.",
      categoria: "Tipo 1816.", subcategoria: "Subtipo 1816.", moneda_fondo: "Moneda del fondo.", fondos: "Cantidad de fondos (agregados).",
      patrimonio: "Patrimonio del día, millones de ARS.", flujo: "Suscripciones netas del día, millones de ARS.",
      flujo_pct: "Flujo / patrimonio del día anterior (decimal)." }, unidad: "millones de ARS" },
  { ruta: "clases", grupo: "Diario", titulo: "Detalle diario por clase (planilla completa)",
    descripcion: "Todas las columnas de la planilla diaria CAFCI por clase: valor de cuotaparte, cuotapartes, patrimonio, flujo, honorarios, comisiones, mínimo, plazo, calificación, depositaria. Un mes por consulta.",
    parametros: [{ n: "mes", d: "AAAA-MM (obligatorio).", ej: "2026-11", oblig: true }, { n: "codigo", d: "Código CNV (uno o varios).", ej: "876" },
      { n: "clase", d: "Código CAFCI (uno o varios)." }, { n: "fondo", d: "Texto en el fondo." }, { n: "gerente", d: "Texto en la razón social de la gerente." },
      { n: "desde", d: "Fecha AAAA-MM-DD dentro del mes." }, { n: "hasta", d: "Fecha AAAA-MM-DD dentro del mes." }],
    ejemplos: [{ url: "/api/clases?mes=2026-11&codigo=876" }],
    columnas: CLASE_DIARIO, notas: ["Pedir al menos codigo, clase, fondo o gerente: el mes completo tiene unas 80.000 filas (para eso, usar los archivos de /api/archivos)."] },
  { ruta: "vcp", grupo: "Diario", titulo: "Serie de valor de cuotaparte",
    descripcion: "Valor de cuotaparte diario de una o varias clases, en su moneda, en pesos o en dólares, opcionalmente en base 100. Historia completa desde 2020.",
    parametros: [{ n: "clase", d: "Código CAFCI (uno o varios).", ej: "2096" },
      { n: "codigo", d: "Código CNV (usa la clase de referencia de cada fondo).", ej: "876" },
      { n: "gerente", d: "Clases de referencia de los fondos de ese gerente (máx. 80)." }, { n: "tipo", d: "Ídem por tipo 1816." }, { n: "subtipo", d: "Ídem por subtipo 1816.", ej: "MM ARS Clásico" },
      { n: "desde", d: "Fecha AAAA-MM-DD (default: un año atrás).", ej: "2025-01-01" }, { n: "hasta", d: "Fecha AAAA-MM-DD (default: último dato)." },
      { n: "base100", d: "1 = cada serie empieza en 100.", valores: ["1"] },
      { n: "moneda", d: "original (default, moneda de la clase), ars o usd (al promedio MEP-CCL del día).", valores: ["original", "ars", "usd"] }],
    ejemplos: [{ url: "/api/vcp?codigo=876&desde=2025-01-01&base100=1" }, { url: "/api/vcp?subtipo=MM%20ARS%20Cl%C3%A1sico&desde=2026-01-01&base100=1" }],
    columnas: { fecha: "Fecha.", codigo_cafci: "Código CAFCI.", cuota: "Clase.", moneda_clase: "Moneda de la clase.", valor: "Valor de cuotaparte (o índice base 100)." } },
  { ruta: "rendimientos", grupo: "Diario", titulo: "Ranking de rendimientos",
    descripcion: "Rendimientos a la última fecha en 1D, 7D, MTD, 30D, 90D, YTD y 365D, con el puesto dentro del subtipo 1816 (Ranking de 1816).",
    parametros: [{ n: "moneda", d: "ars (default, como 1816), usd o original (moneda de la clase).", valores: ["ars", "usd", "original"] },
      { n: "expresion", d: "directo (default), tna o tea.", valores: ["directo", "tna", "tea"] },
      { n: "cuotas", d: "referencia (default, una por fondo) o todas.", valores: ["referencia", "todas"] },
      { n: "tipo", d: "Texto en el tipo 1816." }, { n: "subtipo", d: "Texto en el subtipo 1816.", ej: "MM ARS" }, { n: "gerente", d: "Texto en el gerente." },
      { n: "tipo_gerente", d: "Bancaria / Independiente." }, { n: "fondo", d: "Texto en el fondo o la clase." }, { n: "codigo", d: "Código CNV." },
      { n: "clase", d: "Código CAFCI." }, { n: "moneda_clase", d: "ARS o USD." },
      { n: "orden", d: "Ventana para ordenar (default 30D).", valores: ["1D", "7D", "MTD", "30D", "90D", "YTD", "365D"] }, { n: "top", d: "Cantidad de filas." }],
    ejemplos: [{ url: "/api/rendimientos?subtipo=MM%20ARS&expresion=tna&orden=7D" }, { url: "/api/rendimientos?gerente=balanz&moneda=original" }],
    columnas: { fecha: "Fecha del cálculo.", codigo_cafci: "Código CAFCI.", codigo_cnv: "Código CNV.", cuota: "Clase.", fondo: "Fondo (1816).",
      tipo: "Tipo 1816.", subtipo: "Subtipo 1816.", gerente: "Gerente.", tipo_gerente: "Bancaria / Independiente.", moneda_clase: "Moneda de la clase.",
      calificacion: "Calificación.", honorarios_total: "Honorarios gerente + depositaria, decimal anual (0.013 = 1,3%).",
      patrimonio_cuota: "Patrimonio de la clase, millones de ARS.", patrimonio_fondo: "Patrimonio del fondo, millones de ARS.",
      cuota_referencia: "1 si es la clase de referencia.", "r_1D … r_365D": "Rendimiento de cada ventana (decimal: 0.01 = 1%).",
      "pos_1D … pos_365D": "Puesto dentro del subtipo (1 = mayor rendimiento) entre las cuotas listadas." } },
  { ruta: "dolar", grupo: "Diario", titulo: "Dólar MEP, CCL y A3500",
    descripcion: "Tipo de cambio diario de cierre (venta): MEP, CCL, promedio MEP-CCL (el que se usa para convertir) y BCRA Comunicación A3500.",
    parametros: [{ n: "desde", d: "Fecha AAAA-MM-DD.", ej: "2026-01-01" }, { n: "hasta", d: "Fecha AAAA-MM-DD." }],
    ejemplos: [{ url: "/api/dolar?desde=2026-01-01" }],
    columnas: { fecha: "Fecha.", mep: "Dólar MEP.", ccl: "Dólar contado con liquidación.", a3500: "BCRA Comunicación A3500 (mayorista).", tc_promedio: "Promedio MEP-CCL." } },

  // ---- indicadores
  { ruta: "insights", grupo: "Indicadores", titulo: "Indicadores que 1816 no muestra",
    descripcion: "Alertas de flujo, liquidez, estacionalidad, sensibilidad flujo-rendimiento, fees vs. mercado, concentración de suscripciones y cambios de condiciones (honorarios, mínimos, plazos, calificación). Tablero web: /insights.",
    parametros: [{ n: "tipo", d: "Indicador (default resumen).", valores: ["resumen", "alertas", "liquidez", "estacionalidad", "sensibilidad", "fees", "concentracion", "cambios"], ej: "alertas" },
      { n: "gerente", d: "Texto en el gerente." }, { n: "fondo", d: "Texto en el fondo." }, { n: "categoria", d: "Texto en la categoría." },
      { n: "subcategoria", d: "Texto en la subcategoría." }, { n: "codigo", d: "Código CNV." }, { n: "campo", d: "cambios: campo que cambió (hon_sg, minimo_inversion...)." },
      { n: "solo_alertas", d: "alertas: 1 = solo fondos con alerta.", valores: ["1"] }, { n: "confirmados", d: "cambios: 1 = sin cambios provisorios.", valores: ["1"] },
      { n: "desde", d: "cambios: fecha; concentracion: mes." }, { n: "hasta", d: "Ídem." }, { n: "grupo", d: "concentracion: grupo." },
      { n: "eje", d: "estacionalidad: dia_habil o dias_al_cierre." }, { n: "top", d: "Cantidad de filas." }],
    ejemplos: [{ url: "/api/insights?tipo=alertas&solo_alertas=1" }, { url: "/api/insights?tipo=cambios&gerente=balanz&confirmados=1" }, { url: "/api/insights?tipo=fees&subcategoria=MM%20ARS" }],
    columnas: { "(depende del tipo)": "Ver la descripción de cada indicador en el README del repo; los porcentajes son decimales." } },
  { ruta: "cuotapartistas", grupo: "Indicadores", titulo: "Cuotapartistas (Informe Mensual CAFCI)",
    descripcion: "tipo=tipo: cuentas y montos por tipo de fondo y tipo de inversor (dato oficial del Informe Mensual CAFCI). tipo=estimados: estimación de cuentas por fondo (no es dato oficial).",
    parametros: [{ n: "tipo", d: "tipo (default) o estimados.", valores: ["tipo", "estimados"] },
      { n: "mes", d: "AAAA-MM. En estimados: mes de la estimación (default: la última).", ej: "2026-09" },
      { n: "desde", d: "tipo=tipo: mes inicial AAAA-MM." }, { n: "hasta", d: "tipo=tipo: mes final AAAA-MM." },
      { n: "tipo_fondo", d: "Texto en el tipo de fondo (Mercado de Dinero, Renta Fija...).", ej: "dinero" },
      { n: "segmento", d: "tipo=tipo: texto en el tipo de inversor.", ej: "personas humanas" },
      { n: "gerente", d: "estimados: texto en la gerente." }, { n: "fondo", d: "estimados: texto en el fondo." }, { n: "codigo", d: "estimados: Código CNV." }],
    ejemplos: [{ url: "/api/cuotapartistas?desde=2025-01&tipo_fondo=dinero" }, { url: "/api/cuotapartistas?tipo=estimados&gerente=balanz" }],
    columnas: { mes: "Mes.", tipo_fondo: "Tipo de fondo CAFCI.", segmento: "Tipo de inversor.", monto_millones: "Monto, millones de ARS.", cuentas: "Cantidad de cuentas.",
      codigo_cnv: "Código CNV (estimados).", AUM_millones: "Patrimonio del fondo (estimados).", Monto_PH_est: "Monto estimado de personas humanas.",
      Cuentas_estimadas: "Cuentas estimadas.", Ticket_promedio_est: "Ticket promedio estimado." } },
  { ruta: "dashboard", grupo: "Indicadores", titulo: "Datos del tablero Ranking Fondos Balanz",
    descripcion: "Ranking semanal por categoría de los fondos de la industria (rendimiento 7 días, AUM promedio semanal, suscripciones netas, puestos).",
    parametros: [{ n: "archivo", d: "fondos (default), categorias, corte o historial.", valores: ["fondos", "categorias", "corte", "historial"] },
      { n: "moneda", d: "ARS o USD." }, { n: "categoria", d: "Texto en la categoría." }, { n: "gerente", d: "Texto en el gerente." },
      { n: "balanz", d: "1 = solo fondos Balanz.", valores: ["1"] }],
    ejemplos: [{ url: "/api/dashboard?archivo=fondos&balanz=1" }, { url: "/api/dashboard?archivo=corte" }],
    columnas: { "(depende del archivo)": "rend_*: decimales; aum_*: millones; pos_*: puesto dentro de la categoría." } },

  // ---- bajar todo
  { ruta: "archivos", grupo: "Base completa", titulo: "Archivos de la base completa (CSV y Parquet)",
    descripcion: "Links directos a todos los archivos de la base (toda la historia), para cargar en Power BI, Python, R o DuckDB sin pasar por los límites de la API.",
    parametros: [{ n: "grupo", d: "Texto en el grupo (mensual, diario por clase, parquet...).", ej: "parquet" }],
    ejemplos: [{ url: "/api/archivos" }, { url: "/api/archivos?grupo=parquet" }],
    columnas: { grupo: "Grupo.", archivo: "Nombre del archivo.", formato: "csv, csv.gz, parquet o json.", descripcion: "Contenido.", url: "Link directo (se puede leer desde Power BI, pandas o DuckDB)." } },
  { ruta: "script", grupo: "Base completa", titulo: "Scripts del repo",
    descripcion: "Versión vigente de los scripts públicos del repo (por ejemplo el de la Call de Fondos), para bajarlos con curl.",
    parametros: [{ n: "nombre", d: "Nombre del script.", valores: ["call_fondos.py"], ej: "call_fondos.py" }],
    ejemplos: [{ url: "/api/script" }], columnas: {} },

  // ---- la guia
  { ruta: "docs", grupo: "Guía", titulo: "Guía en JSON", descripcion: "Esta guía completa en JSON (la usa la página /docs).", parametros: [], ejemplos: [{ url: "/api/docs" }], columnas: {} },
  { ruta: "guia", grupo: "Guía", titulo: "Guía en texto (para Claude, ChatGPT u otros asistentes)",
    descripcion: "Esta guía completa en markdown. También en /llms.txt. Se le puede pasar el link a un asistente de IA para que arme consultas o tableros.",
    parametros: [], ejemplos: [{ url: "/llms.txt" }], columnas: {} },
  { ruta: "openapi", grupo: "Guía", titulo: "Especificación OpenAPI 3",
    descripcion: "Especificación OpenAPI de todos los endpoints (para Postman, generadores de clientes o acciones de GPTs). También en /openapi.json.",
    parametros: [], ejemplos: [{ url: "/openapi.json" }], columnas: {} },
];

// ---------------------------------------------------------------- texto de la guia (markdown simple)
const PQ_CSV = `let
    Base = "${SITIO}",
    Datos = Csv.Document(
        Web.Contents(Base, [RelativePath = "api/serie",
                            Query = [gerente = "balanz", desde = "2024-01", formato = "csv"]]),
        [Delimiter = ",", Encoding = 65001, QuoteStyle = QuoteStyle.Csv]),
    Tabla = Table.PromoteHeaders(Datos, [PromoteAllScalars = true]),
    // los números vienen con punto decimal: convertir con la configuración regional en-US
    Tipos = Table.TransformColumnTypes(Tabla,
        {{"AUM_promedio", type number}, {"Susc_Netas", type number}}, "en-US")
in
    Tipos`;
const PQ_JSON = `let
    Json = Json.Document(Web.Contents("${SITIO}", [RelativePath = "api/fondos", Query = [mes = "2026-10"]])),
    Tabla = Table.FromRecords(Json[datos])
in
    Tabla`;
const PQ_PARQUET = `let
    Origen = Parquet.Document(Binary.Buffer(Web.Contents(
        "${RAW}parquet/fondos_mensual.parquet")))
in
    Origen`;

const GUIA = [
  { id: "inicio", titulo: "Inicio rápido", md: `
Todas las consultas son un link: se pueden abrir en el navegador, pegar en Power BI o Excel, o leer desde Python. No hace falta usuario ni clave.

- Fondos de Balanz de octubre: [/api/fondos?mes=2026-10&gerente=balanz](/api/fondos?mes=2026-10&gerente=balanz)
- Lo mismo en dólares y en CSV: [/api/fondos?mes=2026-10&gerente=balanz&moneda=usd&formato=csv](/api/fondos?mes=2026-10&gerente=balanz&moneda=usd&formato=csv)
- Industria por categoría desde 2025: [/api/industria?desde=2025-01&por=categoria](/api/industria?desde=2025-01&por=categoria)
- Buscar el código de un fondo: [/api/catalogo?buscar=ahorro%20dolares](/api/catalogo?buscar=ahorro%20dolares)
- ¿Hasta qué fecha hay datos?: [/api/estado](/api/estado)

Las respuestas JSON traen los datos en \`datos\`, la cantidad de filas en \`filas\`, la unidad en \`unidad\` y la fecha de la última actualización en \`actualizado\`. Con \`formato=csv\` vuelve una tabla plana.

Más abajo está el **constructor de consultas**: elegís el endpoint y los filtros, ves el resultado y copiás el link o el código para Power BI, Excel, Google Sheets o Python.` },

  { id: "conceptos", titulo: "Conceptos clave", md: `
- **Código CNV** (\`codigo\`, \`Codigo_CNV\`): identifica al **fondo**. No cambia si el fondo cambia de nombre o de gerente, así que es la mejor clave para cruzar datos.
- **Código CAFCI** (\`clase\`, \`codigo_cafci\`): identifica a cada **clase** (cuotaparte) de un fondo. Un fondo tiene una o varias clases (A, B, C...).
- **Clase de referencia** (\`cuota_referencia = 1\`): la clase que se usa para rankings de rendimiento, una por fondo, igual que 1816.
- **Clasificación**: \`Categoria\`/\`Subcategoria\` (o \`tipo\`/\`subtipo\`) y \`Gerente\` son los de 1816. También está la clasificación oficial de CAFCI (\`Clasificacion_CAFCI\`). Los fondos nuevos que no están en 1816 se clasifican con una regla automática: ver [/api/taxonomia?fuente=regla](/api/taxonomia?fuente=regla).
- **Unidades**: los montos mensuales y de períodos están en **millones de ARS** (o de USD con \`moneda=usd\`). En \`/api/clases\` el patrimonio y el flujo están en unidades (no millones).
- **Porcentajes**: los rendimientos, participaciones y \`*_pct\` son **decimales** (0.05 = 5%). Los honorarios de la planilla (\`hon_sg\`, \`hon_sd\`, \`hon_gerente\`) están en **% anual** (0.85 = 0,85%).
- **Dólares**: las clases en dólares se pasan a pesos (y los pesos a dólares) con el **promedio de dólar MEP y CCL de cada día**, que es el tipo de cambio que usa 1816.
- **Mes en curso**: el último mes es parcial hasta que termina (\`parcial: true\` en [/api/estado](/api/estado) y en /api/fondos).
- **Fondos excluidos**: fondos cerrados y del Decreto 596 no suman en los totales (en snapshot y catálogo se pueden incluir con \`incluir_596=1\`).
- **Filtros de texto**: no distinguen mayúsculas ni acentos y buscan "contiene" (\`gerente=bal\` encuentra Balanz). Los códigos aceptan varios valores separados por coma.` },

  { id: "conectar", titulo: "Cómo conectarse", md: `
### Power BI

Obtener datos → **Web** → pegar el link con \`formato=csv\`. Para que la **actualización programada en el Service** funcione sin gateway, escribir la consulta en el editor avanzado con \`Web.Contents\` separando la base del resto (si el link completo se arma con texto variable, el Service no deja programar la actualización). La autenticación es **Anónima**.

\`\`\`
${PQ_CSV}
\`\`\`

En JSON:

\`\`\`
${PQ_JSON}
\`\`\`

Para cargar **toda la historia** de una vez (por ejemplo todos los meses por fondo), conviene leer directo el archivo Parquet de la base (ver [/api/archivos](/api/archivos)):

\`\`\`
${PQ_PARQUET}
\`\`\`

### Excel

- **Power Query** (Datos → Obtener datos → Desde la Web): el mismo link con \`formato=csv\`. Al cambiar el tipo de las columnas numéricas usar "Usar configuración regional → Inglés (Estados Unidos)".
- **Abrir directo un CSV**: agregar \`&formato=csv&excel=1&descargar=1\`: separador punto y coma, coma decimal y acentos bien, listo para Excel en castellano.

### Google Sheets

\`\`\`
=IMPORTDATA("${SITIO}/api/rendimientos?gerente=balanz&formato=csv"; ","; "en_US")
\`\`\`

### Python

\`\`\`
import pandas as pd
API = "${SITIO}/api"
serie = pd.read_csv(f"{API}/serie?gerente=balanz&desde=2024-01&formato=csv")
# o en JSON
import requests
r = requests.get(f"{API}/fondos", params={"mes": "2026-10", "categoria": "money"}).json()
df = pd.DataFrame(r["datos"])
\`\`\`

### SQL sobre Parquet (DuckDB)

\`\`\`
INSTALL httpfs; LOAD httpfs;
SELECT Mes, Gerente, sum(AUM_promedio) AS aum
FROM '${RAW}parquet/fondos_mensual.parquet'
WHERE Mes >= '2026-01' GROUP BY ALL ORDER BY Mes, aum DESC;
\`\`\`

### Con Claude, ChatGPT u otro asistente

Pasarle el link [${SITIO}/llms.txt](/llms.txt) (esta guía en texto) y pedirle lo que necesitás, por ejemplo: *"Leé ${SITIO}/llms.txt y armame un gráfico de suscripciones netas mensuales de Money Market por gerente desde 2025"*. Para herramientas que aceptan OpenAPI (acciones de GPTs, Postman): [${SITIO}/openapi.json](/openapi.json).` },

  { id: "metodologia", titulo: "Metodología (igual a 1816)", md: `
- **Flujo diario** = variación de cuotapartes × valor de cuotaparte, en pesos.
- **AUM promedio** = suma del patrimonio de cada día calendario / días del mes (los días sin planilla toman el último dato).
- **Rendimiento** = AUM final − AUM inicial − suscripciones netas.
- **Facturación** = honorario % anual × patrimonio diario / 365.
- Cada fondo toma el dato de su propia fecha (los que informan tarde se toman de la planilla siguiente). Se descartan datos puntuales erróneos (saltos de un día) y flujos imposibles.
- Migraciones de clase, fondos que dejan de informar, fondos nuevos y cambios de nombre tienen reglas propias, validadas contra 1816 (detalle en el README del repo).

Validación contra 1816 (ene–oct 2026): AUM total ±0,2 %, flujo ex Money Market de Balanz igual todos los meses, rendimientos por cuota idénticos en el 99,5% de los casos. Las diferencias que quedan son en su mayoría errores puntuales de 1816 (dato viejo a fin de mes, altas tardías, bajas transitorias).` },

  { id: "actualizacion", titulo: "Actualización", md: `
- La base se actualiza sola **de lunes a viernes a las 12:47 y 18:47** (hora Argentina) con GitHub Actions.
- La CNV publica la planilla de cada día hábil al día siguiente: el último dato suele ser del día hábil anterior.
- [/api/estado](/api/estado) muestra la última planilla, la hora de la última corrida y si la base está al día. Todas las respuestas traen \`actualizado\` (y el encabezado HTTP \`X-Datos-Actualizado\`).
- Las respuestas quedan en caché hasta 30 minutos: después de una actualización puede tardar ese tiempo en verse.
- Los datos de meses cerrados pueden corregirse si la CNV republica una planilla o se mejora una regla de procesamiento (se avisa en "Cambios").` },

  { id: "limites", titulo: "Límites y buenas prácticas", md: `
- Cada respuesta puede tener hasta **4,5 MB** (unas 10.000 a 20.000 filas según las columnas). Si se pasa, la API devuelve error 413 con sugerencias: filtrar, pedir menos \`columnas\`, paginar con \`limite\`/\`offset\` o usar los archivos de [/api/archivos](/api/archivos).
- Cada consulta tiene hasta 60 segundos. Las más pesadas son \`snapshot\` de períodos largos con toda la industria y \`clases\`: filtrar por gerente, tipo o código las acelera.
- \`diario\` admite hasta 13 meses y \`snapshot\` hasta 400 días por consulta; para más historia, partir en varias consultas o usar los Parquet.
- Si un parámetro está mal escrito, la respuesta lo avisa en \`avisos\` (y en el encabezado \`X-Avisos\`) en vez de ignorarlo en silencio.
- Para tableros que se actualizan solos, conviene pedir lo justo (filtros y columnas) y no más de una vez por hora: los datos cambian dos veces por día.
- Es una herramienta interna mantenida por el área de Fondos sobre datos públicos: no tiene garantía de disponibilidad. Para procesos críticos, guardar una copia de los datos.` },

  { id: "estabilidad", titulo: "Estabilidad", md: `
- Los endpoints, parámetros y columnas que están en esta guía **no se renombran ni se borran**: los cambios se hacen agregando cosas nuevas. Si alguna vez hace falta romper algo, se avisa acá antes.
- Conviene leer las columnas por nombre (no por posición): pueden aparecer columnas nuevas al final.` },

  { id: "faq", titulo: "Preguntas frecuentes", md: `
- **¿Cómo encuentro el código de un fondo?** En [/api/catalogo?buscar=nombre](/api/catalogo?buscar=balanz) (código CNV del fondo y códigos CAFCI de cada clase).
- **¿Por qué un número no coincide con 1816?** Ver "Metodología": la mayoría de las diferencias son errores puntuales de 1816. Para revisar un caso, mirar la planilla diaria del fondo en \`/api/clases?mes=AAAA-MM&codigo=...\`.
- **¿Cómo comparo en dólares?** \`moneda=usd\` en fondos, serie, industria, ranking y snapshot; \`moneda=usd\` en vcp y rendimientos.
- **¿De dónde sale el número de cuentas?** De los Informes Mensuales de CAFCI ([/api/cuotapartistas](/api/cuotapartistas)). Por fondo es una estimación propia, no un dato oficial.` },
];

const CAMBIOS = [
  { fecha: "2026-11-18", cambios: [
    "Guía dentro de la API: /docs (página con constructor de consultas), /api/docs, /api/guia y /llms.txt, /api/openapi y /openapi.json.",
    "Nuevos endpoints: /api/estado, /api/catalogo, /api/cuotapartistas y /api/archivos.",
    "moneda=usd en /api/fondos, /api/serie, /api/industria y /api/ranking.",
    "/api/vcp: historia completa desde 2020 (antes 400 días) y filtros gerente, tipo y subtipo.",
    "Parámetros comunes: columnas, ordenar, limite/offset, excel=1 y descargar=1. Filtro codigo en /api/taxonomia; categoria, subcategoria y tipo_gerente en /api/serie.",
    "Avisos de parámetros mal escritos, validación de fechas, campo actualizado en todas las respuestas, error 413 claro cuando la respuesta es demasiado grande.",
  ] },
  { fecha: "2026-11", cambios: ["Endpoints snapshot, rendimientos, vcp, taxonomia, insights, diario, dashboard y script."] },
];

const VALIDOS_COMUNES = new Set(COMUNES.map(p => p.n));
const PARAMS = Object.fromEntries(ENDPOINTS.map(e => [e.ruta, new Set(e.parametros.map(p => p.n))]));

// ---------------------------------------------------------------- generadores
function docsJSON() {
  return { info: INFO, guia: GUIA, parametros_comunes: COMUNES, endpoints: ENDPOINTS, cambios: CAMBIOS };
}

function guiaMarkdown() {
  const L = [`# ${INFO.titulo}`, "", INFO.resumen, "", `Base: ${SITIO}/api — Guía web: ${SITIO}/docs — OpenAPI: ${SITIO}/openapi.json`,
    `Actualización: ${INFO.actualizacion}`, ""];
  const abs = s => s.replace(/\]\(\//g, `](${SITIO}/`);
  for (const s of GUIA) L.push(`## ${s.titulo}`, abs(s.md.trim()), "");
  L.push("## Parámetros comunes (todos los endpoints que devuelven tablas)", "");
  for (const p of COMUNES) L.push(`- \`${p.n}\`: ${p.d}${p.ej ? ` Ej: \`${p.n}=${p.ej}\`` : ""}`);
  L.push("", "## Endpoints", "");
  let g = "";
  for (const e of ENDPOINTS) {
    if (e.grupo !== g) { g = e.grupo; L.push(`### ${g}`, ""); }
    L.push(`#### /api/${e.ruta} — ${e.titulo}`, "", e.descripcion, "");
    if (e.unidad) L.push(`Unidad: ${e.unidad}.`, "");
    if (e.parametros.length) {
      L.push("Parámetros:");
      for (const p of e.parametros) L.push(`- \`${p.n}\`${p.oblig ? " (obligatorio)" : ""}: ${p.d}${p.valores ? ` Valores: ${p.valores.join(" | ")}.` : ""}${p.ej ? ` Ej: \`${p.ej}\`` : ""}`);
      L.push("");
    }
    if (e.ejemplos.length) { L.push("Ejemplos:"); for (const x of e.ejemplos) L.push(`- ${SITIO}${x.url}${x.d ? ` (${x.d})` : ""}`); L.push(""); }
    const cols = Object.entries(e.columnas || {});
    if (cols.length) { L.push("Columnas:"); for (const [k, v] of cols) L.push(`- \`${k}\`: ${v}`); L.push(""); }
    for (const n of e.notas || []) L.push(`Nota: ${n}`, "");
  }
  L.push("## Cambios", "");
  for (const c of CAMBIOS) { L.push(`- ${c.fecha}:`); for (const x of c.cambios) L.push(`  - ${x}`); }
  return L.join("\n") + "\n";
}

function openapi() {
  const prm = (p, enComun) => {
    const o = { name: p.n, in: "query", required: !!p.oblig, description: p.d, schema: { type: "string" } };
    if (p.valores) o.schema.enum = p.valores;
    if (p.ej) o.example = p.ej;
    return o;
  };
  const paths = {};
  for (const e of ENDPOINTS) {
    const tabla = !["docs", "guia", "openapi", "script", "estado"].includes(e.ruta);
    paths[`/api/${e.ruta}`] = { get: {
      operationId: e.ruta, tags: [e.grupo], summary: e.titulo,
      description: e.descripcion + (e.unidad ? ` Unidad: ${e.unidad}.` : "") +
        (Object.keys(e.columnas || {}).length ? "\n\nColumnas: " + Object.entries(e.columnas).map(([k, v]) => `${k}: ${v}`).join(" | ") : ""),
      parameters: [...e.parametros.map(p => prm(p)), ...(tabla ? COMUNES.map(p => prm(p, true)) : [])],
      responses: {
        200: { description: tabla ? "JSON {filas, datos: [...], unidad, actualizado, ...} o CSV con formato=csv" : "OK",
          content: tabla ? { "application/json": { schema: { $ref: "#/components/schemas/Tabla" } }, "text/csv": { schema: { type: "string" } } }
            : { "application/json": { schema: { type: "object" } } } },
        400: { description: "Parámetro inválido", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        413: { description: "Respuesta demasiado grande: filtrar, paginar o usar /api/archivos" },
      } } };
  }
  return {
    openapi: "3.0.3",
    info: { title: INFO.titulo, version: INFO.version, description: INFO.resumen + " Guía completa: " + SITIO + "/docs" },
    servers: [{ url: SITIO }],
    paths,
    components: { schemas: {
      Tabla: { type: "object", properties: { filas: { type: "integer" }, unidad: { type: "string" }, actualizado: { type: "string" },
        avisos: { type: "array", items: { type: "string" } }, total_filas: { type: "integer" }, siguiente_offset: { type: "integer" },
        datos: { type: "array", items: { type: "object", additionalProperties: true } } } },
      Error: { type: "object", properties: { error: { type: "string" }, ayuda: { type: "string" } } },
    } },
  };
}

module.exports = { INFO, COMUNES, ENDPOINTS, GUIA, CAMBIOS, PARAMS, VALIDOS_COMUNES, RAW, docsJSON, guiaMarkdown, openapi };
