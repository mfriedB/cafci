/* Formatos de numeros y fechas como el Power BI (configuracion regional es-AR) */
(function () {
  const F = {};
  window.F = F;
  const nfCache = new Map();
  const nf = (d, grp) => { const k = d + "|" + grp; let f = nfCache.get(k); if (!f) nfCache.set(k, f = new Intl.NumberFormat("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: grp })); return f; };
  F.UNITS = { 1e3: " mil", 1e6: " mill.", 1e9: " mil M", 1e12: " bill." };
  F.autoUnit = a => (a >= 1e12 ? 1e12 : a >= 1e9 ? 1e9 : a >= 1e6 ? 1e6 : a >= 1e3 ? 1e3 : 1);

  // parte una cadena de formato .NET/Excel en secciones y tokens
  function parse(fmt) {
    const secs = [];
    let cur = [], lit = "", i = 0;
    const flush = () => { if (lit) { cur.push({ t: "lit", v: lit }); lit = ""; } };
    while (i < fmt.length) {
      const ch = fmt[i];
      if (ch === "\\") { lit += fmt[i + 1] || ""; i += 2; continue; }
      if (ch === '"') { const j = fmt.indexOf('"', i + 1); lit += fmt.slice(i + 1, j < 0 ? undefined : j); i = j < 0 ? fmt.length : j + 1; continue; }
      if (ch === ";") { flush(); secs.push(cur); cur = []; i++; continue; }
      if ("#0,.".includes(ch)) { flush(); let j = i; while (j < fmt.length && "#0,.".includes(fmt[j])) j++; cur.push({ t: "num", v: fmt.slice(i, j) }); i = j; continue; }
      if (ch === "%") { flush(); cur.push({ t: "pct" }); i++; continue; }
      lit += ch; i++;
    }
    flush(); secs.push(cur);
    return secs;
  }
  const pcache = new Map();
  F.isPct = fmt => !!fmt && parse(fmt)[0].some(t => t.t === "pct");
  F.decimals = fmt => { if (!fmt) return null; const n = parse(fmt)[0].find(t => t.t === "num"); if (!n) return null; const p = n.v.split("."); return p[1] ? p[1].replace(/[^0#]/g, "").length : 0; };
  F.minDecimals = fmt => { if (!fmt) return null; const n = parse(fmt)[0].find(t => t.t === "num"); if (!n) return null; const p = n.v.split("."); return p[1] ? (p[1].match(/0/g) || []).length : 0; };

  // v: numero; fmt: cadena de formato; opt: {units (0 auto,1 ninguna, 1e3..), prec, autoBase}
  F.num = function (v, fmt, opt) {
    opt = opt || {};
    if (v == null || (typeof v === "number" && !isFinite(v))) return opt.blank != null ? opt.blank : "";
    if (typeof v !== "number") return String(v);
    let p = pcache.get(fmt || ""); if (!p) pcache.set(fmt || "", p = fmt ? parse(fmt) : null);
    let sec = p ? p[0] : [{ t: "num", v: "#,0.##" }], neg = false;
    if (p) {
      if (v < 0 && p[1] && p[1].length) { sec = p[1]; neg = true; }
      else if (v === 0 && p[2] && p[2].length) sec = p[2];
    }
    const pct = sec.some(t => t.t === "pct");
    let x = pct ? v * 100 : v;
    if (neg) x = Math.abs(x);
    let unit = 1;
    if (!pct) {
      if (opt.units === 0 || opt.units === undefined && opt.auto) unit = F.autoUnit(Math.abs(opt.autoBase != null ? opt.autoBase : x));
      else if (opt.units > 1) unit = opt.units;
    }
    x = x / unit;
    const numTok = sec.find(t => t.t === "num") || { v: "#,0" };
    const parts = numTok.v.split(".");
    const grp = parts[0].includes(",");
    let d;
    if (opt.prec != null) d = opt.prec;
    else if (unit > 1 && opt.sig) { const ax = Math.abs(x); d = ax >= 100 ? 0 : ax >= 10 ? 1 : 2; }   // automatico del Power BI: 3 cifras significativas
    else if (parts[1]) {
      const fixed = (parts[1].match(/0/g) || []).length, opt2 = (parts[1].match(/#/g) || []).length;
      d = fixed;
      if (opt2) { const s = Math.abs(x).toFixed(Math.min(fixed + opt2, 10)).split(".")[1] || ""; d = Math.max(fixed, s.replace(/0+$/, "").length); }
      if (!p) d = Math.min(d, 2);
    } else d = 0;
    let s = nf(d, grp).format(x);
    if (unit > 1) s += F.UNITS[unit];
    let out = "";
    for (const t of sec) out += t.t === "lit" ? t.v : t.t === "pct" ? "%" : t.t === "num" ? s : "";
    if (!p) out = s;
    // una sola seccion: el signo va adelante de todo ("-$ 84,5 mil M")
    if (p && v < 0 && !neg && out.includes("-")) out = "-" + out.replace("-", "");
    return out.replace(/ /g, " ");
  };

  const MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  // fecha 'AAAA-MM-DD' con formato de fecha del Power BI
  F.date = function (s, fmt) {
    if (s == null) return "";
    const y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
    const p2 = n => String(n).padStart(2, "0");
    if (!fmt || fmt === "General Date" || fmt === "Short Date" || fmt === "d" || fmt === "g" || fmt === "G") return `${p2(d)}/${p2(m)}/${y}`;
    if (fmt === "y" || fmt === "Y") return `${MES[m - 1]} de ${y}`;
    if (fmt === "M" || fmt === "m") return `${d} de ${MES[m - 1]}`;
    if (fmt === "D") fmt = "Long Date";
    if (fmt === "Long Date") { const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return `${DIA[wd]}, ${d} de ${MES[m - 1]} de ${y}`; }
    return fmt.replace(/"([^"]*)"|\\(.)|[mM]{4}|[mM]{3}|[mM]{2}|[mM]|yyyy|yy|dd|d/g, (t, q, e) => {
      if (q != null) return q;
      if (e != null) return e;
      switch (t.length === 1 && t !== "d" ? "m" : t.replace(/M/g, "m")) { case "mmmm": return MES[m - 1]; case "mmm": return MES[m - 1].slice(0, 3); case "mm": return String(m).padStart(2, "0"); case "m": return String(m);
        case "yyyy": return String(y); case "yy": return String(y).slice(2); case "dd": return String(d).padStart(2, "0"); case "d": return String(d); }
      return t;
    });
  };
  F.mesCorto = s => (s ? MES[+s.slice(5, 7) - 1].slice(0, 3) + " " + s.slice(0, 4) : "");
})();
