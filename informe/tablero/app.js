/* Navegacion: una pestaña por hoja del Power BI "Informe Gestion FCI" (mismo orden y nombre), mas las slides de la Call */
(async function () {
  const main = document.getElementById("main"), gNav = document.getElementById("groups"), pNav = document.getElementById("pages");
  try { await M.load(); D.build(); } catch (e) { console.error(e); main.innerHTML = '<div class="load">No se pudieron cargar los datos del tablero.</div>'; return; }
  const ult = M.fechas[M.lastMi].split("-").reverse().join("/");
  const gen = M.generado ? new Date(M.generado).toLocaleDateString("es-AR") : "";
  document.getElementById("meta").textContent = `Datos CAFCI/CNV al ${ult} · actualizado ${gen}`;
  const GPBI = "Informe de Gestión (Power BI)";
  const pages = PBI.pages.map((p, i) => ({ id: "pbi-" + (i + 1), group: GPBI, name: p.name, spec: p }))
    .concat((window.P ? P.pages : []).map(p => Object.assign({}, p, { group: p.group === "Datos internos" ? p.group : "Call de Fondos · slides" })));
  const groups = [...new Set(pages.map(p => p.group))];
  const state = {};
  let cur = pages[0].id;
  const byId = id => pages.find(p => p.id === id);
  const fromHash = () => { const h = decodeURIComponent(location.hash.slice(1)); if (byId(h)) cur = h; };
  fromHash();

  function nav() {
    const g = byId(cur).group;
    gNav.replaceChildren(...groups.map(x => { const b = U.el("button", null, x); b.type = "button"; b.setAttribute("aria-pressed", String(x === g));
      b.addEventListener("click", () => go(pages.find(p => p.group === x).id)); return b; }));
    pNav.className = g === GPBI ? "pages pbi-tabs" : "pages";
    pNav.replaceChildren(...pages.filter(p => p.group === g).map(p => { const b = U.el("button", null, p.name); b.type = "button"; b.setAttribute("aria-pressed", String(p.id === cur));
      b.addEventListener("click", () => go(p.id)); return b; }));
    const act = pNav.querySelector('[aria-pressed="true"]'); if (act && act.scrollIntoView) act.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  function go(id) { cur = id; try { history.replaceState(null, "", "#" + id); } catch (e) {} render(); }
  let scaleBox = null;
  function fit() {
    if (!scaleBox) return;
    const stage = scaleBox.firstElementChild; if (!stage) return;
    const w = stage.offsetWidth, h = stage.offsetHeight;
    const availW = main.clientWidth - 24, availH = window.innerHeight - main.getBoundingClientRect().top - 16 + window.scrollY;
    let s = availW / w;
    if (availH > 300 && !stage.dataset.alto) s = Math.min(s, availH / h);   // hojas que crecen para mostrar tablas completas: escala al ancho y se recorre con el scroll
    s = Math.max(0.3, s);
    stage.style.transform = `scale(${s})`;
    scaleBox.style.width = w * s + "px"; scaleBox.style.height = h * s + "px";
  }
  function render() {
    nav();
    const p = byId(cur);
    if (!state[p.id]) { state[p.id] = {}; if (p.init) p.init(state[p.id]); }
    const st = state[p.id];
    U.disposeAll(); R.dispose();
    if (p.spec) {
      const wrap = U.el("div", "pbi-wrap"); scaleBox = U.el("div", "pbi-scale"); wrap.appendChild(scaleBox);
      main.replaceChildren(wrap);
      if (p.id === pages[0].id) banner(wrap);
      try { R.renderPage(p.spec, scaleBox, st, () => requestAnimationFrame(render)); } catch (e) { console.error(e); scaleBox.appendChild(U.el("div", "empty", "Error al dibujar esta hoja: " + e.message)); }
      fit();
      requestAnimationFrame(() => { fit(); R.resize(); });
      return;
    }
    scaleBox = null;
    const page = U.el("div", "page"), side = U.el("aside", "side"), content = U.el("div", "content");
    page.append(side, content);
    main.replaceChildren(page);
    const rf = () => requestAnimationFrame(render);
    try { p.render(st, side, content, rf); } catch (e) { console.error(e); content.appendChild(U.el("div", "empty", "Error al dibujar esta página: " + e.message)); }
    if (!side.children.length) page.classList.add("full");
    requestAnimationFrame(() => U.resizeAll());
  }
  window.addEventListener("resize", () => { fit(); });
  // datos internos cargados a mano (carga_internos.js): se leen de la base del artifact y se vuelve a dibujar la hoja
  window.APP = { rerender: () => requestAnimationFrame(render), fit: () => fit() };
  if (window.CARGAS && CARGAS.conectar) CARGAS.conectar();

  /* ---- Aviso: fondos con patrimonio que no estan en la tabla de 1816 y hay que clasificar ---- */
  const PEND = M.pend || [], KEY = "pendVistos";
  const corte = M.meses[Math.max(0, M.lastMi - 2)];
  const esNuevo = f => (f.alta || "").slice(0, 7) >= corte;
  const fmt = v => v.toLocaleString("es-AR", { maximumFractionDigits: 1 });
  function popup() {
    if (document.querySelector(".ovl")) return;
    const ovl = U.el("div", "ovl"), pop = U.el("div", "pop");
    pop.setAttribute("role", "dialog"); pop.setAttribute("aria-modal", "true");
    const nuevos = PEND.filter(esNuevo).length;
    pop.innerHTML = `<h2>⚠ ${PEND.length === 1 ? "1 fondo necesita" : PEND.length + " fondos necesitan"} ser clasificado${PEND.length === 1 ? "" : "s"}</h2>
      <div class="bd"><p>${nuevos ? `<b>${nuevos} nuevo${nuevos === 1 ? "" : "s"}</b> en la base CAFCI. ` : ""}Estos fondos tienen patrimonio pero no figuran en la clasificación de 1816,
      así que el tablero les asignó tipo y subtipo con una regla automática (acierta el tipo ~80% y el subtipo ~50%). Revisalos y, si hace falta,
      corregilos agregando una línea en <code>mapeo/taxonomia_1816.csv</code> del repo.</p>
      <table><thead><tr><th>Fondo</th><th>Gerente</th><th>Clasificación CAFCI</th><th>Tipo / Subtipo asignado</th><th>Alta</th><th class="n">AUM $M</th></tr></thead><tbody></tbody></table></div>
      <div class="ft"><button type="button">Entendido</button></div>`;
    const tb = pop.querySelector("tbody");
    for (const f of PEND) {
      const tr = document.createElement("tr");
      const cel = (t, cls) => { const td = document.createElement("td"); if (cls) td.className = cls; td.textContent = t; tr.appendChild(td); return td; };
      const c0 = cel(f.fondo + " (CNV " + f.cnv + ")"); if (esNuevo(f)) c0.appendChild(U.el("span", "tag", "Nuevo"));
      cel(f.gerente); cel(f.cafci); cel((f.tipo || "—") + " / " + (f.subtipo || "Sin clasificar"));
      cel((f.alta || "").slice(0, 7).split("-").reverse().join("/")); cel(fmt(f.aum), "n");
      tb.appendChild(tr);
    }
    const cerrar = () => { try { localStorage.setItem(KEY, PEND.map(f => f.cnv).sort().join(",")); } catch (e) {} ovl.remove(); };
    pop.querySelector(".ft button").addEventListener("click", cerrar);
    ovl.addEventListener("click", e => { if (e.target === ovl) cerrar(); });
    document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { cerrar(); document.removeEventListener("keydown", esc); } });
    ovl.appendChild(pop); document.body.appendChild(ovl); pop.querySelector(".ft button").focus();
  }
  function banner(parent) {
    if (!PEND.length) return;
    const nuevos = PEND.filter(esNuevo).length;
    const a = U.el("div", "alerta");
    a.innerHTML = `<span>⚠ <b>${PEND.length} fondo${PEND.length === 1 ? "" : "s"} ${nuevos ? `(${nuevos} nuevo${nuevos === 1 ? "" : "s"}) ` : ""}sin clasificación de 1816</b> — ${PEND.length === 1 ? "necesita" : "necesitan"} ser clasificado${PEND.length === 1 ? "" : "s"}.</span>`;
    const b = U.el("button", null, "Ver detalle"); b.type = "button"; b.addEventListener("click", popup); a.appendChild(b);
    parent.prepend(a);
  }
  let visto = ""; try { visto = localStorage.getItem(KEY) || ""; } catch (e) {}
  const vistos = new Set(visto.split(","));
  if (cur === pages[0].id && PEND.some(f => !vistos.has(String(f.cnv)))) setTimeout(popup, 300);

  window.addEventListener("hashchange", () => { fromHash(); render(); });
  render();
})();
