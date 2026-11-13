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

## Consultas SQL sobre Parquet (DuckDB)

```sql
INSTALL httpfs; LOAD httpfs;
SELECT Mes, Gerente, sum(AUM_promedio) AS aum
FROM 'https://raw.githubusercontent.com/mfriedB/cafci/main/procesado/parquet/fondos_mensual.parquet'
WHERE Mes >= '2026-01' GROUP BY ALL ORDER BY Mes, aum DESC;
```
