# Correr las consultas DAX desde Power BI web (sin Power BI Desktop)

Probado el 13/11/2026: las 4 consultas dan lo mismo que las exportaciones de Power BI Desktop.

1. Navegador integrado de la app de Claude (`mcp__remote-devices__Claude_Browser__*`). Abrir
   `https://app.powerbi.com/groups/52c41835-a16a-4afd-bb46-54bd12c4635f/modeling/8c99575a-95a0-4338-8bdd-bec5924189ce/daxQueryView?experience=power-bi`
   (modelo "DS Fondos - AM - Comisiones - Volumen - CuotaPartes", área SelfService_Fondos). Si pide login, lo hace Matías.
   Cerrar el cartel de bienvenida si aparece. `resize_window` 1600x1000.
2. El editor y la grilla están en el iframe `iframe[name="iframe-page-modeling"]` (mismo origen). Una vez por sesión,
   instalar la captura del portapapeles (sólo intercepta lo que copia el botón "Copia" de la propia página; no lee tokens):
   ```js
   const w=document.querySelector('iframe[name="iframe-page-modeling"]').contentWindow; w.__cap=[];
   const c=w.navigator.clipboard, ow=c.writeText.bind(c); c.writeText=async t=>{w.__cap.push(t); return ow(t)}; 'ok'
   ```
3. Por cada consulta de `consultas_dax.dax`:
   - Cargarla: `w.monaco.editor.getEditors()[0].setValue(q); ...focus()` y apretar **F5**. Esperar a que la barra de estado
     diga "Correcto (… ms) … N filas" (la de clientes tarda ~35 s).
   - Botón **Copia** (arriba de la grilla de resultados) > **Toda la tabla**.
   - Descargar lo capturado con el nombre de la consulta:
     ```js
     const t=w.__cap[w.__cap.length-1]; const a=document.createElement('a');
     a.href=URL.createObjectURL(new Blob(['\ufeff'+t],{type:'text/plain;charset=utf-8'})); a.download='dax_mes_unidad.txt';
     document.body.appendChild(a); a.click(); a.remove(); t.split('\n').length
     ```
   La descarga cae en `C:\Users\mfried\Downloads` con ese nombre.
4. Mover los 4 .txt a `informe_comite\dax_nuevo\` y correr `control_dax.py dax dax_nuevo`.
