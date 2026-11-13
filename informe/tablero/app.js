/* Navegacion: secciones (grupos) y paginas, como las pestañas del Power BI */
(async function () {
  const main = document.getElementById("main"), gNav = document.getElementById("groups"), pNav = document.getElementById("pages");
  try { await M.load(); } catch (e) { main.innerHTML = '<div class="load">No se pudieron cargar los datos del tablero.</div>'; return; }
  const ult = M.fechas[M.lastMi].split("-").reverse().join("/");
  const gen = M.generado ? new Date(M.generado).toLocaleDateString("es-AR") : "";
  document.getElementById("meta").textContent = `Datos CAFCI/CNV al ${ult} · actualizado ${gen}`;
  const pages = P.pages, groups = [...new Set(pages.map(p => p.group))];
  const state = {};
  let cur = pages[0].id;
  const byId = id => pages.find(p => p.id === id);
  const fromHash = () => { const h = location.hash.slice(1); if (byId(h)) cur = h; };
  fromHash();

  function nav() {
    const g = byId(cur).group;
    gNav.replaceChildren(...groups.map(x => { const b = U.el("button", null, x); b.type = "button"; b.setAttribute("aria-pressed", String(x === g));
      b.addEventListener("click", () => go(pages.find(p => p.group === x).id)); return b; }));
    pNav.replaceChildren(...pages.filter(p => p.group === g).map(p => { const b = U.el("button", null, p.name); b.type = "button"; b.setAttribute("aria-pressed", String(p.id === cur));
      b.addEventListener("click", () => go(p.id)); return b; }));
  }
  function go(id) { cur = id; try { history.replaceState(null, "", "#" + id); } catch (e) {} render(); }
  function render() {
    nav();
    const p = byId(cur);
    if (!state[p.id]) { state[p.id] = {}; if (p.init) p.init(state[p.id]); }
    const st = state[p.id];
    U.disposeAll();
    const page = U.el("div", "page"), side = U.el("aside", "side"), content = U.el("div", "content");
    page.append(side, content);
    main.replaceChildren(page);
    const rf = () => requestAnimationFrame(render);
    try { p.render(st, side, content, rf); } catch (e) { console.error(e); content.appendChild(U.el("div", "empty", "Error al dibujar esta página: " + e.message)); }
    if (!side.children.length) page.classList.add("full");
    requestAnimationFrame(() => U.resizeAll());
  }
  window.addEventListener("hashchange", () => { fromHash(); render(); });
  render();
})();
