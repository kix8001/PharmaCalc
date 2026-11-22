# 製品ごとの薬価と識別コード（錠剤の刻印など）のデータ data/info.json を作る。
#
# 薬価：tools/generic_src/ の厚労省「薬価基準収載品目リスト」（内用・注射・外用。make_generic.py と同じ元データ）の
#   「薬価」と「規格」。統一名収載（一般名で1行にまとめて載る後発品）の製品は、YJ コードの先頭9桁が同じ行の薬価
#   （その9桁の行の薬価が1つにそろうときだけ）
# 識別コード：PMDA の電子添文 XML の性状の表（PropertyForBrand → IdCode）。どの製品の物かは ref → DetailBrandName の YJCode。
#   XML は make_handling.py が取ったキャッシュ（/tmp/pmda_handling_cache と /tmp/pmda_limits_cache）を使う
#
# 使い方：python3 tools/make_info.py
import glob, json, os, re, unicodedata, zipfile
import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "info.json")
CACHES = ["/tmp/pmda_handling_cache", "/tmp/pmda_limits_cache"]


def nk(s):
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", str(s or "")))


def fmt_price(p):
    return f"{p:.2f}".rstrip("0").rstrip(".")


# 薬価
price = {}
pname = {}
expiring = set()  # 経過措置で使えなくなる品目（最安のジェネリックに選ばない）
by9 = {}
for f in sorted(glob.glob(os.path.join(HERE, "generic_src", "tp*_0[123]_*.xlsx"))):
    ws = openpyxl.load_workbook(f, read_only=True).worksheets[0]
    for r in list(ws.iter_rows(values_only=True))[1:]:
        if not r[1] or r[12] is None:
            continue
        yj = str(r[1]).strip()
        rec = {"p": fmt_price(float(r[12])), "s": nk(r[3])}
        price[yj] = rec
        pname[yj] = unicodedata.normalize("NFKC", str(r[7] or "")).strip()
        if r[13]:
            expiring.add(yj)
            # 経過措置による使用期限（「R9.3.31まで」→「令和9年3月31日」）
            m = re.match(r"R(\d+)\.(\d+)\.(\d+)", nk(r[13]))
            rec["x"] = f"令和{m.group(1)}年{m.group(2)}月{m.group(3)}日" if m else nk(r[13])
        by9.setdefault(yj[:9], set()).add((rec["p"], rec["s"], rec.get("x", "")))
p9 = {k: {"p": list(v)[0][0], "s": list(v)[0][1], **({"x": list(v)[0][2]} if list(v)[0][2] else {})} for k, v in by9.items() if len(v) == 1}


def text(x):
    x = re.sub(r"<\?enter\?>", " ", x)
    x = re.sub(r"<[^>]+>", "", x)
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", x)).strip()


# 識別コード
idc = {}
# 識別コードが画像だけで載っている添付文書（バイアスピリンの「BA 100」など）は、画像を目で読んだ表 idcode_img.json を使う
IMG_IDC = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "idcode_img.json"), encoding="utf-8"))
look = {}  # 外観
seen = set()
for d in CACHES:
    for f in glob.glob(os.path.join(d, "*.zip")):
        name = os.path.basename(f)
        if name in seen:
            continue
        seen.add(name)
        try:
            z = zipfile.ZipFile(f)
            s = z.read([n for n in z.namelist() if n.endswith(".xml")][0]).decode("utf-8", "ignore")
        except Exception:
            continue
        brands = {m.group(1): m.group(2) for m in re.finditer(r'<DetailBrandName id="([^"]+)">.*?<YJCode>([0-9A-Z]{12})</YJCode>', s, re.S)}
        for m in re.finditer(r'<PropertyForBrand ref="([^"]+)">(.*?)</PropertyForBrand>', s, re.S):
            yj = brands.get(m.group(1))
            if not yj:
                continue
            b = m.group(2)
            codes = [text(c) for c in re.findall(r"<IdCode[^>]*>(.*?)</IdCode>", b, re.S)]
            # IdCode の欄が無く「識別コード XXX」と文で書いてある添付文書もある
            if not codes:
                t = text(b)
                mm = re.search(r"識別(コード|記号)\s*[:：]?\s*([^\n]{1,40})", t)
                if mm:
                    codes = [mm.group(2).strip()]
            # 識別コードの欄が「なし」「－」＝刻印の無い錠剤（外観の n=1）
            nocode = bool(codes) and all(re.sub(r"[※注）)\s]", "", c) in ("-", "－", "―", "――", "なし") for c in codes)
            codes = [c for c in dict.fromkeys(codes) if c and re.sub(r"[※注）)\s]", "", c) not in ("-", "－", "―", "――", "なし")]
            if not codes and yj in IMG_IDC:
                codes = [IMG_IDC[yj]]
            if codes and yj not in idc:
                idc[yj] = " / ".join(codes)[:60]
            # 外観：色・剤形・大きさ・形（丸い r／楕円・長い o／カプセル c）
            if yj not in look:
                col = re.search(r"<ColorTone>(.*?)</ColorTone>", b, re.S)
                # 色調が「その他」の欄（色調・剤形 など）に書いてある添付文書もある
                if not col:
                    col = re.search(r"<CategoryName>(?:(?!</CategoryName>).)*色(?:(?!</CategoryName>).)*</CategoryName>\s*<Content>(.*?)</Content>", b, re.S)
                fm = re.search(r"<Formulation>(.*?)</Formulation>", b, re.S)
                dia = re.search(r"<SizeDiameter>(.*?)</SizeDiameter>", b, re.S)
                lng = re.search(r"<SizeLongDiameter>(.*?)</SizeLongDiameter>", b, re.S)
                sht = re.search(r"<SizeShortDiameter>(.*?)</SizeShortDiameter>", b, re.S)
                fmt = text(fm.group(1)).replace("\n", " ")[:30] if fm else ""
                if not fmt and col and re.search(r"錠|カプセル|丸|散|顆粒", text(col.group(1))):
                    fmt = text(col.group(1)).replace("\n", " ")[:30]
                rec = {}
                if col:
                    rec["k"] = text(col.group(1)).replace("\n", " ")[:30]
                if fmt:
                    rec["m"] = fmt
                if lng:
                    rec["z"] = "長径" + text(lng.group(1)) + ("・短径" + text(sht.group(1)) if sht else "")
                elif dia:
                    rec["z"] = "直径" + text(dia.group(1))
                shape = "c" if "カプセル" in fmt else "o" if lng or "楕円" in fmt or "長円" in fmt else "r" if dia and "錠" in fmt + "錠" else ""
                if shape:
                    rec["h"] = shape
                if nocode:
                    rec["n"] = 1
                if rec:
                    look[yj] = rec

# 錠剤の図（性状の表の表・裏・横の画像。PMDA の SimpleImageGIF で開く）。今の添付文書（GeneralList に載っている物）だけ
current = set()
for d in CACHES:
    for f in glob.glob(os.path.join(d, "*.html")):
        current.update(re.findall(r"\d{6}_\d{7}[0-9A-Z]\d{4}_\d_\d+", open(f, encoding="utf-8", errors="ignore").read()))
fig = {}
for d in CACHES:
    for f in glob.glob(os.path.join(d, "*.zip")):
        doc = os.path.basename(f)[:-4]
        if doc not in current:
            continue
        try:
            z = zipfile.ZipFile(f)
            s2 = z.read([n for n in z.namelist() if n.endswith(".xml")][0]).decode("utf-8", "ignore")
        except Exception:
            continue
        brands = {m.group(1): m.group(2) for m in re.finditer(r'<DetailBrandName id="([^"]+)">.*?<YJCode>([0-9A-Z]{12})</YJCode>', s2, re.S)}
        for m in re.finditer(r'<PropertyForBrand ref="([^"]+)">(.*?)</PropertyForBrand>', s2, re.S):
            yj = brands.get(m.group(1))
            sh = re.search(r"<Shape>(.*?)</Shape>", m.group(2), re.S)
            if not yj or yj in fig or not sh:
                continue
            g = re.findall(r'gfname="([^"]+)\.gif"', sh.group(1))[:3]
            if g:
                # 画像の名前は「添付文書番号_figNN」がふつう。その形なら番号だけ持つ
                fig[yj] = [doc] + [x[len(doc) + 1:] if x.startswith(doc + "_") else "!" + x for x in g]

# 先発品（準先発品を含む）→ 同じ成分・規格・剤形のジェネリックで薬価がいちばん安い物（経過措置の品目は除く）
gen = json.load(open(os.path.join(HERE, "..", "data", "generic.json"), encoding="utf-8"))
def is_od(n):
    return bool(re.search(r"OD|口腔内崩壊|D錠|ODフィルム|ゼリー", n))


cheap = {}
for yj, g in gen["items"].items():
    if g.get("k") != "G" or g.get("o") or yj not in price or yj in expiring:
        continue
    for b in g.get("b", []):
        # 口腔内崩壊錠（OD・D錠）同士、ふつうの錠同士で比べる
        if is_od(pname[yj]) != is_od(pname.get(b, "")):
            continue
        p = float(price[yj]["p"])
        if b not in cheap or p < cheap[b][1] or (p == cheap[b][1] and pname[yj] < cheap[b][0]):
            cheap[b] = (pname[yj], p)

# 例に出す名前：一般名でまとめて載る行（「」の無い名前）なら、その行にまとめられている実際の製品の名前を1つ
otc_names = json.load(open(os.path.join(HERE, "..", "data", "otc.json"), encoding="utf-8"))["names"]
by9names = {}
for y, n in otc_names.items():
    if y not in price and "「" in n:
        by9names.setdefault(y[:9], []).append(n)
for b, (n, p) in list(cheap.items()):
    if "「" not in n:
        u = [k for k, v in pname.items() if v == n]
        ex = sorted(by9names.get(u[0][:9], [])) if u else []
        if ex:
            cheap[b] = (ex[0], p)

# 経過措置（製品ごと）：診療報酬情報提供サービスの医薬品マスター（tools/generic_src/y_*.zip。34列目＝経過措置年月日）。
# 薬価基準の一覧は一般名でまとめて載る後発品の行しか無いので、各社の製品（「トーワ」など）の経過措置はこちらで分かる。
# 製品名（全角→半角）で突き合わせる
import csv, io
keika = {}
for zf in sorted(glob.glob(os.path.join(HERE, "generic_src", "y_*.zip")))[-1:]:
    z = zipfile.ZipFile(zf)
    raw = z.read([n for n in z.namelist() if n.lower().endswith(".csv")][0]).decode("cp932", "ignore")
    for r in csv.reader(io.StringIO(raw)):
        if len(r) > 34 and re.fullmatch(r"20\d{6}", r[33] or ""):
            y, mo, da = int(r[33][:4]), int(r[33][4:6]), int(r[33][6:8])
            keika[nk(r[34] or r[4])] = f"令和{y - 2018}年{mo}月{da}日"
otc_all = json.load(open(os.path.join(HERE, "..", "data", "otc.json"), encoding="utf-8"))["names"]
xmap = {yj: keika[nk(n)] for yj, n in otc_all.items() if nk(n) in keika}

# メーカーのお知らせによる経過措置の予定（data/keika_extra.json。手で足す）
ex_src = json.load(open(os.path.join(HERE, "..", "data", "keika_extra.json"), encoding="utf-8"))["items"]
ex_by = {nk(e["name"]): e for e in ex_src}
extra = {yj: ex_by[nk(n)] for yj, n in otc_all.items() if nk(n) in ex_by}

out = {}
for yj in set(price) | set(idc) | set(fig) | set(look) | set(xmap) | set(extra):
    rec = {}
    if yj in price:
        rec.update(price[yj])
    if yj in idc:
        rec["i"] = idc[yj]
    if yj in fig:
        rec["f"] = fig[yj]
    if yj in look:
        rec.update(look[yj])
    if yj in xmap and "x" not in rec:
        rec["x"] = xmap[yj]
    if yj in extra and "x" not in rec:
        # メーカーのお知らせによる予定（xs=1、xl=お知らせ、xk=在庫終了予定）
        e = extra[yj]
        rec.update({"x": e["until"], "xs": 1, "xl": e.get("url", ""), **({"xk": e["stock"]} if e.get("stock") else {})})
    if yj in cheap:
        rec["c"] = [cheap[yj][0], fmt_price(cheap[yj][1])]
    out[yj] = rec
# 統一名収載の製品：先頭9桁が同じ「一般名でまとめて載る後発品の行」（generic.json の u9）の薬価を優先する
# （先発品と後発品で薬価が違うと、9桁の薬価がそろわず引けなかった。例：フェブキソスタット錠10mg「DSEP」）
for k9, u in gen.get("u9", {}).items():
    if u and u in price:
        p9[k9] = price[u]
# 統一名収載の製品：一覧に無い YJ は先頭9桁で薬価を引く（識別コードだけある製品にも足す）
for yj, rec in out.items():
    if "p" not in rec and yj[:9] in p9:
        rec.update({k: v for k, v in p9[yj[:9]].items() if k != "x"})
# ジェネリックの比べる相手：先発品の薬価（generic.json の b の1つめ。規格違い・剤形違いは比べない）
bp = {b: price[b]["p"] for g in gen["items"].values() if g.get("k") == "G" and not g.get("o") for b in g.get("b", [])[:1] if b in price}
data = {
    "bp": bp,
    "source": "薬価：厚生労働省「薬価基準収載品目リスト」（令和8年11月13日適用）。識別コード：PMDA 医療用医薬品の電子添文（性状）",
    "items": out,
    "p9": p9,
}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
print("経過措置（マスター）", len(keika), "→製品", len(xmap), "予定（お知らせ）", len(extra), "薬価", len(price), "識別コード", len(idc), "外観", len(look), "図", len(fig), "最安", len(cheap), "製品", len(out), "9桁", len(p9), os.path.getsize(OUT) // 1024, "KB")
