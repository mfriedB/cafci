# Deck "Informe de Gestión FCI" en Claude Slides (réplica del PPT mensual)

Artifact: https://claude.ai/artifact/B1ynMrQFd9nz8h6s71Aspn (64 slides, igual al PPT de septiembre 2026).
Cada slide es: fondo raster del PPT sin textos + textos editables + los gráficos regenerados con datos (`<img class="ch">`).

## Qué gráfico sale de dónde
| Slides | Fuente | Script |
|---|---|---|
| 5, 12, 13, 20, 22, 23, 24, 25, 26 | Tablero "Informe de Gestión FCI" (réplica del Power BI) con CAFCI/CNV cortado al mes | `capturas_tablero.py` |
| 6, 10, 15, 16, 17, 21 | CAFCI/CNV (los originales eran Excel / 1816) | `gen_excel.py` |
| 29, 54, 55 | `hist_area.csv` + mes nuevo de `dax_mes_unidad.txt` | `gen_internos.py` |
| 32 | serie de facturación (`internos.json`) | `gen_internos.py` |
| 50 a 53 | % de facturación por fondo de cada área (export del Power BI, se sube en "Datos internos") | `gen_internos.py` |

Pendientes de fuente: emisiones primarias (35), ACDIs (41, sale de `dax_clientes`), fondos de terceros (42, solo hay foto
desde sep-26 en la base de Tenencias), ratings (44, plantilla 9), contrapartes Q3 (48-49, `compravtaespecies3Q.xlsx`).

## Actualización mensual
1. Matías sube en el tablero › **Datos internos**: comisiones, consultas DAX, % de facturación por fondo de cada área
   (`fact_fondo_area_<Área>.xlsx`), y las plantillas (terceros, emisiones con montos, ratings, textos).
2. Claude lee la colección `cargas` (db_list) y la convierte: `python3 ../cargas_a_archivos.py cargas.json --dax DAX --internos internos.json --fact-area FA --extras extras.json`.
3. `python3 actualizar_deck.py --mes AAAA-MM --cafci CLON_DATOS --tablero TABLERO --internos internos.json --dax DAX --hist hist_area.csv --fact-area FA`
4. Claude sube `charts/*.png` como assets del artifact y reemplaza el `src` de cada `<img class="ch">` (mismas posiciones).
   Los textos de cada slide se actualizan por prompt.

`fondos_sin_graficos.py` solo hace falta si cambia el diseño del PPT base: rehace los fondos sin las imágenes reemplazadas.
Los datos internos (charts, hist_area, internos.json, DAX) nunca se suben al repo.
