# Informe de Gestión FCI (réplica del Power BI)

Tablero en un artifact privado (https://claude.ai/artifact/4Cj68KjArL3bGSi5xdeJs4) con las 53 páginas del Power BI
"Informe Gestion FCI.pbix": mismas medidas (mes máximo visible, market share dinámico, flujo acumulado 2026, rankings,
facturación m/m, y/y y YTD, etc.) y columnas calculadas (Tipo_Gerente, Categoria2/3, Subcategoria2, Comercial, ...).

- `tablero/`: código del tablero. Cada pestaña es una réplica 1:1 de una hoja del Power BI (mismo nombre, orden,
  posición y tamaño de cada visual, colores del tema, títulos, filtros y segmentadores), en un lienzo de 1280 x 720:
  - `pbi_convert.py`: lee la definición PBIR del .pbix (Report/definition/*.json) y genera `pbi_spec.js` (diseño de las
    53 hojas) y `pbi_img/` (imágenes del reporte). No lee datos. `pbi_spec.js` no se versiona: se regenera en cada
    actualización desde el .pbix, así que un cambio de diseño en el Power BI pasa solo al tablero.
  - `pbi_formats.json`: formatos de las medidas y columnas del modelo (se regenera con `pbi_formatos.py` y pbixray si
    se agregan medidas o cambian formatos).
  - `pbi_model.js`: tablas del modelo, contexto de filtro (filtros de página, visual y segmentadores, relaciones con
    Calendario, ALLSELECTED / REMOVEFILTERS / ISINSCOPE) y las medidas DAX del .pbix traducidas a JS.
    Si se agrega una medida nueva en el Power BI, hay que traducirla acá (la consola avisa "Medida sin traducir").
  - `pbi_render.js` y `pbi_format.js`: dibujan cada visual (tarjetas, barras, columnas, líneas, combo, torta, anillo,
    dispersión, tablas, matrices, segmentadores de lista, botones, desplegable y texto) con el formato del .pbix.
  - `pages_call_slides.js` y `pages_call_prop.js`: slides de la Call de Fondos (sección aparte).
  - `empaquetar.py`: arma la carpeta para publicar (código + diseño del .pbix + datos) con un manifiesto de hashes.
- `build_data.py`: arma `industria.json` (industria en ARS y USD desde `procesado/informe/`, que genera
  `scripts/informe_gestion.py` en GitHub Actions) e `internos.json`.
- `internos.py`: lee las bases internas de Balanz (comisiones, comisiones por fondo, serie de facturación, posición de
  cuotapartistas y compraventa con contrapartes) de la carpeta de OneDrive "FCI - PBI - Fondos". Corre en la compu de
  Matías: **los datos internos nunca se suben a este repo**, solo al artifact privado.

Segmentadores: arrancan con la selección guardada en el .pbix, corrida al último dato (un mes -> último mes; enero a X
-> enero al último mes; otro rango -> el mismo rango desplazado). Los segmentadores filtran los ítems de los demás y
respetan las interacciones "Ninguna" del Power BI.

Actualización: tarea programada los lunes a la mañana en la compu de Matías. Todo lo que genera va a
`FCI - PBI - Fondos\Claude outputs` (nunca a las carpetas que combina el Power BI):
1. Baja `informe/` de este repo (tar de la rama main) a `$HOME/ig`.
2. `internos.py` -> `Claude outputs/informe_internos`; `build_data.py` -> `Claude outputs/informe_gestion_data`.
3. `tablero/empaquetar.py` con el .pbix (`FCI - Matias\Tableros.pbix\Informe Gestion FCI.pbix`) ->
   `Claude outputs/tablero_publicar` (index.html, *.js, pbi_spec.js, pbi_img/, data/, manifiesto.json).
4. Publica en el artifact los archivos de esa carpeta (echarts.min.js ya está en el artifact).
