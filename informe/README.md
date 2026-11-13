# Informe de Gestión FCI (réplica del Power BI)

Tablero en un artifact privado (https://claude.ai/artifact/4Cj68KjArL3bGSi5xdeJs4) con las 53 páginas del Power BI
"Informe Gestion FCI.pbix": mismas medidas (mes máximo visible, market share dinámico, flujo acumulado 2026, rankings,
facturación m/m, y/y y YTD, etc.) y columnas calculadas (Tipo_Gerente, Categoria2/3, Subcategoria2, Comercial, ...).

- `tablero/`: código del tablero (HTML + JS, gráficos con ECharts). Los datos van aparte, en `data/` del artifact.
- `build_data.py`: arma `industria.json` (industria en ARS y USD desde `procesado/informe/`, que genera
  `scripts/informe_gestion.py` en GitHub Actions) e `internos.json`.
- `internos.py`: lee las bases internas de Balanz (comisiones, comisiones por fondo, serie de facturación, posición de
  cuotapartistas y compraventa con contrapartes) de la carpeta de OneDrive "FCI - PBI - Fondos". Corre en la compu de
  Matías: **los datos internos nunca se suben a este repo**, solo al artifact privado.

Actualización: tarea programada los lunes a la mañana (compu de Matías) que corre `internos.py` y `build_data.py` y
reemplaza `data/industria.json` y `data/internos.json` del artifact.
