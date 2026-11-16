# Base de fondos comunes de inversión — CAFCI / CNV

Base diaria y mensual de toda la industria de FCI abiertos de Argentina, armada **solo con fuentes oficiales**:
la Planilla Diaria de CAFCI archivada por la CNV (desde enero 2020) y los Informes Mensuales de CAFCI.
Se actualiza sola de lunes a viernes (GitHub Actions) y se publica en `procesado/` con el mismo formato que la
bajada "Métricas por Fondo" de 1816.

## Consumo (API: archivos con dirección fija)

Base: `https://raw.githubusercontent.com/mfriedB/cafci/main/procesado/`

| Archivo | Contenido |
|---|---|
| `index.json` | meses disponibles, archivo de cada mes, si es parcial y cuántas planillas tiene |
| `fondos_cafci_AAAA-MM-DD.csv` | un mes por fondo: AUM promedio / inicial / final, suscripciones netas, rendimiento, facturación gerente y depositaria, `Codigo_CNV` (millones de $) |
| `clases_diario/AAAA-MM.csv.gz` | detalle diario por clase: VCP, cuotapartes, patrimonio, patrimonio en $, flujo del día, honorarios, comisiones de ingreso/rescate/transferencia, gastos de gestión, honorario de éxito, calificación de riesgo, mínimo de inversión, plazo de liquidación, inversor calificado, depositaria, variación de cuotaparte mes/año/12 meses, tipo de cambio |
| `parquet/` | lo mismo en Parquet para consultas SQL por HTTP (ver `parquet/catalogo.json`) |
| `dolar.csv` | dólar MEP y CCL de cierre (venta), promedio MEP-CCL y BCRA Com. A3500 |
| `cuotapartistas_tipo.csv` | cuentas y montos por tipo de fondo y tipo de inversor (Informe Mensual CAFCI) |
| `cuotapartistas_estimados_AAAA-MM.csv` | estimación de cuentas por fondo (no es dato oficial) |
| `manifest.csv` | planillas descargadas: link a la CNV, recepción y hash |

## Método (equivalente a 1816)
- Flujo diario = variación de cuotapartes × valor de cuotaparte (en $).
- AUM promedio = numeral por día calendario / días del mes. Rendimiento = AUM final − AUM inicial − suscripciones netas.
- Facturación = honorario % anual × patrimonio diario / 365.
- Clases en dólares a pesos con el **promedio de dólar MEP y CCL del día** (es el tipo de cambio que usa 1816: validado día por día, desvío 0,3%). Con `"tipo_cambio": "mep"` en `config.json` se usa solo el MEP.
- Se excluyen fondos cerrados y Decreto 596. Cada fondo toma el dato de su propia fecha (los que publican con
  atraso se toman de la planilla siguiente); días sin planilla se completan con la columna "día anterior".
- Se descartan datos puntuales erróneos de la planilla (saltos de un día) y flujos imposibles.

## Clasificación igual a 1816
- `mapeo/taxonomia_1816.csv`: por Código CNV, nombre del fondo, tipo, subtipo, gerente (nombre corto) y tipo de gerente
  (Bancaria / Independiente) tal como los muestra 1816. Se relevó una sola vez de la web de 1816 (13/11/2026, 1.251 fondos,
  99,5% del patrimonio de la industria). `mapeo/clases_1816.csv`: cada clase CAFCI con su cuota en 1816 y si es la
  **cuota de referencia** (la que 1816 usa para rankings de rendimiento; es la clase más grande en el 75% de los casos).
- Fondos nuevos (no están en la tabla) se clasifican solos en `scripts/taxonomia.py`: heredan la clase del fondo padre si
  son escisiones, por palabras del nombre (Pymes, Infraestructura, ASG) o por mayoría de los fondos con los mismos
  atributos CAFCI; gerente y tipo de gerente de los otros fondos de la misma sociedad; cuota de referencia = clase más
  grande. Quedan marcados en `procesado/taxonomia.csv` (`fuente_tax` = `regla: ...`). El subtipo de 1816 es criterio de
  sus analistas: la regla acierta el tipo en ~80% y el subtipo en ~50%, así que conviene revisar los nuevos y, si hace
  falta, agregarlos a `mapeo/taxonomia_1816.csv` (una línea; la base se regenera sola).
- `mapeo/taxonomia_manual.csv`: fondos que no están en 1816 y se clasificaron a mano (por ejemplo, mirando la cartera
  y los pares en el Monitor de carteras). Quedan con `fuente_tax` = `manual` y salen del aviso de fondos sin clasificar.
- Rendimientos (`procesado/rendimientos.csv`): directos sobre el valor de cuotaparte, con las mismas ventanas que 1816
  (1D, 7D, MTD, 30D, 90D, YTD, 365D). Validado contra el ranking de 1816 al 12/11/2026: idénticos en la moneda de la
  clase (99,5% de las cuotas, el resto son errores puntuales de 1816). Las clases en dólares convertidas a pesos (y
  viceversa) difieren en la variación del dólar: 1816 usa una serie propia que no coincide con ninguna oficial.

## Carpetas
- `scripts/` descarga y procesamiento. `config.json` rango de fechas.
- `mapeo/` clasificación 1816 (ver arriba).
- `call/call_fondos.py` gráficos y actualización de las slides 4 a 9 de la Call de Fondos (solo lee la base publicada).

## API con filtros (Vercel)

Carpeta `api/` (funciones serverless de Vercel, sin dependencias). Lee la misma base de `procesado/` y devuelve JSON
(o CSV con `formato=csv`), con filtros. Endpoints:

| Endpoint | Ejemplo |
|---|---|
| `/api` | descripción, meses disponibles |
| `/api/fondos` | `/api/fondos?mes=2026-10&gerente=balanz&categoria=money` |
| `/api/serie` | `/api/serie?codigo=876&desde=2026-01` |
| `/api/industria` | `/api/industria?desde=2026-01&por=categoria` |
| `/api/ranking` | `/api/ranking?mes=2026-10&por=gerente&metrica=Susc_Netas&top=10` |
| `/api/clases` | `/api/clases?mes=2026-11&codigo=876` |
| `/api/dolar` | `/api/dolar?desde=2026-11-01` |
| `/api/snapshot` | `/api/snapshot?desde=2026-06-01&hasta=2026-11-12&por=subtipo` (Snapshot Industria de 1816, cualquier período) |
| `/api/rendimientos` | `/api/rendimientos?subtipo=MM%20ARS&orden=30D&expresion=tna` (Ranking de 1816) |
| `/api/vcp` | `/api/vcp?codigo=876&desde=2026-01-01&base100=1` (Series de VCP) |
| `/api/taxonomia` | `/api/taxonomia?fuente=regla` (clasificación 1816 de cada fondo) |

Los filtros de texto no distinguen mayúsculas ni acentos. Montos en millones de ARS.

Validación del snapshot contra 1816 (1/6 al 12/11/2026, por cuota): patrimonio inicio y fin y suscripciones netas
de la industria dentro del 0,05%; 99% de las cuotas en pesos dentro del 1%; honorarios % iguales en 99%.

## Insights (lo que 1816 no muestra)

`scripts/insights.py` corre en cada actualización y deja en `procesado/insights/` indicadores precalculados sobre el
detalle diario por clase, más una serie diaria liviana por fondo (`procesado/fondos_diario/AAAA-MM.csv.gz` y
`parquet/fondos_diario.parquet`). Tablero web: **https://cafci.vercel.app/insights**.

| Archivo / `tipo=` | Contenido |
|---|---|
| `alertas` | por fondo a la última fecha: racha de días con rescates netos, flujo del día y de 5 días, percentil del flujo del día contra su último año; alerta con racha ≥ 5 o día en el 2% extremo (y > 1%) |
| `liquidez` | últimos 250 días hábiles: peor día de rescate, percentiles 1 y 5, volatilidad de flujos y % de días con rescate, contra la mediana de la subcategoría |
| `estacionalidad` | flujo medio (pb del patrimonio previo) por día hábil del mes y por días al cierre, por categoría, últimos 12 meses completos |
| `sensibilidad` | suscripciones netas del mes siguiente según el quintil de rendimiento del mes dentro de la subcategoría (últimos 24 meses) |
| `fees` | fee efectivo de gerente por subcategoría y gerente vs. mercado, share de AUM y de facturación (último mes completo) |
| `concentracion` | por gerente y mes: suscripción bruta diaria, % que entró en los 3 mejores días, días con entradas |
| `cambios` | cambios de honorarios, comisiones, mínimo, plazo, calificación y depositaria que se sostienen ≥ 5 planillas, y altas/bajas de clases (13 meses) |

Endpoints: `/api/insights?tipo=alertas&gerente=balanz&solo_alertas=1`, `/api/diario?desde=2026-10-01&por=categoria`.

## Consultas SQL sobre Parquet (DuckDB)

```sql
INSTALL httpfs; LOAD httpfs;
SELECT Mes, Gerente, sum(AUM_promedio) AS aum
FROM 'https://raw.githubusercontent.com/mfriedB/cafci/main/procesado/parquet/fondos_mensual.parquet'
WHERE Mes >= '2026-01' GROUP BY ALL ORDER BY Mes, aum DESC;
```

## Reglas de procesamiento de la base (validadas contra 1816, nov-2026)

`scripts/procesar.py` ya aplica estas reglas solo. Sirven para revisar diferencias contra 1816 y para no deshacerlas.

| Caso | Qué hace la base CAFCI | Ejemplo |
|---|---|---|
| **Migración de clase**: una clase deja de informar y el fondo sigue con otras (todo pasa de Clase I a Clase C) | Registra la salida de la clase vieja el mismo día que entra a la nueva, así el traspaso neto da cero (espera 7 días por si es rezago). | Galicia 28/08/2026 (Fima Retorno Total, Fima Infraestructura I y II). 1816 contó la entrada en agosto y la salida en septiembre. |
| **Fondo que deja de informar** (liquidación, fusión, baja) | Su patrimonio sale como rescate el día hábil siguiente (espera 10 días por si es rezago). | Alpha Recursos Naturales, abril 2026. |
| **Fondo o clase nueva** | El primer dato cuenta como suscripción inicial completa. Si las primeras planillas traen el código CNV vacío, lo completa con el de la misma clase. | Mills M1000 Balanceado Pesos, 05/05/2026. |
| **Flujo real de ida y vuelta** (suscripción o rescate grande el último día del mes que vuelve al día siguiente) | No se descarta como error si el dato es coherente (patrimonio = cuotapartes × VCP / 1000) y el VCP no salta. Solo se descartan los saltos incoherentes o los ceros entre dos días con dato. | Delta Pesos 31/07, Unico Liquidez Pesos 30/10. |
| **Cambio de nombre o de gerente** | Se compara por código CNV, no por nombre; el nombre del mes es el último informado. | Gainvest → Stonex, ST Zero → Consultatio Zero, HF → Fima. |

Diferencias conocidas en las que 1816 se equivoca, que **no** se corrigen en la base:
- **Dato viejo a fin de mes**: 1816 repite el patrimonio del día anterior si el fondo informó tarde (Pionero Pesos Plus 31/08: +199 mil M en 1816).
- **Alta tardía**: 1816 incorpora fondos nuevos uno o más meses después (Alpha Dólar, febrero en CAFCI y marzo en 1816; MAF Gestión Activa II).
- **Bajas transitorias**: 1816 saca un fondo un mes que no informó a fin de mes y lo vuelve a sumar como suscripción (JA Roca, Apolo Dólares, Cocos Medalla).
- **Patrimonio inicial revisado**: el AUM inicial de 1816 no siempre coincide con su propio cierre del mes anterior (Fima Premium, Allaria Ahorro en enero).
- **Valor distinto del último día** en algunos Money Market (Lombard 31/07, Premier Renta CP 31/08 y 30/09): se compensa al mes siguiente; queda la versión de la planilla CNV.

Resultado de la validación ene–oct 2026:
- Flujo ex-MM de Balanz igual todos los meses (±3 mil M).
- AUM total ±0,2 %.
- Flujo ex-MM acumulado de la industria: 12,51 bill. en CAFCI contra 12,55 bill. en 1816.
- Ventaja de Balanz sobre el segundo: +42 % en ambas.

Al comparar con 1816:
- Emparejar por código CNV y sumar agosto y septiembre juntos cuando hubo migraciones.
- Revisar cada diferencia de más de 8 mil M por fondo con la planilla diaria (`procesado/clases_diario/AAAA-MM.csv.gz`) antes de decidir cuál está bien.
- Si aparece un patrón nuevo, agregar la regla a `procesar.py` y a esta tabla.

En el log de cada run de GitHub Actions ("Procesar") se ven dos controles: "datos puntuales descartados" y "clases que dejaron de informar con el fondo activo". Un salto grande en cualquiera de los dos respecto del run anterior es para revisar.
