/* Dibuja las hojas del Power BI a partir de pbi_spec.js (posiciones, formato y filtros) y del motor pbi_model.js */
(function () {
  const R = {};
  window.R = R;
  // ?cmp: modo comparacion con el PDF del Power BI (selecciones guardadas tal cual y graficos en SVG para medir textos)
  try { R.CMP = new URLSearchParams(location.search).has("cmp"); } catch (e) { R.CMP = false; }
  const PT = 4 / 3;                       // el Power BI expresa los tamaños de letra en puntos
  const FONT = "'Segoe UI', 'Segoe UI Web (West European)', -apple-system, 'Helvetica Neue', Arial, sans-serif";
  const FONT_SB = "'Segoe UI Semibold', 'Segoe UI', 'Segoe UI Web (West European)', -apple-system, Arial, sans-serif";
  const FONT_DIN = "'Barlow', 'Segoe UI', Arial, sans-serif";   // la DIN del Power BI ("StandardFont") no es web: Barlow 500 al 91 % con +0,02em la iguala
  // aplica familia, tamaño y peso como el Power BI (con la sustitucion de DIN)
  function setFont(e, fam, sizePx, weight) {
    if (fam === FONT_DIN) { e.style.fontFamily = FONT_DIN; e.style.fontSize = (sizePx * 0.89) + "px"; e.style.letterSpacing = "0.018em"; e.style.fontWeight = +weight >= 600 ? "600" : "500"; }
    else { e.style.fontFamily = fam; e.style.fontSize = sizePx + "px"; if (weight) e.style.fontWeight = weight; e.style.letterSpacing = "normal"; }
  }
  R.setFont = (...a) => setFont(...a);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  let TH;                                   // tema
  const charts = [];
  R.dispose = () => { while (charts.length) { try { charts.pop().dispose(); } catch (e) {} } };

  /* ---------- lectura de propiedades de formato ---------- */
  // primera entrada sin selector (o con selector id default) que tenga la propiedad
  function prop(v, src, obj, name, dflt) {
    const arr = (v[src] || {})[obj];
    if (arr) for (const it of arr) if ((!it.s || it.s.id === "default") && it.p[name] !== undefined) return unraw(it.p[name]);
    return dflt;
  }
  // meta: queryRef de la medida; o {val}: valor de la serie/categoria (selector scope)
  function propSel(v, src, obj, name, meta, dflt) {
    const arr = (v[src] || {})[obj];
    if (arr && meta != null) for (const it of arr) {
      if (!it.s || it.p[name] === undefined) continue;
      if (typeof meta === "object") { if (it.s.data && it.s.data.some(d => d.scope && d.scope.r && String(d.scope.r.v) === String(meta.val))) return unraw(it.p[name]); }
      else if (it.s.meta === meta) return unraw(it.p[name]);
    }
    return prop(v, src, obj, name, dflt);
  }
  const unraw = x => (x && typeof x === "object" && "raw" in x ? undefined : x);
  const O = (v, obj, name, d) => prop(v, "obj", obj, name, d);
  const C = (v, obj, name, d) => prop(v, "vco", obj, name, d);
  // colores por valor de serie / categoria (dataPoint con selector scope)
  function dpColors(v, obj, name, col) {
    const out = new Map();
    col = col || ((v.proj.Series || [])[0] || (v.proj.Category || [])[0] || {}).p;
    for (const it of ((v.obj || {})[obj || "dataPoint"] || [])) {
      if (!it.s || !it.s.data) continue;
      for (const d of it.s.data) if (d.scope && d.scope.op === "cmp" && d.scope.r && (!col || !d.scope.l || d.scope.l.p === col)) {
        const val = d.scope.r.v && typeof d.scope.r.v === "object" && d.scope.r.v.date ? d.scope.r.v.date.slice(0, 10) : d.scope.r.v;
        const c = unraw(it.p[name || "fill"]);
        if (c) out.set(String(val), { c, tr: it.p.fillTransparency });
      }
    }
    return out;
  }
  function dpMeta(v, meta, name) {
    for (const it of ((v.obj || {}).dataPoint || [])) if (it.s && it.s.meta === meta && it.p[name || "fill"]) return unraw(it.p[name || "fill"]);
    return undefined;
  }
  const alpha = (hex, tr) => {
    if (!hex || typeof hex !== "string") return hex;
    if (tr == null || tr === 0) return hex;
    const h = hex.replace("#", ""); const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${(1 - tr / 100).toFixed(3)})`;
  };
  const px = pt => (pt == null ? null : pt * PT);

  /* ---------- formatos de campos ---------- */
  function fmtOf(fd) {
    if (fd.fmt) return fd.fmt;
    const fm = (window.PBI && PBI.formats) || {};
    if (fd.k === "M") return (fm.m || {})[fd.t + "|" + fd.p];
    if (fd.k === "C") return (fm.c || {})[fd.t + "|" + fd.p] || (fd.t === "Calendario" ? { "AñoMes (Texto)": 'mmmm "de" yyyy', Date: "Long Date" }[fd.p] : undefined);
    if (fd.k === "A") return fd.f === 0 || fd.f === 1 || fd.f === 3 || fd.f === 4 ? (fm.c || {})[fd.e.t + "|" + fd.e.p] : "0";
    if (fd.k === "X" && fd.op === 3) return "0.00%;-0.00%;0.00%";
    return undefined;
  }
  R.fmtOf = fmtOf;
  R.container = (...a) => container(...a);
  R.visualCtx = (...a) => visualCtx(...a);
  const isDateCol = fd => fd && (fd.k === "C") && /^(Fecha|Mes_Año_Fecha|AñoMes \(Texto\)|Date|FechaFinMes|AnoMesCorto)$/.test(fd.p);
  function fmtCat(fd, val) {
    if (val == null) return "(En blanco)";
    if (isDateCol(fd)) { const f = fmtOf(fd); return F.date(String(val), f === "Long Date" ? "d/m/yyyy" : f); }
    if (typeof val === "number") return F.num(val, fmtOf(fd));
    return String(val);
  }
  R.fmtCat = fmtCat;
  const label = fd => fd.dn || fd.nq || fd.p || "";

  /* ---------- contexto de cada visual ---------- */
  // estado de segmentadores por pagina: st.sl[visualId] = Set | null
  function slicerKey(v) { const f = (v.proj.Values || v.proj.Field || [])[0]; return f ? D.fieldKey(f) : null; }
  function slicerField(v) { return (v.proj.Values || v.proj.Field || [])[0]; }
  // valores posibles de un segmentador
  function slicerValues(v) {
    const fd = slicerField(v); if (!fd) return [];
    const key = D.fieldKey(fd);
    let vals;
    if (fd.t === "Calendario") {
      const lo = Math.min(...D.T.CSV_1816.rows.map(r => r.mk)), hi = D.lastMk.CSV_1816;
      vals = []; for (let mk = lo; mk <= hi; mk++) vals.push(D.cal(D.mkEnd(mk), fd.p));
      vals = [...new Set(vals)];
    } else {
      const tb = D.T[fd.t];
      let rows = tb.rows;
      if (R._page) {
        const f = pageCtx(R._page, R._st, v.id);
        for (const vf of v.filters || []) for (const c of vf.c) for (const x of D.condToFilters(c)) if (x.key && x.pred) f[x.key] = (f[x.key] || []).concat([x.pred]);
        delete f[key];
        rows = D.rows(fd.t, D.ctx(f, f, new Set()));
      }
      vals = [...new Set(rows.map(r => D.colVal(fd.t, key, r)))];
    }
    vals = vals.filter(x => x != null && x !== "");
    const desc = (v.sort || []).some(s => s.dir === "Descending");
    vals.sort((a, b) => (typeof a === "number" ? a - b : String(a).localeCompare(String(b), "es")));
    if (desc) vals.reverse();
    return vals;
  }
  // seleccion inicial: la guardada en el .pbix, con los meses corridos al ultimo dato disponible
  function initialSel(v) {
    const fd = slicerField(v); if (!fd || !v.sel) return null;
    const key = D.fieldKey(fd);
    let fl = [];
    for (const c of v.sel) fl = fl.concat(D.condToFilters(c));
    const f = fl.find(x => x.key === key);
    if (!f || !f.pred) return null;
    const vals = slicerValues(v);
    if (f.pred.vals) {
      let s = [...f.pred.vals];
      const isMonth = /Mes_Año_Fecha|AñoMes \(Texto\)|^Fecha$/.test(fd.p);
      if (isMonth && s.length && !R.CMP) {
        const tbl = fd.t === "Calendario" ? "CSV_1816" : fd.t;
        const last = D.lastMk[tbl] != null ? D.lastMk[tbl] : D.lastMk.CSV_1816;
        const mks = s.map(x => D.mkOf(String(x))).sort((a, b) => a - b);
        const mx = mks[mks.length - 1], mn = mks[0];
        const contiguo = mks.length === mx - mn + 1;
        let target;
        if (mks.length === 1) target = [last];
        else if (contiguo && mn % 12 === 0) { target = []; for (let mk = Math.floor(last / 12) * 12; mk <= last; mk++) target.push(mk); }
        else target = mks.map(mk => mk + (last - mx));
        s = target.map(mk => D.mkStart(mk));
        if (fd.p === "AñoMes (Texto)" || fd.p === "Mes_Año_Fecha") s = target.map(mk => D.mkStart(mk));
        else if (fd.p === "Fecha") { const set = new Set(target); return { fn: true, set, pred: D.pFn("sl" + [...set].join(","), x => x != null && set.has(D.mkOf(x))) }; }
      }
      return new Set(s.filter(x => vals.includes(x)));
    }
    // seleccion invertida (Not In): todos menos esos
    const sel = new Set(vals.filter(x => f.pred.test(x)));
    return sel.size === vals.length ? null : sel;
  }
  function pageCtx(page, st, exceptId) {
    const f = {};
    const add = (k, p) => { f[k] = (f[k] || []).concat([p]); };
    for (const pf of page.filters || []) for (const c of pf.c) for (const x of D.condToFilters(c)) if (x.key && x.pred) add(x.key, x.pred);
    for (const v of page.visuals) {
      if (!/licer/.test(v.type) || v.id === exceptId) continue;
      if ((page.noFilter || []).some(x => x[0] === v.id && x[1] === exceptId)) continue;
      const s = st.sl[v.id];
      if (s == null) continue;
      const key = slicerKey(v);
      if (!key) continue;
      if (s.text != null) { const q = s.text.toLowerCase(); if (q) add(key, D.pFn("txt:" + q, x => x != null && String(x).toLowerCase().includes(q))); continue; }
      if (s.fn) { add(key, s.pred); continue; }
      add(key, D.pIn([...s]));
    }
    return f;
  }
  function visualCtx(page, st, v) {
    const f = pageCtx(page, st, v.id);
    const mfil = [], topn = [];
    for (const vf of v.filters || []) for (const c of vf.c) for (const x of D.condToFilters(c)) {
      if (x.key && x.pred) f[x.key] = (f[x.key] || []).concat([x.pred]);
      else if (x.measure) mfil.push(x);
      else if (x.topn) topn.push(x);
    }
    let ctx = D.ctx(f, f, new Set());
    for (const tn of topn) {   // TopN: los N valores con mayor (o menor) medida
      const q = tn.topn, ord = q.order[0], key = tn.key;
      const t = D.fieldTable(q.select[0]);
      const vals = [...new Set(D.rows(t, ctx).map(r => D.colVal(t, key, r)))];
      const sc = vals.map(x => { const c2 = D.with(ctx, [{ set: [key, D.pIn([x])] }]); c2.scope = new Set([key]); return [x, D.evalField(ord.e, c2)]; }).filter(x => x[1] != null);
      sc.sort((a, b) => (ord.dir === 2 ? b[1] - a[1] : a[1] - b[1]));
      const keep = sc.slice(0, q.top).map(x => x[0]);
      f[key] = (f[key] || []).concat([D.pIn(keep)]);
      ctx = D.ctx(f, f, new Set());
    }
    ctx.mfil = mfil;
    return ctx;
  }

  /* ---------- consulta: agrupar y evaluar ---------- */
  // groups: [fd] columnas; vals: [fd] medidas. Devuelve filas {k:[..], v:[..]}
  function query(v, ctx, groups, vals, opt) {
    opt = opt || {};
    const keys = groups.map(D.fieldKey);
    const out = [];
    const ev = (c2) => vals.map(fd => D.evalField(fd, c2, v.__q));
    if (!groups.length) {
      const c2 = D.ctx(ctx.f, ctx.outer, new Set());
      const r = { k: [], v: ev(c2) };
      if (!ctx.mfil || ctx.mfil.every(mf => mf.test(D.evalField(mf.measure, c2, v.__q)))) out.push(r);
      return out;
    }
    const t = D.fieldTable(groups[0]);
    const combos = new Map();
    for (const r of D.rows(t, ctx)) {
      const kv = keys.map(k => D.colVal(t, k, r));
      const s = JSON.stringify(kv);
      if (!combos.has(s)) combos.set(s, kv);
    }
    for (const kv of combos.values()) {
      let ops = keys.map((k, i) => ({ set: [k, D.pIn([kv[i]])] }));
      const c2 = D.with(ctx, ops); c2.scope = new Set(opt.scopeKeys || keys);
      if (ctx.mfil && !ctx.mfil.every(mf => mf.test(D.evalField(mf.measure, c2, v.__q)))) continue;
      const vv = ev(c2);
      if (!opt.keepBlank && vals.length && vv.every(x => x == null)) continue;
      out.push({ k: kv, v: vv });
    }
    return out;
  }
  R.query = query;
  R.track = c => charts.push(c);
  function sortRows(v, rows, groups, vals, gi) {
    const sd = (v.sort || [])[0];
    const cmpK = (a, b) => (a == null ? -1 : b == null ? 1 : typeof a === "number" ? a - b : String(a).localeCompare(String(b), "es", { numeric: true }));
    if (sd) {
      const dir = sd.dir === "Ascending" ? 1 : -1;
      const gIdx = groups.findIndex(g => g.k === sd.e.k && g.p === sd.e.p && g.t === sd.e.t);
      if (gIdx >= 0) return rows.sort((a, b) => dir * cmpK(a.k[gIdx], b.k[gIdx]));
      const se = JSON.stringify(Object.assign({}, sd.e));
      let vIdx = vals.findIndex(x => JSON.stringify({ k: x.k, t: x.t, p: x.p, f: x.f, e: x.e, op: x.op, l: x.l, r: x.r }) === JSON.stringify({ k: sd.e.k, t: sd.e.t, p: sd.e.p, f: sd.e.f, e: sd.e.e, op: sd.e.op, l: sd.e.l, r: sd.e.r }));
      if (vIdx < 0) vIdx = vals.findIndex(x => x.p && x.p === sd.e.p);
      if (vIdx >= 0) return rows.sort((a, b) => dir * ((a.v[vIdx] ?? -Infinity) - (b.v[vIdx] ?? -Infinity)));
    }
    return rows.sort((a, b) => cmpK(a.k[gi || 0], b.k[gi || 0]));
  }

  /* ---------- contenedor del visual (fondo, borde, titulo) ---------- */
  function container(v, host, defTitle) {
    const box = el("div", "pv"); box.dataset.t = v.type; box.dataset.id = v.id;
    Object.assign(box.style, { left: v.x + "px", top: v.y + "px", width: v.w + "px", height: v.h + "px" });
    const bgShow = C(v, "background", "show", !/^(textbox|image|shape|group)$/.test(v.type) || !!C(v, "background", "color"));
    const bgCol = C(v, "background", "color", TH.background || "#FFFFFF");
    const bgTr = C(v, "background", "transparency", v.type === "textbox" ? (C(v, "background", "color") ? 0 : 100) : 0);
    if (bgShow && bgTr < 100 && v.type !== "image") box.style.background = alpha(typeof bgCol === "string" ? bgCol : "#FFFFFF", bgTr);
    if (C(v, "border", "show", false)) {
      box.style.border = `${C(v, "border", "width", 1)}px solid ${C(v, "border", "color", "#B3B0AD")}`;
      box.style.borderRadius = (C(v, "border", "radius", 0)) + "px";
    }
    if (C(v, "dropShadow", "show", false)) box.style.boxShadow = "0 2px 6px rgba(0,0,0,.25)";
    const inner = el("div", "pv-in");
    box.appendChild(inner);
    const showT = C(v, "title", "show", defTitle != null);
    let title = null;
    if (showT) {
      const txt = C(v, "title", "text", defTitle || "");
      title = el("div", "pv-title", txt);
      const fs = C(v, "title", "fontSize", 14);
      Object.assign(title.style, {
        color: C(v, "title", "fontColor", TH.foreground || "#252423"),
        textAlign: C(v, "title", "alignment", "left"), fontStyle: C(v, "title", "italic", false) ? "italic" : "normal",
        textDecoration: C(v, "title", "underline", false) ? "underline" : "none"
      });
      setFont(title, fontFam(C(v, "title", "fontFamily"), FONT_DIN), px(fs), C(v, "title", "bold", false) ? "700" : "400");
      const tbg = C(v, "title", "background");
      if (tbg && typeof tbg === "string") title.style.background = alpha(tbg, C(v, "title", "transparency", 0));
      if (C(v, "title", "titleWrap", true) === false) { title.style.whiteSpace = "nowrap"; title.style.overflow = "hidden"; title.style.textOverflow = "ellipsis"; }
      inner.appendChild(title);
      if (C(v, "divider", "show", false)) title.style.borderBottom = `1px solid ${C(v, "divider", "color", "#C8C6C4")}`;
    }
    const body = el("div", "pv-body");
    inner.appendChild(body);
    host.appendChild(box);
    return { box, body, title };
  }
  function fontFam(f, dflt) {
    if (!f || typeof f !== "string") return dflt;
    const n = f.replace(/''/g, "'").split(",")[0].replace(/'/g, "").trim();
    if (/semibold/i.test(n)) return FONT_SB;
    if (/DIN/i.test(n)) return FONT_DIN;
    if (/Segoe/i.test(n)) return FONT;
    return `'${n}', ${FONT}`;
  }
  R.fontFam = fontFam;
  const mctx = document.createElement("canvas").getContext("2d");
  R.textW = (t, size, weight, fam) => { mctx.font = `${weight || "normal"} ${size}px ${fam || FONT}`; return mctx.measureText(String(t)).width; };
  const fontW = (f, d) => (typeof f === "string" ? (/Bold/i.test(f) && !/Semibold/i.test(f) ? "700" : /Semibold/i.test(f) ? "600" : /Light/i.test(f) ? "300" : d) : d);
  const defaultTitle = (v, vals, groups) => {
    const ms = vals.map(label), gs = groups.map(label);
    if (!ms.length) return gs.join(", ");
    return ms.join(" y ") + (gs.length ? " por " + gs.join(" y ") : "");
  };

  function echart(body, opt) {
    const d = el("div", "pv-chart"); body.appendChild(d);
    const c = echarts.init(d, null, { renderer: "svg" });
    opt.animation = false;
    if (R.LEY && opt.legend && opt.legend.show !== false && opt.legend.orient !== "vertical") {
      const ts = Object.assign({}, opt.legend.textStyle || {}, R.LEY.textStyle || {}); delete opt.legend.bottom;
      Object.assign(opt.legend, R.LEY, { textStyle: ts });
    }
    opt.textStyle = Object.assign({ fontFamily: FONT, color: TH.foregroundNeutralSecondary || "#605E5C" }, opt.textStyle || {});
    c.setOption(opt); charts.push(c);
    return c;
  }
  R.resize = () => charts.forEach(c => { try { c.resize(); } catch (e) {} });

  /* ---------- colores de series ---------- */
  // colores del tema y, despues, la paleta extendida que usa el Power BI cuando se terminan
  const EXT = ["#3599B8", "#DFBFBF", "#4AC5BB", "#5F6B6D", "#FB8281", "#F4D25A", "#7F898A", "#A4DDEE", "#FDAB89", "#B687AC", "#28738A", "#A78F8F", "#168980", "#293537",
    "#BB4A4A", "#B59525", "#475052", "#6A9FB0", "#BD7150", "#7B4F71", "#1B4D5C", "#706060", "#0F5C55", "#1C2325", "#7D3231", "#796419", "#303637", "#476A75", "#7E4B36", "#52354C", "#0D262E", "#544848"];
  function palette() { return TH.dataColors.concat(EXT); }
  // campos cuyo orden de series en el Power BI no sale de los datos (orden de aparicion en el modelo): se fija aca
  const SERIES_ORDER = { "CSV_1816.Categoria2": ["Money Market ARS", "Renta Fija", "Money Market USD", "T+1", "Destino Esp.", "Renta Mixta", "Renta Variable"] };
  function seriesColor(v, i, name, meta) {
    const dp = dpColors(v);
    if (name != null && dp.has(String(name))) { const x = dp.get(String(name)); return alpha(x.c, x.tr); }
    if (meta) { const m = dpMeta(v, meta); if (m) return m; }
    const def = O(v, "dataPoint", "fill");
    if (def && i === 0 && typeof def === "string" && !name) return alpha(def, O(v, "dataPoint", "fillTransparency"));
    const tr = O(v, "dataPoint", "fillTransparency");
    return alpha(palette()[i % palette().length], tr);
  }

  /* ---------- etiquetas de datos ---------- */
  function labelOpts(v, meta) {
    const g = (n, d) => propSel(v, "obj", "labels", n, meta, d);
    return {
      show: g("show", false), color: g("color"), fontSize: px(g("fontSize", 9)),
      bold: g("bold", false), units: g("labelDisplayUnits", 0), prec: g("labelPrecision"), pos: g("labelPosition", "Auto"),
      bg: g("enableBackground", false) ? alpha(g("backgroundColor", "#FFFFFF"), g("backgroundTransparency", 0)) : null,
      family: fontFam(g("fontFamily"), FONT)
    };
  }
  function vfmt(fd, lo, base) { const f = fmtOf(fd); return x => F.num(x, f, { units: F.isPct(f) ? 1 : lo.units, prec: lo.prec, autoBase: base }); }

  /* ================= visuales ================= */
  const VIS = {};

  VIS.image = function (v, env) {
    const { body } = container(v, env.host, null);
    const sf = O(v, "image", "sourceFile");
    const res = sf && sf.image && sf.image.url && sf.image.url.res;
    if (!res) return;
    const img = el("img", "pv-img"); img.src = "pbi_img/" + res; img.alt = "";
    const fit = (O(v, "image", "fit") || sf.image.scaling || "Normal");
    img.style.objectFit = /Fit/i.test(fit) ? "fill" : /Fill/i.test(fit) ? "cover" : "contain";
    body.appendChild(img);
  };

  VIS.textbox = function (v, env) {
    const { body } = container(v, env.host, null);
    body.classList.add("pv-text");
    for (const par of v.text || []) {
      const p = el("p");
      if (par.align) p.style.textAlign = par.align;
      for (const r of par.runs) {
        const s = el("span", null, r.t);
        const st = r.st || {};
        const fsz = st.fontSize ? parseFloat(st.fontSize) * (/px/.test(st.fontSize) ? 1 : PT) : 14 * PT;
        setFont(s, fontFam(st.fontFamily, FONT), fsz, st.fontWeight === "bold" ? "700" : st.fontWeight || "400");
        if (st.color) s.style.color = st.color;
        if (st.fontStyle) s.style.fontStyle = st.fontStyle;
        if (st.textDecoration) s.style.textDecoration = st.textDecoration;
        p.appendChild(s);
      }
      if (!par.runs.length || par.runs.every(r => !r.t)) p.innerHTML = "&nbsp;";
      body.appendChild(p);
    }
  };

  VIS.shape = function (v, env) {
    const { box } = container(v, env.host, null);
    const shp = O(v, "shape", "tileShape", "rectangle");
    const fill = prop(v, "obj", "fill", "fillColor", TH.dataColors[0]);
    const s = el("div", "pv-shape");
    s.style.background = alpha(fill, prop(v, "obj", "fill", "transparency", 0));
    if (/line/i.test(shp)) { s.style.height = "2px"; s.style.top = "50%"; }
    if (/rounded/i.test(shp)) s.style.borderRadius = "10px";
    if (O(v, "outline", "show", true) === false) s.style.border = "0";
    const ang = O(v, "rotation", "shapeAngle", 0); if (ang) s.style.transform = `rotate(${ang}deg)`;
    box.appendChild(s);
  };

  /* ---- tarjeta nueva (cardVisual) ---- */
  VIS.cardVisual = function (v, env) {
    const vals = v.proj.Data || [];
    const { body } = container(v, env.host, C(v, "title", "show", false) ? (vals.length === 1 ? label(vals[0]) : "") : null);
    const ctx = visualCtx(env.page, env.st, v);
    const row = query(v, ctx, [], vals, { keepBlank: true })[0] || { v: [] };
    const wrap = el("div", "pv-cards");
    const pad = O(v, "padding", "paddingUniform", O(v, "layout", "paddingUniform", 12));
    const bgc = C(v, "background", "color");
    if (bgc && typeof bgc === "string" && bgc.toUpperCase() !== "#FFFFFF") wrap.classList.add("framed");
    wrap.style.padding = Math.max(4, Math.min(pad, 8)) + "px";
    wrap.style.gap = Math.min(pad, 10) + "px";
    const maxT = O(v, "layout", "maxTiles", 3);
    wrap.style.gridTemplateColumns = `repeat(${Math.min(vals.length, Math.max(maxT, vals.length <= 4 ? vals.length : maxT))}, minmax(0,1fr))`;
    vals.forEach((fd, i) => {
      const meta = fd.ref;
      const tile = el("div", "pv-tile");
      const tbg = propSel(v, "obj", "layout", "backgroundColor", meta);
      if (tbg && typeof tbg === "string") tile.style.background = tbg;
      const fmt = fmtOf(fd);
      const units = propSel(v, "obj", "value", "labelDisplayUnits", meta, 0);
      const prec = propSel(v, "obj", "value", "labelPrecision", meta);
      const txt = F.num(row.v[i], fmt, { units: F.isPct(fmt) ? 1 : units, prec, blank: "(En blanco)" });
      const val = el("div", "pv-tv", txt);
      const vfs = propSel(v, "obj", "value", "fontSize", meta, 27);
      Object.assign(val.style, { fontSize: px(vfs) + "px", color: propSel(v, "obj", "value", "fontColor", meta, TH.foreground || "#252423"),
        fontFamily: fontFam(propSel(v, "obj", "value", "fontFamily", meta), FONT), fontWeight: propSel(v, "obj", "value", "bold", meta, false) ? "700" : fontW(propSel(v, "obj", "value", "fontFamily", meta), "400"),
        textAlign: propSel(v, "obj", "value", "horizontalAlignment", meta, "left") });
      tile.appendChild(val);
      if (propSel(v, "obj", "label", "show", meta, true) !== false) {
        const lb = el("div", "pv-tl", label(fd));
        Object.assign(lb.style, { fontSize: px(propSel(v, "obj", "label", "fontSize", meta, 12)) + "px", color: propSel(v, "obj", "label", "fontColor", meta, TH.foregroundNeutralSecondary || "#605E5C"),
          textAlign: propSel(v, "obj", "value", "horizontalAlignment", meta, "left") });
        tile.appendChild(lb);
      }
      wrap.appendChild(tile);
    });
    body.appendChild(wrap);
  };

  /* ---- segmentadores ---- */
  function setSel(env, v, s) { env.st.sl[v.id] = s; env.rerender(); }
  function slicerTitle(v) { const fd = slicerField(v); return fd ? label(fd) : ""; }
  function slicerFmt(v) { const fd = slicerField(v); return x => fmtCat(fd, x); }

  VIS.slicer = function (v, env) {
    const mode = O(v, "data", "mode", "Basic");
    const head = O(v, "header", "show", true) !== false ? (O(v, "header", "text") || slicerTitle(v)) : null;
    const { body } = container(v, env.host, C(v, "title", "show", false) ? slicerTitle(v) : null);
    body.classList.add("pv-slicer");
    if (head) { const h = el("div", "pv-sh", head); h.style.fontFamily = fontFam(O(v, "header", "fontFamily"), FONT_SB); h.style.fontSize = px(O(v, "header", "textSize", 10)) + "px"; h.style.color = O(v, "header", "fontColor", TH.foreground || "#252423"); h.style.fontSize = px(O(v, "header", "textSize", 10)) + "px"; body.appendChild(h); }
    const vals = slicerValues(v), f = slicerFmt(v), cur = env.st.sl[v.id];
    const single = O(v, "selection", "singleSelect", false) || O(v, "selection", "strictSingleSelect", false);
    if (/Dropdown/i.test(mode)) {
      const btn = el("button", "pv-dd");
      btn.type = "button";
      btn.textContent = cur == null || cur.fn ? "Todas" : cur.size === 1 ? f([...cur][0]) : cur.size ? "Selección múltiple" : "Todas";
      btn.style.fontSize = px(O(v, "items", "textSize", 10)) + "px";
      btn.style.color = O(v, "items", "fontColor", "#252423");
      const ib = O(v, "items", "background"); if (typeof ib === "string") btn.style.background = ib;
      btn.addEventListener("click", e => { e.stopPropagation(); dropdown(btn, v, env, vals, f, single); });
      body.appendChild(btn);
    } else listItems(body, v, env, vals, f, single, O(v, "items", "textSize", 10));
  };
  function listItems(body, v, env, vals, f, single, fs) {
    const cur = env.st.sl[v.id];
    const list = el("div", "pv-list");
    if (!single && O(v, "selection", "selectAllCheckboxEnabled", false)) list.appendChild(item("Seleccionar todo", cur == null, () => setSel(env, v, null)));
    for (const x of vals) {
      const on = cur == null ? false : cur.fn ? cur.set.has(D.mkOf(String(x))) : cur.has(x);
      list.appendChild(item(f(x), on || (cur == null && false), () => {
        let s = cur && !cur.fn ? new Set(cur) : new Set();
        if (single) s = new Set([x]); else s.has(x) ? s.delete(x) : s.add(x);
        setSel(env, v, s.size ? s : null);
      }));
    }
    list.style.fontSize = px(fs) + "px";
    body.appendChild(list);
  }
  function item(txt, on, fn) {
    const b = el("button", "pv-it" + (on ? " on" : ""));
    b.type = "button"; b.setAttribute("aria-pressed", String(on));
    b.appendChild(el("span", "pv-ck")); b.appendChild(el("span", null, txt));
    b.addEventListener("click", fn); return b;
  }
  function dropdown(btn, v, env, vals, f, single) {
    document.querySelectorAll(".pv-pop").forEach(x => x.remove());
    const pop = el("div", "pv-pop");
    const r = btn.getBoundingClientRect();
    Object.assign(pop.style, { left: (r.left + window.scrollX) + "px", top: (r.bottom + window.scrollY + 2) + "px", minWidth: r.width + "px" });
    listItems(pop, v, env, vals, f, single, 10);
    document.body.appendChild(pop);
    const close = e => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener("click", close); } };
    setTimeout(() => document.addEventListener("click", close), 0);
  }

  VIS.listSlicer = function (v, env) {
    const { body } = container(v, env.host, C(v, "title", "show", true) !== false ? (C(v, "title", "text") || slicerTitle(v)) : null);
    body.classList.add("pv-slicer");
    const vals = slicerValues(v), f = slicerFmt(v);
    const strict = O(v, "selection", "strictSingleSelect", false);
    const single = O(v, "selection", "singleSelect", false) || strict;
    const cur = env.st.sl[v.id];
    const list = el("div", "pv-ls");
    const fs = px(O(v, "value", "fontSize", 10));
    const bgShow = O(v, "background", "show", false), bgC = O(v, "background", "color", "#E6E6E6"), bgT = O(v, "background", "transparency", 0);
    const olShow = O(v, "outline", "show", false), olC = O(v, "outline", "lineColor", "#C8C6C4"), olT = O(v, "outline", "transparency", 0);
    const rc = O(v, "layout", "rowCount");
    const icon = O(v, "selectionIcon", "size", 12);
    const n = vals.length + (!single && O(v, "selection", "selectAllCheckboxEnabled", false) ? 1 : 0);
    requestAnimationFrame(() => {
      const h = rc ? Math.max(fs * 1.5, ((list.clientHeight || body.clientHeight) - 4) / rc) : fs * 1.62;
      list.querySelectorAll(".pv-lt").forEach(b => { b.style.height = h + "px"; });
    });
    if (!single && O(v, "selection", "selectAllCheckboxEnabled", false)) {
      const todo = cur == null && O(v, "data", "isInvertedSelectionMode", false);
      const t0 = tile(todo ? "Anular toda la selección" : "Seleccionar todo", todo, () => setSel(env, v, null));
      if (!todo && cur != null) t0.classList.add("part");
      list.appendChild(t0);
    }
    for (const x of vals) {
      const on = cur == null ? !single && O(v, "data", "isInvertedSelectionMode", false) : (cur.fn ? cur.set.has(D.mkOf(String(x))) : cur.has(x));
      list.appendChild(tile(f(x), on, () => {
        let s = cur && !cur.fn ? new Set(cur) : cur && cur.fn ? new Set(vals.filter(y => cur.set.has(D.mkOf(String(y))))) : new Set();
        if (single) s = new Set([x]); else s.has(x) ? s.delete(x) : s.add(x);
        setSel(env, v, s.size ? s : null);
      }));
    }
    list.style.fontSize = fs + "px";
    if (O(v, "general", "selfFilterEnabled", false) && !isDateCol(slicerField(v)) && slicerField(v).t !== "Calendario") {
      const q = el("input", "pv-lq"); q.type = "search"; q.placeholder = "Buscar"; q.style.fontSize = fs + "px";
      q.addEventListener("input", () => { const t = q.value.toLowerCase(); list.querySelectorAll(".pv-lt").forEach((b, i) => { b.style.display = !t || b.textContent.toLowerCase().includes(t) ? "" : "none"; }); });
      body.appendChild(q);
    }
    body.appendChild(list);
    function tile(txt, on, fn) {
      const b = el("button", "pv-lt" + (on ? " on" : "")); b.type = "button"; b.setAttribute("aria-pressed", String(on));
      const ck = el("span", strict || single ? "pv-ck pv-rd" : "pv-ck"); ck.style.width = ck.style.height = icon + "px"; b.appendChild(ck);
      const t = el("span", "pv-lx", txt);
      if (bgShow) t.style.background = alpha(bgC, bgT);
      b.appendChild(t);
      if (olShow) b.style.borderBottom = "1px solid " + alpha(olC, olT);
      b.addEventListener("click", fn); return b;
    }
  };

  VIS.advancedSlicerVisual = function (v, env) {
    const { body } = container(v, env.host, C(v, "title", "show", false) ? slicerTitle(v) : null);
    const vals = slicerValues(v), f = slicerFmt(v);
    const cur = env.st.sl[v.id];
    const single = O(v, "selection", "singleSelect", false);
    const orient = O(v, "layout", "orientation", 0);
    const maxT = O(v, "layout", "maxTiles", 3);
    const grid = el("div", "pv-btns");
    const n = vals.length;
    const horiz = orient === 2 || orient === 1 || orient === "horizontal";
    const per = Math.min(n, maxT || n);
    if (horiz) {
      grid.style.gridAutoFlow = "column"; grid.style.gridTemplateRows = "1fr";
      grid.style.gridAutoColumns = `calc((100% - ${(per - 1) * 4}px) / ${per})`;
      if (n > per) { grid.style.overflowX = "auto"; grid.style.scrollbarWidth = "thin"; }
    } else grid.style.gridTemplateColumns = `repeat(${per}, minmax(0,1fr))`;
    const bgOn = prop(v, "obj", "background", "color");
    for (const x of vals) {
      const on = cur != null && cur.has(x);
      const b = el("button", "pv-bt" + (on ? " on" : cur != null ? " off" : ""), f(x));
      b.type = "button"; b.setAttribute("aria-pressed", String(on));
      b.style.fontSize = px(O(v, "value", "fontSize", 12)) + "px";
      b.addEventListener("click", () => {
        let s = cur ? new Set(cur) : new Set();
        if (single) s = s.has(x) ? new Set() : new Set([x]); else s.has(x) ? s.delete(x) : s.add(x);
        setSel(env, v, s.size ? s : null);
      });
      grid.appendChild(b);
    }
    body.appendChild(grid);
  };

  VIS.textSlicer = function (v, env) {
    const { body } = container(v, env.host, null);
    // como el segmentador de texto del Power BI: boton con flecha a la izquierda, "Entrar <campo>" y flecha de aplicar a la derecha
    const box = el("div", "pv-tsb"), chev = el("span", "pv-tsc"), go = el("button", "pv-tsg");
    go.type = "button"; go.setAttribute("aria-label", "Aplicar");
    const inp = el("input", "pv-ts"); inp.type = "search"; inp.placeholder = "Entrar " + slicerTitle(v);
    const cur = env.st.sl[v.id]; inp.value = cur && cur.text != null ? cur.text : "";
    const apply = () => setSel(env, v, inp.value ? { text: inp.value } : null);
    inp.addEventListener("change", apply); go.addEventListener("click", apply);
    if (inp.value) box.classList.add("on");
    box.append(chev, inp, go); body.appendChild(box);
  };

  /* ---- graficos cartesianos (barras, columnas, lineas, combo) ---- */
  function cartesian(v, env, kind) {
    const cat = (v.proj.Category || [])[0], ser = (v.proj.Series || [])[0];
    const ys = v.proj.Y || [], y2 = v.proj.Y2 || [];
    const sm = (v.proj.Rows || [])[0];
    const vals = ys.concat(y2);
    const groups = [cat, ser].filter(Boolean);
    const { body } = container(v, env.host, defaultTitle(v, vals, groups));
    const ctx = visualCtx(env.page, env.st, v);
    if (sm) return smallMultiples(v, env, body, ctx, kind);
    drawCartesian(v, body, ctx, kind, cat, ser, ys, y2);
  }
  function drawCartesian(v, body, ctx, kind, cat, ser, ys, y2, opts) {
    opts = opts || {};
    const vals = ys.concat(y2);
    const horizontal = /^(barChart|clusteredBarChart|hundredPercentStackedBarChart)$/.test(kind);
    const stacked = /^(barChart|columnChart|lineStackedColumnComboChart)$/.test(kind);
    const groups = [cat, ser].filter(Boolean);
    v.__q = { roleKeys: { Category: cat ? [D.fieldKey(cat)] : [], Series: ser ? [D.fieldKey(ser)] : [] } };
    let rows = query(v, ctx, groups, vals);
    if (!rows.length) { body.appendChild(el("div", "pv-empty", "")); return; }
    // categorias en orden
    const catRows = cat ? sortRows(v, query(v, ctx, [cat], vals.slice(0, 1).length ? vals : [], {}), [cat], vals, 0) : [{ k: [null] }];
    let cats = cat ? [...new Set(catRows.map(r => r.k[0]))] : [null];
    if (cat && isDateCol(cat) && !(v.sort || []).some(s => s.e.p !== cat.p)) cats.sort();
    const catIdx = new Map(cats.map((c, i) => [c, i]));
    // series
    let series = [];
    const isLineKind = kind === "lineChart";
    if (ser) {
      let sv = [...new Set(rows.map(r => r.k[1]))].sort((a, b) => String(a).localeCompare(String(b), "es", { numeric: true }));
      const sdm = (v.sort || []).find(x => x.e && (x.e.k === "M" || x.e.k === "X" || x.e.k === "A"));
      if (!(v.sort || []).some(x => x.e && x.e.p === ser.p)) {   // como el Power BI: series (leyenda y colores) en orden alfabetico
        if (sdm && sdm.e && vals.some(f => f.p === sdm.e.p) && !(isLineKind)) {   // salvo que el visual se ordene por la medida
          const tot = new Map(); for (const r of rows) tot.set(r.k[1], (tot.get(r.k[1]) || 0) + (r.v[0] || 0));
          const dir = sdm.dir === "Ascending" ? 1 : -1;
          sv = sv.sort((a, b) => dir * ((tot.get(a) || 0) - (tot.get(b) || 0)));
        }
        const fijo = SERIES_ORDER[ser.ref];   // orden (y colores) que el Power BI mostro para este campo
        if (fijo) { const ix = x => { const i = fijo.indexOf(String(x)); return i < 0 ? 999 : i; }; sv = sv.sort((a, b) => ix(a) - ix(b)); }
      }
      const dpS = dpColors(v); let ci = 0;
      sv.forEach((s) => {   // colores de la paleta en el orden de las series; las que tienen color propio no consumen un color
        const data = cats.map(() => null);
        for (const r of rows) if (r.k[1] === s) data[catIdx.get(r.k[0])] = r.v[0];
        const propio = s != null && dpS.has(String(s));
        series.push({ name: s == null ? "(En blanco)" : String(fmtCat(ser, s)), raw: s, fd: ys[0], data, color: seriesColor(v, propio ? 0 : ci++, s), axis: 0, type: isLineKind ? "line" : "bar", meta: { val: s } });
      });
    } else {
      const dpc = cat ? dpColors(v, null, null, cat.p) : new Map();
      vals.forEach((fd, j) => {
        let data = cats.map(() => null);
        for (const r of rows) data[catIdx.get(cat ? r.k[0] : null)] = r.v[j];
        const pc = dpc.size && vals.length === 1 ? cats.map(c => { const d = dpc.get(String(c)); return d ? alpha(d.c, d.tr) : null; }) : null;
        const isY2 = j >= ys.length;
        const type = kind === "lineStackedColumnComboChart" || kind === "lineClusteredColumnComboChart" ? (isY2 ? "line" : "bar") : isLineKind ? "line" : "bar";
        series.push({ name: label(fd), fd, data, pc, color: seriesColor(v, j, null, fd.ref) || palette()[j], axis: isY2 ? 1 : 0, type, meta: fd.ref });
      });
    }
    const catLabels = cats.map(c => (cat ? fmtCat(cat, c) : ""));
    const dateAxis = cat && isDateCol(cat) && !horizontal && !(isLineKind && cats.length <= 6) && O(v, "categoryAxis", "axisType", "Continuous") !== "Categorical";
    let catLabelsAxis = catLabels, tickIdx = null;
    if (dateAxis) {
      const span = cats.length;
      const wAvail = Math.max(60, (opts.cellW || v.w) - 50);
      const need = span * 62 / wAvail;
      const continuo = cat.p === "Fecha";   // eje de fecha continuo: el Power BI marca enero de cada año
      // como el eje de tiempo del Power BI: el paso mas chico (1, 2, 3, 6 o 12 meses) que deja como mucho ~8 marcas y una cada ~55 px
      const maxTicks = Math.min(8, Math.floor(wAvail / 55));
      let step = [1, 2, 3, 6, 12].find(st => span / st <= maxTicks) || 12;
      if (continuo && span > 24) step = 12;
      const keep = (c, i) => { const m = +String(c).slice(5, 7); return step === 12 ? m === 1 : (m - 1) % step === 0; };
      tickIdx = new Set(cats.map((c, i) => (keep(c, i) ? i : -1)).filter(i => i >= 0));
      catLabelsAxis = cats.map(c => (step === 12 && (!continuo || span > 60) ? String(c).slice(0, 4) : F.mesCorto(String(c))));
    }
    // ejes
    const ax = (n, d) => O(v, "categoryAxis", n, d), vx = (n, d) => O(v, "valueAxis", n, d);
    const axFs = px(ax("fontSize", 9)), vxFs = px(vx("fontSize", 9));
    const axColor = ax("labelColor", TH.foregroundNeutralSecondary || "#605E5C");
    const showCat = ax("show", true) !== false, showVal = vx("show", true) !== false;
    const lg = (n, d) => O(v, "legend", n, d);
    const showLegend = lg("show", series.length > 1 || !!ser) !== false && (series.length > 1 || !!ser);
    const lpos = String(lg("position", "Top"));
    const legend = showLegend ? {
      show: true, type: "scroll", icon: isLineKind && lg("legendMarkerRendering", "markerOnly") !== "markerOnly" ? "path://M0,4h14v2H0z" : "circle", itemWidth: 8, itemHeight: 8, itemGap: 6,
      textStyle: { fontSize: px(lg("fontSize", 10)), color: lg("labelColor", TH.foregroundNeutralSecondary || "#605E5C"), fontFamily: FONT, padding: [0, 0, 0, -3] },
      left: /Center/.test(lpos) ? "center" : /Right/.test(lpos) ? "right" : 4, top: /^Bottom/.test(lpos) ? undefined : 8, bottom: /^Bottom/.test(lpos) ? 2 : undefined,
      orient: /^(Left|Right)/.test(lpos) && !/Center$/.test(lpos) ? "vertical" : "horizontal"
    } : { show: false };
    let legW = 0;   // leyenda vertical a la derecha/izquierda: texto alineado a la izquierda y fuera del area del grafico
    if (showLegend && legend.orient === "vertical") {
      Object.assign(legend, { align: "left", itemGap: Math.round(px(lg("fontSize", 10)) * 0.75) });
      if (/^Right/.test(lpos)) { delete legend.left; legend.right = 4; } else legend.left = 4;
      legW = Math.max(...series.map(x => R.textW(x.name, px(lg("fontSize", 10))))) + 22;
    }
    // escalas
    const valFmt = fdx => { const f = fmtOf(fdx); return F.isPct(f); };
    const allVals = series.filter(s => s.axis === 0).flatMap(s => s.data).filter(x => x != null);
    let vmax = allVals.length ? Math.max(...allVals.map(Math.abs)) : 0;
    if (stacked && !isLineKind) { vmax = 0; cats.forEach((_, i) => { let p = 0, n = 0; for (const s of series) if (s.axis === 0 && s.type === "bar") { const x = s.data[i] || 0; x > 0 ? p += x : n += x; } vmax = Math.max(vmax, p, -n); }); }
    const lo0 = labelOpts(v);
    const fmtAxis = fdx => { const f = fmtOf(fdx); const u = vx("labelDisplayUnits", 0);
      return x => {
        let prec = vx("labelPrecision");
        if (prec == null) {   // como el Power BI: los decimales que hagan falta para los valores del eje
          const unit = F.isPct(f) ? 0.01 : (u === 0 ? F.autoUnit(Math.abs(vmax)) : u > 1 ? u : 1);
          const y = Math.abs(x / unit); prec = 0;
          while (prec < 3 && Math.abs(y - Math.round(y * 10 ** prec) / 10 ** prec) > 1e-9) prec++;
        }
        return F.num(x, f, { units: F.isPct(f) ? 1 : u, prec, autoBase: vmax });
      }; };
    const endV = vx("end"), startV = vx("start");
    const valAxis = {
      splitNumber: Math.max(2, Math.min(6, Math.floor(((opts.cellH || v.h) - 70) / 50))),
      // inicio/fin fijos del eje: se respetan salvo que los datos de hoy los superen (el Power BI los guardó con datos más viejos)
      type: "value", show: showVal, scale: isLineKind || series.every(x => x.type === "line"),
      min: typeof startV === "number" ? (m => Math.min(startV, m.min)) : undefined, max: typeof endV === "number" ? (m => { if (m.max <= endV) return endV; if (!showVal) return m.max + (m.max - m.min) * 0.04; const st = Math.pow(10, Math.floor(Math.log10(Math.abs(m.max)))) / 2; return Math.ceil(m.max / st) * st; }) : undefined,
      axisLabel: { fontSize: vxFs, fontWeight: vx("bold", false) ? "bold" : "normal", color: vx("labelColor", TH.foregroundNeutralSecondary || "#605E5C"), formatter: fmtAxis(series[0] && series[0].fd || vals[0]) },
      splitLine: { show: showVal && vx("gridlineShow", true) !== false, lineStyle: { color: vx("gridlineColor", "#E1DFDD"), type: vx("gridlineStyle", "dotted") === "solid" ? "solid" : vx("gridlineStyle", "dotted") === "dashed" ? "dashed" : "dotted", width: vx("gridlineThickness", 1) } },
      axisLine: { show: false }, axisTick: { show: false }
    };
    if (!showVal) { valAxis.splitLine = { show: false }; valAxis.axisLabel.show = false; }
    // eje visible en lineas: el Power BI corta la escala apenas arriba del maximo (media marca), no en la marca siguiente
    if (showVal && isLineKind && typeof endV !== "number" && !opts.yRange) {
      const ys0 = series.filter(x => x.axis === 0).flatMap(x => x.data).filter(x => x != null);
      if (ys0.length) {
        const mx = Math.max(...ys0), mn = valAxis.scale ? Math.min(...ys0) : Math.min(0, ...ys0), n = valAxis.splitNumber;
        const raw = (mx - mn) / n, mag = Math.pow(10, Math.floor(Math.log10(raw || 1))), st = [1, 2, 2.5, 5, 10].map(k => k * mag).find(k => k >= raw) || 10 * mag;
        if (mx > 0) { valAxis.interval = st; valAxis.max = Math.ceil(mx / (st / 2) * (1 + 1e-9)) * (st / 2); if (Math.abs(valAxis.max / st - Math.round(valAxis.max / st)) > 1e-6) valAxis.axisLabel.showMaxLabel = false; if (typeof startV !== "number") valAxis.min = Math.floor(mn / st) * st; }
      }
    }
    // eje oculto: el Power BI estira la barra mas larga hasta el borde del area (sin redondear la escala)
    if (!showVal && !isLineKind && series.some(x => x.type === "bar") && typeof endV !== "number") { valAxis.max = m => Math.max(0, m.max); if (typeof startV !== "number") valAxis.min = m => (m.min < 0 ? m.min - (Math.max(0, m.max) - m.min) * (horizontal ? 0.02 : 0.22) : 0); }   // si no, containLabel de echarts reserva lugar para etiquetas ocultas
    const y2Axis = y2.length ? { type: "value", scale: true, show: false, splitLine: { show: false },
      min: O(v, "y2Axis", "secStart", O(v, "valueAxis", "secStart")), max: O(v, "y2Axis", "secEnd", O(v, "valueAxis", "secEnd")), axisLabel: { show: false, formatter: fmtAxis(y2[0]) } } : null;
    if (y2Axis) {   // eje secundario oculto: la linea usa todo el alto, como el Power BI
      if (typeof y2Axis.min !== "number") { const pad = O(v, "labels", "optimizeLabelDisplay", true) === false ? 0.14 : 0.06; y2Axis.min = m => m.min - (m.max - m.min) * pad; }
      if (typeof y2Axis.max !== "number") y2Axis.max = m => m.max + (m.max - m.min) * 0.04;
    }
    const catAxis = {
      type: "category", data: catLabelsAxis, show: showCat, boundaryGap: !isLineKind || series.some(s => s.type === "bar"),
      axisLabel: { fontSize: axFs, color: axColor, fontWeight: ax("bold", false) ? "bold" : "normal", hideOverlap: !horizontal && isLineKind, interval: horizontal || !isLineKind ? 0 : "auto",
        width: horizontal ? Math.max(40, v.w * (ax("maxMarginFactor", 25) / 100)) : (!isLineKind && !dateAxis ? Math.max(30, (v.w - 40) / Math.max(1, cats.length) - 12) : undefined),
        overflow: horizontal ? "truncate" : (!isLineKind && !dateAxis ? "break" : "none"), lineHeight: axFs * 1.15, margin: 6 },
      axisTick: { show: false }, axisLine: { show: !horizontal && showCat && !dateAxis, lineStyle: { color: "#C8C6C4" } }, inverse: horizontal
    };
    if (!horizontal && !dateAxis && cat) {   // etiquetas que no entran: rotadas 45° como el Power BI
      const lw = Math.max(...catLabels.map(x => String(x).length)) * axFs * 0.55;
      if (isLineKind && lw * cats.length > (opts.cellW || v.w) - 40) {
        Object.assign(catAxis.axisLabel, { rotate: 45, interval: 0, width: undefined, overflow: "none", hideOverlap: false });
      }
    }
    if (tickIdx) {
      catAxis.axisLabel.interval = i => tickIdx.has(i); catAxis.axisLabel.hideOverlap = false;
      catAxis.splitLine = { show: true, interval: i => tickIdx.has(i), lineStyle: { color: "#C8C6C4", type: [2, 4] } };
    }
    // series de echarts
    const plotW = Math.max(50, (opts.cellW || v.w) - 60);
    let endLab = 0;
    const ech = series.map((s, j) => {
      const lo = labelOpts(v, s.meta);
      if (s.type !== "bar" && cats.length > 36 && lo.fontSize > 12) lo.fontSize = 12;   // lineas muy largas: el Power BI baja las etiquetas a 9 pt
      const showSer = lo.show && propSel(v, "obj", "labels", "showSeries", s.meta, true) !== false;
      const fmt = vfmt(s.fd, lo, s.axis ? null : vmax);
      const isBar = s.type === "bar";
      const nBars = series.filter(x => x.type === "bar").length;
      const pos = isBar ? (/Inside/i.test(lo.pos) ? (/End/.test(lo.pos) ? (horizontal ? "insideRight" : "insideTop") : /Base/.test(lo.pos) ? (horizontal ? "insideLeft" : "insideBottom") : "inside")
        : /Outside/i.test(lo.pos) || !stacked || nBars === 1 ? (horizontal ? "right" : "top") : "inside") : (/Under|Below/i.test(lo.pos) ? "bottom" : "top");
      const sw = propSel(v, "obj", "lineStyles", "strokeWidth", s.meta, O(v, "lineStyles", "strokeWidth", 3));
      let every = 1;
      if (!isBar && showSer) {
        const sample = fmt(Math.max(...s.data.filter(x => x != null).map(Math.abs), 0));
        const lw = R.textW(sample, lo.fontSize, lo.bold ? "bold" : "normal", lo.family) + 8;
        const dens = propSel(v, "obj", "labels", "labelDensity", s.meta, 50);
        const fit = Math.max(1, Math.floor(plotW / lw * (0.8 + dens / 400)));
        every = 1;   // el Power BI ubica todas las que no se pisan (hideOverlap)
      }
      const marker = O(v, "lineStyles", "showMarker", false);
      const o = {
        name: s.name, type: s.type, data: s.data, yAxisIndex: horizontal ? undefined : s.axis, xAxisIndex: horizontal ? s.axis : undefined,
        stack: isBar && stacked ? "a" : undefined, itemStyle: { color: s.color },
        data: s.data.map((x, i) => {
          const o2 = {};
          if (isBar && pos === "top" && x != null && x < 0) o2.label = { position: horizontal ? "left" : "bottom" };
          // todas las etiquetas visibles y sin lugar entre puntos: se escalonan en dos alturas para que no se pisen
          if (!isBar && x != null && showSer && O(v, "labels", "optimizeLabelDisplay", true) === false && i % 2 === 1) {
            const lw = R.textW(fmt(x), lo.fontSize, lo.bold ? "bold" : "normal") + 8;
            if (lw > plotW / Math.max(1, cats.length)) o2.label = Object.assign(o2.label || {}, { position: "bottom", distance: 6 });
          }
          // lineas con posicion automatica: la serie de abajo lleva la etiqueta debajo del punto, como el Power BI
          if (!isBar && x != null && /Auto/i.test(lo.pos || "Auto") && series.filter(z => z.type !== "bar").length > 1) {
            const otros = series.filter(z => z !== s && z.type !== "bar" && z.axis === s.axis).map(z => z.data[i]).filter(y => y != null);
            if (otros.length && x < Math.min(...otros)) o2.label = { position: "bottom" };
          }
          if (s.pc && s.pc[i]) o2.itemStyle = { color: s.pc[i] };
          return Object.keys(o2).length ? Object.assign({ value: x }, o2) : x;
        }),
        barCategoryGap: (ax("innerPadding", 20)) + "%", barGap: "0%", barMaxWidth: horizontal ? undefined : 80,
        label: { show: !!showSer, position: pos, fontSize: lo.fontSize, color: lo.color || (/inside/i.test(pos) ? "#FFFFFF" : TH.foregroundNeutralSecondary || "#605E5C"), fontWeight: lo.bold ? "bold" : "normal",
          fontFamily: lo.family, backgroundColor: lo.bg || "transparent", padding: lo.bg ? [1, 3] : 0,
          formatter: p => { if (p.value == null) return ""; if (!isBar && every > 1 && p.dataIndex % every !== (cats.length - 1) % every) return ""; return fmt(p.value); } },
        labelLayout: { hideOverlap: O(v, "labels", "optimizeLabelDisplay", true) !== false },   // "optimizar etiquetas" apagado en el PBI: se ven todas
        emphasis: { disabled: true }
      };
      if (!isBar) Object.assign(o, { symbol: marker ? "circle" : "none", symbolSize: O(v, "lineStyles", "markerSize", 5) * 1.6, showSymbol: marker || !!showSer, connectNulls: true,
        lineStyle: { width: sw, color: s.color }, z: 5 });
      if (!isBar && showSer && !marker) { o.symbol = "circle"; o.symbolSize = 1; }
      if (!isBar && O(v, "seriesLabels", "show", false)) {
        const scol = propSel(v, "obj", "seriesLabels", "seriesColor", s.meta);
        o.__end = { name: s.name, color: typeof scol === "string" ? scol : O(v, "seriesLabels", "seriesMatchColor", false) === true ? s.color : TH.foregroundNeutralSecondary || "#605E5C", bold: propSel(v, "obj", "seriesLabels", "bold", s.meta, false),
          fs: px(O(v, "seriesLabels", "textSize", 9)), leader: O(v, "seriesLabels", "leaderLines", true) !== false };
        endLab = Math.max(endLab, s.name.length * px(O(v, "seriesLabels", "textSize", 9)) * 0.6 + 14);
      }
      return o;
    });
    // totales de barras apiladas
    if (stacked && series.filter(s => s.type === "bar").length > 1 && O(v, "totals", "show", false)) {
      const tot = cats.map((_, i) => series.reduce((a, s) => a + (s.type === "bar" ? s.data[i] || 0 : 0), 0));
      const tfmt = vfmt(series[0].fd, { units: O(v, "totals", "labelDisplayUnits", O(v, "labels", "labelDisplayUnits", 0)), prec: O(v, "totals", "labelPrecision", O(v, "labels", "labelPrecision")) }, vmax);
      ech.push({ type: "bar", stack: "a", data: tot.map(() => 0), silent: true, itemStyle: { color: "transparent" }, tooltip: { show: false }, yAxisIndex: horizontal ? undefined : 0,
        label: { show: true, position: horizontal ? "right" : "top", fontSize: px(O(v, "totals", "fontSize", O(v, "labels", "fontSize", 9))), color: O(v, "totals", "color", TH.foreground || "#252423"), fontWeight: "bold",
          formatter: p => tfmt(tot[p.dataIndex]) } });
    }
    const lblTop = !horizontal && ech.some(e => e.label && e.label.show && e.label.position === "top") ? labelOpts(v).fontSize * 1.6 : 0;
    const lblBot = !horizontal && series.some(x => x.type === "bar" && x.data.some(y => y != null && y < 0)) && lblTop ? lblTop : 0;
    // lugar para las etiquetas de datos que quedan afuera del area (como el Power BI, que no las corta)
    let rightLab = 14;
    if (horizontal) {
      const lo1 = labelOpts(v), w1 = Math.max(0, ...ech.filter(e => e.label && e.label.show && /right/.test(e.label.position)).flatMap(e => (e.data || []).map((d, i) => {
        const x = d && typeof d === "object" ? d.value : d; if (x == null) return 0; const t = e.label.formatter({ value: x, dataIndex: i }); return R.textW(t, e.label.fontSize || lo1.fontSize, e.label.fontWeight) + (e.label.backgroundColor && e.label.backgroundColor !== "transparent" ? 6 : 0); })));
      rightLab = Math.max(12, w1 + 8);
    } else if (ech.some(e => e.type === "line" && e.label && e.label.show)) {
      const e0 = ech.filter(e => e.type === "line" && e.label && e.label.show).map(e => { const d = e.data[e.data.length - 1]; return d == null ? 0 : String(e.label.formatter({ value: d, dataIndex: e.data.length - 1 })).length * (e.label.fontSize || 12) * 0.3; });
      rightLab = Math.max(14, ...e0) ;
    }
    if (!showVal && (isLineKind || series.every(x => x.type === "line"))) {
      valAxis.scale = true;
      if (valAxis.min === undefined) { const pad = O(v, "labels", "optimizeLabelDisplay", true) === false ? 0.14 : 0.06; valAxis.min = m => m.min - (m.max - m.min) * pad; }
      if (valAxis.max === undefined) valAxis.max = m => m.max + (m.max - m.min) * 0.04;
    }
    const legV = legW > 0, grid = { left: 6 + (legV && /^Left/.test(lpos) ? legW : 0), right: (horizontal ? rightLab : Math.max(rightLab, 14 + endLab)) + (legV && /^Right/.test(lpos) ? legW : 0), top: (showLegend && !legV && !/^Bottom/.test(lpos) ? 30 : 10) + lblTop, bottom: (showLegend && /^Bottom/.test(lpos) ? 24 : 6), containLabel: true };
    if (horizontal) { grid.top = (showLegend && !/^Bottom/.test(lpos) ? 30 : 0) + 21; grid.bottom = (showLegend && /^Bottom/.test(lpos) ? 30 : 0) + 15; }
    if (opts.yRange) { const [a, b] = opts.yRange, pad = (b - a) * 0.06; valAxis.min = a - pad; valAxis.max = b + pad; valAxis.scale = true; }
    if (!showVal && !horizontal && series.every(x => x.type === "line")) {   // sin eje de valores: el area del grafico va de borde a borde, como el Power BI
      const lw0 = String(catLabelsAxis[0] || "").length * axFs * 0.55;
      grid.containLabel = false;
      grid.left = Math.max(8, (series.some(x => x.type === "bar") ? 0 : lw0 / 2) + 4);
      const rot = catAxis.axisLabel.rotate ? Math.max(...catLabelsAxis.map(x => R.textW(x, axFs))) * 0.71 + axFs * 0.7 : 0;
      grid.bottom += showCat ? (rot || axFs * 1.25) + 10 : 0;
      if (rot) grid.left = Math.max(grid.left, rot * 0.9);
    }
    // columnas sin eje de valores: el Power BI deja ~44 px a la izquierda y ~32 a la derecha, etiquetas de categoria partidas al ancho de la banda
    if (!horizontal && !showVal && !isLineKind && cat && !dateAxis && !opts.cellW && !opts.compact && !series.some(x => x.type === "line")) {
      const W = (body.clientWidth || v.w) - 74, band = W / Math.max(1, cats.length), lh = Math.round(axFs * 1.33);
      const wrapN = t => { const ws = String(t).split(/\s+/); let n = 1, cur = ""; for (const w of ws) { const nx = cur ? cur + " " + w : w; if (cur && R.textW(nx, axFs, ax("bold", false) ? "bold" : "normal") > band - 4) { n++; cur = w; } else cur = nx; } return n; };
      const lines = showCat ? Math.max(1, ...catLabels.map(wrapN)) : 0;
      Object.assign(catAxis.axisLabel, { width: band - 4, lineHeight: lh, margin: 12 });
      catAxis.axisLine.show = false;
      grid.containLabel = false; grid.left = 43; grid.right = 31;
      grid.bottom = (showLegend && /^Bottom/.test(lpos) ? 24 : 0) + (lines ? lines * lh + 14 : 6);
    }
    // barras horizontales con pocas categorias: el Power BI limita el alto de cada categoria y las centra
    if (horizontal && cats.length) {
      const H = (body.clientHeight || v.h) - grid.top - grid.bottom, band = H / cats.length, maxBand = Math.max(40, 0.30 * H);
      if (band > maxBand) { const extra = (H - maxBand * cats.length) / 2; grid.top += extra; grid.bottom += extra; }
    }
    if (lblBot && !valAxis.min) { const mn = Math.min(...series.flatMap(x => x.data).filter(y => y != null)); valAxis.min = mn * 1.25; }
    const tip = { trigger: "axis", confine: true, axisPointer: { type: isLineKind ? "line" : "shadow" },
      valueFormatter: undefined, formatter: ps => { const a = Array.isArray(ps) ? ps : [ps]; if (!a.length) return ""; const t = catLabels[a[0].dataIndex] || "";
        return `<b>${t}</b><br>` + a.filter(p => p.seriesName && series[p.seriesIndex]).map(p => `${p.marker}${p.seriesName}: <b>${F.num(p.value, fmtOf(series[p.seriesIndex].fd), { units: 1 })}</b>`).join("<br>"); } };
    const opt = { legend, grid, tooltip: tip, color: series.map(s => s.color), series: ech };
    if (horizontal) { opt.yAxis = catAxis; opt.xAxis = [valAxis]; }
    else { opt.xAxis = catAxis; opt.yAxis = y2Axis ? [valAxis, y2Axis] : [valAxis]; }
    if (opts.compact) { opt.grid.top = 6; opt.legend.show = false; }
    // muchas categorias: como el Power BI, ancho minimo por categoria y barra de desplazamiento
    const plotLen = horizontal ? body.clientHeight - grid.top - grid.bottom : body.clientWidth - 60;
    const minCat = horizontal ? Math.max(20, axFs * 1.38) : 18;
    if (cats.length * minCat > plotLen && plotLen > 0 && !isLineKind) {
      const n = Math.max(3, Math.floor(plotLen / minCat));
      const dz = { type: "slider", show: true, start: 0, end: Math.min(100, 100 * n / cats.length), zoomLock: true, brushSelect: false, showDetail: false, showDataShadow: false,
        width: horizontal ? 8 : undefined, height: horizontal ? undefined : 8, right: horizontal ? 2 : undefined, bottom: horizontal ? undefined : 0, borderColor: "transparent",
        fillerColor: "rgba(0,0,0,.25)", backgroundColor: "#f3f2f1", handleSize: 0, moveHandleSize: 0 };
      if (horizontal) { dz.yAxisIndex = 0; dz.orient = "vertical"; dz.top = grid.top; dz.bottom = grid.bottom; opt.grid.right += 10; }
      else { dz.xAxisIndex = 0; opt.grid.bottom += 10; }
      opt.dataZoom = [dz, Object.assign({}, { type: "inside", zoomLock: true, moveOnMouseWheel: true, zoomOnMouseWheel: false }, horizontal ? { yAxisIndex: 0 } : { xAxisIndex: 0 })];
    }
    const ends = ech.filter(e => e.__end).map(e => ({ data: e.data, yAxisIndex: e.yAxisIndex, __end: e.__end }));
    ech.forEach(e => delete e.__end);
    const chart = echart(body, opt);
    if (ends.length && !horizontal) {   // nombres de serie al final de cada linea, separados y con linea guia (seriesLabels del Power BI)
      const pts = ends.map(e => {
        const val = d => (d != null && typeof d === "object" && !Array.isArray(d) ? d.value : d);
        let i = e.data.length - 1; while (i >= 0 && val(e.data[i]) == null) i--;
        if (i < 0) return null;
        const [x, y] = chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: e.yAxisIndex || 0 }, [i, val(e.data[i])]);
        if (!isFinite(x) || !isFinite(y)) return null;
        return Object.assign({ x, y, ty: y }, e.__end);
      }).filter(Boolean).sort((a, b) => a.y - b.y);
      for (let k = 1; k < pts.length; k++) { const gap = (pts[k].fs + pts[k - 1].fs) / 2 + 1; if (pts[k].ty - pts[k - 1].ty < gap) pts[k].ty = pts[k - 1].ty + gap; }
      const g = [];
      for (const p of pts) {
        const tx = p.x + 14;
        if (p.leader && Math.abs(p.ty - p.y) > 2) g.push({ type: "polyline", shape: { points: [[p.x + 3, p.y], [tx - 3, p.ty]] }, style: { stroke: "#A19F9D", lineWidth: 1 }, silent: true });
        else g.push({ type: "line", shape: { x1: p.x + 3, y1: p.y, x2: tx - 3, y2: p.ty }, style: { stroke: "#A19F9D", lineWidth: 1 }, silent: true });
        g.push({ type: "text", x: tx, y: p.ty, silent: true, style: { text: p.name, fill: p.color, fontSize: p.fs, fontWeight: p.bold ? "bold" : "normal", fontFamily: FONT, verticalAlign: "middle", align: "left" } });
      }
      chart.setOption({ graphic: g });
    }
  }
  function smallMultiples(v, env, body, ctx, kind) {
    const sm = v.proj.Rows[0], cat = (v.proj.Category || [])[0], ser = (v.proj.Series || [])[0], ys = v.proj.Y || [];
    const vals = query(v, ctx, [sm], ys);
    const smv = sortRows(v, vals, [sm], ys, 0).map(r => r.k[0]);
    const cols = O(v, "smallMultiplesLayout", "columnCount", Math.ceil(Math.sqrt(smv.length))), rowsN = Math.ceil(smv.length / cols);
    // el Power BI comparte la escala del eje de valores entre los multiplos
    const allv = query(v, ctx, [sm, cat, ser].filter(Boolean), ys).flatMap(r => r.v).filter(x => x != null);
    const yr = allv.length ? [Math.min(...allv), Math.max(...allv)] : null;
    const grid = el("div", "pv-sm"); grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0,1fr))`; grid.style.gridTemplateRows = `repeat(${rowsN}, minmax(0,1fr))`;
    body.appendChild(grid);
    for (const x of smv) {
      const cell = el("div", "pv-smc"); grid.appendChild(cell);
      cell.appendChild(el("div", "pv-smh", fmtCat(sm, x)));
      const b = el("div", "pv-smb"); cell.appendChild(b);
      const c2 = D.with(ctx, [{ set: [D.fieldKey(sm), D.pIn([x])] }]); c2.mfil = ctx.mfil;
      drawCartesian(v, b, c2, kind, cat, ser, ys, [], { cellW: v.w / cols, yRange: yr });
    }
  }
  VIS.barChart = (v, env) => cartesian(v, env, "barChart");
  VIS.clusteredBarChart = (v, env) => cartesian(v, env, "clusteredBarChart");
  VIS.columnChart = (v, env) => cartesian(v, env, "columnChart");
  VIS.clusteredColumnChart = (v, env) => cartesian(v, env, "clusteredColumnChart");
  VIS.lineChart = (v, env) => cartesian(v, env, "lineChart");
  VIS.lineStackedColumnComboChart = (v, env) => cartesian(v, env, "lineStackedColumnComboChart");
  VIS.lineClusteredColumnComboChart = (v, env) => cartesian(v, env, "lineClusteredColumnComboChart");

  /* ---- torta / anillo ---- */
  function pie(v, env, donut) {
    const cat = (v.proj.Category || [])[0], y = (v.proj.Y || [])[0];
    const { body } = container(v, env.host, defaultTitle(v, [y], [cat]));
    const ctx = visualCtx(env.page, env.st, v);
    v.__q = { roleKeys: { Category: [D.fieldKey(cat)] } };
    let rows = sortRows(v, query(v, ctx, [cat], [y]), [cat], [y], 0).filter(r => r.v[0] != null && r.v[0] > 0);
    if (!(v.sort || []).length) rows.sort((a, b) => b.v[0] - a.v[0]);
    const lo = labelOpts(v); lo.show = O(v, "labels", "show", true);
    const style = O(v, "labels", "labelStyle", "Data value, percent of total");
    const fmt = vfmt(y, lo, Math.max(...rows.map(r => r.v[0]), 0));
    const pprec = O(v, "labels", "percentageLabelPrecision", 2);
    const tot = rows.reduce((a, r) => a + r.v[0], 0);
    // el Power BI pasa la categoria a una linea aparte cuando la etiqueta no entra al costado de la torta
    // (se mide con el lugar que queda al costado de cada porcion, segun su angulo)
    const bw = body.clientWidth || v.w, bh = body.clientHeight || v.h - 34, RAD = 0.375 * Math.min(bw, bh);
    const tot0 = rows.reduce((a, r) => a + Math.max(0, r.v[0] || 0), 0) || 1, a0 = (O(v, "slices", "startAngle", 0) || 0);
    let acc = 0; const lado = new Map();
    rows.forEach(r => { const f = Math.max(0, r.v[0] || 0) / tot0; const ang = (a0 + (acc + f / 2) * 360 - 90) * Math.PI / 180; acc += f;
      lado.set(r, Math.min(230, Math.max(40, bw / 2 - Math.abs(RAD * Math.cos(ang)) - 8))); });
    let curR = null;
    const brk = (a, b) => (R.textW(a + " " + b, lo.fontSize, lo.bold ? "bold" : "normal") > (lado.get(curR) || 80) ? a + "\n" + b : a + " " + b);
    const txt = (r) => {
      curR = r;
      const pc = F.num(r.v[0] / tot, "0" + (pprec ? "." + "0".repeat(pprec) : "") + "%", { prec: pprec });
      const name = fmtCat(cat, r.k[0]);
      switch (style) {
        case "Category": return name;
        case "Data value": return fmt(r.v[0]);
        case "Percent of total": return pc;
        case "Category, data value": return brk(name, fmt(r.v[0]));
        case "Category, percent of total": return brk(name, pc);
        case "Data value, percent of total": return fmt(r.v[0]) + " (" + pc + ")";
        case "All detail labels": case "Category, data value, percent of total": return brk(name, fmt(r.v[0]) + " (" + pc + ")");
        default: return fmt(r.v[0]) + " (" + pc + ")";
      }
    };
    const lpos = String(O(v, "legend", "position", "RightCenter"));
    const showLeg = O(v, "legend", "show", true) !== false;
    const inside = /inside/i.test(String(O(v, "labels", "position", "")));
    const data = rows.map((r, i) => {
      const dp = dpColors(v).get(String(r.k[0]));
      return { name: fmtCat(cat, r.k[0]), value: r.v[0], itemStyle: { color: dp ? alpha(dp.c, dp.tr) : palette()[i % palette().length], borderColor: O(v, "dataPoint", "borderShow", false) ? "#fff" : undefined },
        label: { color: labelColorSel(v, r.k[0]) || lo.color || (inside ? "#FFFFFF" : TH.foregroundNeutralSecondary || "#605E5C") } };
    });
    const vertical = /^(Left|Right)/.test(lpos);
    const center = showLeg ? (/^Right/.test(lpos) ? ["40%", "52%"] : /^Left/.test(lpos) ? ["60%", "52%"] : /^Top/.test(lpos) ? ["50%", "56%"] : ["50%", "46%"]) : ["50%", "50%"];
    const inner = donut ? (O(v, "slices", "innerRadiusRatio", 50)) : 0;
    echart(body, {
      tooltip: { trigger: "item", confine: true, formatter: p => `${p.name}<br><b>${F.num(p.value, fmtOf(y), { units: 1 })}</b> (${F.num(p.value / tot, "0.0%")})` },
      legend: showLeg ? { type: "scroll", orient: vertical ? "vertical" : "horizontal", left: /Center/.test(lpos) && !vertical ? "center" : /^Right/.test(lpos) ? "right" : 4,
        top: /^Bottom/.test(lpos) ? undefined : vertical ? "middle" : 2, bottom: /^Bottom/.test(lpos) ? 2 : undefined, icon: "circle", itemWidth: 9, itemHeight: 9,
        textStyle: { fontSize: px(O(v, "legend", "fontSize", 10)), color: O(v, "legend", "labelColor", TH.foregroundNeutralSecondary || "#605E5C") } } : { show: false },
      series: [{ type: "pie", radius: [(inner * 0.75) + "%", "75%"], center, startAngle: 90 - (O(v, "slices", "startAngle", 0) || 0), data,
        label: { show: lo.show !== false, position: inside ? "inside" : "outside", fontSize: lo.fontSize, lineHeight: lo.fontSize * 1.25, fontWeight: lo.bold ? "bold" : "normal", fontFamily: lo.family, formatter: p => txt(rows[p.dataIndex]) },
        labelLine: { show: !inside, length: 10, length2: 10, lineStyle: { color: "#A19F9D" } }, emphasis: { disabled: true }, minShowLabelAngle: 1 }]
    });
  }
  function labelColorSel(v, val) {
    for (const it of ((v.obj || {}).labels || [])) if (it.s && it.s.data) for (const d of it.s.data) {
      if (d.wild != null && it.p.color) return unraw(it.p.color);
      if (d.scope && d.scope.r && d.scope.r.v === val && it.p.color) return unraw(it.p.color);
    }
    return null;
  }
  VIS.pieChart = (v, env) => pie(v, env, false);
  VIS.donutChart = (v, env) => pie(v, env, true);

  /* ---- dispersion ---- */
  VIS.scatterChart = function (v, env) {
    const cat = (v.proj.Category || [])[0], ser = (v.proj.Series || [])[0];
    const xf = (v.proj.X || [])[0], yf = (v.proj.Y || [])[0], sz = (v.proj.Size || [])[0];
    const { body } = container(v, env.host, defaultTitle(v, [yf, xf].filter(Boolean), [cat].filter(Boolean)));
    const ctx = visualCtx(env.page, env.st, v);
    const groups = [cat, ser].filter(Boolean).filter((g, i, a) => a.findIndex(x => D.fieldKey(x) === D.fieldKey(g)) === i);
    const ms = [xf, yf, sz].filter(Boolean);
    v.__q = { roleKeys: {} };
    const rows = query(v, ctx, groups, ms).filter(r => r.v[0] != null && r.v[1] != null);
    const si = ser ? groups.findIndex(g => D.fieldKey(g) === D.fieldKey(ser)) : -1;
    const sNames = si >= 0 ? [...new Set(rows.map(r => r.k[si]))].sort((a, b) => String(a).localeCompare(String(b), "es")) : ["_"];
    const maxS = sz ? Math.max(...rows.map(r => Math.abs(r.v[2] || 0)), 1) : 1;
    const bub = O(v, "bubbles", "bubbleSize", 0);
    const fx = vfmt(xf, { units: O(v, "categoryAxis", "labelDisplayUnits", 0), prec: O(v, "categoryAxis", "labelPrecision") }, Math.max(...rows.map(r => Math.abs(r.v[0]))));
    const fy = vfmt(yf, { units: O(v, "valueAxis", "labelDisplayUnits", 0) }, Math.max(...rows.map(r => Math.abs(r.v[1]))));
    const axisFmt = (fd, o, base) => { const f = fmtOf(fd), u = O(v, o, "labelDisplayUnits", 0), p0 = O(v, o, "labelPrecision");
      return x => { let prec = p0; if (prec == null) { const unit = F.isPct(f) ? 0.01 : (u === 0 ? F.autoUnit(Math.abs(base)) : u > 1 ? u : 1); const y = Math.abs(x / unit); prec = 0; while (prec < 3 && Math.abs(y - Math.round(y * 10 ** prec) / 10 ** prec) > 1e-9) prec++; }
        return F.num(x, f, { units: F.isPct(f) ? 1 : u, prec, autoBase: base }); }; };
    const fxA = axisFmt(xf, "categoryAxis", Math.max(...rows.map(r => Math.abs(r.v[0])))), fyA = axisFmt(yf, "valueAxis", Math.max(...rows.map(r => Math.abs(r.v[1]))));
    const cl = (n, d) => O(v, "categoryLabels", n, d);
    const series = sNames.map((s, i) => ({
      name: s === "_" ? label(yf) : String(s), type: "scatter",
      data: rows.filter(r => si < 0 || r.k[si] === s).map((r, j) => {
        const o = { name: fmtCat(cat || ser, r.k[0]), value: [r.v[0], r.v[1]], sz: r.v[2], k0: r.k[0] };
        const dp = dpColors(v, null, null, (cat || ser || {}).p).get(String(r.k[0]));
        if (dp) o.itemStyle = { color: alpha(dp.c, dp.tr) };
        else if (O(v, "colorByCategory", "show", false)) o.itemStyle = { color: palette()[rows.indexOf(r) % palette().length] };
        return o;
      }),
      symbolSize: (val, p) => (sz ? Math.max(9, Math.min(v.w, v.h) * 0.11 * (1 + bub / 100) * Math.sqrt(Math.abs(p.data.sz || 0) / maxS)) : 10 * (1 + bub / 50)),
      itemStyle: { color: seriesColor(v, i, s === "_" ? null : s), opacity: 1, borderColor: "#fff", borderWidth: 0 },
      symbol: (val, p) => { const sh = propSel(v, "obj", "bubbles", "markerShape", { val: p.data.k0 }); return sh === "diamond" ? "diamond" : sh === "square" ? "rect" : sh === "triangle" ? "triangle" : "circle"; },
      label: { show: cl("show", false), position: "bottom", distance: 3, fontSize: px(cl("fontSize", 9)), color: cl("color", TH.foregroundNeutralSecondary), fontWeight: cl("bold", false) ? "bold" : "normal",
        backgroundColor: cl("enableBackground", false) ? alpha(cl("backgroundColor", "#fff"), cl("backgroundTransparency", 0)) : "transparent", formatter: p => p.data.name },
      labelLayout: { hideOverlap: true }, emphasis: { disabled: true }
    }));
    const axis = (o, f, nm) => ({
      type: "value", scale: true, name: O(v, o, "showAxisTitle", true) !== false ? label(nm) : "", nameLocation: "middle",
      nameGap: o === "valueAxis" ? (() => { const ys = rows.map(r => r.v[1]).filter(x => x != null && (typeof O(v, o, "end") !== "number" || x <= O(v, o, "end")) && (typeof O(v, o, "start") !== "number" || x >= O(v, o, "start")));
        const mx = Math.max(...ys.map(Math.abs), typeof O(v, o, "end") === "number" ? Math.abs(O(v, o, "end")) * 0.9 : 0); return R.textW(f(Math.round(mx)), px(O(v, o, "fontSize", 9))) + 16; })() : px(O(v, o, "fontSize", 9)) + 12,
      axisLabel_: null,
      nameTextStyle: { fontSize: px(O(v, o, "titleFontSize", 9)), color: O(v, o, "titleColor", TH.foreground || "#252423"), fontWeight: O(v, o, "titleBold", false) ? "bold" : "normal" },
      min: typeof O(v, o, "start") === "number" ? O(v, o, "start") : undefined, max: typeof O(v, o, "end") === "number" ? O(v, o, "end") : undefined,
      show: true,
      axisLabel: { show: O(v, o, "show", true) !== false, formatter: f, fontSize: px(O(v, o, "fontSize", 9)), color: TH.foregroundNeutralSecondary, fontWeight: O(v, o, "bold", false) ? "bold" : "normal",
        showMinLabel: typeof O(v, o, "start") === "number" ? false : undefined, showMaxLabel: typeof O(v, o, "end") === "number" ? false : undefined },
      splitLine: { show: O(v, o, "show", true) !== false && O(v, o, "gridlineShow", true) !== false, lineStyle: { color: alpha(O(v, o, "gridlineColor", "#E1DFDD"), O(v, o, "gridlineTransparency", 0)), type: O(v, o, "gridlineStyle", "dotted") } },
      axisLine: { show: false, onZero: false }, axisTick: { show: false }
    });
    // el Power BI no dibuja los puntos que quedan fuera de los limites fijos del eje
    const inX = x => (typeof O(v, "categoryAxis", "start") !== "number" || x >= O(v, "categoryAxis", "start")) && (typeof O(v, "categoryAxis", "end") !== "number" || x <= O(v, "categoryAxis", "end"));
    const inY = y => (typeof O(v, "valueAxis", "start") !== "number" || y >= O(v, "valueAxis", "start")) && (typeof O(v, "valueAxis", "end") !== "number" || y <= O(v, "valueAxis", "end"));
    series.forEach(se => { se.data = se.data.filter(d => inX(d.value[0]) && inY(d.value[1])); });
    const showLeg = O(v, "legend", "show", !!ser) !== false && sNames.length > 1;
    const sch = echart(body, {
      grid: { left: O(v, "valueAxis", "show", true) === false ? 69 : 36, right: 44, top: showLeg ? 30 : 14, bottom: 30, containLabel: true },
      legend: showLeg ? { type: "scroll", top: 2, left: 4, icon: "circle", itemWidth: 9, itemHeight: 9, textStyle: { fontSize: px(8), color: O(v, "legend", "labelColor", TH.foregroundNeutralSecondary) } } : { show: false },
      tooltip: { trigger: "item", confine: true, formatter: p => `<b>${p.data.name}</b><br>${label(xf)}: ${fx(p.data.value[0])}<br>${label(yf)}: ${fy(p.data.value[1])}` + (sz ? `<br>${label(sz)}: ${F.num(p.data.sz, fmtOf(sz), { units: 0 })}` : "") },
      xAxis: axis("categoryAxis", fxA, xf), yAxis: axis("valueAxis", fyA, yf), series
    });
    // titulo del eje Y pegado a las etiquetas, como el Power BI
    const rect = sch.getModel().getComponent("grid", 0).coordinateSystem.getRect();
    const tfs = px(O(v, "valueAxis", "titleFontSize", 9));
    sch.setOption({ yAxis: { nameGap: Math.max(10, rect.x - tfs * 0.75 - 2) } });
  };

  /* ---- tablas y matrices ---- */
  function tableStyle(v) {
    const ch = (n, d) => O(v, "columnHeaders", n, d), vv = (n, d) => O(v, "values", n, d);
    const preset = C(v, "stylePreset", "name", "Default");
    return {
      hBg: ch("backColor", /Minimal|None/i.test(preset) ? "transparent" : "#FFFFFF"), hFg: ch("fontColor", TH.foreground || "#252423"), hBold: ch("bold", true), hFs: px(ch("fontSize", 10)), hAlign: ch("alignment"),
      vFs: px(vv("fontSize", 10)), vBg: vv("backColor", "#FFFFFF"), vBg2: vv("backColorSecondary", /Default/i.test(preset) ? "#F5F5F5" : "#FFFFFF"), vFg: vv("fontColor", TH.foreground || "#252423"),
      grid: O(v, "grid", "gridHorizontal", true) !== false, gridColor: O(v, "grid", "gridHorizontalColor", "#E1DFDD"), gridV: O(v, "grid", "gridVertical", false), gridVColor: O(v, "grid", "gridVerticalColor", "#E1DFDD"),
      outline: O(v, "grid", "outlineColor"), rhFs: px(O(v, "rowHeaders", "fontSize", 10)), totFs: px(O(v, "total", "fontSize", O(v, "rowTotal", "fontSize", O(v, "values", "fontSize", 10))))
    };
  }
  function cellFmt(v, fd, x) {
    if ((fd.k === "C" || fd.k === "H") && x == null) return "";
    if (fd.k === "C" || fd.k === "H") return fmtCat(fd, x);
    const f = fmtOf(fd);
    const u = propSel(v, "obj", "columnFormatting", "labelDisplayUnits", fd.ref, 1);
    const p = propSel(v, "obj", "columnFormatting", "labelPrecision", fd.ref);
    return F.num(x, f, { units: F.isPct(f) ? 1 : u, prec: p });
  }
  // formato condicional de fondo (escala de colores linearGradient2/3 del Power BI)
  function gradFn(v, fd, values) {
    for (const it of ((v.obj || {}).values || [])) {
      if (!it.s || it.s.meta !== fd.ref || !it.p.backColor || !it.p.backColor.raw) continue;
      const fr = (it.p.backColor.raw.raw || {}).FillRule; if (!fr) continue;
      const g = fr.FillRule.linearGradient3 || fr.FillRule.linearGradient2; if (!g) continue;
      const col = x => (x && x.color && x.color.Literal ? x.color.Literal.Value.replace(/'/g, "") : null);
      const num = x => (x && x.value && x.value.Literal ? parseFloat(x.value.Literal.Value) : null);
      const vs = values.filter(x => x != null && isFinite(x));
      if (!vs.length) return null;
      const lo = num(g.min) ?? Math.min(...vs), hi = num(g.max) ?? Math.max(...vs), mid = g.mid ? (num(g.mid) ?? (lo + hi) / 2) : null;
      const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
      const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return "#" + A.map((c, i) => Math.round(c + (B[i] - c) * Math.max(0, Math.min(1, t))).toString(16).padStart(2, "0")).join(""); };
      return x => {
        if (x == null) x = 0;
        if (mid == null) return mix(col(g.min), col(g.max), hi === lo ? 0 : (x - lo) / (hi - lo));
        return x <= mid ? mix(col(g.min), col(g.mid), mid === lo ? 0 : (x - lo) / (mid - lo)) : mix(col(g.mid), col(g.max), hi === mid ? 0 : (x - mid) / (hi - mid));
      };
    }
    return null;
  }
  function colWidth(v, fd) { return propSel(v, "obj", "columnWidth", "value", fd.ref); }
  function condBg(v, fd, x) {
    const arr = ((v.obj || {}).values || []);
    for (const it of arr) if (it.s && it.s.meta === fd.ref && it.p.backColor && it.p.backColor.raw === undefined && typeof it.p.backColor === "string") return it.p.backColor;
    return null;
  }

  VIS.tableEx = function (v, env) {
    const cols = v.proj.Values || [];
    const { body } = container(v, env.host, null);
    const ctx = visualCtx(env.page, env.st, v);
    const groups = cols.filter(c => c.k === "C" || c.k === "H"), ms = cols.filter(c => !(c.k === "C" || c.k === "H"));
    v.__q = { roleKeys: { Values: groups.map(D.fieldKey) } };
    let rows = query(v, ctx, groups, ms, { keepBlank: !ms.length });
    rows = sortTable(v, rows, groups, ms);
    const st = tableStyle(v);
    const wrap = el("div", "pv-tw"), t = el("table", "pv-t pv-tex");
    const thead = el("thead"), hr = el("tr");
    cols.forEach(c => { const th = el("th", null, label(c)); Object.assign(th.style, { background: st.hBg, color: st.hFg, fontWeight: st.hBold ? "700" : "400", fontSize: st.hFs + "px", textAlign: st.hAlign ? st.hAlign.toLowerCase() : c.k === "C" ? "left" : "right" });
      const w = colWidth(v, c); if (w) { th.style.width = th.style.minWidth = th.style.maxWidth = w + "px"; th.style.whiteSpace = "normal"; }
      if (isSorted(v, c)) th.appendChild(sortMark(st.hFg)); hr.appendChild(th); });
    const anchos = cols.map(c => colWidth(v, c));
    thead.appendChild(hr); t.appendChild(thead);
    const tb = el("tbody");
    const grads = ms.map((m, j) => gradFn(v, m, rows.map(r => r.v[j])));
    rows.forEach((r, i) => {
      const tr = el("tr");
      cols.forEach(c => {
        const gi = groups.indexOf(c), mi = ms.indexOf(c);
        const x = gi >= 0 ? r.k[gi] : r.v[mi];
        const td = el("td", null, cellFmt(v, c, x));
        Object.assign(td.style, { fontSize: st.vFs + "px", color: st.vFg, background: i % 2 ? st.vBg2 : st.vBg, textAlign: gi >= 0 && typeof x !== "number" ? "left" : "right",
          borderBottom: `1px solid ${st.grid ? st.gridColor : "transparent"}` });
        if (mi >= 0 && grads[mi]) td.style.background = grads[mi](x);
        const w = anchos[cols.indexOf(c)]; if (w) { td.style.maxWidth = w + "px"; if (gi >= 0) td.style.whiteSpace = "normal"; }
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    if (O(v, "total", "totals", true) !== false && ms.length) {
      const tot = query(v, ctx, [], ms, { keepBlank: true })[0];
      const tr = el("tr", "pv-tot");
      cols.forEach((c, j) => { const mi = ms.indexOf(c); const td = el("td", null, j === 0 ? "Total" : mi >= 0 ? cellFmt(v, c, tot.v[mi]) : ""); td.style.fontSize = st.vFs + "px"; td.style.textAlign = j === 0 ? "left" : "right"; tr.appendChild(td); });
      tb.appendChild(tr);
    }
    t.appendChild(tb); wrap.appendChild(t); body.appendChild(wrap);
  };
  // el Power BI dibuja la flecha de orden debajo del encabezado de la columna ordenada
  function isSorted(v, c) { const sd = (v.sort || [])[0]; sortUp = !!(sd && sd.dir === "Ascending"); return !!(sd && sd.e && c && sd.e.p === c.p && (sd.e.t == null || c.t == null || sd.e.t === c.t)); }
  let sortUp = false;
  function sortMark(col) { const d = el("span", "pv-sort"); d.innerHTML = `<svg viewBox="0 0 9 6"><path d="${sortUp ? "M.8 5.2 4.5 1.4 8.2 5.2" : "M.8.8 4.5 4.6 8.2.8"}" fill="none" stroke="${col || "#252423"}" stroke-width="1.2"/></svg>`; return d; }
  function sortTable(v, rows, groups, ms) {
    const sd = (v.sort || [])[0];
    const cmpK = (a, b) => (typeof a === "number" && typeof b === "number" ? a - b : String(a ?? "").localeCompare(String(b ?? ""), "es", { numeric: true }));
    // desempate como el Power BI: por las columnas de agrupacion, en orden y ascendente
    if (sd && groups.length) rows.sort((a, b) => { for (let i = 0; i < a.k.length; i++) { const c = cmpK(a.k[i], b.k[i]); if (c) return c; } return 0; });
    if (!sd) return rows.sort((a, b) => { if (ms.length) return (b.v[0] ?? -Infinity) - (a.v[0] ?? -Infinity); for (let i = 0; i < a.k.length; i++) { const c = cmpK(a.k[i], b.k[i]); if (c) return c; } return 0; });
    return sortRows(v, rows, groups, ms, 0);
  }

  VIS.pivotTable = function (v, env) {
    const rowsF = v.proj.Rows || [], colsF = v.proj.Columns || [], ms = v.proj.Values || [];
    const { body } = container(v, env.host, null);
    const ctx = visualCtx(env.page, env.st, v);
    v.__q = { roleKeys: { Rows: rowsF.map(D.fieldKey), Columns: colsF.map(D.fieldKey) } };
    const st = tableStyle(v);
    const rf = rowsF[0], cf = colsF[0];
    const rowSub = O(v, "subTotals", "rowSubtotals", true) !== false, colSub = O(v, "subTotals", "columnSubtotals", true) !== false;
    // valores por celda
    const all = query(v, ctx, rowsF.concat(colsF), ms);
    let rvals = rf ? [...new Set(all.map(r => r.k[0]))] : [null];
    // columnas: combinacion de todos los campos de Columnas (ej. Categoria + Trimestre)
    const ck = r => (cf ? JSON.stringify(r.k.slice(rowsF.length)) : null);
    const cmpArr = (a, b) => { const A = JSON.parse(a), B = JSON.parse(b); for (let i = 0; i < A.length; i++) { const x = A[i], y = B[i]; const c = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""), "es", { numeric: true }); if (c) return c; } return 0; };
    let cvals = cf ? [...new Set(all.map(ck))].sort(cmpArr) : [null];
    const cell = new Map(all.map(r => [JSON.stringify([rf ? r.k[0] : null, ck(r)]), r.v]));
    const rowTot = rf ? query(v, ctx, [rf], ms, { scopeKeys: [D.fieldKey(rf)] }) : [];
    const rowTotMap = new Map(rowTot.map(r => [r.k[0], r.v]));
    const colTot = cf ? query(v, ctx, colsF, ms) : [];
    const colTotMap = new Map(colTot.map(r => [JSON.stringify(r.k), r.v]));
    const cPart = (c, lvl) => (c == null ? null : JSON.parse(c)[lvl]);
    const grand = query(v, ctx, [], ms, { keepBlank: true })[0];
    // orden de filas
    const sd = (v.sort || [])[0];
    if (sd && rf) {
      const dir = sd.dir === "Ascending" ? 1 : -1;
      if (sd.e.p === rf.p) rvals.sort((a, b) => dir * String(a).localeCompare(String(b), "es", { numeric: true }));
      else { const mi = Math.max(0, ms.findIndex(x => x.p === sd.e.p)); rvals.sort((a, b) => dir * (((rowTotMap.get(a) || [])[mi] ?? -Infinity) - ((rowTotMap.get(b) || [])[mi] ?? -Infinity))); }
    } else if (rf) rvals.sort((a, b) => String(a).localeCompare(String(b), "es", { numeric: true }));
    const wrap = el("div", "pv-tw"), t = el("table", "pv-t pv-pivot");
    const thead = el("thead");
    const hcell = (txt, opt) => { const th = el("th", null, txt); Object.assign(th.style, { background: st.hBg, color: st.hFg, fontWeight: st.hBold ? "700" : "400", fontSize: st.hFs + "px",
      textAlign: (opt && opt.left) ? "left" : (st.hAlign || "center") }); if (opt && opt.span) th.colSpan = opt.span; if (opt && opt.rows) th.rowSpan = opt.rows; return th; };
    if (cf) {
      const h1 = el("tr");
      const lastHdr = colsF.length - 1 + (ms.length > 1 ? 1 : 0);
      colsF.forEach((fc, lvl) => {
        const h = lvl === 0 ? h1 : el("tr");
        h.appendChild(hcell(lvl === lastHdr ? (rf ? label(rf) : "") : label(fc), { left: !st.hAlign && O(v, "rowHeaders", "alignment") !== "Center" }));
        let i = 0;
        while (i < cvals.length) {   // celdas agrupadas del nivel
          let j = i + 1;
          const pre = c => JSON.stringify(JSON.parse(c).slice(0, lvl + 1));
          while (j < cvals.length && pre(cvals[j]) === pre(cvals[i])) j++;
          h.appendChild(hcell(fmtCat(fc, cPart(cvals[i], lvl)), { span: (j - i) * ms.length }));
          i = j;
        }
        if (colSub && lvl === 0) { const tc = hcell("Total", { span: ms.length, rows: colsF.length }); if (ms.length === 1 && isSorted(v, ms[0])) { const sm = sortMark(st.hFg); Object.assign(sm.style, { position: "absolute", right: "5px", bottom: "1px" }); tc.appendChild(sm); } h.appendChild(tc); }
        thead.appendChild(h);
      });
      if (ms.length > 1) { const h2 = el("tr"); h2.appendChild(hcell(rf ? label(rf) : "", { left: !st.hAlign && O(v, "rowHeaders", "alignment") !== "Center" })); for (let i = 0; i < cvals.length + (colSub ? 1 : 0); i++) for (const m of ms) { const hc = hcell(label(m)); if (i === cvals.length && isSorted(v, m)) { const sm = sortMark(st.hFg); Object.assign(sm.style, { position: "absolute", left: "5px", bottom: "0" }); hc.appendChild(sm); } h2.appendChild(hc); } thead.appendChild(h2); }
    } else {
      const h1 = el("tr"); const r0 = hcell(rf ? label(rf) : "", { left: !st.hAlign }); if (isSorted(v, rf)) r0.appendChild(sortMark(st.hFg)); h1.appendChild(r0);
      for (const m of ms) { const hc = hcell(label(m)); if (isSorted(v, m)) hc.appendChild(sortMark(st.hFg)); h1.appendChild(hc); } thead.appendChild(h1);
    }
    if (cf) {   // el Power BI deja lugar para la flecha de orden debajo de la ultima fila de encabezados de la matriz
      const trs = thead.querySelectorAll("tr"), last = trs[trs.length - 1];
      const pb = Math.round(0.75 * st.hFs - 1) + "px";
      last.querySelectorAll("th").forEach(th => { th.style.paddingBottom = pb; });
      thead.querySelectorAll("th").forEach(th => { th.style.borderBottomColor = st.hBg; if (th.rowSpan > 1 || trs.length === 1) th.style.paddingBottom = pb; });
    }
    t.appendChild(thead);
    const tb = el("tbody");
    const vcell = (m, x, i, bold) => { const td = el("td", null, cellFmt(v, m, x)); Object.assign(td.style, { fontSize: st.vFs + "px", color: st.vFg, background: i % 2 ? st.vBg2 : st.vBg,
      textAlign: "right", borderBottom: `1px solid ${st.grid ? st.gridColor : "transparent"}`, borderRight: st.gridV ? `1px solid ${st.gridVColor}` : "0", fontWeight: bold ? "700" : "400" }); return td; };
    const grads = ms.map((m, j) => gradFn(v, m, all.map(r => r.v[j])));
    rvals.forEach((rv, i) => {
      const tr = el("tr");
      const th = el("td", "rh", rf ? fmtCat(rf, rv) : ""); Object.assign(th.style, { fontSize: st.rhFs + "px", background: i % 2 ? st.vBg2 : st.vBg, borderBottom: `1px solid ${st.grid ? st.gridColor : "transparent"}`,
        textAlign: (O(v, "rowHeaders", "alignment") || "left").toLowerCase(), borderRight: `1px solid ${st.outline || TH.tableAccent || "#0F3D6E"}` });
      if (rv === "Balanz") th.style.fontWeight = "700";
      tr.appendChild(th);
      for (const c of cvals) { const vv = cell.get(JSON.stringify([rv, c])) || []; ms.forEach((m, j) => { const td = vcell(m, vv[j], i); if (grads[j]) td.style.background = grads[j](vv[j]); tr.appendChild(td); }); }
      if (cf && colSub) { const vv = rowTotMap.get(rv) || []; ms.forEach((m, j) => tr.appendChild(vcell(m, vv[j], i, true))); }
      tb.appendChild(tr);
    });
    if (rowSub && rf) {
      const tr = el("tr", "pv-tot"); const th = el("td", "rh", "Total"); th.style.fontSize = st.totFs + "px"; th.style.textAlign = (O(v, "rowHeaders", "alignment") || "left").toLowerCase(); th.style.borderRight = `1px solid ${st.outline || TH.tableAccent || "#0F3D6E"}`; tr.appendChild(th);
      const tc = (m, x) => { const td = vcell(m, x, 0, true); td.style.fontSize = st.totFs + "px"; return td; };
      for (const c of cvals) { const vv = cf ? (colTotMap.get(c) || []) : grand.v; ms.forEach((m, j) => tr.appendChild(tc(m, vv[j]))); }
      if (cf && colSub) ms.forEach((m, j) => tr.appendChild(tc(m, grand.v[j])));
      tb.appendChild(tr);
    }
    // anchos de columna guardados en el .pbix (por medida y valor de columna, o subtotal) y alineacion por medida
    const TOT = {};
    const cw = (ref, c) => {
      for (const it of ((v.obj || {}).columnWidth || [])) {
        if (!it.s || it.s.meta !== ref || it.p.value == null) continue;
        if (!it.s.data) return it.p.value;
        const d = it.s.data[0];
        if (c === TOT && d.raw && d.raw.total) return it.p.value;
        if (c !== TOT && d.scope && d.scope.r && String(d.scope.r.v) === String(c)) return it.p.value;
      }
      return null;
    };
    const widths = [rf ? cw(rf.ref, null) : null];
    for (const c of cvals) for (const m of ms) widths.push(cf ? cw(m.ref, cPart(c, 0)) : cw(m.ref, null));
    if (cf && colSub) for (const m of ms) widths.push(cw(m.ref, TOT));
    if (widths.some(x => x != null)) {
      const cg = el("colgroup");
      widths.forEach(w => { const c = el("col"); if (w != null) c.style.width = w + "px"; cg.appendChild(c); });
      t.prepend(cg);
      if (widths.every(x => x != null)) { t.style.tableLayout = "fixed"; t.style.width = widths.reduce((a, b) => a + b, 0) + "px"; }
      if (widths[0] != null) t.querySelectorAll("td.rh").forEach(td => { Object.assign(td.style, { boxSizing: "border-box", width: widths[0] + "px", minWidth: widths[0] + "px", maxWidth: widths[0] + "px" }); });
    }
    const aligns = ms.map(m => propSel(v, "obj", "columnFormatting", "alignment", m.ref));
    if (aligns.some(Boolean)) tb.querySelectorAll("tr").forEach(tr => { const tds = [...tr.children].slice(1); tds.forEach((td, k) => { const a = aligns[k % ms.length]; if (a) td.style.textAlign = a.toLowerCase(); }); });
    t.appendChild(tb); wrap.appendChild(t); body.appendChild(wrap);
  };

  /* ---------- pagina ---------- */
  R.renderPage = function (page, host, st, rerender) {
    TH = PBI.theme;
    R.dispose(); D.clearCache();
    if (!st.sl) {
      R._page = null;
      st.sl = {};
      for (const v of page.visuals) if (/licer/.test(v.type)) {
        try { st.sl[v.id] = v.type === "textSlicer" && v.sel ? textSel(v) : initialSel(v); } catch (e) { console.error(e); }
        const fd = slicerField(v);
      }
    }
    R._page = page; R._st = st;
    const stage = el("div", "pv-stage");
    stage.style.width = page.w + "px"; stage.style.height = page.h + "px";
    host.appendChild(stage);
    const env = { page, st, host: stage, rerender };
    const cambios = (window.PBI_CUSTOM || []).filter(c => c.hoja === page.name);
    R.LEY = (cambios.find(c => c.leyenda) || {}).leyenda || null;   // leyendas con el mismo estilo y altura en toda la hoja
    page.visuals.forEach((v, i) => {
      if (v.hidden) return;
      const cb = cambios.find(c => c.id === v.id);
      if (cb && cb.texto != null && v.text) {   // cuadro de texto con otro texto, mismo formato
        const r0 = ((v.text[0] || {}).runs || [])[0] || {};
        v = Object.assign({}, v, { text: [{ runs: [{ t: cb.texto, st: r0.st }], align: (v.text[0] || {}).align }] });
      }
      const fn = cb && cb.dibujar ? (vv, e) => cb.dibujar(vv, e, R) : VIS[v.type];
      const before = stage.childElementCount;
      try {
        if (fn) fn(v, env);
        else { const { body } = container(v, stage, null); body.appendChild(el("div", "pv-empty", v.type)); }
      } catch (e) { console.error(v.type, v.id, e); }
      if (stage.lastElementChild && stage.childElementCount > before) stage.lastElementChild.style.zIndex = String(i + 1);
    });
    return stage;
  };
  function textSel(v) {
    for (const c of v.sel) if (c.op === "contains" && c.r) return { text: String(c.r.v || "") };
    return null;
  }
})();
