"""Convierte la definicion PBIR de "Informe Gestion FCI.pbix" en pbi_spec.js para el tablero.

Uso:  python3 pbi_convert.py "Informe Gestion FCI.pbix" <carpeta_salida>
Genera <salida>/pbi_spec.js (window.PBI = {...}) y <salida>/pbi_img/<recurso> con las imagenes del reporte.
La salida describe el diseño (hojas, visuales, posiciones, formato, filtros); no contiene datos. Se regenera en cada
actualizacion desde el .pbix de Matias (empaquetar.py), asi que un cambio de diseño en el Power BI pasa solo al tablero.
"""
import json, os, re, sys, zipfile


def shade(hexc, pct):
    hexc = hexc.lstrip("#")
    r, g, b = (int(hexc[i:i + 2], 16) for i in (0, 2, 4))
    if pct < 0:
        f = 1 + pct
        r, g, b = (round(x * f) for x in (r, g, b))
    elif pct > 0:
        r, g, b = (round(x + (255 - x) * pct) for x in (r, g, b))
    return "#%02X%02X%02X" % (r, g, b)


class Conv:
    def __init__(self, files):
        self.f = files
        rep = json.loads(files["Report/definition/report.json"])
        self.report = rep
        theme = None
        for k, v in files.items():
            if k.startswith("Report/StaticResources/RegisteredResources/") and k.endswith(".json"):
                theme = json.loads(v)
        base = json.loads(next(v for k, v in files.items() if "BaseThemes" in k))
        self.base = base
        self.theme = dict(base)
        if theme:
            self.theme.update({k: v for k, v in theme.items() if k != "name"})
        t = self.theme
        self.palette = [t.get("background", "#FFFFFF"), t.get("foreground", "#252423")] + list(t["dataColors"])
        self.named = {k: t[k] for k in ("foreground", "background", "backgroundLight", "backgroundNeutral", "foregroundNeutralSecondary",
                                         "foregroundNeutralTertiary", "tableAccent", "good", "bad", "neutral", "maximum", "minimum", "center") if k in t}

    # ---------- valores ----------
    def color(self, e):
        if isinstance(e, str):
            return self.named.get(e, e)
        if "ThemeDataColor" in e:
            c = e["ThemeDataColor"]
            i = c.get("ColorId", 0)
            base = self.palette[i] if i < len(self.palette) else self.theme["dataColors"][(i - 2) % len(self.theme["dataColors"])]
            return shade(base, c.get("Percent", 0) or 0)
        if "Literal" in e:
            return self.lit(e["Literal"]["Value"])
        return {"raw": e}

    def lit(self, s):
        if not isinstance(s, str):
            return s
        if s in ("true", "false"):
            return s == "true"
        if s == "null":
            return None
        if s.startswith("'") and s.endswith("'"):
            return s[1:-1].replace("''", "'")
        if s.startswith("datetime'"):
            return {"date": s[9:-1]}
        m = re.fullmatch(r"(-?[0-9.]+(?:E[-+]?\d+)?)([DLM]?)", s)
        if m:
            x = float(m.group(1))
            return int(x) if m.group(2) == "L" else x
        return s

    def val(self, v):
        if isinstance(v, dict):
            if "expr" in v:
                e = v["expr"]
                if "Literal" in e:
                    return self.lit(e["Literal"]["Value"])
                if "ThemeDataColor" in e:
                    return self.color(e)
                if "ResourcePackageItem" in e:
                    return {"res": e["ResourcePackageItem"]["ItemName"]}
                return {"raw": self.expr(e, {})}
            if "solid" in v:
                c = v["solid"].get("color")
                if isinstance(c, dict) and "expr" in c:
                    e = c["expr"]
                    if "ThemeDataColor" in e or "Literal" in e:
                        return self.color(e)
                    return {"raw": self.expr(e, {})}
                return self.color(c) if c is not None else None
            if "image" in v:
                im = v["image"]
                return {"image": {k: self.val(x) for k, x in im.items()}}
            if "linearGradient2" in v or "linearGradient3" in v:
                return {"grad": json.loads(json.dumps(v))}
            return {k: self.val(x) for k, x in v.items()}
        if isinstance(v, list):
            return [self.val(x) for x in v]
        return v

    # ---------- campos / expresiones ----------
    def expr(self, e, alias):
        if not isinstance(e, dict):
            return e
        if "Column" in e or "Measure" in e:
            k = "Column" if "Column" in e else "Measure"
            x = e[k]
            sr = x.get("Expression", {}).get("SourceRef", {})
            ent = sr.get("Entity") or alias.get(sr.get("Source"), sr.get("Source"))
            return {"k": k[0], "t": ent, "p": x["Property"]}
        if "Aggregation" in e:
            return {"k": "A", "f": e["Aggregation"]["Function"], "e": self.expr(e["Aggregation"]["Expression"], alias)}
        if "HierarchyLevel" in e:
            h = e["HierarchyLevel"]
            hx = h["Expression"].get("Hierarchy", {})
            base = hx.get("Expression", {})
            inner = base.get("PropertyVariationSource", {})
            sr = (inner.get("Expression") or base).get("SourceRef", {})
            ent = sr.get("Entity") or alias.get(sr.get("Source"), sr.get("Source"))
            return {"k": "H", "t": ent, "p": inner.get("Property") or hx.get("Hierarchy"), "lvl": h["Level"]}
        if "Arithmetic" in e:
            a = e["Arithmetic"]
            return {"k": "X", "op": a["Operator"], "l": self.expr(a["Left"], alias), "r": self.expr(a["Right"], alias)}
        if "ScopedEval" in e:
            return {"k": "S", "e": self.expr(e["ScopedEval"]["Expression"], alias), "scope": [self.expr(s, alias) for s in e["ScopedEval"].get("Scope", [])]}
        if "Literal" in e:
            return {"k": "L", "v": self.lit(e["Literal"]["Value"])}
        if "DateSpan" in e:
            return {"k": "DS", "e": self.expr(e["DateSpan"]["Expression"], alias), "u": e["DateSpan"]["TimeUnit"]}
        if "DateAdd" in e:
            return {"k": "DA", "e": self.expr(e["DateAdd"]["Expression"], alias), "n": e["DateAdd"]["Amount"], "u": e["DateAdd"]["TimeUnit"]}
        if "Now" in e:
            return {"k": "NOW"}
        if "SelectRef" in e:
            return {"k": "REF", "n": e["SelectRef"]["ExpressionName"]}
        return {"k": "?", "raw": e}

    def cond(self, c, alias):
        if "In" in c:
            x = c["In"]
            out = {"op": "in", "e": [self.expr(z, alias) for z in x["Expressions"]]}
            if "Values" in x:
                out["v"] = [[self.expr(z, alias).get("v") for z in row] for row in x["Values"]]
            if "Table" in x:
                out["tbl"] = alias.get("__sub__" + x["Table"]["SourceRef"]["Source"])
            return out
        if "Not" in c:
            return {"op": "not", "c": self.cond(c["Not"]["Expression"], alias)}
        if "And" in c:
            return {"op": "and", "l": self.cond(c["And"]["Left"], alias), "r": self.cond(c["And"]["Right"], alias)}
        if "Or" in c:
            return {"op": "or", "l": self.cond(c["Or"]["Left"], alias), "r": self.cond(c["Or"]["Right"], alias)}
        if "Comparison" in c:
            x = c["Comparison"]
            return {"op": "cmp", "kind": x["ComparisonKind"], "l": self.expr(x["Left"], alias), "r": self.expr(x["Right"], alias)}
        if "Between" in c:
            x = c["Between"]
            return {"op": "between", "e": self.expr(x["Expression"], alias), "lo": self.expr(x["LowerBound"], alias), "hi": self.expr(x["UpperBound"], alias)}
        if "Contains" in c:
            x = c["Contains"]
            return {"op": "contains", "l": self.expr(x["Left"], alias), "r": self.expr(x["Right"], alias)}
        if "StartsWith" in c:
            x = c["StartsWith"]
            return {"op": "starts", "l": self.expr(x["Left"], alias), "r": self.expr(x["Right"], alias)}
        return {"op": "?", "raw": c}

    def filt(self, f):
        if not f:
            return None
        alias = {}
        for fr in f.get("From", []):
            if "Entity" in fr:
                alias[fr["Name"]] = fr["Entity"]
            elif "Expression" in fr and "Subquery" in fr["Expression"]:
                q = fr["Expression"]["Subquery"]["Query"]
                a2 = {x["Name"]: x["Entity"] for x in q.get("From", []) if "Entity" in x}
                alias["__sub__" + fr["Name"]] = {
                    "select": [self.expr(s, a2) for s in q.get("Select", [])],
                    "order": [{"dir": o["Direction"], "e": self.expr(o["Expression"], a2)} for o in q.get("OrderBy", [])],
                    "top": q.get("Top")}
        return [self.cond(w["Condition"], alias) for w in f.get("Where", [])]

    def objects(self, objs):
        out = {}
        for name, lst in (objs or {}).items():
            arr = []
            for it in lst:
                props = {k: self.val(v) for k, v in it.get("properties", {}).items()}
                sel = it.get("selector")
                s = None
                if sel:
                    s = {}
                    if "metadata" in sel:
                        s["meta"] = sel["metadata"]
                    if "id" in sel:
                        s["id"] = sel["id"]
                    if "data" in sel:
                        dd = []
                        for x in sel["data"]:
                            if "scopeId" in x:
                                dd.append({"scope": self.cond(x["scopeId"], {})})
                            elif "dataViewWildcard" in x:
                                dd.append({"wild": x["dataViewWildcard"].get("matchingOption", 0)})
                            else:
                                dd.append({"raw": x})
                        s["data"] = dd
                    if "order" in sel:
                        s["order"] = sel["order"]
                arr.append({"p": props, "s": s} if s else {"p": props})
            out[name] = arr
        return out

    def proj(self, q):
        out = {}
        for role, v in (q or {}).items():
            L = []
            for p in v.get("projections", []):
                d = self.expr(p["field"], {})
                d["ref"] = p.get("queryRef")
                d["nq"] = p.get("nativeQueryRef")
                if p.get("displayName"):
                    d["dn"] = p["displayName"]
                if p.get("format"):
                    d["fmt"] = p["format"]
                if p.get("active") is not None:
                    d["active"] = p["active"]
                L.append(d)
            out[role] = L
        return out

    def textbox(self, objs):
        try:
            pars = objs["general"][0]["properties"]["paragraphs"]
        except Exception:
            return None
        out = []
        for par in pars:
            runs = [{"t": r.get("value", ""), "st": r.get("textStyle", {})} for r in par.get("textRuns", [])]
            out.append({"runs": runs, "align": par.get("horizontalTextAlignment")})
        return out

    def page(self, pid):
        pg = json.loads(self.f[f"Report/definition/pages/{pid}/page.json"])
        raw = {}
        pre = f"Report/definition/pages/{pid}/visuals/"
        for k, v in self.f.items():
            if k.startswith(pre) and k.endswith("visual.json"):
                j = json.loads(v)
                raw[j["name"]] = j

        def absp(n):
            j = raw[n]
            p = j["position"]
            x, y, zs, hid = p["x"], p["y"], [p.get("z", 0)], bool(j.get("isHidden"))
            par = j.get("parentGroupName")
            while par and par in raw:
                pp = raw[par]["position"]
                x += pp["x"]; y += pp["y"]; zs.insert(0, pp.get("z", 0)); hid = hid or bool(raw[par].get("isHidden"))
                par = raw[par].get("parentGroupName")
            return x, y, zs, hid

        vis = []
        for n, j in raw.items():
            if "visual" not in j:
                continue
            x, y, zs, hid = absp(n)
            p = j["position"]
            v = j["visual"]
            q = v.get("query", {})
            o = {"id": n, "type": v.get("visualType"), "x": round(x, 2), "y": round(y, 2), "w": round(p["width"], 2), "h": round(p["height"], 2),
                 "z": zs, "hidden": hid,
                 "proj": self.proj(q.get("queryState")),
                 "sort": [{"e": self.expr(s["field"], {}), "dir": s.get("direction")} for s in q.get("sortDefinition", {}).get("sort", [])],
                 "obj": self.objects(v.get("objects")),
                 "vco": self.objects(v.get("visualContainerObjects"))}
            if o["type"] == "textbox":
                o["text"] = self.textbox(v.get("objects"))
                o["obj"].pop("general", None)
            fl = []
            for f in j.get("filterConfig", {}).get("filters", []):
                c = self.filt(f.get("filter"))
                if c:
                    fl.append({"type": f.get("type"), "f": self.expr(f.get("field", {}), {}), "c": c})
            if fl:
                o["filters"] = fl
            # filtro guardado del segmentador (seleccion)
            sf = None
            for g in v.get("objects", {}).get("general", []):
                if "filter" in g.get("properties", {}):
                    sf = self.filt(g["properties"]["filter"]["filter"])
            if sf:
                o["sel"] = sf
            vis.append(o)
        vis.sort(key=lambda o: o["z"])
        pf = []
        for f in pg.get("filterConfig", {}).get("filters", []):
            c = self.filt(f.get("filter"))
            if c:
                pf.append({"type": f.get("type"), "f": self.expr(f.get("field", {}), {}), "c": c})
        return {"id": pid, "name": pg["displayName"].strip(), "w": pg.get("width", 1280), "h": pg.get("height", 720),
                "obj": self.objects(pg.get("objects")), "filters": pf, "visuals": vis,
                "noFilter": [[i["source"], i["target"]] for i in pg.get("visualInteractions", []) if i.get("type") == "NoFilter"]}

    def run(self):
        order = json.loads(self.f["Report/definition/pages/pages.json"])["pageOrder"]
        t = self.theme
        return {"theme": {"dataColors": t["dataColors"], "foreground": t.get("foreground"), "background": t.get("background"),
                          "backgroundLight": t.get("backgroundLight"), "foregroundNeutralSecondary": t.get("foregroundNeutralSecondary"),
                          "foregroundNeutralTertiary": t.get("foregroundNeutralTertiary"), "backgroundNeutral": t.get("backgroundNeutral"),
                          "tableAccent": t.get("tableAccent"), "textClasses": self.base.get("textClasses", {})},
                "pages": [self.page(p) for p in order]}


def main():
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(os.path.join(out, "pbi_img"), exist_ok=True)
    files, extra = {}, {}
    with zipfile.ZipFile(src) as z:
        for n in z.namelist():
            if n.startswith("Report/") and n.endswith(".json"):
                files[n] = z.read(n).decode("utf-8-sig")
            elif n.startswith("Report/StaticResources/RegisteredResources/"):
                extra[os.path.basename(n)] = z.read(n)
    for k, b in extra.items():
        if not k.endswith(".json"):
            open(os.path.join(out, "pbi_img", k), "wb").write(b)
    spec = Conv(files).run()
    # formatos de medidas y columnas del modelo (salen del DataModel; ver pbi_formatos.py). Primero junto al .pbix, si no el del repo
    meta = os.path.join(os.path.dirname(os.path.abspath(src)), "pbi_formats.json")
    if not os.path.exists(meta):
        meta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pbi_formats.json")
    if os.path.exists(meta):
        spec["formats"] = json.load(open(meta, encoding="utf-8"))
    js = "window.PBI=" + json.dumps(spec, ensure_ascii=False, separators=(",", ":")) + ";\n"
    open(os.path.join(out, "pbi_spec.js"), "w", encoding="utf-8").write(js)
    print("paginas", len(spec["pages"]), "visuales", sum(len(p["visuals"]) for p in spec["pages"]), "bytes", len(js))


if __name__ == "__main__":
    main()
