# Informe de Gestión FCI – Comité Ejecutivo (automático)

Arma la presentación ejecutiva (20 slides core + 5 adicionales) del mes cerrado y la publica en el artifact privado de Slides
`https://claude.ai/artifact/4vBT6LP9UdZ479mM7oXS4b` (slug `1fb84697-492b-4795-a32b-0ee445cd2fa4`).
Todos los números, títulos y gráficos se calculan del dato del mes: no hay textos fijos.

**Este repo tiene sólo código.** Los datos internos de Balanz viven en
`C:\Users\mfried\OneDrive - BALANZ\FCI - PBI - Fondos\PBI - Mati\Claude outputs\informe_comite\` y en el artifact privado.

## Fuentes

| Dato | Origen | Cómo llega |
|---|---|---|
| Industria (AUM, flujos, ranking, share) | CAFCI/CNV, este repo `procesado/informe/` | automático (GitHub Actions) |
| Rendimientos vs peer group 1816 | este repo `procesado/clases_diario/` + `rend_corte.py` | automático |
| Facturación por unidad y fondo | Power BI "Rporte de Comision por Fondos v2" | tarea mensual de comisiones (1er día hábil) → `PBI - Mati/Claude outputs/informe/data/internos.json` |
| AUM por área, clientes, ACDIs, inversores, facturación por fondo | modelo "DS Fondos - AM - Comisiones - Volumen - CuotaPartes" | Power BI **web** (vista de consultas DAX, ver `web_dax.md`), consultas de `consultas_dax.dax` → `informe_comite/dax/*.txt` |
| AUM por área nov-19 → sep-26 | digitalizado del informe anterior | fijo, `informe_comite/hist_area.csv` |

## Pasos (los hace la tarea programada mensual)

1. `python3 comite.py --chequear --mes AAAA-MM ...`: controla que estén industria, comisiones y las 4 exportaciones DAX del mes. Sale con código 2 y la lista de faltantes si no.
2. Si faltan las exportaciones DAX: correr `consultas_dax.dax` en Power BI web con el navegador integrado (`web_dax.md`), guardar los 4 `.txt` en `informe_comite/dax_nuevo/` y controlar con `control_dax.py dax dax_nuevo` que los meses ya cerrados no cambien; si da OK, reemplazar `dax/`.
3. `python3 comite.py --mes AAAA-MM --cafci <clon> --internos internos.json --dax <dax> --hist hist_area.csv --out <out>`.
4. Subir `out/png/*` con `upload_asset` al artifact, armar `mapa.json` (nombre → url) y correr `assets_map.py <out> mapa.json`.
5. `publish_files` (mode patch) de `project/deck.json`, `project/deck.css` y todos los `project/slides/*.html`.
6. Guardar `estado.json` (`{"ultimo_mes": "AAAA-MM"}`) en `informe_comite/` para no repetir.

## Reglas
- Nunca subir datos internos a GitHub. Nunca tocar "Capacitación- Intranet. NO MODIFICAR".
- Logins y códigos los hace Matías. No escribir credenciales ni leer tokens.
- Si un título deja de ser cierto (por ejemplo, Balanz deja de ser #1), el script cambia el texto solo: revisar `resumen.json → titulos` antes de publicar.
