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
| `clases_diario/AAAA-MM.csv.gz` | detalle diario por clase: VCP, cuotapartes, patrimonio, patrimonio en $, flujo del día, honorarios, tipo de cambio |
| `dolar.csv` | dólar MEP de cierre diario y BCRA Com. A3500 |
| `cuotapartistas_tipo.csv` | cuentas y montos por tipo de fondo y tipo de inversor (Informe Mensual CAFCI) |
| `cuotapartistas_estimados_AAAA-MM.csv` | estimación de cuentas por fondo (no es dato oficial) |
| `manifest.csv` | planillas descargadas: link a la CNV, recepción y hash |

## Método (equivalente a 1816)
- Flujo diario = variación de cuotapartes × valor de cuotaparte (en $).
- AUM promedio = numeral por día calendario / días del mes. Rendimiento = AUM final − AUM inicial − suscripciones netas.
- Facturación = honorario % anual × patrimonio diario / 365.
- Clases en dólares a pesos con el **dólar MEP de cierre del día**.
- Se excluyen fondos cerrados y Decreto 596. Cada fondo toma el dato de su propia fecha (los que publican con
  atraso se toman de la planilla siguiente); días sin planilla se completan con la columna "día anterior".
- Se descartan datos puntuales erróneos de la planilla (saltos de un día) y flujos imposibles.

## Carpetas
- `scripts/` descarga y procesamiento. `config.json` rango de fechas.
- `call/call_fondos.py` gráficos y actualización de las slides 4 a 9 de la Call de Fondos (usa tablas de mapeo locales que no se publican).
